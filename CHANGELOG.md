# Changelog

All notable changes to the BASIS Gate packages are documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Changes in this file are grouped per package, since the three packages version independently.

---

## [Unreleased]

Nothing yet.

---

## @vorionsys/basis-gate-runtime

### [0.1.1] — 2026-04-17

**Changed**
- Dependency on `@vorionsys/basis-gate-industry` loosened from strict `0.1.0` to `^0.1.1`. Consumers now automatically pick up the serverless-compatible profile loader in industry 0.1.1 without having to upgrade runtime again.

### [0.1.0] — 2026-04-17

**Added**
- Initial release. Reference implementation of BASIS Gate v1.
- Posture resolver — preset + industry profile + operator overrides → ordered pipeline.
- Pipeline executor — block/inline/deferred scheduler with two-stage proof-chain commit.
- Ed25519 signing via `@noble/ed25519` + SHA-256 hashing via `@noble/hashes`.
- Deferred queue with deferral-window enforcement and timeout event emission.
- Key-management helper (`loadSigningKeySeed`) with env-var production path + dev-seed file fallback + safety checks (refuses to create dev seed in un-gitignored repos).
- Five reference layers: `@basis/identity`, `@basis/tier-check`, `@basis/rate-limit`, `@basis/proof-chain-tip`, `@basis/audit-log`.
- `KEYS.md` policy document covering production key generation, rotation, and anti-patterns.

---

## @vorionsys/basis-gate-industry

### [0.1.1] — 2026-04-17

**Changed**
- Profiles now embedded as JS constants at build time instead of being parsed from YAML at runtime. This fixes a `ENOENT` error observed when the package loads in serverless sandboxes (Vercel, Cloudflare Workers, AWS Lambda) where bundled non-code files are unreliable.
- Removed `yaml` runtime dependency. No runtime filesystem I/O in the loader path.

**Unchanged**
- Profile content matches v0.1.0 exactly. Same `required_layers`, `required_blocking`, `prohibited_deferred`, `action_class_rules`, and citations.
- YAML source files still ship in `profiles/` for human-readable reference, but they are not parsed at runtime.

### [0.1.0] — 2026-04-17

**Added**
- Initial release. Four built-in profiles:
  - `@basis/industry/consumer-default` — baseline for personal and hobbyist applications.
  - `@basis/industry/finance-us` — U.S. financial services. Cites Reg BI, FINRA 3110/4511, FTC Safeguards, OCC 2011-12, BSA/AML.
  - `@basis/industry/healthcare-hipaa` — U.S. healthcare under HIPAA. Cites Privacy/Security/Breach Notification rules, HITECH, 21st Century Cures information-blocking.
  - `@basis/industry/legal-privilege` — legal services handling attorney-client privileged material. Cites ABA Model Rules 1.6/5.3, ABA Formal Opinion 512 (Generative AI), GDPR Articles 5/32, FRE 502.
- Profile loader (`loadBuiltinProfile`, `loadAllBuiltinProfiles`).
- Profile validator (`validateProfile`) for external YAML.

---

## @vorionsys/basis-gate-spec

### [0.1.0] — 2026-04-17

**Added**
- Initial release. BASIS Gate v1 specification in `SPEC.md` — 12 sections:
  1. Introduction and scope
  2. Design principles
  3. Layer interface
  4. Execution modes (block / inline / deferred)
  5. Presets (lite / standard / strict / full / custom)
  6. Configuration grammar
  7. Two-stage proof-chain commit protocol
  8. Industry profiles
  9. Conformance requirements
  10. Security considerations
  11. Versioning policy
  12. Acknowledgments and contact
- TypeScript types matching the specification — `GateLayer`, `GateContext`, `LayerDecision`, `LayerEvidenceEnvelope`, `Posture`, `IndustryProfile`, `ProofChainEvent` union.
- `LEGAL-REVIEW.md` — attorney-ready citation audit for each industry profile's regulatory claims. Structured for markup by counsel qualified in each profile's jurisdiction.

---

## Repository history

### 2026-04-17

- Initial public repository split from private `voriongit/vorion` monorepo.
- Three packages migrated to this focused repo under Vorion LLC's Apache-2.0 license.
- `v0.1.1` tag marks repo initialization; corresponds to the npm state at that date.
- Consumers of the BASIS Gate standard (Aurais, AgentAnchor, third parties) pull from npm, not from source.
