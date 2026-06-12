// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Bundled proof-chain verifier.
//
// Walks an ordered sequence of proof-chain events the way an external
// auditor would: every signature is checked, every tip-commit must link to
// the previous tip, and every extension/timeout must anchor to a tip that
// was actually committed earlier in the walk.
//
// Schema-version handling (see spec `ProofSchemaVersion`):
// - Version 2 events sign `bindTimestamp(baseHash, createdAt)`, so stored
//   timestamps are tamper-evident, and timeout events carry a signature.
// - Version 1 (legacy) events sign only the base hash, and timeout events
//   are UNSIGNED. Strict mode (the default) rejects them; pass
//   `{ legacyTimestamps: true }` to accept chains recorded by runtimes
//   published before schema version 2. In legacy mode, checks that are
//   impossible on v1 events (timeout signatures, extension signatures
//   without key ids) are skipped — linkage checks still apply.
//
// Note on truncation: removing events from the END of a chain is not
// detectable from the events alone. Callers MUST compare the returned
// `tip` against an externally stored expected tip to rule out truncation.

import type { ProofChainEvent } from "@vorionsys/basis-gate-spec";
import {
  bindTimestamp,
  hashExtension,
  hashPostureLoad,
  hashTimeout,
  verifyHex,
} from "./proof-chain.js";
import { GENESIS_TIP } from "./executor.js";

/**
 * Resolves a key id (e.g. `k_3fa9c2…`) to its Ed25519 public key, or
 * undefined if unknown. May be async (e.g. a registry lookup).
 */
export type KeyResolver = (
  keyId: string,
) => Uint8Array | undefined | Promise<Uint8Array | undefined>;

export interface VerifyChainOptions {
  /** Expected tip before the first event. Defaults to GENESIS_TIP. */
  genesisTip?: string;
  /**
   * Accept legacy (schema version 1) events whose timestamps are not
   * signature-covered and whose timeout events are unsigned. Default false.
   */
  legacyTimestamps?: boolean;
}

export interface VerifyChainResult {
  valid: boolean;
  /** Index into `events` of the first failure. */
  failedAt?: number;
  reason?: string;
  /** The final chain tip after a fully valid walk. */
  tip?: string;
}

function fail(index: number, reason: string): VerifyChainResult {
  return { valid: false, failedAt: index, reason };
}

/**
 * Verify an ordered proof-chain event sequence.
 *
 * Checks, per event kind:
 * - `tip-commit`: priorChainTip continuity from genesis, signature over the
 *   (v2: timestamp-bound) tip hash by `signedBy`.
 * - `chain-extension`: anchors to a previously committed tip of the same
 *   action; extension hash recomputed from the stored evidence; both the
 *   layer signature and runtime attestation verify (v2).
 * - `deferred-timeout`: anchors to a previously committed tip of the same
 *   action; signed timeout digest verifies (v2; v1 has no signature).
 * - `posture-load`: posture digest recomputed from stored fields; signature
 *   verifies.
 */
export async function verifyChain(
  events: readonly ProofChainEvent[],
  resolveKey: KeyResolver,
  options: VerifyChainOptions = {},
): Promise<VerifyChainResult> {
  const strict = !options.legacyTimestamps;
  let expectedTip = options.genesisTip ?? GENESIS_TIP;
  /** tipHash → actionId for every tip-commit seen so far. */
  const committedTips = new Map<string, string>();

  for (const [i, event] of events.entries()) {
    const version = event.schemaVersion ?? 1;
    if (version === 1 && strict) {
      return fail(
        i,
        `legacy schema-version-1 event (${event.kind}) has no signed timestamp; ` +
          "rejected in strict mode (pass legacyTimestamps: true to accept)",
      );
    }

    switch (event.kind) {
      case "tip-commit": {
        if (event.priorChainTip !== expectedTip) {
          return fail(
            i,
            `tip-commit priorChainTip ${event.priorChainTip} does not match expected tip ${expectedTip}`,
          );
        }
        const key = await resolveKey(event.signedBy);
        if (!key) return fail(i, `unknown signer key ${event.signedBy}`);
        const digest =
          version >= 2 ? bindTimestamp(event.tipHash, event.createdAt) : event.tipHash;
        if (!(await verifyHex(key, digest, event.tipSignature))) {
          return fail(i, "tip-commit signature verification failed");
        }
        committedTips.set(event.tipHash, event.actionId);
        expectedTip = event.tipHash;
        break;
      }

      case "chain-extension": {
        const anchorAction = committedTips.get(event.anchorTip);
        if (anchorAction === undefined) {
          return fail(i, `chain-extension anchors to unknown tip ${event.anchorTip}`);
        }
        if (anchorAction !== event.actionId) {
          return fail(
            i,
            `chain-extension actionId ${event.actionId} does not match anchored action ${anchorAction}`,
          );
        }
        const digest = hashExtension(event.actionId, event.anchorTip, event.evidence);
        if (version >= 2) {
          if (!event.layerSignedBy || !event.runtimeSignedBy) {
            return fail(i, "schema-version-2 chain-extension is missing signer key ids");
          }
          const bound = bindTimestamp(digest, event.createdAt);
          const layerKey = await resolveKey(event.layerSignedBy);
          if (!layerKey) return fail(i, `unknown layer key ${event.layerSignedBy}`);
          if (!(await verifyHex(layerKey, bound, event.layerSignature))) {
            return fail(i, "chain-extension layer signature verification failed");
          }
          const runtimeKey = await resolveKey(event.runtimeSignedBy);
          if (!runtimeKey) return fail(i, `unknown runtime key ${event.runtimeSignedBy}`);
          if (!(await verifyHex(runtimeKey, bound, event.runtimeAttestation))) {
            return fail(i, "chain-extension runtime attestation verification failed");
          }
        }
        // v1 extension events carry no key ids; in legacy mode the linkage
        // checks above are the strongest available guarantee.
        break;
      }

      case "deferred-timeout": {
        const anchorAction = committedTips.get(event.anchorTip);
        if (anchorAction === undefined) {
          return fail(i, `deferred-timeout anchors to unknown tip ${event.anchorTip}`);
        }
        if (anchorAction !== event.actionId) {
          return fail(
            i,
            `deferred-timeout actionId ${event.actionId} does not match anchored action ${anchorAction}`,
          );
        }
        if (version >= 2) {
          if (!event.timeoutSignature) {
            return fail(i, "schema-version-2 deferred-timeout is missing its signature");
          }
          const key = await resolveKey(event.signedBy);
          if (!key) return fail(i, `unknown signer key ${event.signedBy}`);
          const digest = hashTimeout({
            actionId: event.actionId,
            anchorTip: event.anchorTip,
            layerId: event.layerId,
            declaredDeadline: event.declaredDeadline,
            createdAt: event.createdAt,
          });
          if (!(await verifyHex(key, digest, event.timeoutSignature))) {
            return fail(i, "deferred-timeout signature verification failed");
          }
        }
        // v1 timeout events are unsigned; in legacy mode only the anchor
        // checks apply.
        break;
      }

      case "posture-load": {
        const key = await resolveKey(event.signedBy);
        if (!key) return fail(i, `unknown signer key ${event.signedBy}`);
        const base = hashPostureLoad(
          event.postureId,
          event.posture,
          event.resolvedPipeline,
        );
        const digest = version >= 2 ? bindTimestamp(base, event.createdAt) : base;
        if (!(await verifyHex(key, digest, event.postureSignature))) {
          return fail(i, "posture-load signature verification failed");
        }
        break;
      }

      default: {
        const unknown = event as { kind: string };
        return fail(i, `unknown event kind ${unknown.kind}`);
      }
    }
  }

  return { valid: true, tip: expectedTip };
}
