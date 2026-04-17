// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// BASIS Gate industry profile loader.
//
// Returns strongly typed `IndustryProfile` objects for the built-in
// profiles. Profiles are embedded as JS constants at build time — no
// runtime filesystem access is required, so the loader works in
// serverless sandboxes (Vercel, Cloudflare Workers, AWS Lambda) where
// bundled non-code files are unreliable.
//
// The authoritative human-readable copies of each profile live in
// `./profiles/*.yml` in this package. If you change a YAML file, the
// constant below must be updated to match.

import type {
  ActionClass,
  ExecutionMode,
  IndustryProfile,
  IndustryProfileReference,
  Preset,
  RiskLevel,
} from "@vorionsys/basis-gate-spec";

export const BUILTIN_PROFILE_IDS = [
  "@basis/industry/consumer-default",
  "@basis/industry/finance-us",
  "@basis/industry/healthcare-hipaa",
  "@basis/industry/legal-privilege",
] as const;

export type BuiltinProfileId = (typeof BUILTIN_PROFILE_IDS)[number];

// ---------------------------------------------------------------------------
// Embedded profile content
// ---------------------------------------------------------------------------

const CONSUMER_DEFAULT: IndustryProfile = {
  id: "@basis/industry/consumer-default",
  version: "0.1.0",
  description:
    "Baseline profile for consumer and hobbyist AI agent applications. Ensures identity, tier verification, and tamper-evident evidence while allowing most safety and policy layers to run as deferred or inline to preserve user-facing responsiveness.",
  jurisdiction: ["any"],
  minimum_preset: "lite",
  required_layers: [
    "@basis/identity",
    "@basis/tier-check",
    "@basis/proof-chain-tip",
    "@basis/audit-log",
  ],
  required_blocking: {
    "@basis/identity": "READ",
    "@basis/tier-check": "READ",
    "@basis/proof-chain-tip": "READ",
  },
  prohibited_deferred: [
    "@basis/identity",
    "@basis/tier-check",
    "@basis/proof-chain-tip",
  ],
  action_class_rules: {
    "irreversible-real-world": {
      min_execution_mode: "block",
      required_layers: ["@basis/policy-match", "@basis/human-review"],
    },
    "external-recipient": {
      min_execution_mode: "inline",
      required_layers: ["@basis/content-safety-out"],
    },
    "multi-hop-chain": {
      min_execution_mode: "block",
    },
  },
  references: [
    {
      cite: "BASIS canonical trust specification, packages/basis/src/canonical.ts",
      note: "Every agent starts at INITIAL_TRUST_SCORE=0 and must be identified and tier-verified before any action. These constraints are canonical, not regulatory.",
    },
    {
      cite: "RFC 0001 Bot Package Manifest v1",
      note: "Consumer bots distributed via the BASIS bot-package format include a signed manifest that declares the agent's identity and declared tier.",
    },
  ],
};

const FINANCE_US: IndustryProfile = {
  id: "@basis/industry/finance-us",
  version: "0.1.0",
  description:
    "United States financial services profile. Applies to AI agents that may touch trade proposals, client account data, lending decisions, or any action with direct monetary effect. Forces preventive layers to run synchronously for MEDIUM risk and above. Forbids deferred execution of identity, policy, content safety, PII redaction, and tool-call validation.",
  jurisdiction: ["US"],
  minimum_preset: "strict",
  required_layers: [
    "@basis/identity",
    "@basis/tier-check",
    "@basis/policy-match",
    "@basis/rate-limit",
    "@basis/budget",
    "@basis/content-safety-in",
    "@basis/content-safety-out",
    "@basis/jailbreak-detect",
    "@basis/pii-redact",
    "@basis/tool-validate",
    "@basis/human-review",
    "@basis/proof-chain-tip",
    "@basis/audit-log",
    "@basis/telemetry",
  ],
  required_blocking: {
    "@basis/identity": "READ",
    "@basis/tier-check": "READ",
    "@basis/policy-match": "LOW",
    "@basis/rate-limit": "LOW",
    "@basis/budget": "LOW",
    "@basis/content-safety-in": "MEDIUM",
    "@basis/content-safety-out": "MEDIUM",
    "@basis/jailbreak-detect": "MEDIUM",
    "@basis/pii-redact": "MEDIUM",
    "@basis/tool-validate": "LOW",
    "@basis/human-review": "HIGH",
    "@basis/proof-chain-tip": "READ",
  },
  prohibited_deferred: [
    "@basis/identity",
    "@basis/tier-check",
    "@basis/policy-match",
    "@basis/budget",
    "@basis/content-safety-in",
    "@basis/content-safety-out",
    "@basis/jailbreak-detect",
    "@basis/pii-redact",
    "@basis/tool-validate",
    "@basis/proof-chain-tip",
  ],
  action_class_rules: {
    "irreversible-real-world": {
      min_execution_mode: "block",
      required_layers: ["@basis/human-review", "@basis/budget", "@basis/policy-match"],
    },
    "external-recipient": {
      min_execution_mode: "block",
      required_layers: ["@basis/content-safety-out", "@basis/pii-redact"],
    },
    "multi-hop-chain": {
      min_execution_mode: "block",
    },
  },
  references: [
    { cite: "SEC Regulation Best Interest (Reg BI), 17 CFR § 240.15l-1", note: "Broker-dealer recommendations to retail customers require a care obligation that includes diligent consideration of alternatives. Deferred content-safety or policy-match layers cannot produce a record of that consideration before the recommendation is issued." },
    { cite: "FINRA Rule 3110 (Supervision)", note: "Member firms must establish and maintain a supervisory system with written procedures reasonably designed to achieve compliance. Synchronous policy-match evidence contributes to that record." },
    { cite: "FINRA Rule 4511 (General Requirements — Books and Records)", note: "Synchronous proof-chain tip commits per BASIS Gate SPEC § 7 produce tamper-evident records suitable as a complement to standard books-and-records requirements." },
    { cite: "FTC Safeguards Rule, 16 CFR Part 314", note: "PII redaction layers run synchronously to reduce risk of disclosing customer information in agent outputs." },
    { cite: "OCC Bulletin 2011-12 (Model Risk Management)", note: "Model risk management expectations include ongoing validation. Canary sampling and shadow verification layers may run deferred to contribute to that validation record." },
    { cite: "BSA/AML Program Requirements, 31 CFR § 1020.210", note: "Anti-money-laundering program requirements for covered financial institutions necessitate synchronous policy-match evidence on transactions that may constitute reportable activity." },
  ],
};

const HEALTHCARE_HIPAA: IndustryProfile = {
  id: "@basis/industry/healthcare-hipaa",
  version: "0.1.0",
  description:
    "United States healthcare profile for HIPAA-covered entities and business associates. Forces PII and PHI redaction to run synchronously at READ risk level and above, requires human review for any action that may disclose, modify, or create PHI at HIGH risk or above, and forbids deferred execution of any layer that could allow PHI to leave the runtime's trust boundary before evidence is captured.",
  jurisdiction: ["US"],
  minimum_preset: "strict",
  required_layers: [
    "@basis/identity",
    "@basis/tier-check",
    "@basis/policy-match",
    "@basis/rate-limit",
    "@basis/content-safety-in",
    "@basis/content-safety-out",
    "@basis/pii-redact",
    "@basis/tool-validate",
    "@basis/human-review",
    "@basis/proof-chain-tip",
    "@basis/audit-log",
    "@basis/telemetry",
  ],
  required_blocking: {
    "@basis/identity": "READ",
    "@basis/tier-check": "READ",
    "@basis/policy-match": "READ",
    "@basis/rate-limit": "LOW",
    "@basis/content-safety-in": "READ",
    "@basis/content-safety-out": "READ",
    "@basis/pii-redact": "READ",
    "@basis/tool-validate": "LOW",
    "@basis/human-review": "HIGH",
    "@basis/proof-chain-tip": "READ",
  },
  prohibited_deferred: [
    "@basis/identity",
    "@basis/tier-check",
    "@basis/policy-match",
    "@basis/content-safety-in",
    "@basis/content-safety-out",
    "@basis/pii-redact",
    "@basis/tool-validate",
    "@basis/proof-chain-tip",
  ],
  action_class_rules: {
    "irreversible-real-world": {
      min_execution_mode: "block",
      required_layers: ["@basis/human-review", "@basis/pii-redact"],
    },
    "external-recipient": {
      min_execution_mode: "block",
      required_layers: ["@basis/pii-redact", "@basis/content-safety-out"],
    },
    "multi-hop-chain": {
      min_execution_mode: "block",
    },
  },
  references: [
    { cite: "HIPAA Privacy Rule, 45 CFR Part 164 Subpart E", note: "Uses and disclosures of protected health information are subject to minimum-necessary standards. Synchronous PII and PHI redaction at READ level reduces the surface on which minimum-necessary is evaluated." },
    { cite: "HIPAA Security Rule, 45 CFR Part 164 Subpart C", note: "Administrative, physical, and technical safeguards include audit controls at 45 CFR § 164.312(b). The proof-chain tip event is a tamper-evident audit record that complements those controls." },
    { cite: "HIPAA Breach Notification Rule, 45 CFR § 164.400 et seq.", note: "Synchronous content-safety and PII-redaction evidence reduces the incidence of unauthorized acquisitions of PHI that would require breach notification." },
    { cite: "HITECH Act of 2009 (Pub. L. 111-5, Title XIII)", note: "Enforcement provisions increase the consequences of HIPAA violations. Synchronous preventive layers reduce the probability of the violations in the first place." },
    { cite: "21st Century Cures Act, Information Blocking Rule, 45 CFR Part 171", note: "Information blocking prohibitions apply to actors who unreasonably interfere with access to, exchange of, or use of electronic health information. Operators configuring this profile should ensure required-blocking constraints do not produce blocking behavior that would itself constitute an information-blocking violation." },
  ],
};

const LEGAL_PRIVILEGE: IndustryProfile = {
  id: "@basis/industry/legal-privilege",
  version: "0.1.0",
  description:
    "Legal services profile. Applies to AI agents handling attorney-client privileged communications, work product, or equivalent confidential materials. Forces synchronous execution of PII redaction, content safety on outputs, and tool-call validation. Requires human review for any action that may externally disclose privileged content.",
  jurisdiction: ["US", "EU", "UK", "CA"],
  minimum_preset: "strict",
  required_layers: [
    "@basis/identity",
    "@basis/tier-check",
    "@basis/policy-match",
    "@basis/content-safety-in",
    "@basis/content-safety-out",
    "@basis/pii-redact",
    "@basis/tool-validate",
    "@basis/human-review",
    "@basis/proof-chain-tip",
    "@basis/audit-log",
  ],
  required_blocking: {
    "@basis/identity": "READ",
    "@basis/tier-check": "READ",
    "@basis/policy-match": "READ",
    "@basis/content-safety-in": "LOW",
    "@basis/content-safety-out": "READ",
    "@basis/pii-redact": "READ",
    "@basis/tool-validate": "READ",
    "@basis/human-review": "HIGH",
    "@basis/proof-chain-tip": "READ",
  },
  prohibited_deferred: [
    "@basis/identity",
    "@basis/tier-check",
    "@basis/policy-match",
    "@basis/content-safety-out",
    "@basis/pii-redact",
    "@basis/tool-validate",
    "@basis/proof-chain-tip",
  ],
  action_class_rules: {
    "irreversible-real-world": {
      min_execution_mode: "block",
      required_layers: ["@basis/human-review"],
    },
    "external-recipient": {
      min_execution_mode: "block",
      required_layers: ["@basis/content-safety-out", "@basis/pii-redact", "@basis/human-review"],
    },
    "multi-hop-chain": {
      min_execution_mode: "block",
    },
  },
  references: [
    { cite: "ABA Model Rule of Professional Conduct 1.6 (Confidentiality)", note: "Lawyers must not reveal information relating to representation without informed consent. Synchronous content-safety and PII redaction on outputs reduce inadvertent disclosure." },
    { cite: "ABA Model Rule of Professional Conduct 5.3 (Responsibilities Regarding Nonlawyer Assistance)", note: "Lawyers retain responsibility for the conduct of nonlawyer assistants, which in recent guidance includes AI tools. The human-review layer at HIGH and above provides a supervisory checkpoint aligned with this obligation." },
    { cite: "ABA Formal Opinion 512 (Generative AI Tools), July 2024", note: "The opinion addresses lawyers' obligations under the Model Rules when using generative AI tools, including competence, confidentiality, communication, and supervision. This profile's required-blocking structure supports documented compliance with those obligations." },
    { cite: "EU General Data Protection Regulation (GDPR), Articles 5 and 32", note: "Data protection by design and appropriate technical measures are required for processing personal data. Synchronous PII redaction operates as a technical measure within the runtime trust boundary." },
    { cite: "UK Solicitors Regulation Authority Standards and Regulations, Principle 7", note: "Acting in the best interests of each client includes protecting client confidentiality. Synchronous preventive layers produce records consistent with this duty." },
    { cite: "Federal Rule of Evidence 502 (Attorney-Client Privilege and Work Product)", note: "FRE 502 governs waiver of privilege in federal proceedings. Synchronous content-safety and PII redaction on outputs reduce the probability of inadvertent disclosure that could be treated as waiver." },
  ],
};

const BUILTIN: Record<BuiltinProfileId, IndustryProfile> = {
  "@basis/industry/consumer-default": CONSUMER_DEFAULT,
  "@basis/industry/finance-us": FINANCE_US,
  "@basis/industry/healthcare-hipaa": HEALTHCARE_HIPAA,
  "@basis/industry/legal-privilege": LEGAL_PRIVILEGE,
};

// ---------------------------------------------------------------------------
// Loader — no filesystem I/O
// ---------------------------------------------------------------------------

export async function loadBuiltinProfile(
  id: BuiltinProfileId,
): Promise<IndustryProfile> {
  const profile = BUILTIN[id];
  if (!profile) {
    throw new Error(`not a built-in profile identifier: ${id}`);
  }
  return JSON.parse(JSON.stringify(profile)) as IndustryProfile;
}

export async function loadAllBuiltinProfiles(): Promise<IndustryProfile[]> {
  return Promise.all(BUILTIN_PROFILE_IDS.map((id) => loadBuiltinProfile(id)));
}

// ---------------------------------------------------------------------------
// Back-compat: validateProfile for callers validating external YAML.
// ---------------------------------------------------------------------------

const RISK_LEVELS: ReadonlySet<RiskLevel> = new Set([
  "READ",
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
  "LIFE_CRITICAL",
]);
const EXECUTION_MODES: ReadonlySet<ExecutionMode> = new Set([
  "block",
  "inline",
  "deferred",
]);
const PRESETS: ReadonlySet<Exclude<Preset, "custom">> = new Set([
  "lite",
  "standard",
  "strict",
  "full",
]);
const ACTION_CLASSES: ReadonlySet<ActionClass> = new Set([
  "read-only",
  "internal-effect",
  "external-recipient",
  "irreversible-real-world",
  "multi-hop-chain",
]);

export function validateProfile(
  doc: unknown,
  expectedId?: string,
): IndustryProfile {
  if (!isRecord(doc)) throw new Error("profile document must be an object");
  const id = requireString(doc, "id");
  if (expectedId && id !== expectedId) {
    throw new Error(`profile id mismatch: expected ${expectedId}, got ${id}`);
  }
  const version = requireString(doc, "version");
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`profile version must be semver-formatted: ${version}`);
  }
  const description = requireString(doc, "description");
  const jurisdiction = requireStringArray(doc, "jurisdiction");
  if (jurisdiction.length === 0) {
    throw new Error("profile must declare at least one jurisdiction");
  }
  const minimumPresetRaw = requireString(doc, "minimum_preset");
  if (!PRESETS.has(minimumPresetRaw as Exclude<Preset, "custom">)) {
    throw new Error(`invalid minimum_preset: ${minimumPresetRaw}`);
  }
  const minimum_preset = minimumPresetRaw as Exclude<Preset, "custom">;
  const required_layers = requireStringArray(doc, "required_layers");
  if (required_layers.length === 0) {
    throw new Error("profile must declare at least one required layer");
  }
  const required_blocking = validateRequiredBlocking(doc["required_blocking"]);
  const prohibited_deferred = requireStringArray(doc, "prohibited_deferred");
  for (const layerId of prohibited_deferred) {
    if (!required_layers.includes(layerId)) {
      throw new Error(
        `prohibited_deferred references layer not in required_layers: ${layerId}`,
      );
    }
  }
  const action_class_rules = validateActionClassRules(doc["action_class_rules"]);
  const references = validateReferences(doc["references"]);
  return {
    id,
    version,
    description,
    jurisdiction,
    minimum_preset,
    required_layers,
    required_blocking,
    prohibited_deferred,
    action_class_rules,
    references,
  };
}

function validateRequiredBlocking(v: unknown): Partial<Record<string, RiskLevel>> {
  if (v === undefined || v === null) return {};
  if (!isRecord(v)) throw new Error("required_blocking must be an object");
  const out: Partial<Record<string, RiskLevel>> = {};
  for (const [layerId, risk] of Object.entries(v)) {
    if (typeof risk !== "string" || !RISK_LEVELS.has(risk as RiskLevel)) {
      throw new Error(
        `required_blocking[${layerId}] must be a canonical risk level, got ${String(risk)}`,
      );
    }
    out[layerId] = risk as RiskLevel;
  }
  return out;
}

function validateActionClassRules(v: unknown): IndustryProfile["action_class_rules"] {
  if (v === undefined || v === null) return undefined;
  if (!isRecord(v)) throw new Error("action_class_rules must be an object");
  const out: Record<string, { min_execution_mode?: ExecutionMode; required_layers?: string[] }> = {};
  for (const [key, rule] of Object.entries(v)) {
    if (!ACTION_CLASSES.has(key as ActionClass)) {
      throw new Error(`unknown action class: ${key}`);
    }
    if (!isRecord(rule)) {
      throw new Error(`action_class_rules[${key}] must be an object`);
    }
    const normalized: { min_execution_mode?: ExecutionMode; required_layers?: string[] } = {};
    if (rule["min_execution_mode"] !== undefined) {
      const m = rule["min_execution_mode"];
      if (typeof m !== "string" || !EXECUTION_MODES.has(m as ExecutionMode)) {
        throw new Error(
          `action_class_rules[${key}].min_execution_mode must be an execution mode, got ${String(m)}`,
        );
      }
      normalized.min_execution_mode = m as ExecutionMode;
    }
    if (rule["required_layers"] !== undefined) {
      normalized.required_layers = requireStringArrayValue(
        rule["required_layers"],
        `action_class_rules[${key}].required_layers`,
      );
    }
    out[key] = normalized;
  }
  return out as IndustryProfile["action_class_rules"];
}

function validateReferences(v: unknown): IndustryProfileReference[] {
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error("profile must declare at least one reference");
  }
  return v.map((entry, idx) => {
    if (!isRecord(entry)) throw new Error(`references[${idx}] must be an object`);
    return {
      cite: requireString(entry, "cite"),
      note: requireString(entry, "note"),
    };
  });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function requireString(doc: Record<string, unknown>, key: string): string {
  const v = doc[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return v;
}
function requireStringArray(doc: Record<string, unknown>, key: string): string[] {
  return requireStringArrayValue(doc[key], key);
}
function requireStringArrayValue(v: unknown, label: string): string[] {
  if (!Array.isArray(v)) throw new Error(`${label} must be an array of strings`);
  for (const [i, entry] of v.entries()) {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error(`${label}[${i}] must be a non-empty string`);
    }
  }
  return v as string[];
}

export type { IndustryProfile, IndustryProfileReference } from "@vorionsys/basis-gate-spec";
