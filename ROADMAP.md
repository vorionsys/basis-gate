# Roadmap

This is a direction, not a set of dated promises. BASIS Gate is an open
specification plus a reference implementation; the items below describe where
the work is heading and what would help most from outside contributors. If you
want to influence priority, open an issue or a counter-proposal.

## Shipped

The reference runtime runs today for the five layers it implements.

- **Reference runtime** — resolver, executor, Ed25519 proof-chain signing,
  an in-process deferred-evidence queue, and five reference layers (identity,
  tier check, rate limit, proof-chain tip, audit log). Preset layer ids with
  no implementation are skipped at execution.
- **Three packages published on npm** (versions checked 30 Oct 2026) —
  [`@vorionsys/basis-gate-spec@0.1.1`](https://www.npmjs.com/package/@vorionsys/basis-gate-spec),
  [`@vorionsys/basis-gate-industry@0.1.2`](https://www.npmjs.com/package/@vorionsys/basis-gate-industry),
  and
  [`@vorionsys/basis-gate-runtime@0.2.0`](https://www.npmjs.com/package/@vorionsys/basis-gate-runtime).
  The spec package holds the specification text and TypeScript types.
  Conformance tests are still unwritten.
- **GitHub releases** — [`v0.1.1`](https://github.com/vorionsys/basis-gate/releases/tag/v0.1.1)
  and [`v0.2.0`](https://github.com/vorionsys/basis-gate/releases/tag/v0.2.0).
  The `v0.2.0` notes still name spec `0.1.0` and industry `0.1.1`.
  npm metadata for spec `0.1.1`, industry `0.1.2`, and runtime `0.2.0`
  each includes a SLSA provenance attestation. Spec `0.1.1` and
  industry `0.1.2` have no newer git tag.
- **Runnable example** — [`examples/minimal-governance.ts`](./examples/minimal-governance.ts)
  runs one allowed action, one denied action, and checks the signed chain
  with `verifyChain`.

## Next 3 months

Directional, in rough priority order:

- **Conformance test vectors + a validator** — publish executable test vectors
  against the spec so an independent runtime can demonstrate it implements the
  layer contract, the three execution modes, and the two-stage proof chain the
  same way the reference runtime does. This is the highest-leverage next step
  for making BASIS a standard rather than a single implementation.
- **Tags for the current spec and industry versions** — `v0.2.0` predates
  `@vorionsys/basis-gate-spec@0.1.1` and `@vorionsys/basis-gate-industry@0.1.2`.
  A tag that matches those npm versions is still uncut.
- **More examples** — beyond the minimal pipeline: an industry-profile walkthrough,
  a proof-chain verify-and-tamper walkthrough, and a custom-layer authoring guide.
- **External-implementer outreach** — invite a second, independent runtime
  implementation and use the conformance vectors above to check interoperability.
  Counter-proposals on the spec itself are welcome via issues.

Nothing here is a commitment to a date. Scope and order will move as
contributors and real deployments push on it.
