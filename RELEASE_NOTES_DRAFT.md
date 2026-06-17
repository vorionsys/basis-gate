DRAFT — not yet published; publishing is an outward-facing step pending approval.

# BASIS Gate — first GitHub Release (draft)

These are draft notes for the first tagged GitHub Release of BASIS Gate. The
repository currently has zero releases; the three packages already live on npm.
This release would tag the repository state and point at those artifacts. It
describes a **reference implementation** of the BASIS Gate specification, not a
production-ready or certified product.

> BASIS is to AI-agent governance what OAuth is to delegated authorization — an open standard so an agent trusted by one system can be evaluated by another.

## What this is

An open specification plus a reference runtime for governance pipelines that
mediate AI-agent actions. You compose identity, authorization, content safety,
rate limits, policy, audit, and proof-chain signing as ordered layers, pick the
strictness per deployment, add your own layers, and swap runtime implementations
without rewriting agents.

## Packages

Three packages version independently and are published on npm.

- **[`@vorionsys/basis-gate-spec`](https://www.npmjs.com/package/@vorionsys/basis-gate-spec)** (`0.1.0`)
  — the normative specification: the layer interface, the three execution modes
  (block / inline / deferred), presets, the configuration grammar, the
  two-stage proof-chain protocol, industry profiles, conformance requirements,
  and the matching TypeScript types.
- **[`@vorionsys/basis-gate-industry`](https://www.npmjs.com/package/@vorionsys/basis-gate-industry)** (`0.1.1`)
  — four built-in industry profiles (consumer-default, finance-US,
  healthcare-HIPAA, legal-privilege) that pin specific layers to `block` in
  regulated contexts, with their regulatory citations. Profiles are embedded as
  build-time constants, so the loader does no runtime filesystem I/O and works
  in serverless sandboxes.
- **[`@vorionsys/basis-gate-runtime`](https://www.npmjs.com/package/@vorionsys/basis-gate-runtime)** (`0.1.1`)
  — the reference runtime: posture resolver, block/inline/deferred executor,
  Ed25519 signing, a deferred-evidence queue with timeout events, and 5+
  reference layers (identity, tier check, rate limit, proof-chain tip, audit
  log, and more).

## Two-stage proof-chain protocol

Every governed action produces a signed **tip commit** before it dispatches.
Deferred layers — checks that run after dispatch — anchor chain extensions to
that tip as they complete. Missing evidence is itself a recorded event, not a
silent gap. Tips are Ed25519-signed by the runtime key; the runtime exports the
verification primitives so a whole chain can be replayed and tamper-checked.

## Try it

A complete, runnable example lives at
[`examples/minimal-governance.ts`](./examples/minimal-governance.ts) (starter /
reference use). It runs one allowed action, one blocked action, and prints the
signed proof the pipeline emits, using only the three published packages.

```bash
git clone https://github.com/vorionsys/basis-gate && cd basis-gate
npm install && npm run build
npx tsx examples/minimal-governance.ts
```

## What's next

- Conformance test vectors and a validator, so an independent runtime can show
  it implements the layer contract, the execution modes, and the proof chain the
  same way the reference runtime does.
- Tagged GitHub Releases with build provenance attestation.
- More examples (industry-profile walkthrough, proof-chain verify-and-tamper
  walkthrough, custom-layer authoring guide).
- Outreach to external implementers and counter-proposals on the spec.

See [ROADMAP.md](./ROADMAP.md) for the fuller picture. None of this is a dated
commitment.

## Provenance

Source of record: the private voriongit/vorion monorepo; npm provenance attestation links the build.
