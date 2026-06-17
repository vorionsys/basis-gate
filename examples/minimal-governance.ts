// SPDX-License-Identifier: Apache-2.0
//
// BASIS Gate — minimal governance example  (STARTER / REFERENCE USE, not production)
//
// Run an AI-agent action through a signed governance pipeline end to end:
//   1. happy path  — a known agent's LOW-risk action is ALLOWED; it emits a signed proof-chain tip.
//   2. blocked path — an UNKNOWN agent's action is DENIED by the identity rule (the refusal is itself signed proof).
// Verified end-to-end against @vorionsys/basis-gate-runtime@0.1.1.
//
//   npm i @vorionsys/basis-gate-runtime @vorionsys/basis-gate-industry @vorionsys/basis-gate-spec
//   npx tsx examples/minimal-governance.ts
//
// (This file runs as an ES module — see examples/package.json. The runtime and spec
//  packages are ESM-only, so the example must run as ESM, which also enables top-level await.)

import { randomBytes } from "node:crypto";
import { GateRuntime, type ProofChainEvent } from "@vorionsys/basis-gate-runtime";
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
if (denied.verdict === "deny") {
  console.log(`[BLOCK] verdict=deny  by=${denied.layerId}  reason=${denied.reason}`);
  console.log(`        tip=${denied.tip?.tipHash?.slice(0, 24)}...  (a refusal is itself signed proof)`);
} else {
  console.log(`[BLOCK] verdict=${denied.verdict}`);
}
await runtime.drain();

// 3. Proof: every verdict committed signed proof-chain events.
console.log(`\n[PROOF] ${events.length} signed proof-chain events emitted; each tip is Ed25519-signed by the runtime key.`);
console.log("        (Replay the whole chain with the exported verifyChain(events, resolveKey); the runtime also");
console.log("         exposes the signing primitives signHex/verifyHex/hashTip. A full verify+tamper walk-through");
console.log("         lives in packages/basis-gate-runtime/tests/verify-chain.test.ts.)");
