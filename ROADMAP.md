# Roadmap

This is a direction, not a set of dated promises. BASIS Gate is an open
specification plus a reference implementation; the items below describe where
the work is heading and what would help most from outside contributors. If you
want to influence priority, open an issue or a counter-proposal.

## Shipped

The reference runtime is complete and runnable today.

- **Reference runtime** — resolver, executor, Ed25519 proof-chain signing,
  deferred-evidence queue, and 5+ reference layers (identity, tier check, rate
  limit, proof-chain tip, audit log, and more).
- **Three packages published on npm** —
  [`@vorionsys/basis-gate-spec`](https://www.npmjs.com/package/@vorionsys/basis-gate-spec)
  (the normative spec: types, interfaces, conformance requirements),
  [`@vorionsys/basis-gate-industry`](https://www.npmjs.com/package/@vorionsys/basis-gate-industry)
  (built-in industry profiles), and
  [`@vorionsys/basis-gate-runtime`](https://www.npmjs.com/package/@vorionsys/basis-gate-runtime)
  (the reference runtime).
- **Runnable example** — [`examples/minimal-governance.ts`](./examples/minimal-governance.ts)
  runs one allowed action, one blocked action, and prints the signed proof the
  pipeline emits, using only the three published packages.

## Next 3 months

Directional, in rough priority order:

- **Conformance test vectors + a validator** — publish executable test vectors
  against the spec so an independent runtime can demonstrate it implements the
  layer contract, the three execution modes, and the two-stage proof chain the
  same way the reference runtime does. This is the highest-leverage next step
  for making BASIS a standard rather than a single implementation.
- **GitHub Releases + provenance** — cut tagged releases with build provenance
  attestation, so the npm artifacts trace back to a specific commit.
- **More examples** — beyond the minimal pipeline: an industry-profile walkthrough,
  a proof-chain verify-and-tamper walkthrough, and a custom-layer authoring guide.
- **External-implementer outreach** — invite a second, independent runtime
  implementation and use the conformance vectors above to check interoperability.
  Counter-proposals on the spec itself are welcome via issues.

Nothing here is a commitment to a date. Scope and order will move as
contributors and real deployments push on it.
