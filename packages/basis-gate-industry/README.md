# BASIS Gate Industry Profiles

Named configuration fragments that encode regulatory or sector-specific constraints for BASIS Gate pipelines.

## What this is

A BASIS Gate posture starts from a preset (`lite`, `standard`, `strict`, `full`) and may apply an industry profile on top. A profile tells the runtime which layers must run, which layers must run synchronously, and which must never be deferred, for the sector and jurisdiction the operator is working in.

## Profiles in this package

| Profile                         | Sector              | Jurisdiction | Document version |
|---------------------------------|---------------------|--------------|------------------|
| `consumer-default`              | Consumer            | Any          | `0.1.0` draft    |
| `finance-us`                    | Financial services  | United States| `0.1.0` draft    |
| `healthcare-hipaa`              | Healthcare          | United States| `0.1.0` draft    |
| `legal-privilege`               | Legal services      | US / EU / UK | `0.1.0` draft    |

Human-readable YAML for the same four profiles lives in [`profiles/`](./profiles/). The loader in [`src/index.ts`](./src/index.ts) returns copies of TypeScript constants embedded in that file. It does not parse the YAML at runtime. `validateProfile` checks an already-parsed object against the `@vorionsys/basis-gate-spec` profile shape.

## How operators use a profile

```yaml
# cognigate.yaml
preset: strict
industry: "@basis/industry/finance-us"

layers:
  add:
    - id: "@acme/internal-trade-policy"
      execution: block
```

The runtime resolver loads a built-in profile before applying operator `layers.add`, `layers.remove`, or `layers.override`. Removing a layer listed in that profile's `required_layers`, or setting an execution mode below `required_blocking`, throws. Other layers can be removed. The reference runtime still skips a required layer at execution time when that layer is absent from the registry.

## What a profile is not

A profile is not a legal compliance certification. Publishing a profile claims that the listed layers and execution constraints reflect a good-faith reading of the cited regulations as of the profile's version date. Operators remain responsible for their regulatory posture and should consult qualified counsel.

## Publishing your own profile

The `@basis/industry/*` namespace is reserved for profiles published by Vorion LLC. Other parties publishing profiles should use a namespace they own (for example, `@acme/industry/fintech-eu-v2`). The profile document format is specified in `@vorionsys/basis-gate-spec` § 8. `GateRuntime.create` accepts only the four built-in ids; any other `posture.industry` throws.

## License

Apache License, Version 2.0. See [`LICENSE`](./LICENSE).

## References

- [`@vorionsys/basis-gate-spec`](../basis-gate-spec) — the underlying specification.
- [`@vorionsys/basis-spec`](https://github.com/vorionsys/basis-spec) — canonical BASIS trust parameters. The file `packages/basis/src/canonical.ts` is in that repository. This repo does not contain `packages/basis`.
