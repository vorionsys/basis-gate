// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Smoke tests for the spec package. The package is predominantly
// type-level; these tests pin the runtime constants and that the module
// loads cleanly as ESM.

import { describe, expect, it } from "vitest";
import * as spec from "../src/index.js";

describe("spec package surface", () => {
  it("exports the spec identity constants", () => {
    expect(spec.SPEC_NAME).toBe("BASIS Gate v1");
    expect(spec.SPEC_VERSION).toMatch(/^1\.0/);
  });

  it("loads as a module without side effects", () => {
    expect(typeof spec).toBe("object");
  });
});
