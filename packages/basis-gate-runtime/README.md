# BASIS Gate Runtime

A reference implementation of [BASIS Gate v1](../basis-gate-spec/SPEC.md). Resolves a posture to an ordered layer pipeline, executes the pipeline for each action in the three declared execution modes, and produces a two-stage proof chain for every decision.

## What this package provides

- **Posture resolver.** Takes a preset, optional industry profile, and operator overrides and returns a concrete pipeline with execution modes resolved per layer per risk level.
- **Pipeline executor.** Runs block layers serially, inline layers in parallel with action dispatch, and deferred layers through an in-process queue. Honors the spec's ordering, dependency, and conformance rules.
- **Two-stage proof chain.** Computes and signs a tip-commit event before action dispatch. Signs and anchors chain-extension events as deferred layers complete. Emits deferred-timeout events when a deferred layer misses its window.
- **Reference layers.** Minimal, auditable implementations of `@basis/identity`, `@basis/tier-check`, `@basis/proof-chain-tip`, `@basis/audit-log`, and `@basis/rate-limit`. These are intended as specification illustrations and as scaffolding for production deployments, not as feature-complete production layers.

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
import { GateRuntime } from "@vorionsys/basis-gate-runtime";
import { loadBuiltinProfile } from "@vorionsys/basis-gate-industry";

// Create a runtime with a signing key.
const runtime = await GateRuntime.create({
  posture: {
    preset: "standard",
    industry: "@basis/industry/consumer-default",
  },
  signingKey: /* 32-byte Ed25519 private key */,
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

## License

Apache License, Version 2.0.

## Related packages

- [`@vorionsys/basis-gate-spec`](../basis-gate-spec) — the specification this runtime implements.
- [`@vorionsys/basis-gate-industry`](../basis-gate-industry) — industry profiles consumed by the resolver.
- [`@vorionsys/basis`](../basis) — canonical trust parameters (risk levels, tiers, penalties) that this runtime does not override.
