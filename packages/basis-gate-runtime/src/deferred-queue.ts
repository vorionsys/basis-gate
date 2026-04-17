// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// In-process deferred-layer queue.
//
// This is the minimum viable implementation of the deferred execution
// channel defined in BASIS Gate v1 § 4 and § 7.2. It holds scheduled work
// in memory, executes it after the synchronous phase returns, and emits
// chain-extension events or deferred-timeout events as appropriate.
//
// Production deployments should replace this with a queue backed by
// durable storage (database-backed outbox, message bus, etc.) so that
// in-flight deferred work survives restarts.

import type {
  AgentAction,
  ChainExtensionEvent,
  DeferredTimeoutEvent,
  GateLayer,
  LayerEvidenceEnvelope,
} from "@vorionsys/basis-gate-spec";
import {
  buildChainExtensionEvent,
  buildDeferredTimeoutEvent,
  type KeyPair,
} from "./proof-chain.js";

export type DeferredEventSink = (
  event: ChainExtensionEvent | DeferredTimeoutEvent,
) => void | Promise<void>;

export interface DeferredJob {
  action: AgentAction;
  anchorTip: string;
  layer: GateLayer;
  contextAgentTier: import("@vorionsys/basis-gate-spec").TrustTier;
  postureId: string;
  priorChainTip: string;
  layerMode: "enforce" | "observe" | "shadow";
}

export interface DeferredQueueOptions {
  runtimeKey: KeyPair;
  /** Map from layer id to the Ed25519 key pair that layer signs with. */
  layerKeys: ReadonlyMap<string, KeyPair>;
  /** Maximum time a deferred layer may take before timing out. */
  deferralWindowMs: number;
  /** Sink invoked for each emitted event. */
  emit: DeferredEventSink;
}

export class DeferredQueue {
  private readonly opts: DeferredQueueOptions;
  private inFlight = new Set<Promise<void>>();

  constructor(opts: DeferredQueueOptions) {
    this.opts = opts;
  }

  schedule(job: DeferredJob): void {
    const p = this.run(job).catch((e) => {
      // Surface errors to stderr so they are observable without crashing.
      // Production embedders should replace this with structured logging.
      process.stderr.write(
        `[basis-gate-runtime] deferred job failed for ${job.layer.id}: ${(e as Error).message}\n`,
      );
    });
    this.inFlight.add(p);
    p.finally(() => this.inFlight.delete(p));
  }

  /**
   * Wait for all currently scheduled jobs to complete. Intended for tests and
   * graceful shutdown. Does not prevent new jobs from being scheduled.
   */
  async drain(): Promise<void> {
    await Promise.all(this.inFlight);
  }

  // -------------------------------------------------------------------------

  private async run(job: DeferredJob): Promise<void> {
    const start = Date.now();
    const deadline = new Date(start + this.opts.deferralWindowMs).toISOString();

    // Race the layer against the deferral window.
    let timedOut = false;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        timedOut = true;
        reject(new Error("deferral window exceeded"));
      }, this.opts.deferralWindowMs).unref?.();
    });

    try {
      const decision = await Promise.race([
        job.layer.run(
          {
            action: job.action,
            agentTier: job.contextAgentTier,
            priorChainTip: job.priorChainTip,
            postureId: job.postureId,
            accumulatedEvidence: [],
          },
          job.action,
        ),
        timeoutPromise,
      ]);

      const envelope: LayerEvidenceEnvelope = {
        layerId: job.layer.id,
        layerVersion: job.layer.version,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
        executionMode: "deferred",
        layerMode: job.layerMode,
        payload: (decision.evidence as LayerEvidenceEnvelope).payload ?? {},
      };

      const layerKey = this.opts.layerKeys.get(job.layer.id) ?? this.opts.runtimeKey;
      const event = await buildChainExtensionEvent({
        actionId: job.action.actionId,
        anchorTip: job.anchorTip,
        layerId: job.layer.id,
        layerVersion: job.layer.version,
        evidence: envelope,
        layerKey,
        runtimeKey: this.opts.runtimeKey,
      });
      await this.opts.emit(event);
    } catch (err) {
      if (timedOut) {
        const event = await buildDeferredTimeoutEvent({
          actionId: job.action.actionId,
          anchorTip: job.anchorTip,
          layerId: job.layer.id,
          declaredDeadline: deadline,
          runtimeKey: this.opts.runtimeKey,
        });
        await this.opts.emit(event);
      } else {
        throw err;
      }
    }
  }
}
