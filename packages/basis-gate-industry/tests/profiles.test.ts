// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Industry-profile loader tests: every built-in profile loads, validates,
// and matches its declared identifier.

import { describe, expect, it } from "vitest";
import {
  BUILTIN_PROFILE_IDS,
  loadAllBuiltinProfiles,
  loadBuiltinProfile,
  validateProfile,
} from "../src/index.js";

describe("built-in profiles", () => {
  it("declares the four shipped profiles", () => {
    expect(BUILTIN_PROFILE_IDS).toHaveLength(4);
    expect(BUILTIN_PROFILE_IDS).toContain("@basis/industry/consumer-default");
    expect(BUILTIN_PROFILE_IDS).toContain("@basis/industry/finance-us");
    expect(BUILTIN_PROFILE_IDS).toContain("@basis/industry/healthcare-hipaa");
    expect(BUILTIN_PROFILE_IDS).toContain("@basis/industry/legal-privilege");
  });

  it("loads every built-in profile with a matching id", async () => {
    for (const id of BUILTIN_PROFILE_IDS) {
      const profile = await loadBuiltinProfile(id);
      expect(profile.id).toBe(id);
    }
  });

  it("loadAllBuiltinProfiles returns all profiles", async () => {
    const all = await loadAllBuiltinProfiles();
    expect(all).toHaveLength(BUILTIN_PROFILE_IDS.length);
  });

  it("every built-in profile passes validateProfile against its own id", async () => {
    for (const id of BUILTIN_PROFILE_IDS) {
      const profile = await loadBuiltinProfile(id);
      expect(() => validateProfile(profile, id)).not.toThrow();
    }
  });

  it("validateProfile rejects a non-object document", () => {
    expect(() => validateProfile("not-a-profile")).toThrow("object");
  });
});
