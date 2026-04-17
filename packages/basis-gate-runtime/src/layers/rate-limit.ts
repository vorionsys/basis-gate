// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Reference @basis/rate-limit layer.
//
// Sliding-window counter keyed by agentId. Production deployments should
// move counter storage to a shared store (Redis, database) if the runtime
// runs on more than one node.

import type {
  AgentAction,
  GateContext,
  GateLayer,
  LayerDecision,
} from "@vorionsys/basis-gate-spec";

export interface RateLimitLayerOptions {
  /** Default requests per minute per agent. */
  requestsPerMinute: number;
  /** Optional per-agent override. */
  perAgentOverrides?: ReadonlyMap<string, number>;
}

export function createRateLimitLayer(opts: RateLimitLayerOptions): GateLayer {
  const windowMs = 60_000;
  const log = new Map<string, number[]>();

  return {
    id: "@basis/rate-limit",
    version: "0.1.0",
    band: 2,
    defaultExecution: "block",
    maxDurationMs: 5,
    async run(ctx: GateContext, action: AgentAction): Promise<LayerDecision> {
      const limit = opts.perAgentOverrides?.get(action.agentId) ?? opts.requestsPerMinute;
      const now = Date.now();
      const cutoff = now - windowMs;
      const arr = log.get(action.agentId) ?? [];
      const recent = arr.filter((t) => t > cutoff);
      const ok = recent.length < limit;
      if (ok) {
        recent.push(now);
        log.set(action.agentId, recent);
      }
      const envelope = {
        layerId: "@basis/rate-limit",
        layerVersion: "0.1.0",
        timestamp: new Date().toISOString(),
        durationMs: 0,
        executionMode: "block" as const,
        layerMode: "enforce" as const,
        payload: {
          windowMs,
          limit,
          observed: recent.length,
        },
      };
      if (!ok) {
        return {
          verdict: "deny",
          reason: `rate limit exceeded for ${action.agentId} (${recent.length}/${limit} per minute)`,
          evidence: envelope,
        };
      }
      return { verdict: "allow", evidence: envelope };
    },
  };
}
