// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Signing-key loader.
//
// The gate runtime's signing key is the root of trust for every tip commit
// and every posture-load event it produces. If the key rotates between
// process restarts, the proof chain becomes unverifiable across that
// boundary. If the key is exposed, every past and future event becomes
// forgeable.
//
// This module centralizes key loading so that callers never construct
// keys inline. In practice that means: never call `randomBytes(32)` in a
// production code path. Use `loadSigningKeySeed()`.
//
// Resolution order:
//   1. If VORION_GATE_SIGNING_KEY_B64 is set in the environment, its
//      base64-decoded bytes become the seed.
//   2. Otherwise, in a non-production environment, look for a persisted
//      dev seed file at `.vorion-gate-dev-key.seed` (path configurable).
//      If present, read it. If absent, generate one, persist it, and
//      emit a loud console warning.
//   3. In a production environment with no env var, throw.
//
// The persisted dev seed file MUST be gitignored. The helper refuses to
// create it if the directory looks like a repository root with no
// `.gitignore`.

import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export interface KeyLoadOptions {
  /**
   * Environment-variable name holding a base64-encoded 32-byte seed.
   * Defaults to VORION_GATE_SIGNING_KEY_B64.
   */
  envVar?: string;
  /**
   * Path to the persisted dev-seed file. Relative paths resolve against
   * the current working directory. Defaults to `.vorion-gate-dev-key.seed`.
   * Set to `null` to disable the dev-fallback entirely.
   */
  devSeedPath?: string | null;
  /**
   * When true, treat any missing env var as a hard error even in dev.
   * Defaults to false.
   */
  strict?: boolean;
  /**
   * When true, suppress the dev-mode warning. Useful for tests.
   */
  quiet?: boolean;
}

export interface KeyLoadResult {
  seed: Uint8Array;
  source: "env" | "dev-seed-file" | "dev-seed-file-generated";
  envVar: string;
  devSeedPath: string | null;
}

const DEFAULT_ENV_VAR = "VORION_GATE_SIGNING_KEY_B64";
const DEFAULT_DEV_SEED_PATH = ".vorion-gate-dev-key.seed";

/**
 * Load a signing-key seed from the environment or a persistent dev file.
 * Throws in production when no env var is configured. Writes a dev-only
 * seed to disk with a warning in non-production environments.
 */
export function loadSigningKeySeed(opts: KeyLoadOptions = {}): KeyLoadResult {
  const envVar = opts.envVar ?? DEFAULT_ENV_VAR;
  const isProd = process.env.NODE_ENV === "production";

  const rawEnv = process.env[envVar];
  if (rawEnv && rawEnv.length > 0) {
    const seed = decodeSeed(rawEnv, envVar);
    return {
      seed,
      source: "env",
      envVar,
      devSeedPath: opts.devSeedPath ?? null,
    };
  }

  if (opts.strict === true) {
    throw new Error(
      `${envVar} is required (strict mode). Base64-encode a 32-byte seed and set it in the environment.`,
    );
  }

  if (isProd) {
    throw new Error(
      `${envVar} is required in production. Generate a key (e.g. \`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"\`) and set it in your deployment environment before starting the runtime.`,
    );
  }

  if (opts.devSeedPath === null) {
    throw new Error(
      `${envVar} is not set and the dev fallback is disabled. Provide the env var or enable devSeedPath.`,
    );
  }

  const devPath = resolve(opts.devSeedPath ?? DEFAULT_DEV_SEED_PATH);
  if (existsSync(devPath)) {
    const buf = readFileSync(devPath);
    if (buf.length !== 32) {
      throw new Error(
        `${devPath} has unexpected size (${buf.length} bytes; expected 32). Delete the file to regenerate.`,
      );
    }
    return {
      seed: new Uint8Array(buf),
      source: "dev-seed-file",
      envVar,
      devSeedPath: devPath,
    };
  }

  // Generating a dev key. Before writing, verify the directory is not a
  // git repository root with no .gitignore — otherwise we would create a
  // private key in a repo that the user might commit by accident.
  assertDevDirectoryIsSafe(devPath);

  const seed = randomBytes(32);
  writeFileSync(devPath, seed, { mode: 0o600 });

  if (!opts.quiet) {
    process.stderr.write(
      [
        "",
        "========================================================================",
        "BASIS Gate runtime: generated a local development signing key.",
        `  Seed file: ${devPath}`,
        "  - This file is for local development only.",
        `  - Add it to .gitignore if you have not already (never commit it).`,
        "  - In production, set the " + envVar + " environment variable instead.",
        "  - To rotate, delete the file and restart.",
        "========================================================================",
        "",
      ].join("\n"),
    );
  }

  return {
    seed: new Uint8Array(seed),
    source: "dev-seed-file-generated",
    envVar,
    devSeedPath: devPath,
  };
}

/**
 * Decode a base64-encoded seed string to 32 bytes. Accepts standard
 * base64 and URL-safe variants; rejects anything that does not decode
 * to exactly 32 bytes.
 */
export function decodeSeed(input: string, label: string): Uint8Array {
  const cleaned = input.trim().replace(/-/g, "+").replace(/_/g, "/");
  let buf: Buffer;
  try {
    buf = Buffer.from(cleaned, "base64");
  } catch (e) {
    throw new Error(`${label} is not valid base64: ${(e as Error).message}`);
  }
  if (buf.length !== 32) {
    throw new Error(
      `${label} must decode to exactly 32 bytes; got ${buf.length}`,
    );
  }
  return new Uint8Array(buf);
}

/**
 * Encode a 32-byte seed to a base64 string suitable for the environment
 * variable. Useful for key-generation scripts.
 */
export function encodeSeed(seed: Uint8Array): string {
  if (seed.length !== 32) {
    throw new Error(`seed must be 32 bytes; got ${seed.length}`);
  }
  return Buffer.from(seed).toString("base64");
}

/**
 * Refuses to write a dev seed into a directory that is a git repository
 * root without a .gitignore file (the most common way to accidentally
 * commit a private key). The check walks upward from the seed path.
 */
function assertDevDirectoryIsSafe(seedPath: string): void {
  const dir = dirname(seedPath);
  let cursor = dir;
  while (true) {
    const gitDir = join(cursor, ".git");
    if (existsSync(gitDir) && tryStat(gitDir)?.isDirectory()) {
      const gitignorePath = join(cursor, ".gitignore");
      if (!existsSync(gitignorePath)) {
        throw new Error(
          `refusing to write dev seed at ${seedPath} — repo root at ${cursor} has no .gitignore. Add one that excludes the seed file before retrying.`,
        );
      }
      const gi = readFileSync(gitignorePath, "utf8");
      if (!gi.includes(".vorion-gate-dev-key.seed")) {
        // Not a hard error — but warn explicitly.
        process.stderr.write(
          `[basis-gate-runtime] WARNING: ${gitignorePath} does not mention .vorion-gate-dev-key.seed. Add it before committing.\n`,
        );
      }
      return;
    }
    const parent = dirname(cursor);
    if (parent === cursor) return; // reached filesystem root
    cursor = parent;
  }
}

function tryStat(p: string): ReturnType<typeof statSync> | null {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}
