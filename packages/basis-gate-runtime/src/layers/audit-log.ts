// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Reference @basis/audit-log layer.
//
// Emits a structured audit record. Default execution is deferred; the
// runtime will invoke this layer's `run` after the synchronous pipeline
// has committed a tip.
//
// Production deployments should replace the in-memory `emit` sink with a
// write to durable storage and/or an external audit pipeline.

import type {
  AgentAction,
  GateContext,
  GateLayer,
  LayerDecision,
} from "@vorionsys/basis-gate-spec";

export interface AuditLogRecord {
  actionId: string;
  agentId: string;
  risk: string;
  receivedAt: string;
  postureId: string;
  priorChainTip: string;
}

export interface AuditLogLayerOptions {
  emit: (record: AuditLogRecord) => void | Promise<void>;
}

export function createAuditLogLayer(opts: AuditLogLayerOptions): GateLayer {
  return {
    id: "@basis/audit-log",
    version: "0.1.0",
    band: 4,
    defaultExecution: "deferred",
    maxDurationMs: 200,
    async run(ctx: GateContext, action: AgentAction): Promise<LayerDecision> {
      const record: AuditLogRecord = {
        actionId: action.actionId,
        agentId: action.agentId,
        risk: action.risk,
        receivedAt: action.receivedAt,
        postureId: ctx.postureId,
        priorChainTip: ctx.priorChainTip,
      };
      await opts.emit(record);
      const envelope = {
        layerId: "@basis/audit-log",
        layerVersion: "0.1.0",
        timestamp: new Date().toISOString(),
        durationMs: 0,
        executionMode: "deferred" as const,
        layerMode: "enforce" as const,
        payload: { emitted: true },
      };
      return { verdict: "allow", evidence: envelope };
    },
  };
}
