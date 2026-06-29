// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Kernel effective-tier tests — the gate must STOP trusting the claimed tier.
// The executor computes effectiveTier = min(claimed, recomputed?, observation
// ceiling?) via @vorionsys/basis-scorer, fail-closed, and tier-check gates on it.
// CRITICAL actions require T5 (MIN_TIER_FOR_RISK), so a claimed T7 that is capped
// below T5 must escalate. Legacy callers (no verification context) are unaffected.

import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { GateRuntime } from "../src/index.js";
import {
  createIdentityLayer,
  createTierCheckLayer,
  createRateLimitLayer,
  createProofChainTipLayer,
  createAuditLogLayer,
} from "../src/layers/index.js";

type CreateArg = Parameters<typeof GateRuntime.create>[0];

const mk = (opts: Record<string, unknown>) =>
  GateRuntime.create({
    posture: { preset: "standard", industry: "@basis/industry/consumer-default" },
    signingKeySeed: randomBytes(32),
    layers: [
      createIdentityLayer({ knownAgents: new Set(["a1"]) }),
      createTierCheckLayer(),
      createRateLimitLayer({ requestsPerMinute: 1000 }),
      createProofChainTipLayer(),
      createAuditLogLayer({ emit: () => {} }),
    ],
    deferralWindowMs: 800,
    getAgentTier: () => "T7", // always CLAIMS the top tier
    emit: () => {},
    ...opts,
  } as CreateArg);

const action = (id: string) => ({
  actionId: id,
  agentId: "a1",
  risk: "CRITICAL" as const, // requires T5
  classes: ["internal-effect" as const],
  payload: {},
  receivedAt: new Date().toISOString(),
});

async function verdictFor(id: string, opts: Record<string, unknown>): Promise<string> {
  const rt = await mk(opts);
  const v = await rt.gate(action(id));
  await rt.drain();
  return v.verdict;
}

describe("kernel effective-tier: the gate does not trust the claimed tier", () => {
  it("caps a claimed T7 by a BLACK_BOX observation ceiling (T3 < T5) → escalate", async () => {
    expect(await verdictFor("a", { getObservationTier: () => "BLACK_BOX" })).toBe("escalate");
  });

  it("backward-compatible: claimed T7 with no verification context → allow (legacy)", async () => {
    expect(await verdictFor("b", {})).toBe("allow");
  });

  it("WHITE_BOX caps at T6 (≥ T5) → allow", async () => {
    expect(await verdictFor("c", { getObservationTier: () => "WHITE_BOX" })).toBe("allow");
  });

  it("binds to min(claimed, recomputed): claimed T7, recomputed T2 → escalate", async () => {
    expect(await verdictFor("d", { getRecomputedTier: () => "T2" })).toBe("escalate");
  });

  it("fails closed on an unknown observation box (→ T0) → escalate", async () => {
    expect(await verdictFor("e", { getObservationTier: () => "NONSENSE_BOX" })).toBe("escalate");
  });
});
