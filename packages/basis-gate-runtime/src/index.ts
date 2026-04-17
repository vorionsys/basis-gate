// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// GateRuntime — the top-level facade for the reference BASIS Gate v1
// implementation. Consumers instantiate a runtime with a posture, a
// registry of layer implementations, signing keys, and a set of I/O
// hooks (proof-chain persistence, tier lookup, audit sink). They then
// call `gate()` for each action.
//
// This module re-exports the supporting types so that integrators can
// import everything from one entry point.

import type {
  AgentAction,
  ChainExtensionEvent,
  DeferredTimeoutEvent,
  GateLayer,
  IndustryProfile,
  LayerEvidenceEnvelope,
  Posture,
  PostureLoadEvent,
  ProofChainEvent,
  RiskLevel,
  TipCommitEvent,
  TrustTier,
} from "@vorionsys/basis-gate-spec";
import { loadBuiltinProfile, BUILTIN_PROFILE_IDS } from "@vorionsys/basis-gate-industry";
import type { BuiltinProfileId } from "@vorionsys/basis-gate-industry";
import {
  buildPostureLoadEvent,
  keyPairFromSeed,
  type KeyPair,
} from "./proof-chain.js";
import { resolvePosture, type ResolvedPipeline } from "./resolver.js";
import { Executor, GENESIS_TIP, type SyncVerdict } from "./executor.js";
import { DeferredQueue } from "./deferred-queue.js";

export interface GateRuntimeOptions {
  posture: Posture;
  /** 32-byte Ed25519 private key seed for the runtime's signing key. */
  signingKeySeed: Uint8Array;
  /**
   * Map from layer id to the implementation. Must include every layer
   * the resolved pipeline references.
   */
  layers: Iterable<GateLayer>;
  /**
   * Map from layer id to a 32-byte Ed25519 key seed for layer-side signing
   * of deferred evidence. Layers without an entry sign with the runtime key.
   */
  layerSigningKeys?: ReadonlyMap<string, Uint8Array>;
  /** Maximum deferral window for deferred layers. Default 72h. */
  deferralWindowMs?: number;
  /** Emit every proof-chain event. Replace with durable sink in production. */
  emit?: (event: ProofChainEvent) => void | Promise<void>;
  /** Look up an agent's current trust tier. */
  getAgentTier: (agentId: string) => TrustTier | Promise<TrustTier>;
  /** Read the current chain tip (defaults to genesis if not supplied). */
  getPriorChainTip?: () => string | Promise<string>;
}

const DEFAULT_DEFERRAL_WINDOW_MS = 72 * 60 * 60 * 1000;

export class GateRuntime {
  private readonly options: GateRuntimeOptions;
  private readonly runtimeKey: KeyPair;
  private readonly layerKeys: ReadonlyMap<string, KeyPair>;
  private readonly registry: ReadonlyMap<string, GateLayer>;
  private readonly pipeline: ResolvedPipeline;
  private readonly postureLoadEvent: PostureLoadEvent;
  private readonly executor: Executor;
  private readonly deferredQueue: DeferredQueue;

  private constructor(
    options: GateRuntimeOptions,
    runtimeKey: KeyPair,
    layerKeys: ReadonlyMap<string, KeyPair>,
    registry: ReadonlyMap<string, GateLayer>,
    pipeline: ResolvedPipeline,
    postureLoadEvent: PostureLoadEvent,
    executor: Executor,
    deferredQueue: DeferredQueue,
  ) {
    this.options = options;
    this.runtimeKey = runtimeKey;
    this.layerKeys = layerKeys;
    this.registry = registry;
    this.pipeline = pipeline;
    this.postureLoadEvent = postureLoadEvent;
    this.executor = executor;
    this.deferredQueue = deferredQueue;
  }

  static async create(options: GateRuntimeOptions): Promise<GateRuntime> {
    const runtimeKey = await keyPairFromSeed(options.signingKeySeed);
    const layerKeys = new Map<string, KeyPair>();
    for (const [id, seed] of options.layerSigningKeys ?? new Map()) {
      layerKeys.set(id, await keyPairFromSeed(seed));
    }

    const registry = new Map<string, GateLayer>();
    for (const layer of options.layers) {
      registry.set(layer.id, layer);
    }

    // Load industry profile if named. Only built-ins are supported in this
    // reference implementation; integrators extend the loader for custom
    // namespaces.
    let profile: IndustryProfile | undefined;
    if (options.posture.industry) {
      const id = options.posture.industry;
      if (!(BUILTIN_PROFILE_IDS as readonly string[]).includes(id)) {
        throw new Error(
          `runtime does not recognize industry profile '${id}' (extend the loader for non-builtin profiles)`,
        );
      }
      profile = await loadBuiltinProfile(id as BuiltinProfileId);
    }

    const pipeline = resolvePosture({
      posture: options.posture,
      industryProfile: profile,
      registry,
    });

    const emit = options.emit ?? NOOP_EMIT;

    const deferredQueue = new DeferredQueue({
      runtimeKey,
      layerKeys,
      deferralWindowMs: options.deferralWindowMs ?? DEFAULT_DEFERRAL_WINDOW_MS,
      emit: async (event) => {
        await emit(event);
      },
    });

    const executor = new Executor({
      registry,
      runtimeKey,
      deferredQueue,
      getAgentTier: options.getAgentTier,
      getPriorChainTip: options.getPriorChainTip,
    });

    const postureLoadEvent = await buildPostureLoadEvent({
      postureId: pipeline.postureId,
      posture: options.posture,
      resolvedPipeline: pipeline.entries.map((e) => e.id),
      runtimeKey,
    });
    await emit(postureLoadEvent);

    return new GateRuntime(
      options,
      runtimeKey,
      layerKeys,
      registry,
      pipeline,
      postureLoadEvent,
      executor,
      deferredQueue,
    );
  }

  async gate(action: AgentAction): Promise<SyncVerdict> {
    const result = await this.executor.run({ action, pipeline: this.pipeline });
    const emit = this.options.emit ?? NOOP_EMIT;
    await emit(result.tip);
    return result;
  }

  /** Wait for in-flight deferred jobs. Useful for tests and graceful shutdown. */
  async drain(): Promise<void> {
    await this.deferredQueue.drain();
  }

  /** The resolved pipeline's ordered layer ids. */
  get resolvedLayerIds(): ReadonlyArray<string> {
    return this.pipeline.entries.map((e) => e.id);
  }

  /** The posture-load event emitted at runtime start. */
  get postureLoad(): PostureLoadEvent {
    return this.postureLoadEvent;
  }

  /** The runtime's public key (hex-encoded). */
  get runtimePublicKeyHex(): string {
    return bytesToHexLocal(this.runtimeKey.publicKey);
  }

  /** The runtime's key id. */
  get runtimeKeyId(): string {
    return this.runtimeKey.keyId;
  }
}

// Re-exports ----------------------------------------------------------------

export { resolvePosture, type ResolvedPipeline } from "./resolver.js";
export { Executor, GENESIS_TIP, type SyncVerdict } from "./executor.js";
export {
  DeferredQueue,
  type DeferredJob,
  type DeferredQueueOptions,
} from "./deferred-queue.js";
export {
  canonicalJson,
  canonicalJsonBytes,
} from "./canonical-json.js";
export {
  keyPairFromSeed,
  derivePublicKey,
  hashTip,
  hashExtension,
  signHex,
  verifyHex,
  buildTipCommitEvent,
  buildChainExtensionEvent,
  buildDeferredTimeoutEvent,
  buildPostureLoadEvent,
  bytesToHex,
  hexToBytes,
  concatBytes,
  type KeyPair,
} from "./proof-chain.js";
export {
  loadSigningKeySeed,
  decodeSeed,
  encodeSeed,
  type KeyLoadOptions,
  type KeyLoadResult,
} from "./key-management.js";

const NOOP_EMIT: (event: ProofChainEvent) => void = () => {};

function bytesToHexLocal(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

// Re-export core spec types for convenience so integrators can import
// everything from the runtime package without reaching into the spec.
export type {
  LayerEvidenceEnvelope,
  AgentAction,
  GateLayer,
  IndustryProfile,
  Posture,
  PostureLoadEvent,
  ProofChainEvent,
  TipCommitEvent,
  ChainExtensionEvent,
  DeferredTimeoutEvent,
  TrustTier,
  RiskLevel,
};
