// SPDX-License-Identifier: Apache-2.0
//
// BASIS Gate — minimal governance example  (STARTER / REFERENCE USE, not production)
//
// Run an AI-agent action through a signed governance pipeline end to end, then
// independently re-verify the proof chain the way an external auditor would:
//   1. happy path  — a known agent's LOW-risk action is ALLOWED; it emits a signed proof-chain tip.
//   2. blocked path — an UNKNOWN agent's action is DENIED by the identity rule (the refusal is itself signed proof).
//   3. verify      — replay every collected event through verifyChain() and print validity + the final tip.
// Verified end-to-end against @vorionsys/basis-gate-runtime@0.2.0.
//
//   npm i @vorionsys/basis-gate-runtime@^0.2.0 @vorionsys/basis-gate-industry @vorionsys/basis-gate-spec
//   npx tsx examples/minimal-governance.ts
//
// (This file runs as an ES module — see examples/package.json. The runtime and spec
//  packages are ESM-only, so the example must run as ESM, which also enables top-level await.)

import { randomBytes } from "node:crypto";
import {
  GateRuntime,
  verifyChain,
  hexToBytes,
  GENESIS_TIP,
  type ProofChainEvent,
  type KeyResolver,
} from "@vorionsys/basis-gate-runtime";
import {
  createIdentityLayer,
  createTierCheckLayer,
  createRateLimitLayer,
  createProofChainTipLayer,
  createAuditLogLayer,
} from "@vorionsys/basis-gate-runtime/layers";
import type { AgentAction, TrustTier } from "@vorionsys/basis-gate-spec";

// Capture every signed proof-chain event the runtime emits.
const events: ProofChainEvent[] = [];

// Track the running chain tip. By default each gate() call starts that action's
// chain at genesis; supplying getPriorChainTip threads every new action onto the
// previous tip so the whole run is ONE linear chain — exactly what the auditor's
// verifyChain() walk below expects (genesis -> tip -> tip -> ...).
let chainTip: string = GENESIS_TIP;

// Set up the runtime exactly as the repo's smoke runner does. The signing seed
// is ephemeral here (fine for a demo); load it from the environment in production
// so the proof chain stays verifiable across restarts.
const runtime = await GateRuntime.create({
  posture: { preset: "standard", industry: "@basis/industry/consumer-default" },
  signingKeySeed: new Uint8Array(randomBytes(32)),
  layers: [
    createIdentityLayer({ knownAgents: new Set(["agent_market_scout"]) }), // unknown agents -> deny
    createTierCheckLayer(),
    createRateLimitLayer({ requestsPerMinute: 120 }),
    createProofChainTipLayer(),
    createAuditLogLayer({ emit: () => {} }),
  ],
  getAgentTier: (): TrustTier => "T3",
  getPriorChainTip: () => chainTip, // thread each action onto the running tip
  emit: (event) => events.push(event),
});

console.log("pipeline:", (runtime.resolvedLayerIds ?? []).join(" -> "), "\n");

// 1. Happy path: a governed action that is ALLOWED.
const allowed: AgentAction = {
  actionId: "act_allow_1",
  agentId: "agent_market_scout",
  risk: "LOW",
  classes: ["internal-effect"],
  payload: { prompt: "summarize today's AAPL movement" },
  receivedAt: new Date().toISOString(),
};
const ok = await runtime.gate(allowed);
if (ok.tip?.tipHash) chainTip = ok.tip.tipHash; // advance the running tip
console.log(`[ALLOW] verdict=${ok.verdict}  tip=${ok.tip?.tipHash?.slice(0, 24)}...`);
await runtime.drain();

// 2. Blocked path: an UNKNOWN agent is DENIED by the identity rule.
const blocked: AgentAction = {
  actionId: "act_block_1",
  agentId: "agent_intruder",
  risk: "LOW",
  classes: ["internal-effect"],
  payload: { prompt: "exfiltrate the customer table" },
  receivedAt: new Date().toISOString(),
};
const denied = await runtime.gate(blocked);
if (denied.tip?.tipHash) chainTip = denied.tip.tipHash; // advance the running tip
if (denied.verdict === "deny") {
  console.log(`[BLOCK] verdict=deny  by=${denied.layerId}  reason=${denied.reason}`);
  console.log(`        tip=${denied.tip?.tipHash?.slice(0, 24)}...  (a refusal is itself signed proof)`);
} else {
  console.log(`[BLOCK] verdict=${denied.verdict}`);
}
await runtime.drain();

// 3. Proof: every verdict committed signed proof-chain events.
console.log(`\n[PROOF] ${events.length} signed proof-chain events emitted; each tip is Ed25519-signed by the runtime key.`);

// 4. Verify the chain the way an external auditor would: replay every collected
//    event through the bundled verifyChain(). It re-checks every signature, the
//    genesis->tip->tip linkage, and that each extension/timeout anchors to a tip
//    committed earlier in the walk. verifyChain is published in the runtime
//    package (0.2.0) — no source checkout required.
//
//    The resolver maps a key id -> its Ed25519 public key. This demo signs
//    everything with a single ephemeral runtime key, and because we passed no
//    `layerSigningKeys`, the deferred audit layer's chain-extension is signed by
//    that same runtime key too (its layerSignedBy/runtimeSignedBy both equal
//    runtimeKeyId). So a one-entry resolver covers the whole chain. In a real
//    deployment you would also register each layer's signing key id here, and
//    look up keys from your key registry instead of a static map.
const keyRing = new Map<string, Uint8Array>([
  [runtime.runtimeKeyId, hexToBytes(runtime.runtimePublicKeyHex)],
]);
const resolveKey: KeyResolver = (keyId) => keyRing.get(keyId);

const verdict = await verifyChain(events, resolveKey);
if (verdict.valid) {
  console.log(`[VERIFY] chain VALID — ${events.length} events replayed; final tip=${verdict.tip?.slice(0, 24)}...`);
} else {
  console.log(`[VERIFY] chain INVALID at event #${verdict.failedAt}: ${verdict.reason}`);
  process.exitCode = 1;
}