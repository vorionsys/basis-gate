# Security Policy

## Reporting a vulnerability

Report security issues privately — not through GitHub issues or public discussions.

**Email:** security@vorion.org

Include:
- Affected package and version (`@vorionsys/basis-gate-spec`, `@vorionsys/basis-gate-industry`, `@vorionsys/basis-gate-runtime`, or combinations)
- Reproduction steps or a minimal test case
- Your assessment of severity and impact
- Whether you intend to disclose publicly, and on what timeline

We acknowledge reports within 3 business days. We aim to confirm or refute within 14 days of acknowledgment.

## Scope

In-scope:

- Flaws in the reference runtime implementation (posture resolution, executor, proof-chain signing, key management, deferred queue)
- Specification ambiguities that could lead to insecure implementations
- Industry profile citations that misrepresent regulatory requirements in ways that would cause operators to weaken their posture

Out-of-scope:

- Vulnerabilities in dependencies (report those to the upstream project)
- Issues in non-reference runtimes or third-party layers — those are the responsibility of their authors
- Issues that require an attacker to already control the signing key (if the key is compromised, the game is over)
- Issues in consumers of this library (Aurais, Mission Control, AgentAnchor, etc.) — report those to the respective product teams

## Supported versions

Until v1.0.0, every minor version is supported only through the next minor. No LTS commitment. Users on early versions should expect to upgrade.

After v1.0.0, we plan to maintain the current minor and the previous minor with security fixes.

## Disclosure

We prefer coordinated disclosure. After we acknowledge and have a fix in progress, we will agree on a public disclosure date. Attribution to the reporter is included unless you request anonymity.

If a reported issue is already being exploited, we may publish immediately without waiting for a coordinated date.

## Cryptography

This package uses Ed25519 for signing (via `@noble/ed25519`) and SHA-256 for hashing (via `@noble/hashes`). We do not implement our own primitives. If you believe we are using these libraries incorrectly, that is in scope.

## Signing-key handling

The reference runtime's key-management helper (`loadSigningKeySeed`) is documented in `packages/basis-gate-runtime/KEYS.md`. If you identify a way to recover a signing-key seed from any exposed artifact (proof-chain events, posture-load events, signatures) — that is a critical finding. Report immediately.

## PGP

Not offered at this time. Email is sufficient for our scale. If you require encrypted communication, ask and we will arrange.
