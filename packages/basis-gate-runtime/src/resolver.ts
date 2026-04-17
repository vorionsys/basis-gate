// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Posture resolver.
//
// Implements BASIS Gate v1 § 6.3 — resolves a posture (preset, optional
// industry profile, operator overrides) to a concrete ordered pipeline of
// layers with execution modes and layer modes determined per risk level.

import type {
  ExecutionMode,
  GateLayer,
  IndustryProfile,
  LayerEntry,
  LayerMode,
  LayerOverride,
  Posture,
  Preset,
  RiskLevel,
} from "@vorionsys/basis-gate-spec";

// ---------------------------------------------------------------------------
// Preset defaults
// ---------------------------------------------------------------------------

interface PresetLayerEntry {
  id: string;
  execution_by_risk: Partial<Record<RiskLevel, ExecutionMode>>;
  default_execution: ExecutionMode;
}

const PRESET_LAYERS: Record<Exclude<Preset, "custom">, PresetLayerEntry[]> = {
  lite: [
    { id: "@basis/identity", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/tier-check", execution_by_risk: {}, default_execution: "block" },
    {
      id: "@basis/rate-limit",
      execution_by_risk: {
        READ: "deferred",
        LOW: "deferred",
        MEDIUM: "block",
        HIGH: "block",
        CRITICAL: "block",
        LIFE_CRITICAL: "block",
      },
      default_execution: "block",
    },
    { id: "@basis/proof-chain-tip", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/audit-log", execution_by_risk: {}, default_execution: "deferred" },
  ],
  standard: [
    { id: "@basis/identity", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/tier-check", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/rate-limit", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/policy-match", execution_by_risk: {}, default_execution: "block" },
    {
      id: "@basis/budget",
      execution_by_risk: {
        READ: "deferred",
        LOW: "deferred",
        MEDIUM: "block",
        HIGH: "block",
        CRITICAL: "block",
        LIFE_CRITICAL: "block",
      },
      default_execution: "block",
    },
    { id: "@basis/tool-validate", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/proof-chain-tip", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/audit-log", execution_by_risk: {}, default_execution: "deferred" },
    { id: "@basis/telemetry", execution_by_risk: {}, default_execution: "deferred" },
  ],
  strict: [
    { id: "@basis/identity", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/tier-check", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/rate-limit", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/policy-match", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/budget", execution_by_risk: {}, default_execution: "block" },
    {
      id: "@basis/content-safety-in",
      execution_by_risk: {
        READ: "deferred",
        LOW: "deferred",
        MEDIUM: "inline",
        HIGH: "block",
        CRITICAL: "block",
        LIFE_CRITICAL: "block",
      },
      default_execution: "block",
    },
    {
      id: "@basis/content-safety-out",
      execution_by_risk: {
        READ: "deferred",
        LOW: "deferred",
        MEDIUM: "inline",
        HIGH: "block",
        CRITICAL: "block",
        LIFE_CRITICAL: "block",
      },
      default_execution: "block",
    },
    {
      id: "@basis/jailbreak-detect",
      execution_by_risk: {
        READ: "deferred",
        LOW: "deferred",
        MEDIUM: "inline",
        HIGH: "block",
        CRITICAL: "block",
        LIFE_CRITICAL: "block",
      },
      default_execution: "block",
    },
    { id: "@basis/pii-redact", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/tool-validate", execution_by_risk: {}, default_execution: "block" },
    {
      id: "@basis/human-review",
      execution_by_risk: {
        READ: "deferred",
        LOW: "deferred",
        MEDIUM: "deferred",
        HIGH: "block",
        CRITICAL: "block",
        LIFE_CRITICAL: "block",
      },
      default_execution: "block",
    },
    { id: "@basis/proof-chain-tip", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/audit-log", execution_by_risk: {}, default_execution: "deferred" },
    { id: "@basis/telemetry", execution_by_risk: {}, default_execution: "deferred" },
    { id: "@basis/fingerprint-check", execution_by_risk: {}, default_execution: "deferred" },
  ],
  full: [
    { id: "@basis/identity", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/tier-check", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/rate-limit", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/policy-match", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/budget", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/content-safety-in", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/content-safety-out", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/jailbreak-detect", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/pii-redact", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/tool-validate", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/human-review", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/proof-chain-tip", execution_by_risk: {}, default_execution: "block" },
    { id: "@basis/audit-log", execution_by_risk: {}, default_execution: "deferred" },
    { id: "@basis/telemetry", execution_by_risk: {}, default_execution: "deferred" },
    { id: "@basis/canary-sample", execution_by_risk: {}, default_execution: "deferred" },
    { id: "@basis/shadow-verify", execution_by_risk: {}, default_execution: "deferred" },
    { id: "@basis/fingerprint-check", execution_by_risk: {}, default_execution: "deferred" },
  ],
};

// ---------------------------------------------------------------------------
// Resolved pipeline types
// ---------------------------------------------------------------------------

export interface ResolvedLayerEntry {
  id: string;
  /** Execution mode resolved per risk level. */
  execution_by_risk: Record<RiskLevel, ExecutionMode>;
  mode: LayerMode;
  config: Record<string, unknown>;
}

export interface ResolvedPipeline {
  postureId: string;
  entries: ResolvedLayerEntry[];
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export function resolvePosture(args: {
  posture: Posture;
  industryProfile?: IndustryProfile;
  registry: ReadonlyMap<string, GateLayer>;
}): ResolvedPipeline {
  const { posture, industryProfile, registry } = args;

  if (posture.preset !== "custom" && posture.preset !== undefined && industryProfile) {
    const order: Preset[] = ["lite", "standard", "strict", "full"];
    if (order.indexOf(posture.preset) < order.indexOf(industryProfile.minimum_preset)) {
      throw new Error(
        `posture preset '${posture.preset}' is below industry profile minimum '${industryProfile.minimum_preset}'`,
      );
    }
  }

  // Step 1: preset default layers.
  const base: PresetLayerEntry[] =
    posture.preset === "custom" ? [] : [...PRESET_LAYERS[posture.preset]];

  const ordered: string[] = base.map((l) => l.id);
  const byId = new Map<string, PresetLayerEntry>(base.map((l) => [l.id, { ...l }]));

  // Step 2: industry profile — add required_layers, apply required_blocking,
  // apply prohibited_deferred.
  if (industryProfile) {
    for (const id of industryProfile.required_layers) {
      if (!byId.has(id)) {
        byId.set(id, {
          id,
          execution_by_risk: {},
          default_execution: "block",
        });
        ordered.push(id);
      }
    }
    for (const [id, minRisk] of Object.entries(industryProfile.required_blocking)) {
      const entry = byId.get(id);
      if (!entry || !minRisk) continue;
      pinBlockingAtOrAbove(entry, minRisk);
    }
    for (const id of industryProfile.prohibited_deferred) {
      const entry = byId.get(id);
      if (!entry) continue;
      upgradeDeferredToInlineAtLeast(entry);
    }
  }

  // Step 3: operator `layers.remove`.
  const removeList = posture.layers?.remove ?? [];
  for (const id of removeList) {
    if (industryProfile?.required_layers.includes(id)) {
      throw new Error(
        `posture cannot remove layer '${id}' required by industry profile '${industryProfile.id}'`,
      );
    }
    byId.delete(id);
    const idx = ordered.indexOf(id);
    if (idx >= 0) ordered.splice(idx, 1);
  }

  // Step 4: operator `layers.add`.
  const addList = posture.layers?.add ?? [];
  for (const entry of addList) {
    applyLayerEntry(byId, ordered, entry);
  }

  // Step 5: operator `layers.override`.
  const overrides = posture.layers?.override ?? {};
  for (const [id, ov] of Object.entries(overrides)) {
    applyLayerOverride(byId, id, ov, industryProfile);
  }

  // Step 6: resolve execution mode per risk level, consulting the registry
  // for each layer's declared constraints.
  const entries: ResolvedLayerEntry[] = [];
  for (const id of ordered) {
    const source = byId.get(id);
    if (!source) continue;
    const registered = registry.get(id);
    const execByRisk = resolveExecutionByRisk({
      source,
      registered,
      industryProfile,
    });
    entries.push({
      id,
      execution_by_risk: execByRisk,
      mode: (source as PresetLayerEntry & { mode?: LayerMode }).mode ?? "enforce",
      config: (source as PresetLayerEntry & { config?: Record<string, unknown> }).config ?? {},
    });
  }

  // Step 7: dependency DAG check.
  validateDependencies(entries, registry);

  return {
    postureId: computePostureId(posture, industryProfile?.id),
    entries,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RISK_ORDER: RiskLevel[] = [
  "READ",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "LIFE_CRITICAL",
];

function pinBlockingAtOrAbove(entry: PresetLayerEntry, minRisk: RiskLevel): void {
  const startIdx = RISK_ORDER.indexOf(minRisk);
  for (let i = startIdx; i < RISK_ORDER.length; i++) {
    const level = RISK_ORDER[i] as RiskLevel;
    entry.execution_by_risk[level] = "block";
  }
}

function upgradeDeferredToInlineAtLeast(entry: PresetLayerEntry): void {
  for (const r of RISK_ORDER) {
    const current = entry.execution_by_risk[r];
    if (current === "deferred") {
      entry.execution_by_risk[r] = "inline";
    }
  }
  if (entry.default_execution === "deferred") {
    entry.default_execution = "inline";
  }
}

function applyLayerEntry(
  byId: Map<string, PresetLayerEntry>,
  ordered: string[],
  entry: LayerEntry,
): void {
  const existing = byId.get(entry.id);
  if (existing) {
    mergeIntoEntry(existing, entry);
    return;
  }
  const newEntry: PresetLayerEntry & { mode?: LayerMode; config?: Record<string, unknown> } = {
    id: entry.id,
    execution_by_risk: { ...(entry.execution_by_risk ?? {}) },
    default_execution: entry.execution ?? "block",
  };
  if (entry.mode) newEntry.mode = entry.mode;
  if (entry.config) newEntry.config = entry.config;
  byId.set(entry.id, newEntry);
  if (!ordered.includes(entry.id)) ordered.push(entry.id);
}

function mergeIntoEntry(existing: PresetLayerEntry, entry: LayerEntry): void {
  if (entry.execution) {
    existing.default_execution = entry.execution;
  }
  if (entry.execution_by_risk) {
    Object.assign(existing.execution_by_risk, entry.execution_by_risk);
  }
  const augmented = existing as PresetLayerEntry & {
    mode?: LayerMode;
    config?: Record<string, unknown>;
  };
  if (entry.mode) augmented.mode = entry.mode;
  if (entry.config) {
    augmented.config = { ...(augmented.config ?? {}), ...entry.config };
  }
}

function applyLayerOverride(
  byId: Map<string, PresetLayerEntry>,
  id: string,
  ov: LayerOverride,
  industry?: IndustryProfile,
): void {
  const entry = byId.get(id);
  if (!entry) {
    throw new Error(
      `posture override references layer '${id}' not present in pipeline`,
    );
  }
  // Industry profile's required_blocking cannot be weakened.
  if (industry) {
    const minRisk = industry.required_blocking[id];
    if (minRisk) {
      if (ov.execution && ov.execution !== "block") {
        throw new Error(
          `override cannot weaken '${id}' below 'block' (industry profile requires block at ${minRisk})`,
        );
      }
      if (ov.execution_by_risk) {
        const startIdx = RISK_ORDER.indexOf(minRisk);
        for (let i = startIdx; i < RISK_ORDER.length; i++) {
          const level = RISK_ORDER[i] as RiskLevel;
          const requested = ov.execution_by_risk[level];
          if (requested && requested !== "block") {
            throw new Error(
              `override cannot weaken '${id}' at ${level} below 'block' (industry profile requires block)`,
            );
          }
        }
      }
    }
    if (industry.prohibited_deferred.includes(id)) {
      if (ov.execution === "deferred") {
        throw new Error(
          `override cannot set '${id}' to 'deferred' (prohibited by industry profile)`,
        );
      }
      if (ov.execution_by_risk) {
        for (const [risk, mode] of Object.entries(ov.execution_by_risk)) {
          if (mode === "deferred") {
            throw new Error(
              `override cannot set '${id}' to 'deferred' at ${risk} (prohibited by industry profile)`,
            );
          }
        }
      }
    }
  }
  if (ov.execution) entry.default_execution = ov.execution;
  if (ov.execution_by_risk) {
    Object.assign(entry.execution_by_risk, ov.execution_by_risk);
  }
  const augmented = entry as PresetLayerEntry & {
    mode?: LayerMode;
    config?: Record<string, unknown>;
  };
  if (ov.mode) augmented.mode = ov.mode;
  if (ov.config) {
    augmented.config = { ...(augmented.config ?? {}), ...ov.config };
  }
}

function resolveExecutionByRisk(args: {
  source: PresetLayerEntry;
  registered?: GateLayer;
  industryProfile?: IndustryProfile;
}): Record<RiskLevel, ExecutionMode> {
  const { source, registered, industryProfile } = args;
  const out = {} as Record<RiskLevel, ExecutionMode>;
  for (const risk of RISK_ORDER) {
    out[risk] = resolveOne(risk, source, registered, industryProfile);
  }
  return out;
}

function resolveOne(
  risk: RiskLevel,
  source: PresetLayerEntry,
  registered: GateLayer | undefined,
  industry: IndustryProfile | undefined,
): ExecutionMode {
  if (industry) {
    const minRisk = industry.required_blocking[source.id];
    if (minRisk && RISK_ORDER.indexOf(risk) >= RISK_ORDER.indexOf(minRisk)) {
      return "block";
    }
    if (industry.prohibited_deferred.includes(source.id)) {
      const raw = source.execution_by_risk[risk] ?? source.default_execution;
      if (raw === "deferred") return "inline";
      return raw;
    }
  }
  if (registered?.syncRequiredFor?.includes(risk)) return "block";
  return source.execution_by_risk[risk] ?? source.default_execution;
}

function validateDependencies(
  entries: ResolvedLayerEntry[],
  registry: ReadonlyMap<string, GateLayer>,
): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    const layer = registry.get(entry.id);
    if (!layer) continue;
    for (const dep of layer.requires ?? []) {
      if (!seen.has(dep)) {
        throw new Error(
          `layer '${entry.id}' requires '${dep}' which is not earlier in the pipeline`,
        );
      }
    }
    seen.add(entry.id);
  }
}

function computePostureId(posture: Posture, industryId?: string): string {
  const parts = [
    `preset=${posture.preset}`,
    industryId ? `industry=${industryId}` : "",
    posture.layers?.add ? `+${posture.layers.add.length}` : "",
    posture.layers?.remove ? `-${posture.layers.remove.length}` : "",
  ].filter(Boolean);
  return "posture:" + parts.join(";");
}
