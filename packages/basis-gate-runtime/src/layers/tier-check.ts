// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Reference @basis/tier-check layer.
//
// Verifies the agent's current tier meets a minimum for the action's risk
// level. Minimums are a pragmatic illustration; production deployments
// should compute them from the canonical trust specification parameters
// in @vorionsys/basis.

import type {
  AgentAction,
  GateContext,
  GateLayer,
  LayerDecision,
  RiskLevel,
  TrustTier,
} from "@vorionsys/basis-gate-spec";

const TIER_RANK: TrustTier[] = ["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7"];

const MIN_TIER_FOR_RISK: Record<RiskLevel, TrustTier> = {
  READ: "T0",
  LOW: "T1",
  MEDIUM: "T2",
  HIGH: "T3",
  CRITICAL: "T5",
  LIFE_CRITICAL: "T6",
};

export function createTierCheckLayer(): GateLayer {
  return {
    id: "@basis/tier-check",
    version: "0.1.0",
    band: 1,
    defaultExecution: "block",
    syncRequiredFor: ["READ", "LOW", "MEDIUM", "HIGH", "CRITICAL", "LIFE_CRITICAL"],
    requires: ["@basis/identity"],
    maxDurationMs: 10,
    async run(ctx: GateContext, action: AgentAction): Promise<LayerDecision> {
      const required = MIN_TIER_FOR_RISK[action.risk];
      const requiredRank = TIER_RANK.indexOf(required);
      // Gate on the FAIL-CLOSED effective tier (min of claimed, recomputed, and
      // the observation ceiling — computed by the executor), NOT the raw claimed
      // tier. Falls back to the claimed tier when no verification context exists.
      const boundTier = ctx.effectiveTier ?? ctx.agentTier;
      const agentRank = TIER_RANK.indexOf(boundTier);
      const ok = agentRank >= requiredRank;
      const envelope = {
        layerId: "@basis/tier-check",
        layerVersion: "0.1.0",
        timestamp: new Date().toISOString(),
        durationMs: 0,
        executionMode: "block" as const,
        layerMode: "enforce" as const,
        payload: {
          claimedTier: ctx.agentTier,
          effectiveTier: boundTier,
          observationTier: ctx.observationTier,
          required,
          risk: action.risk,
        },
      };
      if (!ok) {
        const capped = boundTier !== ctx.agentTier;
        return {
          verdict: "escalate",
          to: "higher-tier",
          reason: `action requires ${required}; agent effective tier is ${boundTier}${capped ? ` (claimed ${ctx.agentTier}, capped by recomputation/observation)` : ""}`,
          evidence: envelope,
        };
      }
      return { verdict: "allow", evidence: envelope };
    },
  };
}
