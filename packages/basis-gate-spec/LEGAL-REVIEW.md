# BASIS Gate Industry Profiles — Citation Audit for Legal Review

**Document version:** 0.1.0
**Profiles covered:** `@basis/industry/consumer-default`, `@basis/industry/finance-us`, `@basis/industry/healthcare-hipaa`, `@basis/industry/legal-privilege`
**Profile version reviewed:** 0.1.0 (all)
**Date prepared:** 2026-04-17

---

## 1. Purpose of this document

This document exists to support independent legal review of the regulatory citations embedded in each BASIS Gate industry profile. The profiles are configuration documents that instruct a governance runtime which layers must run synchronously for a given sector. Each citation in each profile claims that a specific regulation supports a specific governance constraint.

Before any profile is presented publicly, distributed, or relied upon by operators in production, the citations should be independently reviewed by counsel qualified in the applicable jurisdiction.

## 2. What a reviewer is asked to confirm

For each citation in each profile, a reviewer should confirm:

1. **Existence and currency.** The cited regulation, rule, or opinion exists and is in force as of the profile's version date. If the citation has been superseded or rescinded, note the current authority.
2. **Defensibility of the claim.** The note accompanying the citation states a reading of the cited text that a qualified practitioner could defend in good faith. Citations should not be used to overstate obligations the regulation does not impose.
3. **Fit with the constraint.** The layer or constraint the citation is meant to justify (one of `required_layers`, `required_blocking`, `prohibited_deferred`, or an `action_class_rules` entry) is a reasonable governance response to the cited obligation. If the constraint is disproportionate, note this.
4. **Completeness.** No material regulation in the profile's declared jurisdiction, applicable to the sector the profile covers, is missing.

## 3. How to annotate this document

Each citation below appears in a numbered row. A reviewer may annotate each row with a marker:

- **A** — Accurate and well-supported.
- **N** — Narrow. The citation is accurate but additional authority is recommended. Suggest citations in the notes column.
- **R** — Replace. The citation is inaccurate or misapplied. Suggest a correction.
- **M** — Missing. A material regulation is absent and should be added.

Reviewer comments go in the rightmost column. The final review summary goes in § 8.

## 4. Citation audit — `@basis/industry/finance-us`

**Profile scope:** AI agents operating in United States financial services contexts, including broker-dealer, investment advisor, and consumer lending work.

**Minimum preset:** strict
**Required layers:** 14
**Prohibited deferred:** 10
**Jurisdiction:** US

| # | Citation (as appears in profile) | Claim being supported (note text) | Constraint(s) justified | Marker | Reviewer comments |
|---|----------------------------------|------------------------------------|--------------------------|--------|-------------------|
| 1 | SEC Regulation Best Interest (Reg BI), 17 CFR § 240.15l-1 | Broker-dealer recommendations to retail customers require a care obligation that includes diligent consideration of alternatives. Deferred content-safety or policy-match layers cannot produce a record of that consideration before the recommendation is issued. | `required_blocking["@basis/policy-match"] = LOW`; `required_blocking["@basis/content-safety-out"] = MEDIUM` | | |
| 2 | FINRA Rule 3110 (Supervision) | Member firms must establish and maintain a supervisory system with written procedures reasonably designed to achieve compliance. Synchronous policy-match evidence contributes to that record. | `required_layers` inclusion of `@basis/policy-match`; `required_blocking["@basis/policy-match"]` | | |
| 3 | FINRA Rule 4511 (General Requirements — Books and Records) | Synchronous proof-chain tip commits per BASIS Gate SPEC § 7 produce tamper-evident records suitable as a complement to standard books-and-records requirements. | `required_layers` inclusion of `@basis/proof-chain-tip`; `required_blocking["@basis/proof-chain-tip"] = READ` | | |
| 4 | FTC Safeguards Rule, 16 CFR Part 314 | PII redaction layers run synchronously to reduce risk of disclosing customer information in agent outputs. | `required_blocking["@basis/pii-redact"] = MEDIUM` | | |
| 5 | OCC Bulletin 2011-12 (Model Risk Management) | Model risk management expectations include ongoing validation. Canary sampling and shadow verification layers may run deferred to contribute to that validation record. | `prohibited_deferred` exclusion of canary / shadow verify layers (they are permitted deferred) | | |
| 6 | BSA/AML Program Requirements, 31 CFR § 1020.210 | Anti-money-laundering program requirements for covered financial institutions necessitate synchronous policy-match evidence on transactions that may constitute reportable activity. | `required_blocking["@basis/policy-match"]` on monetary actions | | |

**Jurisdictions or obligations the reviewer should consider as potentially missing:**
- State-level insurance and securities regulators (e.g. New York Department of Financial Services Part 500 cybersecurity regulation).
- Consumer Financial Protection Bureau (CFPB) fair lending, UDAAP, and Regulation Z/B considerations for lending agents.
- Gramm-Leach-Bliley Act privacy provisions beyond the FTC Safeguards Rule.
- State privacy laws (CCPA/CPRA, Virginia VCDPA, Colorado CPA, Connecticut CTDPA, etc.) when consumer PII is processed.

## 5. Citation audit — `@basis/industry/healthcare-hipaa`

**Profile scope:** AI agents operating in United States healthcare contexts governed by HIPAA.

**Minimum preset:** strict
**Required layers:** 12
**Prohibited deferred:** 8
**Jurisdiction:** US

| # | Citation (as appears in profile) | Claim being supported (note text) | Constraint(s) justified | Marker | Reviewer comments |
|---|----------------------------------|------------------------------------|--------------------------|--------|-------------------|
| 1 | HIPAA Privacy Rule, 45 CFR Part 164 Subpart E | Uses and disclosures of protected health information are subject to minimum-necessary standards. Synchronous PII and PHI redaction at READ level reduces the surface on which minimum-necessary is evaluated. | `required_blocking["@basis/pii-redact"] = READ`; `required_blocking["@basis/content-safety-out"] = READ` | | |
| 2 | HIPAA Security Rule, 45 CFR Part 164 Subpart C | Administrative, physical, and technical safeguards include audit controls at 45 CFR § 164.312(b). The proof-chain tip event is a tamper-evident audit record that complements those controls. | `required_layers` inclusion of `@basis/proof-chain-tip`; `required_layers` inclusion of `@basis/audit-log` | | |
| 3 | HIPAA Breach Notification Rule, 45 CFR § 164.400 et seq. | Synchronous content-safety and PII-redaction evidence reduces the incidence of unauthorized acquisitions of PHI that would require breach notification. | `prohibited_deferred` inclusion of `@basis/pii-redact`, `@basis/content-safety-out` | | |
| 4 | HITECH Act of 2009 (Pub. L. 111-5, Title XIII) | Enforcement provisions increase the consequences of HIPAA violations. Synchronous preventive layers reduce the probability of the violations in the first place. | Profile-wide (supports the overall synchronous posture) | | |
| 5 | 21st Century Cures Act, Information Blocking Rule, 45 CFR Part 171 | Information blocking prohibitions apply to actors who unreasonably interfere with access to, exchange of, or use of electronic health information. Operators configuring this profile should ensure required-blocking constraints do not produce blocking behavior that would itself constitute an information-blocking violation. | Tension flag — not a constraint justification but a constraint limitation the operator must manage | | |

**Known tension requiring explicit review attention:** Citation 5 identifies a potential conflict between required-blocking constraints (intended to prevent PHI disclosure) and information-blocking prohibitions (requiring that access not be unreasonably interfered with). Reviewer attention is specifically requested on whether this profile's constraints could produce behavior that itself constitutes information blocking under 45 CFR Part 171, and if so, how the profile should be amended.

**Jurisdictions or obligations the reviewer should consider as potentially missing:**
- State health information privacy laws (e.g. Texas HB 300, California CMIA) that impose obligations beyond HIPAA.
- FDA Software as a Medical Device (SaMD) framework if an agent provides clinical decision support that could meet the device definition.
- 42 CFR Part 2 for substance use disorder treatment records.
- Part 11 (21 CFR Part 11) if the agent produces electronic records subject to FDA regulation.

## 6. Citation audit — `@basis/industry/legal-privilege`

**Profile scope:** AI agents handling attorney-client privileged communications, work product, or equivalent confidential materials.

**Minimum preset:** strict
**Required layers:** 10
**Prohibited deferred:** 7
**Jurisdictions declared:** US, EU, UK, CA

| # | Citation (as appears in profile) | Claim being supported (note text) | Constraint(s) justified | Marker | Reviewer comments |
|---|----------------------------------|------------------------------------|--------------------------|--------|-------------------|
| 1 | ABA Model Rule of Professional Conduct 1.6 (Confidentiality) | Lawyers must not reveal information relating to representation without informed consent. Synchronous content-safety and PII redaction on outputs reduce inadvertent disclosure. | `required_blocking["@basis/content-safety-out"] = READ`; `required_blocking["@basis/pii-redact"] = READ` | | |
| 2 | ABA Model Rule of Professional Conduct 5.3 (Responsibilities Regarding Nonlawyer Assistance) | Lawyers retain responsibility for the conduct of nonlawyer assistants, which in recent guidance includes AI tools. The human-review layer at HIGH and above provides a supervisory checkpoint aligned with this obligation. | `required_blocking["@basis/human-review"] = HIGH` | | |
| 3 | ABA Formal Opinion 512 (Generative AI Tools), July 2024 | The opinion addresses lawyers' obligations under the Model Rules when using generative AI tools, including competence, confidentiality, communication, and supervision. This profile's required-blocking structure supports documented compliance with those obligations. | Profile-wide | | |
| 4 | EU General Data Protection Regulation (GDPR), Articles 5 and 32 | Data protection by design and appropriate technical measures are required for processing personal data. Synchronous PII redaction operates as a technical measure within the runtime trust boundary. | `required_blocking["@basis/pii-redact"] = READ` (EU jurisdiction portion) | | |
| 5 | UK Solicitors Regulation Authority Standards and Regulations, Principle 7 | Acting in the best interests of each client includes protecting client confidentiality. Synchronous preventive layers produce records consistent with this duty. | Profile-wide (UK jurisdiction portion) | | |
| 6 | Federal Rule of Evidence 502 (Attorney-Client Privilege and Work Product) | FRE 502 governs waiver of privilege in federal proceedings. Synchronous content-safety and PII redaction on outputs reduce the probability of inadvertent disclosure that could be treated as waiver. | `required_blocking["@basis/content-safety-out"]`; `required_blocking["@basis/pii-redact"]` | | |

**Jurisdictions or obligations the reviewer should consider as potentially missing:**
- State-specific rules of professional conduct (each US state has adopted its own version; Model Rules are not directly binding).
- State bar ethics opinions addressing AI tools specifically (several states have issued guidance beyond ABA Formal Opinion 512).
- Attorney work-product doctrine distinct from Rule 1.6 confidentiality (Hickman v. Taylor line of cases).
- Court-specific sealing, in-camera review, and protective order procedures that may affect how privileged materials are produced and logged.
- Law Society of England and Wales Code of Conduct where applicable as supplement to SRA Principles.
- Canadian Federation of Law Societies Model Code of Professional Conduct.

## 7. Citation audit — `@basis/industry/consumer-default`

**Profile scope:** baseline governance for consumer and hobbyist applications.

**Minimum preset:** lite
**Required layers:** 4
**Prohibited deferred:** 3
**Jurisdiction:** any

| # | Citation (as appears in profile) | Claim being supported (note text) | Constraint(s) justified | Marker | Reviewer comments |
|---|----------------------------------|------------------------------------|--------------------------|--------|-------------------|
| 1 | BASIS canonical trust specification, packages/basis/src/canonical.ts | Every agent starts at INITIAL_TRUST_SCORE=0 and must be identified and tier-verified before any action. These constraints are canonical, not regulatory. | `required_layers` inclusion of `@basis/identity`, `@basis/tier-check` | | |
| 2 | RFC 0001 Bot Package Manifest v1 | Consumer bots distributed via the BASIS bot-package format include a signed manifest that declares the agent's identity and declared tier. | Profile-wide | | |

**Note to reviewer:** this profile does not make regulatory claims. The citations are internal BASIS specifications, not regulations. It is included here for completeness. No external-law review is required unless the profile is later extended with regulatory constraints.

## 8. Reviewer summary

**Reviewer:** ________________________________________________
**Qualification (jurisdiction, admissions, specialization):** ________________________________________________
**Date of review:** ________________________________________________

**Overall assessment:**

- [ ] Profile `@basis/industry/finance-us` is suitable for public release as a draft pending ____________
- [ ] Profile `@basis/industry/healthcare-hipaa` is suitable for public release as a draft pending ____________
- [ ] Profile `@basis/industry/legal-privilege` is suitable for public release as a draft pending ____________
- [ ] Profile `@basis/industry/consumer-default` is suitable for public release.

**Material changes recommended before release:**

(space for comments)

**Material changes recommended before operators rely on the profile in production:**

(space for comments)

---

## Appendix A — Disclaimers already carried by the profiles

Every profile YAML document includes a preamble comment noting:

- Publishing the profile is not a legal opinion.
- Operators remain responsible for their own compliance posture.
- Operators should consult qualified counsel before relying on a profile for regulated activity.

The README of `@vorionsys/basis-gate-industry` reiterates these disclaimers for anyone consuming the package.

## Appendix B — What changes require a profile version bump

Per BASIS Gate spec § 11:

- Editorial changes (typo, note rewording, comment additions) — patch bump (0.1.0 → 0.1.1).
- Adding a layer to `required_layers`, adding an entry to `required_blocking`, or tightening `prohibited_deferred` — minor bump.
- Removing a layer from `required_layers`, loosening `required_blocking`, or dropping `prohibited_deferred` entries — major bump and release-note justification.

A reviewer recommendation to strengthen a constraint produces a minor bump. A reviewer recommendation to weaken a constraint requires a major bump with documented reasoning.

## Appendix C — Contact for questions during review

Reviewer questions on the specification itself (what a layer does, what a constraint means, what a risk level represents) should be directed to the editors listed in `SPEC.md` § 12. Reviewer questions on a specific citation's application to a specific constraint should be recorded in the reviewer-comments column and resolved in the reviewer summary.

---

*End of citation audit document.*
