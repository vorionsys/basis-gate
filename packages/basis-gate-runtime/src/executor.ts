// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Pipeline executor.
//
// Implements the action-time flow for a gated request:
//   1. Determine execution mode per layer for the action's risk level.
//   2. Run `block` layers serially. A `deny` verdict halts the pipeline.
//      An `escalate` verdict halts the pipeline and returns the escalation.
//   3. Run `inline` layers in parallel with action dispatch. Their evidence
//      attaches to the synchronous evidence set before the tip is committed.
//   4. Commit the tip and return control to the caller.
//   5. Schedule `deferred` layers for asynchronous execution. Their
//      evidence is emitted as chain-extension events anchored to the tip.

import type {
  AgentAction,
  ExecutionMode,
  GateContext,
  GateLayer,
  LayerEvidenceEnvelope,
  RiskLevel,
  TrustTier,
} from "@vorionsys/basis-gate-spec";
import type { ResolvedPipeline } from "./resolver.js";
import {
  buildTipCommitEvent,
  type KeyPair,
} from "./proof-chain.js";
import { DeferredQueue } from "./deferred-queue.js";

export type SyncVerdict =
  | { verdict: "allow"; tip: import("@vorionsys/basis-gate-spec").TipCommitEvent }
  | {
      verdict: "deny";
      reason: string;
      layerId: string;
      tip: import("@vorionsys/basis-gate-spec").TipCommitEvent;
    }
  | {
      verdict: "escalate";
      to: "human" | "higher-tier";
      reason: string;
      layerId: string;
      tip: import("@vorionsys/basis-gate-spec").TipCommitEvent;
    };

export interface ExecutorOptions {
  registry: ReadonlyMap<string, GateLayer>;
  runtimeKey: KeyPair;
  deferredQueue: DeferredQueue;
  /** Look up the current chain tip (e.g. from storage). Defaults to genesis. */
  getPriorChainTip?: () => string | Promise<string>;
  /** Look up the agent's current trust tier. */
  getAgentTier: (agentId: string) => TrustTier | Promise<TrustTier>;
}

export class Executor {
  private readonly opts: ExecutorOptions;

  constructor(opts: ExecutorOptions) {
    this.opts = opts;
  }

  async run(args: {
    action: AgentAction;
    pipeline: ResolvedPipeline;
  }): Promise<SyncVerdict> {
    const { action, pipeline } = args;
    const tier = await this.opts.getAgentTier(action.agentId);
    const priorChainTip =
      (await this.opts.getPriorChainTip?.()) ?? GENESIS_TIP;

    const ctx: GateContext = {
      action,
      agentTier: tier,
      priorChainTip,
      postureId: pipeline.postureId,
      accumulatedEvidence: [],
    };

    const accumulated: LayerEvidenceEnvelope[] = [];
    const inlineTasks: Array<Promise<LayerEvidenceEnvelope | null>> = [];
    const deferredLayers: Array<{ layer: GateLayer; mode: "enforce" | "observe" | "shadow" }> = [];

    for (const entry of pipeline.entries) {
      const layer = this.opts.registry.get(entry.id);
      if (!layer) continue;

      const mode = this.resolveMode(entry.execution_by_risk, action.risk, layer);
      const layerMode = entry.mode;

      if (mode === "block") {
        const result = await this.runBlocking(layer, ctx, action, accumulated, layerMode);
        if (result.kind === "deny") {
          const tip = await this.commitTip(action, priorChainTip, accumulated);
          return {
            verdict: "deny",
            reason: result.reason,
            layerId: layer.id,
            tip,
          };
        }
        if (result.kind === "escalate") {
          const tip = await this.commitTip(action, priorChainTip, accumulated);
          return {
            verdict: "escalate",
            to: result.to,
            reason: result.reason,
            layerId: layer.id,
            tip,
          };
        }
      } else if (mode === "inline") {
        inlineTasks.push(this.runInline(layer, ctx, action, layerMode));
      } else {
        deferredLayers.push({ layer, mode: layerMode });
      }
    }

    // Await inline tasks; attach their evidence to the synchronous evidence set.
    if (inlineTasks.length > 0) {
      const inlineResults = await Promise.all(inlineTasks);
      for (const ev of inlineResults) {
        if (ev) accumulated.push(ev);
      }
    }

    // Commit the tip.
    const tip = await this.commitTip(action, priorChainTip, accumulated);

    // Schedule deferred layers.
    for (const { layer, mode } of deferredLayers) {
      this.opts.deferredQueue.schedule({
        action,
        anchorTip: tip.tipHash,
        layer,
        contextAgentTier: tier,
        postureId: pipeline.postureId,
        priorChainTip,
        layerMode: mode,
      });
    }

    return { verdict: "allow", tip };
  }

  // -------------------------------------------------------------------------

  private resolveMode(
    byRisk: Record<RiskLevel, ExecutionMode>,
    risk: RiskLevel,
    layer: GateLayer,
  ): ExecutionMode {
    if (layer.syncRequiredFor?.includes(risk)) return "block";
    return byRisk[risk] ?? layer.defaultExecution;
  }

  private async runBlocking(
    layer: GateLayer,
    ctx: GateContext,
    action: AgentAction,
    accumulated: LayerEvidenceEnvelope[],
    layerMode: "enforce" | "observe" | "shadow",
  ): Promise<
    | { kind: "ok" }
    | { kind: "deny"; reason: string }
    | { kind: "escalate"; to: "human" | "higher-tier"; reason: string }
  > {
    const start = Date.now();
    const ctxForLayer: GateContext = { ...ctx, accumulatedEvidence: [...accumulated] };
    const decision = await layer.run(ctxForLayer, action);
    const envelope: LayerEvidenceEnvelope = {
      layerId: layer.id,
      layerVersion: layer.version,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - start,
      executionMode: "block",
      layerMode,
      payload: (decision.evidence as LayerEvidenceEnvelope).payload ?? {},
    };
    accumulated.push(envelope);
    if (layerMode === "observe" || layerMode === "shadow") {
      return { kind: "ok" };
    }
    if (decision.verdict === "deny") {
      return { kind: "deny", reason: decision.reason };
    }
    if (decision.verdict === "escalate") {
      return { kind: "escalate", to: decision.to, reason: decision.reason };
    }
    return { kind: "ok" };
  }

  private async runInline(
    layer: GateLayer,
    ctx: GateContext,
    action: AgentAction,
    layerMode: "enforce" | "observe" | "shadow",
  ): Promise<LayerEvidenceEnvelope | null> {
    const start = Date.now();
    try {
      const decision = await layer.run(ctx, action);
      return {
        layerId: layer.id,
        layerVersion: layer.version,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
        executionMode: "inline",
        layerMode,
        payload: (decision.evidence as LayerEvidenceEnvelope).payload ?? {},
      };
    } catch (e) {
      return {
        layerId: layer.id,
        layerVersion: layer.version,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - start,
        executionMode: "inline",
        layerMode,
        payload: { error: (e as Error).message },
      };
    }
  }

  private async commitTip(
    action: AgentAction,
    priorChainTip: string,
    syncEvidence: LayerEvidenceEnvelope[],
  ): Promise<import("@vorionsys/basis-gate-spec").TipCommitEvent> {
    return buildTipCommitEvent({
      action,
      priorChainTip,
      syncEvidence,
      runtimeKey: this.opts.runtimeKey,
    });
  }
}

export const GENESIS_TIP =
  "genesis:0000000000000000000000000000000000000000000000000000000000000000";
