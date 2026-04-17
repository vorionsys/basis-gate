# BASIS Gate v1 — Specification

An open specification for AI agent governance pipelines.

## What this is

When an AI agent tries to take an action — call a tool, send an email, move money, read a file — something needs to decide whether that action is allowed. That decision is rarely one check; it is usually many checks in sequence. Identity. Authorization. Safety. Policy. Rate limits. Budget. Audit trail. Human approval in high-risk cases.

**BASIS Gate** is an open specification for how those checks compose.

It defines:

1. A common interface every check ("layer") implements, so checks written by different teams compose without surprises.
2. A three-mode execution model — **block**, **inline**, or **deferred** — so fast actions stay fast and high-risk actions get the scrutiny they require.
3. A preset system — **Lite**, **Standard**, **Strict**, **Full** — so operators can pick a posture without hand-configuring every layer.
4. A two-stage proof-chain protocol so every decision, synchronous or deferred, produces signed, tamper-evident evidence.
5. An industry-profile mechanism so regulated sectors (finance, healthcare, legal) can require specific layers to run synchronously.

## Who this is for

- **Agent developers** who want their agents to work inside any governance-aware runtime.
- **Governance runtime authors** who want to implement the specification and be interoperable with any compliant layer or profile.
- **Compliance and audit teams** who want a defined, auditable mechanism to point regulators at.
- **Anyone publishing a governance layer** (jurisdiction-specific, industry-specific, policy-specific) who wants that layer to plug into compliant runtimes without custom integration.

## What this is not

- A runtime. The runtime is a separate package. This is only the specification.
- A replacement for identity, authorization, or compliance frameworks. It is a composition mechanism on top of them.
- A legal compliance certification. Publishing a profile does not make it legally sufficient for any jurisdiction. Operators remain responsible for their compliance posture.

## Status

- Version: `v1.0-draft`
- Read the full specification: [`SPEC.md`](./SPEC.md)
- TypeScript types: [`src/index.ts`](./src/index.ts)
- License: Apache-2.0

## Reference

- Canonical trust parameters (risk levels, tier definitions, penalty formulas) are defined in the `@vorionsys/basis` package (`packages/basis/src/canonical.ts`). This specification refers to those values; it does not redefine them.
- Industry profiles ship in `@vorionsys/basis-gate-industry`.
- Reference runtime ships in `@vorionsys/basis-gate-runtime` (separate release).

## Contributing

Comments, critique, and counter-proposals are welcome. Open an issue at the repository or write to the addresses listed in `SPEC.md` § 12.

---

*Published by Vorion LLC. Apache License, Version 2.0.*
