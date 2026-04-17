# Contributing to BASIS Gate

Thank you for considering a contribution. This repository holds the BASIS Gate specification and its reference implementation. It is intended to be an open standard — scrutiny, counter-proposals, and independent implementations are welcome.

## What we accept

**Specification changes.** File an issue before opening a PR for anything that touches `packages/basis-gate-spec/SPEC.md`. Spec changes require rationale, breakage assessment, and a version-bump plan (patch / minor / major) per the policy in SPEC § 11.

**Reference-implementation fixes.** Bug fixes to the runtime, resolver, executor, or reference layers are welcome directly as PRs with a reproduction and a regression test.

**Industry profile additions.** New profiles under the `@basis/industry/*` namespace require (a) jurisdictional scope, (b) citations for every `required_blocking` constraint, and (c) reviewer sign-off from counsel qualified in the claimed jurisdiction. See `LEGAL-REVIEW.md` in the spec package for the format.

**Documentation, typos, clarifications.** Always welcome.

**New independent implementations.** Not accepted in this repository. Build them in your own, reference this spec, and we will link back from the README when conformance is demonstrated.

## What we do not accept without discussion

- New layers in `@vorionsys/basis-gate-runtime/layers/` that duplicate content-safety, jailbreak-detection, or PII redaction using proprietary or unverifiable models. The reference runtime should carry only layers that are minimal, auditable illustrations. Production implementations belong in separate packages.
- Breaking changes to `@vorionsys/basis-gate-spec` types without a corresponding SPEC.md revision.
- Industry profile updates that weaken a constraint. Strengthening constraints is fine; weakening requires a major version bump and documented reasoning.

## Before you open a PR

- Read the relevant package's README and any adjacent SPEC or design docs.
- Open an issue to discuss significant changes. This avoids work on a direction that will not merge.
- Run `npm install` at the repository root to install workspaces.
- Run `npm run build` and confirm it passes.
- Add or update tests that demonstrate the change.

## Commit style

Conventional commits are encouraged but not mandatory:

- `feat(runtime):` new runtime capability
- `fix(industry):` correct a profile
- `docs(spec):` specification clarification
- `chore:` repository housekeeping
- `test:` add or update tests

## Reporting security issues

Do not open a public issue for security vulnerabilities. See [SECURITY.md](./SECURITY.md).

## Code of conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating you agree to uphold this code.

## License

By submitting a Contribution, you agree to license your work under the Apache License, Version 2.0 (the license this project carries). You retain copyright on your Contribution; the license grants us and all users the right to use, modify, and redistribute under the same terms.

## Who decides what merges

Vorion LLC maintains this repository and has final commit authority. Substantive disagreements about specification direction are resolved through the issue tracker with visible rationale. We do not operate a formal voting model; decisions are made by the maintainers with consideration for community input.

## Thanks

Every review, test, reproduction, and counter-argument improves the standard. If the spec is wrong somewhere, we want to know.
