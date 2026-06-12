// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Signing-key loader tests. The loader is the root of trust for every
// event the runtime signs; these tests pin its resolution order and its
// refusal behaviors.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  decodeSeed,
  encodeSeed,
  loadSigningKeySeed,
} from "../src/key-management.js";

const ENV_VAR = "VORION_GATE_SIGNING_KEY_B64";

let tmp: string;
let savedEnv: string | undefined;
let savedNodeEnv: string | undefined;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "basis-gate-key-test-"));
  savedEnv = process.env[ENV_VAR];
  savedNodeEnv = process.env.NODE_ENV;
  delete process.env[ENV_VAR];
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  if (savedEnv === undefined) delete process.env[ENV_VAR];
  else process.env[ENV_VAR] = savedEnv;
  if (savedNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = savedNodeEnv;
});

describe("decodeSeed / encodeSeed", () => {
  it("round-trips a 32-byte seed through base64", () => {
    const seed = new Uint8Array(randomBytes(32));
    expect(decodeSeed(encodeSeed(seed), "test")).toEqual(seed);
  });

  it("accepts URL-safe base64", () => {
    const seed = new Uint8Array(randomBytes(32));
    const urlSafe = encodeSeed(seed).replace(/\+/g, "-").replace(/\//g, "_");
    expect(decodeSeed(urlSafe, "test")).toEqual(seed);
  });

  it("rejects input that does not decode to exactly 32 bytes", () => {
    expect(() =>
      decodeSeed(Buffer.from(randomBytes(16)).toString("base64"), "test"),
    ).toThrow("exactly 32 bytes");
  });

  it("encodeSeed rejects non-32-byte seeds", () => {
    expect(() => encodeSeed(new Uint8Array(16))).toThrow("32 bytes");
  });
});

describe("loadSigningKeySeed", () => {
  it("prefers the environment variable when set", () => {
    const seed = new Uint8Array(randomBytes(32));
    process.env[ENV_VAR] = encodeSeed(seed);
    const result = loadSigningKeySeed({ quiet: true });
    expect(result.source).toBe("env");
    expect(result.seed).toEqual(seed);
  });

  it("throws in strict mode when the env var is missing", () => {
    expect(() => loadSigningKeySeed({ strict: true, quiet: true })).toThrow(
      "strict mode",
    );
  });

  it("throws in production when the env var is missing", () => {
    process.env.NODE_ENV = "production";
    expect(() => loadSigningKeySeed({ quiet: true })).toThrow(
      "required in production",
    );
  });

  it("throws when the dev fallback is disabled and no env var is set", () => {
    expect(() =>
      loadSigningKeySeed({ devSeedPath: null, quiet: true }),
    ).toThrow("dev fallback is disabled");
  });

  it("generates, persists, and reuses a dev seed file", () => {
    const devSeedPath = join(tmp, "dev-key.seed");

    const first = loadSigningKeySeed({ devSeedPath, quiet: true });
    expect(first.source).toBe("dev-seed-file-generated");
    expect(first.seed).toHaveLength(32);
    expect(readFileSync(devSeedPath)).toHaveLength(32);

    const second = loadSigningKeySeed({ devSeedPath, quiet: true });
    expect(second.source).toBe("dev-seed-file");
    expect(second.seed).toEqual(first.seed);
  });

  it("rejects a persisted dev seed of the wrong size", () => {
    const devSeedPath = join(tmp, "bad.seed");
    writeFileSync(devSeedPath, randomBytes(16));
    expect(() => loadSigningKeySeed({ devSeedPath, quiet: true })).toThrow(
      "unexpected size",
    );
  });
});
