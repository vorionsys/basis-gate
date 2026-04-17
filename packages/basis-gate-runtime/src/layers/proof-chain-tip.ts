// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Reference @basis/proof-chain-tip layer.
//
// A marker layer. The actual tip hashing and signing is performed by the
// executor using the `buildTipCommitEvent` helper from proof-chain.ts. This
// layer exists so that operators configuring a posture can control whether
// the proof-chain tip step participates in the pipeline ordering and
// evidence accumulation.

import type {
  AgentAction,
  GateContext,
  GateLayer,
  LayerDecision,
} from "@vorionsys/basis-gate-spec";

export function createProofChainTipLayer(): GateLayer {
  return {
    id: "@basis/proof-chain-tip",
    version: "0.1.0",
    band: 4,
    defaultExecution: "block",
    syncRequiredFor: ["READ", "LOW", "MEDIUM", "HIGH", "CRITICAL", "LIFE_CRITICAL"],
    maxDurationMs: 5,
    async run(ctx: GateContext, action: AgentAction): Promise<LayerDecision> {
      const envelope = {
        layerId: "@basis/proof-chain-tip",
        layerVersion: "0.1.0",
        timestamp: new Date().toISOString(),
        durationMs: 0,
        executionMode: "block" as const,
        layerMode: "enforce" as const,
        payload: {
          priorChainTip: ctx.priorChainTip,
          actionId: action.actionId,
        },
      };
      return { verdict: "allow", evidence: envelope };
    },
  };
}
