// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Canonical JSON serialization.
//
// Produces a deterministic, whitespace-free, key-sorted UTF-8 string
// representation of a JSON-compatible value. This serializer is used to
// produce the byte sequences that are hashed and signed in the proof chain.
//
// Rules:
// - Object keys are sorted lexicographically (UTF-16 code unit order).
// - No whitespace between tokens.
// - Strings are JSON-escaped per RFC 8259.
// - Numbers are serialized as JavaScript's default toString, except:
//   non-finite numbers throw (JSON does not represent them).
// - undefined values are not representable and throw.
// - Arrays preserve order.
//
// This implementation does not claim bit-for-bit compatibility with RFC
// 8785 (JCS). It is a pragmatic canonical serializer sufficient for the
// proof-chain events defined by BASIS Gate v1. Future spec revisions may
// align with an external standard.

export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) {
      throw new Error("canonicalJson: non-finite number is not representable");
    }
    return String(v);
  }
  if (typeof v === "bigint") {
    throw new Error("canonicalJson: bigint is not representable");
  }
  if (typeof v === "string") return escapeString(v);
  if (Array.isArray(v)) {
    return "[" + v.map(stringify).join(",") + "]";
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const val = obj[k];
      if (val === undefined) continue;
      parts.push(escapeString(k) + ":" + stringify(val));
    }
    return "{" + parts.join(",") + "}";
  }
  if (v === undefined) {
    throw new Error("canonicalJson: undefined is not representable");
  }
  throw new Error(`canonicalJson: unsupported type ${typeof v}`);
}

function escapeString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    switch (c) {
      case 0x22: out += '\\"'; break;
      case 0x5c: out += "\\\\"; break;
      case 0x08: out += "\\b"; break;
      case 0x0c: out += "\\f"; break;
      case 0x0a: out += "\\n"; break;
      case 0x0d: out += "\\r"; break;
      case 0x09: out += "\\t"; break;
      default:
        if (c < 0x20) {
          out += "\\u" + c.toString(16).padStart(4, "0");
        } else {
          out += s[i];
        }
    }
  }
  out += '"';
  return out;
}

/**
 * Convenience: returns the UTF-8 byte representation of the canonical form.
 */
export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}
