// SPDX-License-Identifier: Apache-2.0
// Smoke test — runs an action through the GateRuntime end-to-end and prints
// the proof-chain events in order of emission.

import { randomBytes } from "node:crypto";
import { GateRuntime, verifyHex } from "./dist/index.js";
import {
  createIdentityLayer,
  createTierCheckLayer,
  createRateLimitLayer,
  createProofChainTipLayer,
  createAuditLogLayer,
} from "./dist/layers/index.js";

const events = [];
const auditRecords = [];

const runtimeSeed = randomBytes(32);

const runtime = await GateRuntime.create({
  posture: {
    preset: "standard",
    industry: "@basis/industry/consumer-default",
  },
  signingKeySeed: runtimeSeed,
  layers: [
    createIdentityLayer({ knownAgents: new Set(["agent_market_scout"]) }),
    createTierCheckLayer(),
    createRateLimitLayer({ requestsPerMinute: 120 }),
    createProofChainTipLayer(),
    createAuditLogLayer({ emit: (r) => auditRecords.push(r) }),
  ],
  deferralWindowMs: 5_000,
  getAgentTier: () => "T3",
  emit: (ev) => events.push(ev),
});

console.log("Posture id:", runtime.postureLoad.postureId);
console.log("Resolved layer order:", runtime.resolvedLayerIds.join(" -> "));
console.log("Runtime key id:", runtime.runtimeKeyId);
console.log();

const action = {
  actionId: "act_smoke_1",
  agentId: "agent_market_scout",
  risk: "LOW",
  classes: ["internal-effect"],
  payload: { prompt: "brief AAPL" },
  receivedAt: new Date().toISOString(),
};

const verdict = await runtime.gate(action);
console.log(`Verdict: ${verdict.verdict}`);
if (verdict.verdict !== "allow") {
  console.log(`  reason: ${verdict.reason}`);
}
console.log(`  tip hash: ${verdict.tip.tipHash.slice(0, 16)}...`);
console.log(`  sync evidence layers: ${verdict.tip.syncEvidence.map((e) => e.layerId).join(", ")}`);
console.log();

// Let deferred layers finish.
await runtime.drain();

console.log(`Total events emitted: ${events.length}`);
for (const ev of events) {
  if (ev.kind === "posture-load") {
    console.log(`  - posture-load: ${ev.resolvedPipeline.length} layers, signed by ${ev.signedBy}`);
  } else if (ev.kind === "tip-commit") {
    console.log(`  - tip-commit: action=${ev.actionId}, sync-layers=${ev.syncEvidence.length}`);
  } else if (ev.kind === "chain-extension") {
    console.log(`  - chain-extension: layer=${ev.layerId}, anchor=${ev.anchorTip.slice(0, 16)}...`);
  } else if (ev.kind === "deferred-timeout") {
    console.log(`  - deferred-timeout: layer=${ev.layerId}`);
  }
}
console.log();

console.log(`Audit records captured by deferred audit-log: ${auditRecords.length}`);
if (auditRecords.length > 0) {
  console.log(`  first record: ${JSON.stringify(auditRecords[0])}`);
}
console.log();

// Verify the tip signature using the runtime public key.
const pubHex = runtime.runtimePublicKeyHex;
const pubBytes = Uint8Array.from(
  pubHex.match(/.{1,2}/g).map((b) => parseInt(b, 16)),
);
const sigOk = await verifyHex(pubBytes, verdict.tip.tipHash, verdict.tip.tipSignature);
console.log(`Tip signature verifies: ${sigOk}`);

// Test a denial — unknown agent.
const badAction = {
  actionId: "act_smoke_2",
  agentId: "agent_unknown",
  risk: "LOW",
  classes: ["internal-effect"],
  payload: {},
  receivedAt: new Date().toISOString(),
};
const badVerdict = await runtime.gate(badAction);
console.log();
console.log(`Unknown-agent verdict: ${badVerdict.verdict}`);
if (badVerdict.verdict === "deny") {
  console.log(`  reason: ${badVerdict.reason}`);
  console.log(`  layer: ${badVerdict.layerId}`);
}

await runtime.drain();
console.log();
console.log("Smoke test complete.");
