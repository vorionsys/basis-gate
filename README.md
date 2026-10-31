# BASIS Gate

[![npm — basis-gate-spec](https://img.shields.io/npm/v/@vorionsys/basis-gate-spec?label=%40vorionsys%2Fbasis-gate-spec)](https://www.npmjs.com/package/@vorionsys/basis-gate-spec)
[![npm — basis-gate-industry](https://img.shields.io/npm/v/@vorionsys/basis-gate-industry?label=%40vorionsys%2Fbasis-gate-industry)](https://www.npmjs.com/package/@vorionsys/basis-gate-industry)
[![npm — basis-gate-runtime](https://img.shields.io/npm/v/@vorionsys/basis-gate-runtime?label=%40vorionsys%2Fbasis-gate-runtime)](https://www.npmjs.com/package/@vorionsys/basis-gate-runtime)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](./LICENSE)
[![CI](https://github.com/vorionsys/basis-gate/actions/workflows/ci.yml/badge.svg)](https://github.com/vorionsys/basis-gate/actions/workflows/ci.yml)

**B**aseline **A**uthority for **S**afe & **I**nteroperable **S**ystems — Gate specification and reference implementation.

**Status:** Draft spec (`1.0-draft`) and a reference runtime that resolves a posture, runs registered layers in `block` / `inline` / `deferred` modes, and signs an Ed25519 two-stage proof chain. Five layers are implemented (identity, tier check, rate limit, proof-chain tip, audit log); other preset layer ids are skipped, the four industry profiles are draft documents (`version` `0.1.0`), and this repo has no conformance suite.  
Published on npm: `@vorionsys/basis-gate-spec@0.1.1`, `@vorionsys/basis-gate-industry@0.1.2`, `@vorionsys/basis-gate-runtime@0.2.0` (the root package is private). GitHub releases [`v0.1.1`](https://github.com/vorionsys/basis-gate/releases/tag/v0.1.1) and [`v0.2.0`](https://github.com/vorionsys/basis-gate/releases/tag/v0.2.0) exist; the `v0.2.0` notes still list spec `0.1.0` and industry `0.1.1`.  
`npm test` — 66 passed, 0 failed (spec 2, industry 5, runtime 59). `npx tsx examples/minimal-governance.ts` allowed one known-agent action, denied an unknown agent, and `verifyChain` reported the chain valid. The CI badge tracks [`.github/workflows/ci.yml`](./.github/workflows/ci.yml), which builds the three packages and runs two smoke scripts. The vitest suite runs from `npm test`.

> BASIS Gate specifies how governance checks compose and how a runtime executes them. It uses tier and observation ceilings from [`@vorionsys/basis-scorer`](https://www.npmjs.com/package/@vorionsys/basis-scorer), which documents those values as derived from [`@vorionsys/basis-spec`](https://github.com/vorionsys/basis-spec). On trust-parameter questions, basis-spec is the package this runtime's dependency tree points at.

A specification for governance pipelines that mediate AI agent actions, plus one reference runtime. The specification names ordered layers (identity, tier check, rate limits, policy, content safety, audit, proof-chain signing, and others) and the presets `lite`, `standard`, `strict`, and `full`. Callers register layer implementations themselves. This repository ships five of those layers.

## What this repository contains

| Package | Purpose |
|---|---|
| [`@vorionsys/basis-gate-spec`](./packages/basis-gate-spec) | The specification (`SPEC.md`) and matching TypeScript types. `SPEC_VERSION` is `1.0-draft`. |
| [`@vorionsys/basis-gate-industry`](./packages/basis-gate-industry) | Four built-in industry profiles (consumer, finance-US, healthcare-HIPAA, legal-privilege), embedded as draft `0.1.0` documents. |
| [`@vorionsys/basis-gate-runtime`](./packages/basis-gate-runtime) | Reference runtime: resolver, executor, five reference layers, Ed25519 proof chain, in-process deferred queue. |

## Quick start

Install the runtime and the industry profiles. The runtime also depends on `@vorionsys/basis-gate-spec` and `@vorionsys/basis-scorer`.

```bash
npm install @vorionsys/basis-gate-runtime @vorionsys/basis-gate-industry
```

Wrap an agent action with the five layers this package implements:

```typescript
import { GateRuntime, loadSigningKeySeed } from "@vorionsys/basis-gate-runtime";
import {
  createIdentityLayer,
  createTierCheckLayer,
  createRateLimitLayer,
  createProofChainTipLayer,
  createAuditLogLayer,
} from "@vorionsys/basis-gate-runtime/layers";

const { seed } = loadSigningKeySeed();
const runtime = await GateRuntime.create({
  posture: {
    preset: "standard",
    industry: "@basis/industry/consumer-default",
  },
  signingKeySeed: seed,
  layers: [
    createIdentityLayer({ knownAgents: new Set(["my-agent"]) }),
    createTierCheckLayer(),
    createRateLimitLayer({ requestsPerMinute: 60 }),
    createProofChainTipLayer(),
    createAuditLogLayer({ emit: (r) => console.log("[audit]", JSON.stringify(r)) }),
  ],
  getAgentTier: () => "T3",
});

const verdict = await runtime.gate({
  actionId: "act_" + crypto.randomUUID(),
  agentId: "my-agent",
  risk: "LOW",
  classes: ["internal-effect"],
  payload: { prompt: "..." },
  receivedAt: new Date().toISOString(),
});

if (verdict.verdict !== "allow") {
  throw new Error(`gate ${verdict.verdict}: ${"reason" in verdict ? verdict.reason : ""}`);
}

// The runtime has signed a tip commit for this action.
// Deferred work for registered deferred layers is queued in-process.
```

`loadSigningKeySeed()` reads `VORION_GATE_SIGNING_KEY_B64` when set. With that variable unset and `NODE_ENV` other than `production`, it writes `.vorion-gate-dev-key.seed` (gitignored). The preset `standard` also names `@basis/policy-match`, `@basis/budget`, `@basis/tool-validate`, and `@basis/telemetry`. This package has no code for those ids. The executor skips any pipeline entry missing from `layers`, so an `allow` from the snippet has not run them. `runtime.resolvedLayerIds` still lists them. Industry ids outside the four built-ins throw at startup. `inline` layers are awaited inside `gate()` before it returns; the caller dispatches the action after that.

### Try it

[`examples/minimal-governance.ts`](./examples/minimal-governance.ts) (125 lines) runs one allowed action, one denied action, and checks the signed chain with `verifyChain`. It imports the published runtime and spec packages. The runtime depends on the industry package and on `@vorionsys/basis-scorer`. `tsx` is not a dependency of this repo; `npx` fetches it.

```bash
git clone https://github.com/vorionsys/basis-gate && cd basis-gate
npm install && npm run build
npx tsx examples/minimal-governance.ts
```

Running it printed `verdict=allow` for `agent_market_scout`, `verdict=deny` from `@basis/identity` for `agent_intruder`, and `[VERIFY] chain VALID`. The printed pipeline also listed `@basis/policy-match`, `@basis/budget`, `@basis/tool-validate`, and `@basis/telemetry`, which were not executed.

## Spec

The specification is [`packages/basis-gate-spec/SPEC.md`](./packages/basis-gate-spec/SPEC.md). It describes:

- **Layer interface** — one contract per check. Identity, tier, rate limit, policy, safety, and audit are specified as the same shape, whether the implementation is first-party or custom.
- **Three execution modes** — `block` (the pipeline waits), `inline` (the spec says the layer runs in parallel with action dispatch), `deferred` (after dispatch). Per-risk overrides are how the spec expresses "run jailbreak detection synchronously at HIGH and above, observe-only at MEDIUM, skip at LOW." The reference runtime awaits `inline` work inside `gate()` and has no jailbreak-detection layer.
- **Two-stage proof chain** — a signed tip commit, then deferred layers anchoring extensions to that tip. The runtime emits a signed deferred-timeout event when a queued deferred layer misses its window.
- **Industry profiles** — named constraint sets. Finance-US, healthcare-HIPAA, legal-privilege, and a consumer default ship here as draft `0.1.0` documents. The spec allows other namespaces; this runtime accepts only the four built-in ids.
- **Canonical trust parameters** — tier numbers, risk multipliers, and penalty formulas are fixed by `@vorionsys/basis-spec`. This specification does not redefine them. The runtime reads `toT` and `OBS_MAXTIER` from `@vorionsys/basis-scorer`.

## Status details

- Specification constant: `SPEC_VERSION = "1.0-draft"` in `packages/basis-gate-spec/src/index.ts`.
- npm: `@vorionsys/basis-gate-spec@0.1.1`, `@vorionsys/basis-gate-industry@0.1.2`, `@vorionsys/basis-gate-runtime@0.2.0`. Those versions match each package's `package.json`.
- `CHANGELOG.md` stops at runtime `0.1.1`, industry `0.1.1`, and spec `0.1.0`.
- Reference layers with factories: `@basis/identity`, `@basis/tier-check`, `@basis/rate-limit`, `@basis/proof-chain-tip`, `@basis/audit-log`.
- Preset ids with no factory in this repo include `@basis/policy-match`, `@basis/budget`, `@basis/content-safety-in`, `@basis/content-safety-out`, `@basis/jailbreak-detect`, `@basis/pii-redact`, `@basis/tool-validate`, `@basis/human-review`, `@basis/telemetry`, `@basis/canary-sample`, `@basis/shadow-verify`, and `@basis/fingerprint-check`. The resolver can place them on the pipeline. The executor continues past a missing registry entry, including layers an industry profile lists as required. Spec § 9.3 says a conformant runtime must not silently drop required layers.
- `action_class_rules` are stored on the built-in profiles and checked by `validateProfile`. The runtime sources do not read that field.
- Deferred execution uses an in-process queue. It keeps jobs in memory.
- Unit tests cover spec exports, profile loading, canonical JSON, key management, proof-chain construction, tier capping, and `verifyChain`. They do not include a conformance suite. No open issue tracks one. The open issue found was [#8](https://github.com/vorionsys/basis-gate/issues/8) (proof-record format).
- `npm test` builds, then runs vitest: 2 + 5 + 59 = 66 passed, 0 failed.
- CI (`.github/workflows/ci.yml`) installs, builds, and runs two `node -e` smoke scripts (industry loader, one allowed `gate()` call). It does not invoke `npm test`.

## License

Apache License, Version 2.0. See [LICENSE](./LICENSE). Copyright 2026 Vorion LLC.

## Who published this

The Apache copyright line and each package's `author` field name Vorion LLC. Vulnerability reports go through [SECURITY.md](./SECURITY.md).

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Comments on the specification are welcome via issues.

## Related work

- Canonical trust parameters are in [`@vorionsys/basis-spec`](https://github.com/vorionsys/basis-spec) at `packages/basis/src/canonical.ts` in that repository. This repo does not contain that path. The lockfile resolves `@vorionsys/basis-scorer@0.1.0` and `@vorionsys/basis-spec@1.2.0`. The latest published `@vorionsys/basis-spec` is `1.3.0`. `@vorionsys/basis@2.0.0` is a deprecated rename of `@vorionsys/basis-spec`. This repo does not depend on it.
- [aurais.net](https://www.aurais.net)
- [agentanchorai.com](https://www.agentanchorai.com)
