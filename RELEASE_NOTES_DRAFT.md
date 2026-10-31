DRAFT — stale. Do not publish this file as current release notes.

# BASIS Gate — release-notes draft (outdated)

GitHub releases [`v0.1.1`](https://github.com/vorionsys/basis-gate/releases/tag/v0.1.1)
(16 Jun 2026) and [`v0.2.0`](https://github.com/vorionsys/basis-gate/releases/tag/v0.2.0)
(17 Jun 2026) are already published. Current npm versions
are `@vorionsys/basis-gate-spec@0.1.1`, `@vorionsys/basis-gate-industry@0.1.2`,
and `@vorionsys/basis-gate-runtime@0.2.0`. The `v0.2.0` release notes still list
spec `0.1.0` and industry `0.1.1`.

This file is a leftover draft of an earlier announcement. It describes a
reference implementation, not a certified product.

## What this is

A draft specification plus one reference runtime for governance pipelines that
mediate AI-agent actions. The specification names identity, tier check, rate
limits, policy, content safety, audit, and proof-chain signing as ordered
layers. This repository implements five of those layers.

## Packages

Three packages version independently and are published on npm.

- **[`@vorionsys/basis-gate-spec`](https://www.npmjs.com/package/@vorionsys/basis-gate-spec)** (`0.1.1`)
  — the specification text and matching TypeScript types: the layer interface,
  the three execution modes (block / inline / deferred), presets, the
  configuration grammar, the two-stage proof-chain protocol, industry profiles,
  and written conformance requirements. A conformance test suite is not in
  this repository.
- **[`@vorionsys/basis-gate-industry`](https://www.npmjs.com/package/@vorionsys/basis-gate-industry)** (`0.1.2`)
  — four built-in industry profiles (consumer-default, finance-US,
  healthcare-HIPAA, legal-privilege). Each embedded document is `version`
  `0.1.0`. Profiles are TypeScript constants, so the loader does no runtime
  filesystem I/O.
- **[`@vorionsys/basis-gate-runtime`](https://www.npmjs.com/package/@vorionsys/basis-gate-runtime)** (`0.2.0`)
  — the reference runtime: posture resolver, block/inline/deferred executor,
  Ed25519 signing, an in-process deferred queue, and five reference layers
  (identity, tier check, rate limit, proof-chain tip, audit log).

## Two-stage proof-chain protocol

Every governed action produces a signed **tip commit** before it dispatches.
Deferred layers — checks that run after dispatch — anchor chain extensions to
that tip as they complete. Missing evidence is itself a recorded event, not a
silent gap. Tips are Ed25519-signed by the runtime key; the runtime exports the
verification primitives so a whole chain can be replayed and tamper-checked.

## Try it

A runnable example lives at
[`examples/minimal-governance.ts`](./examples/minimal-governance.ts) (125 lines,
starter / reference use). It runs one allowed action, one denied action, and
checks the signed chain with `verifyChain`. It imports the published runtime
and spec packages. The runtime depends on the industry package and on
`@vorionsys/basis-scorer`.

```bash
git clone https://github.com/vorionsys/basis-gate && cd basis-gate
npm install && npm run build
npx tsx examples/minimal-governance.ts
```

## What's next

- Conformance test vectors and a validator, so an independent runtime can show
  it implements the layer contract, the execution modes, and the proof chain the
  same way the reference runtime does.
- A git tag that matches the current spec `0.1.1` and industry `0.1.2` npm versions. Releases `v0.1.1` and `v0.2.0` already exist.
- More examples (industry-profile walkthrough, proof-chain verify-and-tamper
  walkthrough, custom-layer authoring guide).
- Outreach to external implementers and counter-proposals on the spec.

See [ROADMAP.md](./ROADMAP.md) for the fuller picture. None of this is a dated
commitment.

## Provenance

`npm view` reports a SLSA provenance attestation for `@vorionsys/basis-gate-spec@0.1.1`, `@vorionsys/basis-gate-industry@0.1.2`, and `@vorionsys/basis-gate-runtime@0.2.0`. This file does not record a private source repository.
