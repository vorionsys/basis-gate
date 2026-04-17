# BASIS Gate Runtime — Signing Keys

The runtime produces signed proof-chain events. Every event carries an Ed25519 signature over a SHA-256 hash of its content. If the signing key changes between process restarts, the chain becomes unverifiable across that boundary. If the key is exposed, past and future events become forgeable.

Do not generate signing keys inline. Do not call `randomBytes(32)` in a production code path. Use `loadSigningKeySeed()`.

## What the helper does

```typescript
import { GateRuntime, loadSigningKeySeed } from "@vorionsys/basis-gate-runtime";

const { seed } = loadSigningKeySeed();
const runtime = await GateRuntime.create({
  posture: { preset: "standard" },
  signingKeySeed: seed,
  // ...
});
```

`loadSigningKeySeed()` resolves the seed in this order:

1. **Environment variable** — reads `VORION_GATE_SIGNING_KEY_B64` and decodes it as a 32-byte base64 value. This is the production path.
2. **Persistent dev seed file** — if no env var, and `NODE_ENV` is not `production`, looks for a file at `.vorion-gate-dev-key.seed` in the current working directory. If present, reads it. If absent, generates a new one, writes it with `0o600` permissions, and prints a conspicuous warning to stderr.
3. **Hard failure** — if neither source yields a seed and `NODE_ENV === "production"`, throws an error directing the caller to set the env var.

## Generating a production key

A one-liner that produces a base64-encoded 32-byte seed:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then set it in your deployment environment. Examples:

```bash
# Vercel
vercel env add VORION_GATE_SIGNING_KEY_B64

# Fly.io
fly secrets set VORION_GATE_SIGNING_KEY_B64=<base64>

# Docker
docker run -e VORION_GATE_SIGNING_KEY_B64=<base64> ...
```

## Local development

On first run in a non-production environment with no env var set, `loadSigningKeySeed()`:

- Generates a 32-byte seed.
- Writes it to `.vorion-gate-dev-key.seed` in the current working directory with mode `0o600`.
- Reuses that file on every subsequent run, so the local proof chain is continuous across restarts.
- Emits a loud warning to stderr with instructions.
- Refuses to write the seed if it detects a git repository root without a `.gitignore`. Add `.gitignore` first.

The dev seed file is not for production. It is local-development continuity only.

## Safety checks

The helper actively tries to prevent the most common mistakes:

- **Bare repo without `.gitignore`** — refuses to write the seed file, forces the developer to add `.gitignore` before retry.
- **`.gitignore` does not mention the seed filename** — writes the seed but logs a warning pointing at the gitignore path.
- **Seed length wrong** — any seed that does not decode to exactly 32 bytes throws an error identifying the source.
- **Production without env var** — hard throws with a copy-pasteable generation command.

## Rotation

To rotate a key:

1. Generate a new base64 seed.
2. Update the env var in production.
3. Restart the process.
4. The posture-load event emitted at runtime start will reference the new key id.

The old key cannot sign anything after rotation. Events signed by the old key remain verifiable using its public key; consumers that index events by key id should pin public keys at first observation, not assume a stable key per runtime.

In local development, deleting `.vorion-gate-dev-key.seed` and restarting rotates to a fresh key. Any previous chain tied to the old key is no longer extendable.

## Why no KMS or cloud key provider in the reference runtime

The reference runtime intentionally keeps key management to `env` + `file`. Production operators who need a hardware-backed or cloud-KMS key can implement a custom loader:

```typescript
import { GateRuntime } from "@vorionsys/basis-gate-runtime";
import { myKmsClient } from "./my-kms";

const runtime = await GateRuntime.create({
  posture: { preset: "standard" },
  signingKeySeed: await myKmsClient.getSeed("gate/runtime/v1"),
  // ...
});
```

The runtime does not care where the seed comes from as long as it arrives as 32 bytes. A KMS-integrated helper is out of scope for the reference package; it belongs in a companion package that depends on the KMS provider's SDK.

## What not to do

- Do not generate keys with `randomBytes(32)` in the middle of your application code. The key will rotate every restart and no chain will be verifiable across that boundary.
- Do not commit the dev seed file. It is your private key. Add `.vorion-gate-dev-key.seed` to `.gitignore`.
- Do not share signing keys across deployments. Each independent chain root deserves its own key. If two deployments share a key, an outage on one produces events that look like they came from the other.
- Do not rotate a production key without an out-of-band notification to chain consumers. Verifiers that pinned the old public key will see signature failures if they do not refresh.

## Observability

Every runtime emits a `posture-load` proof-chain event at startup that includes `signedBy` (the runtime key id). Downstream consumers should surface this value in their dashboards so rotation and key-confusion incidents are visible.

A recommended pattern: when the `signedBy` key id changes unexpectedly, page the operator.
