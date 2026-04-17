// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Proof-chain primitives.
//
// Implements the two-stage commit protocol defined in BASIS Gate v1 § 7:
//
//   tip_hash = H(action_canonical_json || prior_chain_tip || sync_evidence)
//   tip_signature = Sign(runtime_key, tip_hash)
//
// And for deferred layers:
//
//   extension_hash = H(action_id || anchor_tip || layer_evidence)
//   layer_signature = Sign(layer_key, extension_hash)
//   runtime_attestation = Sign(runtime_key, extension_hash)
//
// This module does not implement persistence. Storage of emitted events is
// the responsibility of the runtime's embedding application.

import * as ed25519 from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2";
import { canonicalJsonBytes } from "./canonical-json.js";
import type {
  AgentAction,
  ChainExtensionEvent,
  DeferredTimeoutEvent,
  LayerEvidenceEnvelope,
  PostureLoadEvent,
  Posture,
  TipCommitEvent,
} from "@vorionsys/basis-gate-spec";

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  keyId: string;
}

/**
 * Derive a public key from a 32-byte Ed25519 private key seed.
 */
export async function derivePublicKey(privateKey: Uint8Array): Promise<Uint8Array> {
  if (privateKey.length !== 32) {
    throw new Error("Ed25519 private key seed must be 32 bytes");
  }
  return ed25519.getPublicKeyAsync(privateKey);
}

/**
 * Build a KeyPair from a private-key seed. `keyId` is derived as the SHA-256
 * of the public key, truncated to 16 hex characters.
 */
export async function keyPairFromSeed(privateKey: Uint8Array): Promise<KeyPair> {
  const publicKey = await derivePublicKey(privateKey);
  const keyId = "k_" + bytesToHex(sha256(publicKey)).slice(0, 16);
  return { privateKey, publicKey, keyId };
}

// ---------------------------------------------------------------------------
// Hashing and signing helpers
// ---------------------------------------------------------------------------

export function hashTip(
  action: AgentAction,
  priorChainTip: string,
  syncEvidence: LayerEvidenceEnvelope[],
): string {
  const material = concatBytes(
    canonicalJsonBytes(action),
    new TextEncoder().encode(priorChainTip),
    canonicalJsonBytes(syncEvidence),
  );
  return bytesToHex(sha256(material));
}

export function hashExtension(
  actionId: string,
  anchorTip: string,
  evidence: LayerEvidenceEnvelope,
): string {
  const material = concatBytes(
    new TextEncoder().encode(actionId),
    new TextEncoder().encode(anchorTip),
    canonicalJsonBytes(evidence),
  );
  return bytesToHex(sha256(material));
}

export async function signHex(keyPair: KeyPair, hexDigest: string): Promise<string> {
  const msg = hexToBytes(hexDigest);
  const sig = await ed25519.signAsync(msg, keyPair.privateKey);
  return bytesToHex(sig);
}

export async function verifyHex(
  publicKey: Uint8Array,
  hexDigest: string,
  hexSignature: string,
): Promise<boolean> {
  return ed25519.verifyAsync(hexToBytes(hexSignature), hexToBytes(hexDigest), publicKey);
}

// ---------------------------------------------------------------------------
// Event constructors
// ---------------------------------------------------------------------------

export async function buildTipCommitEvent(args: {
  action: AgentAction;
  priorChainTip: string;
  syncEvidence: LayerEvidenceEnvelope[];
  runtimeKey: KeyPair;
}): Promise<TipCommitEvent> {
  const tipHash = hashTip(args.action, args.priorChainTip, args.syncEvidence);
  const tipSignature = await signHex(args.runtimeKey, tipHash);
  return {
    kind: "tip-commit",
    actionId: args.action.actionId,
    priorChainTip: args.priorChainTip,
    tipHash,
    syncEvidence: args.syncEvidence,
    tipSignature,
    signedBy: args.runtimeKey.keyId,
    createdAt: new Date().toISOString(),
  };
}

export async function buildChainExtensionEvent(args: {
  actionId: string;
  anchorTip: string;
  layerId: string;
  layerVersion: string;
  evidence: LayerEvidenceEnvelope;
  layerKey: KeyPair;
  runtimeKey: KeyPair;
}): Promise<ChainExtensionEvent> {
  const digest = hashExtension(args.actionId, args.anchorTip, args.evidence);
  const layerSignature = await signHex(args.layerKey, digest);
  const runtimeAttestation = await signHex(args.runtimeKey, digest);
  return {
    kind: "chain-extension",
    actionId: args.actionId,
    anchorTip: args.anchorTip,
    layerId: args.layerId,
    layerVersion: args.layerVersion,
    evidence: args.evidence,
    layerSignature,
    runtimeAttestation,
    createdAt: new Date().toISOString(),
  };
}

export async function buildDeferredTimeoutEvent(args: {
  actionId: string;
  anchorTip: string;
  layerId: string;
  declaredDeadline: string;
  runtimeKey: KeyPair;
}): Promise<DeferredTimeoutEvent> {
  return {
    kind: "deferred-timeout",
    actionId: args.actionId,
    anchorTip: args.anchorTip,
    layerId: args.layerId,
    declaredDeadline: args.declaredDeadline,
    signedBy: args.runtimeKey.keyId,
    createdAt: new Date().toISOString(),
  };
}

export async function buildPostureLoadEvent(args: {
  postureId: string;
  posture: Posture;
  resolvedPipeline: string[];
  runtimeKey: KeyPair;
}): Promise<PostureLoadEvent> {
  const digest = bytesToHex(
    sha256(
      concatBytes(
        new TextEncoder().encode(args.postureId),
        canonicalJsonBytes(args.posture),
        canonicalJsonBytes(args.resolvedPipeline),
      ),
    ),
  );
  const postureSignature = await signHex(args.runtimeKey, digest);
  return {
    kind: "posture-load",
    postureId: args.postureId,
    posture: args.posture,
    resolvedPipeline: args.resolvedPipeline,
    postureSignature,
    signedBy: args.runtimeKey.keyId,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Byte helpers
// ---------------------------------------------------------------------------

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error("hexToBytes: odd-length input");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error(`hexToBytes: invalid hex at offset ${i * 2}`);
    }
    out[i] = byte;
  }
  return out;
}
