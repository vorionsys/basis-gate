// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Vorion LLC
//
// Reference-layer barrel. Import individual layer factories here or from
// their respective files. The factories return `GateLayer` instances ready
// to be passed to the runtime's registry.

export { createIdentityLayer, type IdentityLayerOptions } from "./identity.js";
export { createTierCheckLayer } from "./tier-check.js";
export { createRateLimitLayer, type RateLimitLayerOptions } from "./rate-limit.js";
export { createProofChainTipLayer } from "./proof-chain-tip.js";
export {
  createAuditLogLayer,
  type AuditLogLayerOptions,
  type AuditLogRecord,
} from "./audit-log.js";
