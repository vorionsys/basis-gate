# BASIS Gate v1 — Specification

**Status:** Draft v1.0
**Date:** 2026-04-17
**Editors:** Vorion LLC
**License:** Apache License 2.0

---

## Abstract

BASIS Gate is an open specification for composable governance pipelines that mediate AI agent actions. Governance checks — identity verification, authorization, safety screening, policy enforcement, rate limiting, audit logging — compose as ordered layers. Each layer implements a common interface and declares whether it must block the action, run in parallel with dispatch, or run after the action completes. A two-stage proof-chain protocol produces signed evidence of every decision, synchronous or deferred. Industry profiles require specific layers to run synchronously in regulated contexts.

This specification defines the interface, the execution semantics, the configuration format, and the proof-chain protocol. It does not specify a runtime implementation.

---

## 1. Introduction

An AI agent performs actions. Before an action executes, or in some cases while and after it executes, a governance pipeline decides whether the action is permitted and produces evidence of the decision.

Different deployments require different pipelines. A hobbyist note-taking assistant should not carry the same scrutiny overhead as a clinical decision-support system. A consumer product prioritizing responsiveness should not be forced into a 500-millisecond synchronous pipeline. A regulated institution must not be allowed to skip checks its jurisdiction requires.

BASIS Gate defines a specification that accommodates both ends without forking: the same layer interface, the same evidence format, and the same configuration grammar serve the consumer and the regulated sector. Operators compose layers from a preset, an industry profile, or an explicit list. Execution mode per layer — **block**, **inline**, or **deferred** — controls the tradeoff between latency and barrier strength. Industry profiles override execution mode for layers a sector requires synchronously.

### 1.1 Scope

This specification defines:

- The layer interface (§ 3).
- The execution-mode model (§ 4).
- The preset catalog (§ 5).
- The configuration grammar (§ 6).
- The two-stage proof-chain protocol (§ 7).
- The industry profile format (§ 8).
- Conformance requirements for layers, profiles, and runtimes (§ 9).

This specification does not define:

- A runtime implementation.
- Specific content-safety models or identity providers.
- Cryptographic primitives beyond requiring a signature scheme — the reference profile uses Ed25519.
- Legal sufficiency for any jurisdiction or regulatory regime.

### 1.2 Terminology

The key words **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** in this specification are to be interpreted as described in RFC 2119 and RFC 8174.

- **Layer** — a pluggable unit that evaluates an action and returns a decision.
- **Action** — a request by an agent to perform an operation (call a tool, read a resource, produce output).
- **Pipeline** — the ordered sequence of layers that runs for a given action.
- **Posture** — the combined preset, profile, layer list, and per-layer configuration that defines a runtime's governance behavior at a point in time.
- **Proof chain** — an append-only log of signed evidence documenting every governance decision.
- **Industry profile** — a named override set that requires specific layers to run synchronously for a regulated sector.

### 1.3 Relationship to BASIS canonical trust parameters

Trust score ranges, tier definitions, risk-level multipliers, penalty formulas, circuit-breaker thresholds, and recovery parameters are defined in the canonical BASIS trust specification (implemented in `@vorionsys/basis` at `packages/basis/src/canonical.ts`). This specification references those values; it does not redefine them.

A conformant runtime **MUST NOT** override canonical trust parameters via layer configuration. Operators configure *which layers run* and *in what mode*. They do not configure what tier numbers mean or how penalties are calculated.

---

## 2. Design principles

1. **One interface.** Every layer — first-party, third-party, jurisdiction-specific, custom — implements the same interface. A layer written by a bank for internal compliance composes with a layer written by a hospital and a layer written by a consumer platform.

2. **Composable, not monolithic.** A deployment chooses which layers to run. Adding a layer does not require forking the runtime.

3. **Sync where it must be, async where it may be.** Preventive checks block the action. Detective checks run after. Industry profiles decide which layers sit in which category for regulated work.

4. **Signed evidence for every decision.** Synchronous and deferred decisions both produce signed evidence anchored to the action. Missing evidence is itself a governance event.

5. **Canonical trust parameters are non-negotiable.** Tier definitions, risk-level multipliers, and penalty formulas are fixed by the BASIS canonical specification. Layer composition is flexible; canonical values are not.

6. **Posture is itself a signed claim.** Operators publish their posture. A claimed posture that does not match observed pipeline execution is detectable by any verifier with access to the proof chain.

---

## 3. Layer interface

A layer is a unit of governance logic. It examines an action and returns one of three verdicts: allow, deny, or escalate.

### 3.1 Required fields

A layer **MUST** provide:

| Field              | Type                                       | Purpose                                                               |
|--------------------|--------------------------------------------|-----------------------------------------------------------------------|
| `id`               | string                                     | Globally unique identifier (e.g. `@basis/identity`, `@acme/finra`).   |
| `version`          | string (semver)                            | Layer version.                                                        |
| `band`             | integer 1–5                                | Functional band (§ 3.4).                                              |
| `defaultExecution` | `block` \| `inline` \| `deferred`          | Preferred execution mode in the absence of overrides.                 |
| `run`              | function                                   | The evaluation function (§ 3.2).                                      |

A layer **MAY** provide:

| Field                 | Type                               | Purpose                                                                           |
|-----------------------|------------------------------------|-----------------------------------------------------------------------------------|
| `requires`            | string[]                           | Identifiers of layers that **MUST** run before this one.                          |
| `syncRequiredFor`     | RiskLevel[]                        | Risk levels for which this layer **MUST** be `block` regardless of operator config. |
| `blockingIndustries`  | string[]                           | Industry profile identifiers that **MUST** pin this layer to `block`.             |
| `maxDurationMs`       | integer                            | Self-declared latency budget. Runtimes **MAY** enforce this.                      |

### 3.2 The `run` function

```
run(ctx: GateContext, action: AgentAction) → Promise<LayerDecision>
```

`GateContext` provides:

- the action under evaluation
- the evaluating agent's identity and current tier
- the proof-chain tip hash at the time of evaluation
- the operator's posture identifier
- the evidence accumulated by prior layers (for layers with `requires`)

`LayerDecision` is one of:

- `{ verdict: "allow", evidence: Evidence }` — the layer permits the action.
- `{ verdict: "deny", reason: string, evidence: Evidence }` — the layer blocks the action.
- `{ verdict: "escalate", to: "human" | "higher-tier", reason: string, evidence: Evidence }` — the layer requires escalation before permitting.

`Evidence` is an object of layer-specific fields plus a standard envelope (timestamp, layer id, layer version, run duration). Evidence **MUST** be serializable as canonical JSON (key-sorted, no whitespace) for signing.

### 3.3 Verdict composition

The runtime composes layer verdicts as follows:

- Any `deny` from a `block` layer **MUST** terminate the pipeline and prevent action dispatch.
- Any `escalate` from a `block` layer **MUST** route the action to the declared escalation target before dispatch.
- `inline` and `deferred` layers **MUST** record their verdicts in the proof chain. A `deny` from an `inline` or `deferred` layer **MUST NOT** unring the action; it **MUST** trigger follow-on actions specified by the runtime (penalty application, session revocation, human notification).

### 3.4 Bands

Layers are organized into five functional bands. Bands are advisory for readability; they do not constrain execution ordering.

| Band | Name                | Typical layers                                                              |
|------|---------------------|-----------------------------------------------------------------------------|
| 1    | Identity & Trust    | identity check, tier verification, behavioral-baseline fingerprint          |
| 2    | Policy & Guardrails | policy match, rate limit, budget enforcement, human-in-the-loop             |
| 3    | Content Safety      | input/output content policy, jailbreak detection, PII redaction, tool validation |
| 4    | Evidence            | proof-chain signing, audit log, telemetry                                   |
| 5    | Assurance           | canary sampling, shadow verification, cross-agent consistency               |

Bands 1 and 4 are mandatory in all conformant postures. Bands 2, 3, and 5 are optional and configured by preset and profile.

---

## 4. Execution modes

Every layer runs in one of three modes, chosen by the runtime based on (in precedence order): industry profile requirement, operator override, preset default, layer default.

| Mode       | Definition                                                                                                         |
|------------|--------------------------------------------------------------------------------------------------------------------|
| `block`    | Pipeline pauses for this layer. Action does not dispatch until the layer returns.                                  |
| `inline`   | Layer runs in parallel with action dispatch. Its evidence attaches to the response before it is returned to the caller. |
| `deferred` | Layer runs after action dispatch completes. Evidence is appended to the proof chain later, anchored to the action's synchronous tip. |

### 4.1 Resolution order

For each layer in a pipeline, the runtime resolves execution mode in this order (highest precedence first):

1. Industry profile `required_blocking` list — if the layer id appears here, mode is `block`.
2. Industry profile `prohibited_deferred` list — if the layer id appears here, mode is `block` or `inline`.
3. Operator override in posture configuration (`execution` field).
4. Layer's `syncRequiredFor` — if the action's risk level is in this list, mode is `block`.
5. Preset default for the action's risk level.
6. Layer's `defaultExecution`.

### 4.2 Deferred-incompatible actions

The following action classes **MUST NOT** use `deferred` for any layer that serves a preventive purpose (identity, authorization, policy, content safety, PII, jailbreak detection, tool validation):

1. **Irreversible real-world effects** — funds movement, trade execution, physical actuator signals, regulated substance dispensing.
2. **Actions with external recipients** — published messages, sent emails, delivered notifications — unless the runtime implements a hold-and-release mechanism that waits for inline-observe evidence before externalizing.
3. **Multi-hop agent chains** — for actions that trigger downstream agent actions, all preventive layers **MUST** be `block` at each hop.

Industry profiles and runtime implementations **SHOULD** enforce these constraints by pinning relevant layers to `block` for the matching action classes.

### 4.3 Deferred execution guarantees

A deferred layer **MUST**:

- Complete within a runtime-declared maximum deferral window (default 72 hours).
- Anchor its evidence to the proof-chain tip hash captured at synchronous commit time.
- Sign its evidence with a key whose public counterpart is discoverable by verifiers.

If a deferred layer does not complete within the deferral window, the runtime **MUST** treat the missing evidence as a governance event. At minimum, the runtime **SHOULD** transition the action's agent into an AUDITED observation posture as defined by the BASIS canonical trust specification.

---

## 5. Presets

Presets are named bundles of layers and default execution modes. Operators select a preset as a starting point and apply overrides.

| Preset     | Purpose                                                               | Bands included               | Typical sync-path target    |
|------------|-----------------------------------------------------------------------|------------------------------|-----------------------------|
| `lite`     | Minimum viable governance. Personal and low-stakes applications.      | 1, 4                         | ~10 ms                      |
| `standard` | Default posture. Balances scrutiny and responsiveness.                | 1, 2 (partial), 4            | ~50 ms                      |
| `strict`   | Heavy scrutiny. Business-sensitive and compliance-adjacent work.      | 1, 2, 3, 4                   | ~150 ms                     |
| `full`     | All bands. Regulated-sector and high-stakes applications.             | 1, 2, 3, 4, 5                | ~500 ms                     |
| `custom`   | Explicit layer list. Operator provides layers and modes by hand.      | Operator-defined             | Operator-defined            |

### 5.1 Layers per preset (defaults)

The table below gives each preset's default layer list and per-risk-level execution mode. Layer identifiers prefixed `@basis/` are reference layers defined in this specification.

| Layer / Preset                 | `lite`      | `standard`   | `strict`     | `full`       |
|--------------------------------|-------------|--------------|--------------|--------------|
| `@basis/identity`              | block       | block        | block        | block        |
| `@basis/tier-check`            | block       | block        | block        | block        |
| `@basis/rate-limit`            | deferred/LOW+; block/MEDIUM+ | block        | block        | block        |
| `@basis/policy-match`          | —           | block        | block        | block        |
| `@basis/budget`                | —           | deferred/LOW; block/MEDIUM+ | block        | block        |
| `@basis/content-safety-in`     | —           | —            | inline/MEDIUM; block/HIGH+ | block        |
| `@basis/content-safety-out`    | —           | —            | inline/MEDIUM; block/HIGH+ | block        |
| `@basis/jailbreak-detect`      | —           | —            | inline/MEDIUM; block/HIGH+ | block        |
| `@basis/pii-redact`            | —           | —            | block/MEDIUM+ | block        |
| `@basis/tool-validate`         | —           | block/MEDIUM+ | block        | block        |
| `@basis/human-review`          | —           | —            | block/HIGH+  | block/HIGH+  |
| `@basis/proof-chain-tip`       | block       | block        | block        | block        |
| `@basis/audit-log`             | deferred    | deferred     | deferred     | deferred     |
| `@basis/telemetry`             | deferred    | deferred     | deferred     | deferred     |
| `@basis/canary-sample`         | —           | —            | —            | deferred     |
| `@basis/shadow-verify`         | —           | —            | —            | deferred     |
| `@basis/fingerprint-check`     | —           | —            | deferred     | deferred     |

A dash ("—") indicates the layer is not included in that preset by default. Operators **MAY** add it via configuration.

### 5.2 Risk-level references

Risk levels used in this table (READ, LOW, MEDIUM, HIGH, CRITICAL, LIFE_CRITICAL) are defined in the BASIS canonical trust specification. A conformant runtime **MUST** use those values without modification.

---

## 6. Configuration grammar

An operator configures a runtime's posture with a single document. The document format is YAML for humans and JSON for machines; the two **MUST** be losslessly interconvertible.

### 6.1 Structure

```yaml
# Minimal posture
preset: standard

# Posture with industry profile
preset: strict
industry: "@basis/industry/finance-us"

# Posture with additions, removals, and overrides
preset: standard
industry: "@basis/industry/finance-us"

layers:
  add:
    - id: "@acme/finra-compliance"
      execution: block
      config:
        jurisdiction: US
    - id: "@acme/sox-control"
      execution: inline
      mode: observe      # layer runs but never blocks — for rollout
  remove:
    - "@basis/content-safety-in"
    - "@basis/content-safety-out"
  override:
    "@basis/rate-limit":
      config:
        per_tier:
          T0: "10/min"
          T5: "1000/min"
    "@basis/human-review":
      execution_by_risk:
        HIGH: block
        CRITICAL: block
```

### 6.2 Field reference

| Field                             | Type                 | Required | Notes                                                              |
|-----------------------------------|----------------------|----------|--------------------------------------------------------------------|
| `preset`                          | enum                 | yes      | One of `lite`, `standard`, `strict`, `full`, `custom`.             |
| `industry`                        | string               | no       | Industry profile identifier. Applied on top of preset.             |
| `layers.add[]`                    | Layer entries        | no       | Layers added to the pipeline.                                      |
| `layers.add[].id`                 | string               | yes      | Layer identifier.                                                  |
| `layers.add[].execution`          | enum                 | no       | `block`, `inline`, or `deferred`. Defaults to layer default.       |
| `layers.add[].execution_by_risk`  | object               | no       | Per-risk-level execution overrides.                                |
| `layers.add[].mode`               | enum                 | no       | `enforce` (default), `observe`, or `shadow`.                       |
| `layers.add[].config`             | object               | no       | Layer-specific configuration.                                      |
| `layers.remove[]`                 | string[]             | no       | Layer identifiers to remove from the preset default.               |
| `layers.override`                 | object               | no       | Modifications to layers already in the preset.                     |

### 6.3 Resolution algorithm

A runtime **MUST** resolve a posture to a concrete layer pipeline as follows:

1. Load the preset's default layer list.
2. Load the industry profile, if any, and apply its `required_blocking` pins, `prohibited_deferred` pins, and `required_layers` additions.
3. Apply `layers.remove` — any layer identifier in this list is removed from the pipeline. A removal **MUST** fail if the identifier appears in the industry profile's `required_layers`.
4. Apply `layers.add` — each layer in this list is added to the pipeline.
5. Apply `layers.override` — configuration, execution, and mode overrides are merged into matching pipeline entries.
6. Resolve execution mode per layer per risk level using § 4.1.
7. Validate dependency ordering (`requires` fields). If a cycle or missing dependency exists, the runtime **MUST** refuse to start with the posture.

A runtime **MUST NOT** mutate the posture silently. Any resolution that drops a required layer, ignores a declared override, or weakens an industry profile **MUST** raise an error at configuration load time.

### 6.4 Posture signing

A conformant runtime **MUST** sign its active posture with a declared signing key at startup and on every reload. The signed posture document is itself a proof-chain event and **MUST** be appended to the chain.

---

## 7. Two-stage proof-chain commit

Every governed action produces evidence in two stages: synchronous (tip commit) and deferred (chain extension).

### 7.1 Stage 1 — tip commit

Before the action dispatches, the runtime:

1. Executes all `block` layers in dependency order.
2. Executes all `inline` layers in parallel with action dispatch.
3. Computes a tip hash:

   ```
   tip_hash = H(
     action_canonical_json ||
     prior_chain_tip ||
     sync_evidence_canonical_json
   )
   ```

   where `H` is a hash function specified by the runtime (default: SHA-256) and `||` denotes concatenation of canonical-JSON-serialized, length-prefixed byte sequences.
4. Signs the tip:

   ```
   tip_signature = Sign(runtime_key, tip_hash)
   ```

5. Appends the tip event `{ action_id, tip_hash, sync_evidence, tip_signature }` to the proof chain.

`inline` layer evidence **MUST** attach to the tip event before the response is returned to the caller.

### 7.2 Stage 2 — chain extension

For each `deferred` layer the runtime queues for an action, when the layer completes:

1. The layer's evidence is signed by the layer's signing key.
2. The runtime appends a chain extension event:

   ```
   {
     action_id,
     anchor_tip: tip_hash,
     layer_id,
     layer_version,
     evidence,
     layer_signature
   }
   ```

3. The event is signed again by the runtime key, producing a run-level attestation over the anchor relationship.

A verifier **MUST** be able to reconstruct which deferred events belong to which action by following `anchor_tip` references.

### 7.3 Delayed denial

If a deferred layer returns `deny` or `escalate` after the action has dispatched:

1. The evidence **MUST** be committed to the chain as described above.
2. The runtime **MUST** apply any penalties declared by the layer (trust-score reduction, session revocation, agent state transition) consistent with the BASIS canonical trust specification.
3. The runtime **MUST** notify escalation targets declared in the posture.
4. The runtime **SHOULD NOT** attempt to reverse externalized effects automatically. Reversal is a separate governed action initiated by a human or higher-tier agent.

### 7.4 Missing deferred evidence

If a deferred layer does not produce evidence within its declared deferral window:

1. The runtime **MUST** append a `deferred_timeout` event to the chain, itself signed.
2. The runtime **SHOULD** transition the agent to the AUDITED state as defined in the BASIS canonical trust specification.
3. The runtime **MUST** surface the missing evidence to the posture's operator dashboard.

---

## 8. Industry profiles

An industry profile is a named configuration fragment that encodes regulatory or domain constraints. Operators reference a profile by identifier; the runtime applies it on top of the selected preset.

### 8.1 Profile document

A profile document contains:

| Field                    | Type                                      | Purpose                                                                      |
|--------------------------|-------------------------------------------|------------------------------------------------------------------------------|
| `id`                     | string                                    | Profile identifier (e.g. `@basis/industry/finance-us`).                      |
| `version`                | string (semver)                           | Profile version.                                                             |
| `description`            | string                                    | Human-readable description.                                                  |
| `jurisdiction`           | string[]                                  | Applicable jurisdictions (ISO country/region codes).                         |
| `required_layers`        | string[]                                  | Layer identifiers that **MUST** be present in the pipeline.                  |
| `required_blocking`      | object                                    | Layer identifiers mapped to risk levels at which they **MUST** be `block`.   |
| `prohibited_deferred`    | string[]                                  | Layer identifiers that **MUST NOT** run as `deferred`.                       |
| `minimum_preset`         | enum                                      | Lowest allowed preset (`lite`, `standard`, `strict`, `full`).                |
| `action_class_rules`     | object                                    | Additional constraints by action class (irreversible, external-recipient, multi-hop). |
| `references`             | object[]                                  | Citations to the regulatory basis for each constraint.                       |

### 8.2 Application order

When a posture references an industry profile:

1. The runtime loads the profile before any `layers.add`, `layers.remove`, or `layers.override` from the posture.
2. Every layer in `required_layers` is added to the pipeline if not already present.
3. Every layer in `prohibited_deferred` has its execution clamped to `block` or `inline`.
4. Every entry in `required_blocking` forces the layer to `block` at or above the declared risk level.
5. `layers.remove` **MUST NOT** remove a layer that appears in `required_layers`. If the operator attempts this, the runtime **MUST** refuse to load.
6. `layers.override` **MUST NOT** weaken an execution mode below what `required_blocking` or `prohibited_deferred` requires.

### 8.3 Profile registration

Industry profiles are published documents. A conformant runtime **SHOULD** verify profile authenticity by signature before applying it.

The `@basis/industry/*` namespace is reserved for profiles published by Vorion LLC. Other parties publishing profiles **SHOULD** use a namespace they own or a well-known third-party registry.

---

## 9. Conformance

### 9.1 Layer conformance

A conformant layer:

- **MUST** implement the interface in § 3.
- **MUST** produce serializable evidence for every decision.
- **MUST** declare `defaultExecution`, `band`, and `version` truthfully.
- **SHOULD** declare a `maxDurationMs` budget.
- **SHOULD NOT** exceed its declared budget.
- **MUST NOT** mutate `GateContext` state for subsequent layers except via the evidence record.

### 9.2 Profile conformance

A conformant profile:

- **MUST** cite the regulatory basis for every required-blocking constraint in `references`.
- **MUST** version according to semver.
- **MUST** be publishable as canonical JSON.
- **SHOULD** declare jurisdictional scope.

### 9.3 Runtime conformance

A conformant runtime:

- **MUST** implement the resolution algorithm in § 6.3.
- **MUST** implement the two-stage commit protocol in § 7.
- **MUST NOT** silently weaken or drop required layers.
- **MUST NOT** override canonical trust parameters.
- **MUST** emit proof-chain events for every posture load, reload, and decision.
- **SHOULD** publish its active posture at a discoverable endpoint.
- **SHOULD** provide a posture-signing mechanism per § 6.4.

---

## 10. Security considerations

### 10.1 Posture claims

A runtime can only be verified to match its claimed posture if an observer can compare the observed pipeline execution (from the proof chain) against the claimed configuration. Aggregators and verifiers implementing this comparison **SHOULD** publish their methodology.

### 10.2 Third-party layer trust

Third-party layers introduced via configuration run in the runtime's trust boundary. A runtime implementation **SHOULD**:

- Sandbox third-party layers (WASM, process isolation, or equivalent).
- Restrict layer network and filesystem access to that which the layer declares it needs.
- Verify layer signatures before loading.
- Enforce `maxDurationMs` budgets.

### 10.3 Deferred layer denial of service

An attacker who controls a deferred layer can delay its response to hold the agent in an indeterminate governance state. Runtimes **MUST** enforce the deferral window per § 4.3 and **SHOULD** alert operators when deferral rates exceed baseline.

### 10.4 Configuration weakening

Attempts to weaken a posture by editing configuration **MUST** produce a proof-chain event. Operators **SHOULD** configure multi-party approval for posture changes per the BASIS governance-ceremony mechanism.

---

## 11. Versioning

This specification uses semver. Compatibility commitments:

- **Patch releases (1.0.x)** add clarifications and fix editorial errors. No behavior change.
- **Minor releases (1.x.0)** may add optional fields, new reserved layer namespaces, and new execution-mode hints. Existing conformant implementations remain conformant.
- **Major releases (x.0.0)** may introduce breaking changes. Migration guidance will accompany the release.

---

## 12. Acknowledgments and contact

BASIS Gate v1 is a work of Vorion LLC. Comments and counter-proposals are welcome via the repository issue tracker at `https://github.com/voriongit/vorion` under the `packages/basis-gate-spec` directory, or by writing to the editors.

The canonical trust specification referenced throughout is defined in `@vorionsys/basis` at `packages/basis/src/canonical.ts`.

---

## Appendix A — Reserved layer namespaces

| Namespace prefix     | Reserved for                                            |
|----------------------|---------------------------------------------------------|
| `@basis/`            | Layers defined or endorsed by this specification.       |
| `@basis/industry/`   | Industry profiles published by Vorion LLC.              |

Other namespaces are available for layer and profile publishers on a first-use basis.

## Appendix B — Canonical risk levels (reference)

The risk levels used throughout this specification are defined in the BASIS canonical trust specification. For reference:

| Name            | Multiplier | Description                        |
|-----------------|------------|------------------------------------|
| `READ`          | 1          | Observation only                   |
| `LOW`           | 3          | Low-impact operations              |
| `MEDIUM`        | 5          | Operational impact                 |
| `HIGH`          | 10         | Significant impact                 |
| `CRITICAL`      | 15         | Severe impact                      |
| `LIFE_CRITICAL` | 30         | Human safety at stake              |

Cooldown values, penalty formulas, and tier observation ceilings are defined in the canonical specification. A conformant runtime **MUST** use those values without modification.

---

*End of BASIS Gate v1 specification.*
