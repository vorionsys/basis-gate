# BASIS Gate

**B**aseline **A**uthority for **S**afe & **I**nteroperable **S**ystems — Gate specification and reference implementation.

An open specification for governance pipelines that mediate AI agent actions. Compose identity, authorization, content safety, rate limits, policy, audit, and proof-chain signing as ordered layers. Pick strictness per-deployment. Add your own layers. Swap runtime implementations without rewriting agents.

## What this repository contains

| Package | Purpose |
|---|---|
| [`@vorionsys/basis-gate-spec`](./packages/basis-gate-spec) | The normative specification. Types, interfaces, conformance requirements. |
| [`@vorionsys/basis-gate-industry`](./packages/basis-gate-industry) | Built-in industry profiles (consumer, finance-US, healthcare-HIPAA, legal-privilege). |
| [`@vorionsys/basis-gate-runtime`](./packages/basis-gate-runtime) | Reference runtime implementation — resolver, executor, reference layers, Ed25519 proof-chain. |

## Quick start

Install the runtime and its dependencies:

```bash
npm install @vorionsys/basis-gate-runtime @vorionsys/basis-gate-industry
```

Wrap any agent action with a signed governance pipeline:

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

// Your agent call runs here. The runtime has already signed a
// tip commit over the action and scheduled deferred evidence.
```

## Spec

The full specification lives at [`packages/basis-gate-spec/SPEC.md`](./packages/basis-gate-spec/SPEC.md). Highlights:

- **Layer interface** — one contract every check implements. Identity, tier, rate limit, policy, safety, audit — all first-party, third-party, jurisdiction-specific, or custom — compose through the same shape.
- **Three execution modes** — `block` (barrier), `inline` (parallel with dispatch), `deferred` (after dispatch). Combined with per-risk-level overrides, this expresses "run jailbreak detection synchronously at HIGH and above, observe-only at MEDIUM, skip at LOW."
- **Two-stage proof chain** — every action produces a signed tip commit before it dispatches, and deferred layers anchor chain extensions to that tip as they complete. Missing evidence is itself an event.
- **Industry profiles** — named constraint sets that pin specific layers to `block` in regulated contexts. Finance-US, healthcare-HIPAA, legal-privilege, and a consumer default ship in the box. Operators can publish their own under custom namespaces.
- **Canonical trust parameters stay canonical** — tier numbers, risk multipliers, penalty formulas are fixed by the BASIS canonical trust specification. Layer composition flexes; canonical values do not.

## Status

- Specification version: `v1.0-draft`
- Packages on npm: `@vorionsys/basis-gate-spec@0.1.0`, `@vorionsys/basis-gate-industry@0.1.1`, `@vorionsys/basis-gate-runtime@0.1.1`
- Reference runtime: complete. Resolver, executor, Ed25519 signing, deferred queue, 5 reference layers.
- Conformance test suite: planned. Tracked at [issue](https://github.com/vorionsys/basis-gate/issues) — contributions welcome.

## License

Apache License, Version 2.0. See [LICENSE](./LICENSE).

## Who published this

Vorion LLC. The specification is an open artifact; the legal entity exists to sign, issue compliance claims, and hold patents where applicable. See [SECURITY.md](./SECURITY.md) for disclosure protocol.

## Contributing

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Comments and counter-proposals on the specification are welcome via issues.

## Related work

- BASIS canonical trust specification — tier definitions, risk levels, penalty formulas. Referenced throughout this specification, published separately.
- Reference agent catalog at [`aurais.net`](https://www.aurais.net) — every bot runs through BASIS Gate in production as a working example.
- AgentAnchor certification authority at [`agentanchorai.com`](https://www.agentanchorai.com) — enterprise attestation of declared postures against observed proof-chain behavior.
