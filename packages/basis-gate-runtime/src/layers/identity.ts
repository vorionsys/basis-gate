// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Reference @basis/identity layer.
//
// Minimal illustration of the layer interface. Production deployments
// should replace this with an identity layer that verifies a signed
// agent credential against a trusted registry.

import type {
  AgentAction,
  GateContext,
  GateLayer,
  LayerDecision,
} from "@vorionsys/basis-gate-spec";

export interface IdentityLayerOptions {
  /**
   * Set of agent identifiers this runtime recognizes. A production
   * implementation replaces this with a signed-credential check.
   */
  knownAgents: ReadonlySet<string>;
}

export function createIdentityLayer(opts: IdentityLayerOptions): GateLayer {
  return {
    id: "@basis/identity",
    version: "0.1.0",
    band: 1,
    defaultExecution: "block",
    syncRequiredFor: ["READ", "LOW", "MEDIUM", "HIGH", "CRITICAL", "LIFE_CRITICAL"],
    maxDurationMs: 50,
    async run(ctx: GateContext, action: AgentAction): Promise<LayerDecision> {
      const ok = opts.knownAgents.has(action.agentId);
      const envelope = {
        layerId: "@basis/identity",
        layerVersion: "0.1.0",
        timestamp: new Date().toISOString(),
        durationMs: 0,
        executionMode: "block" as const,
        layerMode: "enforce" as const,
        payload: { agentId: action.agentId, known: ok },
      };
      if (!ok) {
        return {
          verdict: "deny",
          reason: `unknown agent: ${action.agentId}`,
          evidence: envelope,
        };
      }
      return { verdict: "allow", evidence: envelope };
    },
  };
}
