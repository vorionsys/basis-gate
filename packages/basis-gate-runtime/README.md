# BASIS Gate Runtime

A reference implementation of [BASIS Gate v1](../basis-gate-spec/SPEC.md). Resolves a posture to an ordered layer pipeline, executes the pipeline for each action in the three declared execution modes, and produces a two-stage proof chain for every decision.

## What this package provides

- **Posture resolver.** Takes a preset, optional industry profile, and operator overrides and returns a concrete pipeline with execution modes resolved per layer per risk level.
- **Pipeline executor.** Runs registered `block` layers serially, awaits registered `inline` layers inside `gate()` before returning, and starts registered `deferred` layers on an in-process queue. Layer ids with no registry entry are skipped, including ids a preset or industry profile marks required. Spec § 9.3 says a conformant runtime must not silently drop required layers.
- **Two-stage proof chain.** Computes and signs a tip-commit event before action dispatch. Signs and anchors chain-extension events as deferred layers complete. Emits deferred-timeout events when a deferred layer misses its window.
- **Reference layers.** Minimal, auditable implementations of `@basis/identity`, `@basis/tier-check`, `@basis/proof-chain-tip`, `@basis/audit-log`, and `@basis/rate-limit`. These are intended as specification illustrations and as a starting point, not as feature-complete production layers.

## What this package does not provide

- Production-grade content-safety, jailbreak-detection, PII-redaction, or tool-validation layers. Those are domain-specific implementations that belong in separate packages.
- Durable queue storage for deferred layers. The in-process queue here is appropriate for development and single-node use. Production deployments should supply a queue implementation backed by a durable store.
- Sandboxing for third-party layers. Production deployments should isolate third-party layer code per the spec's security considerations (§ 10.2).

## Installation

```bash
npm install @vorionsys/basis-gate-runtime
```

## Minimal use

```typescript
import { GateRuntime, loadSigningKeySeed } from "@vorionsys/basis-gate-runtime";
import {
  createIdentityLayer,
  createTierCheckLayer,
  createProofChainTipLayer,
  createAuditLogLayer,
} from "@vorionsys/basis-gate-runtime/layers";

// Pass a 32-byte seed as `signingKeySeed`. `layers` and `getAgentTier` are required.
const { seed } = loadSigningKeySeed();
const runtime = await GateRuntime.create({
  posture: {
    preset: "standard",
    industry: "@basis/industry/consumer-default",
  },
  signingKeySeed: seed,
  layers: [
    createIdentityLayer({ knownAgents: new Set(["agent_market_scout"]) }),
    createTierCheckLayer(),
    createProofChainTipLayer(),
    createAuditLogLayer({ emit: () => {} }),
  ],
  getAgentTier: () => "T3",
});

// Gate an action.
const result = await runtime.gate({
  actionId: "act_abc123",
  agentId: "agent_market_scout",
  risk: "LOW",
  classes: ["internal-effect"],
  payload: { /* ... */ },
  receivedAt: new Date().toISOString(),
});

if (result.verdict === "allow") {
  // Dispatch the action. The proof-chain tip has already been committed.
  // Deferred layers will continue running in the background.
} else if (result.verdict === "deny") {
  // The action did not pass. `result.reason` explains why.
}
```

Preset `standard` still names layers this snippet does not register, including `@basis/rate-limit`, `@basis/policy-match`, `@basis/budget`, `@basis/tool-validate`, and `@basis/telemetry`. The executor skips those ids.

## License

Apache License, Version 2.0.

## Related packages

- [`@vorionsys/basis-gate-spec`](../basis-gate-spec) — the specification this runtime implements.
- [`@vorionsys/basis-gate-industry`](../basis-gate-industry) — industry profiles consumed by the resolver.
- [`@vorionsys/basis-scorer`](https://www.npmjs.com/package/@vorionsys/basis-scorer) — `toT` and `OBS_MAXTIER`, used when the executor floors a claimed tier. That package depends on [`@vorionsys/basis-spec`](https://github.com/vorionsys/basis-spec). This repo does not contain `packages/basis`.
