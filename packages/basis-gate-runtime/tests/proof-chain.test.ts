// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Proof-chain primitive tests — BASIS Gate v1 § 7.
//
// Covers: key derivation, sign/verify round-trips, tip hashing
// determinism, tip-commit construction, hash-chain linkage across
// multiple commits, and tamper detection at both the payload and the
// chain-link level.

import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import {
  bindTimestamp,
  buildChainExtensionEvent,
  buildTipCommitEvent,
  bytesToHex,
  derivePublicKey,
  hashExtension,
  hashTip,
  hexToBytes,
  keyPairFromSeed,
  signHex,
  verifyHex,
  type KeyPair,
} from "../src/proof-chain.js";
import { GENESIS_TIP } from "../src/executor.js";
import type {
  AgentAction,
  LayerEvidenceEnvelope,
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
    executionMode: "block",
    layerMode: "enforce",
    payload: { verdict: "allow", tierObserved: 3 },
  };
}

describe("key derivation", () => {
  it("derives a 32-byte public key and k_-prefixed keyId from a seed", async () => {
    const kp = await keyPairFromSeed(seed());
    expect(kp.publicKey).toHaveLength(32);
    expect(kp.keyId).toMatch(/^k_[0-9a-f]{16}$/);
  });

  it("is deterministic for the same seed", async () => {
    const s = seed();
    const a = await keyPairFromSeed(s);
    const b = await keyPairFromSeed(s);
    expect(bytesToHex(a.publicKey)).toBe(bytesToHex(b.publicKey));
    expect(a.keyId).toBe(b.keyId);
  });

  it("rejects seeds that are not exactly 32 bytes", async () => {
    await expect(derivePublicKey(new Uint8Array(31))).rejects.toThrow(
      "32 bytes",
    );
    await expect(derivePublicKey(new Uint8Array(33))).rejects.toThrow(
      "32 bytes",
    );
  });
});

describe("sign/verify round-trip", () => {
  it("verifies a signature produced by the matching key", async () => {
    const kp = await keyPairFromSeed(seed());
    const digest = bytesToHex(new Uint8Array(randomBytes(32)));
    const sig = await signHex(kp, digest);
    await expect(verifyHex(kp.publicKey, digest, sig)).resolves.toBe(true);
  });

  it("rejects a signature checked against a different key", async () => {
    const signer = await keyPairFromSeed(seed());
    const other = await keyPairFromSeed(seed());
    const digest = bytesToHex(new Uint8Array(randomBytes(32)));
    const sig = await signHex(signer, digest);
    await expect(verifyHex(other.publicKey, digest, sig)).resolves.toBe(false);
  });

  it("rejects a signature over a tampered digest", async () => {
    const kp = await keyPairFromSeed(seed());
    const digest = bytesToHex(new Uint8Array(randomBytes(32)));
    const sig = await signHex(kp, digest);
    const tampered =
      (digest[0] === "0" ? "1" : "0") + digest.slice(1);
    await expect(verifyHex(kp.publicKey, tampered, sig)).resolves.toBe(false);
  });
});

describe("tip hashing", () => {
  it("is deterministic for identical inputs", () => {
    const action = makeAction();
    const ev = [makeEvidence()];
    expect(hashTip(action, GENESIS_TIP, ev)).toBe(
      hashTip(action, GENESIS_TIP, ev),
    );
  });

  it("is invariant to object key ordering (canonical JSON)", () => {
    const a = makeAction({
      payload: { alpha: 1, beta: 2, gamma: { x: 1, y: 2 } },
    });
    const b = makeAction({
      payload: { gamma: { y: 2, x: 1 }, beta: 2, alpha: 1 },
    });
    expect(hashTip(a, GENESIS_TIP, [])).toBe(hashTip(b, GENESIS_TIP, []));
  });

  it("changes when the action, prior tip, or evidence changes", () => {
    const base = hashTip(makeAction(), GENESIS_TIP, []);
    expect(hashTip(makeAction({ actionId: "act_0002" }), GENESIS_TIP, [])).not.toBe(base);
    expect(hashTip(makeAction(), "f".repeat(64), [])).not.toBe(base);
    expect(hashTip(makeAction(), GENESIS_TIP, [makeEvidence()])).not.toBe(base);
  });
});

describe("tip-commit events", () => {
  it("produces a verifiable event whose hash recomputes from its inputs", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const action = makeAction();
    const evidence = [makeEvidence()];
    const event = await buildTipCommitEvent({
      action,
      priorChainTip: GENESIS_TIP,
      syncEvidence: evidence,
      runtimeKey,
    });

    expect(event.kind).toBe("tip-commit");
    expect(event.schemaVersion).toBe(2);
    expect(event.actionId).toBe(action.actionId);
    expect(event.signedBy).toBe(runtimeKey.keyId);
    // Independent verifier path: recompute the hash, check the signature
    // over the timestamp-bound digest (schema version 2).
    expect(hashTip(action, GENESIS_TIP, evidence)).toBe(event.tipHash);
    await expect(
      verifyHex(
        runtimeKey.publicKey,
        bindTimestamp(event.tipHash, event.createdAt),
        event.tipSignature,
      ),
    ).resolves.toBe(true);
  });

  it("detects payload tampering: recomputed hash no longer matches the committed tip", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const action = makeAction();
    const event = await buildTipCommitEvent({
      action,
      priorChainTip: GENESIS_TIP,
      syncEvidence: [],
      runtimeKey,
    });

    const tampered = makeAction({
      payload: { command: "update-record", target: "crm", fields: 9999 },
    });
    expect(hashTip(tampered, GENESIS_TIP, [])).not.toBe(event.tipHash);
  });
});

describe("chain linkage", () => {
  /**
   * Walks a chain the way an external verifier would: each event's
   * tipHash must recompute from (action, prior event's tipHash,
   * evidence), each signature must verify, and each priorChainTip must
   * equal the previous event's tipHash.
   */
  async function verifyChainWalk(
    events: TipCommitEvent[],
    actions: AgentAction[],
    runtimeKey: KeyPair,
  ): Promise<{ ok: boolean; failedAt: number }> {
    let priorTip = GENESIS_TIP;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e.priorChainTip !== priorTip) return { ok: false, failedAt: i };
      const recomputed = hashTip(actions[i], e.priorChainTip, e.syncEvidence);
      if (recomputed !== e.tipHash) return { ok: false, failedAt: i };
      const sigOk = await verifyHex(
        runtimeKey.publicKey,
        bindTimestamp(e.tipHash, e.createdAt),
        e.tipSignature,
      );
      if (!sigOk) return { ok: false, failedAt: i };
      priorTip = e.tipHash;
    }
    return { ok: true, failedAt: -1 };
  }

  async function buildChain(runtimeKey: KeyPair, n: number) {
    const actions: AgentAction[] = [];
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
      actions.push(action);
      events.push(event);
      priorTip = event.tipHash;
    }
    return { actions, events };
  }

  it("a well-formed multi-event chain verifies end to end from genesis", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const { actions, events } = await buildChain(runtimeKey, 5);
    expect(events[0].priorChainTip).toBe(GENESIS_TIP);
    await expect(verifyChainWalk(events, actions, runtimeKey)).resolves.toEqual(
      { ok: true, failedAt: -1 },
    );
  });

  it("tampering with a middle action breaks verification at that link", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const { actions, events } = await buildChain(runtimeKey, 5);
    actions[2] = makeAction({
      actionId: actions[2].actionId,
      payload: { command: "exfiltrate", target: "all-records" },
    });
    const result = await verifyChainWalk(events, actions, runtimeKey);
    expect(result.ok).toBe(false);
    expect(result.failedAt).toBe(2);
  });

  it("rewriting a middle event's tipHash is caught by the next link's priorChainTip", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const { actions, events } = await buildChain(runtimeKey, 5);
    // Forge event 2 entirely — even a self-consistent forgery breaks the
    // link to event 3, whose priorChainTip pins the original tipHash.
    const forgedAction = makeAction({
      actionId: actions[2].actionId,
      payload: { command: "noop" },
    });
    events[2] = await buildTipCommitEvent({
      action: forgedAction,
      priorChainTip: events[1].tipHash,
      syncEvidence: events[2].syncEvidence,
      runtimeKey,
    });
    actions[2] = forgedAction;
    const result = await verifyChainWalk(events, actions, runtimeKey);
    expect(result.ok).toBe(false);
    expect(result.failedAt).toBe(3); // detected where the chain no longer connects
  });

  it("a chain signed by a different key fails signature verification", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const impostor = await keyPairFromSeed(seed());
    const { actions, events } = await buildChain(runtimeKey, 3);
    const result = await verifyChainWalk(events, actions, impostor);
    expect(result.ok).toBe(false);
    expect(result.failedAt).toBe(0);
  });
});

describe("chain-extension events (deferred layers)", () => {
  it("carries both a layer signature and a runtime attestation over the same digest", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const layerKey = await keyPairFromSeed(seed());
    const evidence = makeEvidence("layer.audit-log");
    const anchorTip = "a".repeat(64);

    const event = await buildChainExtensionEvent({
      actionId: "act_0001",
      anchorTip,
      layerId: "layer.audit-log",
      layerVersion: "1.0.0",
      evidence,
      layerKey,
      runtimeKey,
    });

    const digest = hashExtension("act_0001", anchorTip, evidence);
    const bound = bindTimestamp(digest, event.createdAt);
    expect(event.layerSignedBy).toBe(layerKey.keyId);
    expect(event.runtimeSignedBy).toBe(runtimeKey.keyId);
    await expect(
      verifyHex(layerKey.publicKey, bound, event.layerSignature),
    ).resolves.toBe(true);
    await expect(
      verifyHex(runtimeKey.publicKey, bound, event.runtimeAttestation),
    ).resolves.toBe(true);
  });

  it("detects tampered deferred evidence", async () => {
    const runtimeKey = await keyPairFromSeed(seed());
    const layerKey = await keyPairFromSeed(seed());
    const evidence = makeEvidence("layer.audit-log");
    const anchorTip = "a".repeat(64);
    const event = await buildChainExtensionEvent({
      actionId: "act_0001",
      anchorTip,
      layerId: "layer.audit-log",
      layerVersion: "1.0.0",
      evidence,
      layerKey,
      runtimeKey,
    });

    const tampered = { ...evidence, payload: { verdict: "deny" } };
    const tamperedDigest = hashExtension("act_0001", anchorTip, tampered);
    await expect(
      verifyHex(
        layerKey.publicKey,
        bindTimestamp(tamperedDigest, event.createdAt),
        event.layerSignature,
      ),
    ).resolves.toBe(false);
  });
});

describe("hex helpers", () => {
  it("round-trips bytes through hex", () => {
    const bytes = new Uint8Array(randomBytes(64));
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
  });

  it("rejects odd-length hex", () => {
    expect(() => hexToBytes("abc")).toThrow("odd-length");
  });

  it("rejects non-hex characters", () => {
    expect(() => hexToBytes("zz")).toThrow("invalid hex");
  });
});
