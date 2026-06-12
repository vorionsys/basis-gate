// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Bundled chain-walk verifier tests — covers the three hardening fixes:
// 1. createdAt timestamps are signature-covered (schema version 2)
// 2. deferred-timeout events are signed (forgery is detected)
// 3. verifyChain() gives integrators a complete chain verifier
//
// Plus negative paths: reorder, middle-tamper, unknown keys, foreign
// anchors, and strict-vs-legacy schema-version handling.

import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  buildChainExtensionEvent,
  buildDeferredTimeoutEvent,
  buildPostureLoadEvent,
  buildTipCommitEvent,
  keyPairFromSeed,
  type KeyPair,
} from "../src/proof-chain.js";
import { verifyChain, type KeyResolver } from "../src/verify-chain.js";
import { GENESIS_TIP } from "../src/executor.js";
import type {
  AgentAction,
  DeferredTimeoutEvent,
  LayerEvidenceEnvelope,
  ProofChainEvent,
  TipCommitEvent,
} from "@vorionsys/basis-gate-spec";

function seed(): Uint8Array {
  return new Uint8Array(randomBytes(32));
}

function makeAction(overrides: Partial<AgentAction> = {}): AgentAction {
  return {
    actionId: "act_0001",
    agentId: "agent_alpha",
    risk: "MEDIUM",
    classes: ["internal-effect"],
    payload: { command: "update-record", target: "crm", fields: 3 },
    receivedAt: "2026-06-12T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvidence(layerId = "layer.tier-check"): LayerEvidenceEnvelope {
  return {
    layerId,
    layerVersion: "1.0.0",
    timestamp: "2026-06-12T00:00:00.100Z",
    durationMs: 4,
    executionMode: "deferred",
    layerMode: "enforce",
    payload: { verdict: "allow" },
  };
}

function resolverFor(...keys: KeyPair[]): KeyResolver {
  const map = new Map(keys.map((k) => [k.keyId, k.publicKey]));
  return (keyId) => map.get(keyId);
}

async function buildTipChain(runtimeKey: KeyPair, n: number) {
  const events: TipCommitEvent[] = [];
  let priorTip = GENESIS_TIP;
  for (let i = 0; i < n; i++) {
    const action = makeAction({ actionId: `act_${i.toString().padStart(4, "0")}` });
    const event = await buildTipCommitEvent({
      action,
      priorChainTip: priorTip,
      syncEvidence: [makeEvidence()],
      runtimeKey,
    });
    events.push(event);
    priorTip = event.tipHash;
  }
  return events;
}

describe("verifyChain — positive paths", () => {
  it("verifies a tip-commit chain end to end and returns the final tip", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const events = await buildTipChain(runtimeKey, 5);
    const result = await verifyChain(events, resolverFor(runtimeKey));
    expect(result).toEqual({ valid: true, tip: events[4].tipHash });
  });

  it("verifies a mixed chain: commits, extension, signed timeout, posture load", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const layerKey = await keyPairFromSeed(seed());
    const [tip0, tip1] = await buildTipChain(runtimeKey, 2);

    const extension = await buildChainExtensionEvent({
      actionId: tip0.actionId,
      anchorTip: tip0.tipHash,
      layerId: "layer.audit-log",
      layerVersion: "1.0.0",
      evidence: makeEvidence("layer.audit-log"),
      layerKey,
      runtimeKey,
    });
    const timeout = await buildDeferredTimeoutEvent({
      actionId: tip1.actionId,
      anchorTip: tip1.tipHash,
      layerId: "layer.slow-check",
      declaredDeadline: "2026-06-12T00:05:00.000Z",
      runtimeKey,
    });
    const posture = await buildPostureLoadEvent({
      postureId: "posture_standard",
      posture: { preset: "standard" },
      resolvedPipeline: ["layer.tier-check", "layer.audit-log"],
      runtimeKey,
    });

    const chain: ProofChainEvent[] = [tip0, tip1, extension, timeout, posture];
    const result = await verifyChain(chain, resolverFor(runtimeKey, layerKey));
    expect(result.valid).toBe(true);
    expect(result.tip).toBe(tip1.tipHash);
  });
});

describe("verifyChain — timestamp tamper-evidence (gap 1)", () => {
  it("rejects a tip-commit whose stored createdAt was rewritten", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const events = await buildTipChain(runtimeKey, 3);
    events[1] = { ...events[1], createdAt: "2020-01-01T00:00:00.000Z" };
    const result = await verifyChain(events, resolverFor(runtimeKey));
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(1);
    expect(result.reason).toContain("signature");
  });

  it("rejects a chain-extension whose stored createdAt was rewritten", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const layerKey = await keyPairFromSeed(seed());
    const [tip] = await buildTipChain(runtimeKey, 1);
    const extension = await buildChainExtensionEvent({
      actionId: tip.actionId,
      anchorTip: tip.tipHash,
      layerId: "layer.audit-log",
      layerVersion: "1.0.0",
      evidence: makeEvidence("layer.audit-log"),
      layerKey,
      runtimeKey,
    });
    const tampered = { ...extension, createdAt: "2020-01-01T00:00:00.000Z" };
    const result = await verifyChain([tip, tampered], resolverFor(runtimeKey, layerKey));
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(1);
  });

  it("rejects a posture-load whose stored createdAt was rewritten", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const posture = await buildPostureLoadEvent({
      postureId: "posture_standard",
      posture: { preset: "standard" },
      resolvedPipeline: ["layer.tier-check"],
      runtimeKey,
    });
    const tampered = { ...posture, createdAt: "2020-01-01T00:00:00.000Z" };
    const result = await verifyChain([tampered], resolverFor(runtimeKey));
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(0);
  });
});

describe("verifyChain — signed timeout events (gap 2)", () => {
  it("accepts a runtime-built (signed) timeout event", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const [tip] = await buildTipChain(runtimeKey, 1);
    const timeout = await buildDeferredTimeoutEvent({
      actionId: tip.actionId,
      anchorTip: tip.tipHash,
      layerId: "layer.slow-check",
      declaredDeadline: "2026-06-12T00:05:00.000Z",
      runtimeKey,
    });
    expect(timeout.schemaVersion).toBe(2);
    expect(timeout.timeoutSignature).toBeDefined();
    const result = await verifyChain([tip, timeout], resolverFor(runtimeKey));
    expect(result.valid).toBe(true);
  });

  it("rejects a forged timeout event (no signature, claims v2)", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const [tip] = await buildTipChain(runtimeKey, 1);
    const forged: DeferredTimeoutEvent = {
      kind: "deferred-timeout",
      schemaVersion: 2,
      actionId: tip.actionId,
      anchorTip: tip.tipHash,
      layerId: "layer.slow-check",
      declaredDeadline: "2026-06-12T00:05:00.000Z",
      signedBy: runtimeKey.keyId,
      createdAt: new Date().toISOString(),
    };
    const result = await verifyChain([tip, forged], resolverFor(runtimeKey));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("missing its signature");
  });

  it("rejects a timeout whose declaredDeadline was altered after signing", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const [tip] = await buildTipChain(runtimeKey, 1);
    const timeout = await buildDeferredTimeoutEvent({
      actionId: tip.actionId,
      anchorTip: tip.tipHash,
      layerId: "layer.slow-check",
      declaredDeadline: "2026-06-12T00:05:00.000Z",
      runtimeKey,
    });
    const tampered = { ...timeout, declaredDeadline: "2030-01-01T00:00:00.000Z" };
    const result = await verifyChain([tip, tampered], resolverFor(runtimeKey));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("signature verification failed");
  });
});

describe("verifyChain — structural attacks", () => {
  it("rejects reordered tip-commits", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const events = await buildTipChain(runtimeKey, 4);
    const reordered = [events[0], events[2], events[1], events[3]];
    const result = await verifyChain(reordered, resolverFor(runtimeKey));
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(1);
    expect(result.reason).toContain("does not match expected tip");
  });

  it("rejects a middle event replaced with a self-consistent forgery", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const events = await buildTipChain(runtimeKey, 4);
    const forgedAction = makeAction({ actionId: events[2].actionId, payload: { command: "noop" } });
    events[2] = await buildTipCommitEvent({
      action: forgedAction,
      priorChainTip: events[1].tipHash,
      syncEvidence: [],
      runtimeKey,
    });
    const result = await verifyChain(events, resolverFor(runtimeKey));
    // The forgery itself verifies, but event 3's priorChainTip pins the
    // original tipHash, so the walk breaks at the next link.
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(3);
  });

  it("rejects signatures from an unknown key", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const otherKey = await keyPairFromSeed(seed());
    const events = await buildTipChain(runtimeKey, 2);
    const result = await verifyChain(events, resolverFor(otherKey));
    expect(result.valid).toBe(false);
    expect(result.failedAt).toBe(0);
    expect(result.reason).toContain("unknown signer key");
  });

  it("rejects an extension anchored to a tip that was never committed", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const layerKey = await keyPairFromSeed(seed());
    const [tip] = await buildTipChain(runtimeKey, 1);
    const extension = await buildChainExtensionEvent({
      actionId: tip.actionId,
      anchorTip: "f".repeat(64),
      layerId: "layer.audit-log",
      layerVersion: "1.0.0",
      evidence: makeEvidence("layer.audit-log"),
      layerKey,
      runtimeKey,
    });
    const result = await verifyChain([tip, extension], resolverFor(runtimeKey, layerKey));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("unknown tip");
  });

  it("rejects an extension whose actionId does not match its anchor's action", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const layerKey = await keyPairFromSeed(seed());
    const [tip] = await buildTipChain(runtimeKey, 1);
    const extension = await buildChainExtensionEvent({
      actionId: "act_9999",
      anchorTip: tip.tipHash,
      layerId: "layer.audit-log",
      layerVersion: "1.0.0",
      evidence: makeEvidence("layer.audit-log"),
      layerKey,
      runtimeKey,
    });
    const result = await verifyChain([tip, extension], resolverFor(runtimeKey, layerKey));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("does not match anchored action");
  });

  it("tail truncation is the caller's check: returned tip exposes it", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const events = await buildTipChain(runtimeKey, 4);
    const truncated = events.slice(0, 2);
    const result = await verifyChain(truncated, resolverFor(runtimeKey));
    // A truncated prefix is internally valid…
    expect(result.valid).toBe(true);
    // …but its tip differs from the externally stored expected tip.
    expect(result.tip).not.toBe(events[3].tipHash);
  });
});

describe("verifyChain — schema-version handling", () => {
  /** Simulate an event recorded by a pre-hardening (v1) runtime. */
  function downgrade<T extends ProofChainEvent>(event: T): T {
    const v1 = { ...event } as Record<string, unknown>;
    delete v1.schemaVersion;
    return v1 as T;
  }

  it("strict mode (default) rejects legacy v1 events", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const [tip] = await buildTipChain(runtimeKey, 1);
    const result = await verifyChain([downgrade(tip)], resolverFor(runtimeKey));
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("legacy schema-version-1");
  });

  it("legacyTimestamps mode accepts v1-style chains via linkage checks", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    // A v1 tip-commit signed the bare tipHash; reconstruct that shape.
    const action = makeAction();
    const { hashTip, signHex } = await import("../src/proof-chain.js");
    const tipHash = hashTip(action, GENESIS_TIP, []);
    const v1Tip: TipCommitEvent = {
      kind: "tip-commit",
      actionId: action.actionId,
      priorChainTip: GENESIS_TIP,
      tipHash,
      syncEvidence: [],
      tipSignature: await signHex(runtimeKey, tipHash),
      signedBy: runtimeKey.keyId,
      createdAt: new Date().toISOString(),
    };
    const v1Timeout: DeferredTimeoutEvent = {
      kind: "deferred-timeout",
      actionId: action.actionId,
      anchorTip: tipHash,
      layerId: "layer.slow-check",
      declaredDeadline: "2026-06-12T00:05:00.000Z",
      signedBy: runtimeKey.keyId,
      createdAt: new Date().toISOString(),
    };
    const strict = await verifyChain([v1Tip, v1Timeout], resolverFor(runtimeKey));
    expect(strict.valid).toBe(false);
    const legacy = await verifyChain([v1Tip, v1Timeout], resolverFor(runtimeKey), {
      legacyTimestamps: true,
    });
    expect(legacy.valid).toBe(true);
    expect(legacy.tip).toBe(tipHash);
  });
});
