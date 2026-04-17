# BASIS Gate Industry Profiles

Named configuration fragments that encode regulatory or sector-specific constraints for BASIS Gate pipelines.

## What this is

A BASIS Gate posture starts from a preset (`lite`, `standard`, `strict`, `full`) and may apply an industry profile on top. A profile tells the runtime which layers must run, which layers must run synchronously, and which must never be deferred, for the sector and jurisdiction the operator is working in.

## Profiles in this package

| Profile                         | Sector              | Jurisdiction | Status       |
|---------------------------------|---------------------|--------------|--------------|
| `consumer-default`              | Consumer            | Any          | v1 draft     |
| `finance-us`                    | Financial services  | United States| v1 draft     |
| `healthcare-hipaa`              | Healthcare          | United States| v1 draft     |
| `legal-privilege`               | Legal services      | US / EU / UK | v1 draft     |

Profiles live as YAML documents in [`profiles/`](./profiles/). The TypeScript loader in [`src/index.ts`](./src/index.ts) validates and returns them as typed `IndustryProfile` objects per the `@vorionsys/basis-gate-spec` specification.

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

The runtime loads the profile before applying any operator-supplied `layers.add`, `layers.remove`, or `layers.override`. Operator configuration can only add to or extend the profile — never weaken it.

## What a profile is not

A profile is not a legal compliance certification. Publishing a profile claims that the listed layers and execution constraints reflect a good-faith reading of the cited regulations as of the profile's version date. Operators remain responsible for their regulatory posture and should consult qualified counsel.

## Publishing your own profile

The `@basis/industry/*` namespace is reserved for profiles published by Vorion LLC. Other parties publishing profiles should use a namespace they own (for example, `@acme/industry/fintech-eu-v2`). The profile document format is specified in `@vorionsys/basis-gate-spec` § 8.

## License

Apache License, Version 2.0. See [`LICENSE`](./LICENSE).

## References

- [`@vorionsys/basis-gate-spec`](../basis-gate-spec) — the underlying specification.
- [`@vorionsys/basis`](../basis) — canonical BASIS trust parameters referenced by every profile.
