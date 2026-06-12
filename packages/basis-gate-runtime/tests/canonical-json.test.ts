// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Canonical JSON serializer tests. The serializer produces the byte
// sequences that are hashed and signed in the proof chain, so its
// determinism rules are load-bearing for verification.

import { describe, expect, it } from "vitest";
import { canonicalJson, canonicalJsonBytes } from "../src/canonical-json.js";

describe("canonicalJson", () => {
  it("sorts object keys lexicographically with no whitespace", () => {
    expect(canonicalJson({ b: 1, a: 2, c: { z: 1, y: 2 } })).toBe(
      '{"a":2,"b":1,"c":{"y":2,"z":1}}',
    );
  });

  it("preserves array order", () => {
    expect(canonicalJson([3, 1, 2])).toBe("[3,1,2]");
  });

  it("serializes primitives per JSON rules", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(false)).toBe("false");
    expect(canonicalJson(42)).toBe("42");
    expect(canonicalJson(-0.5)).toBe("-0.5");
    expect(canonicalJson("plain")).toBe('"plain"');
  });

  it("escapes control characters and quotes per RFC 8259", () => {
    expect(canonicalJson('a"b\\c\nd\te')).toBe('"a\\"b\\\\c\\nd\\te"');
    expect(canonicalJson("\u0001")).toBe(String.raw`"\u0001"`);
  });

  it("skips undefined object values but throws on top-level undefined", () => {
    expect(canonicalJson({ a: 1, gone: undefined })).toBe('{"a":1}');
    expect(() => canonicalJson(undefined)).toThrow("not representable");
  });

  it("throws on non-finite numbers and bigint", () => {
    expect(() => canonicalJson(Infinity)).toThrow("non-finite");
    expect(() => canonicalJson(NaN)).toThrow("non-finite");
    expect(() => canonicalJson(10n)).toThrow("bigint");
  });

  it("identical structures with different key insertion order serialize identically", () => {
    const a = JSON.parse('{"x":1,"y":{"k":1,"j":2}}');
    const b = JSON.parse('{"y":{"j":2,"k":1},"x":1}');
    expect(canonicalJson(a)).toBe(canonicalJson(b));
  });
});

describe("canonicalJsonBytes", () => {
  it("returns the UTF-8 encoding of the canonical string", () => {
    const value = { k: "é" };
    expect(canonicalJsonBytes(value)).toEqual(
      new TextEncoder().encode(canonicalJson(value)),
    );
  });
});
