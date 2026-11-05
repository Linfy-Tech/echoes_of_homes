# M0 Railway spike report

## Test scope

- Scratch project: `fabulous-compassion`, environment `production`
- Project ID: `440c4dad-deef-45ec-bcb3-f7a84cc5c216`
- Environment ID: `daf9b28b-733a-46a6-97c5-4310d1eb25e5`
- Railway CLI: `5.71.0`
- Probe dependency: `pg` `8.23.1`
- Resources created only for this spike: managed Postgres `cbbffbc6-9499-4044-86d5-bac68f155f26`; probe service `railway-m0-probe` (`6eef80be-8281-4af6-9278-e816a6af4961`)

The project and services were scratch infrastructure, not future staging or
production infrastructure. The spike did not modify `apps/`, `packages/`, or
`workers/`, and did not change ADR-001 or ADR-002.

## Evidence

### EU-West latency

**Status: Still-open — needs a project/plan explicitly in eu-west.**

Before measuring latency, the probe service was configured for Railway's
Amsterdam region identifier, `europe-west4-drams3a`. Railway rejected the
deployment with:

```text
Your plan can only deploy to a single region. Please upgrade to Pro to deploy to multiple regions.
```

The probe was restored to `sfo` for the private-network test. No SFO number is
reported as the answer to the Amsterdam latency question, and a real Cape Town
mobile-network measurement was not possible from this environment. Evidence
needed to close this item is an HTTP/TCP measurement to a probe deployed in an
explicitly eu-west project/plan, repeated from a Cape Town mobile network (for
example Vodacom or MTN), with the client location and timestamps recorded.

### Postgres private networking

**Status: Resolved for the tested scratch scope.**

The probe received its `DATABASE_URL` from the Postgres service reference. Its
successful runtime log recorded:

```text
private_host=postgres.railway.internal
private_host_suffix=true
tcp=connected
postgres=connected
database_name=railway
database_user=postgres
railway_region=sfo
```

The probe first resolved the private hostname and opened a TCP connection, then
executed a PostgreSQL query over that same private URL. This demonstrates
service-to-database private-network reachability in the tested
`fabulous-compassion/production` environment; it does not claim cross-region or
production behavior.

### Railway config plan

**Status: Resolved for the tested CLI/IaC versions.**

`railway config init --variables unmanaged` generated the throwaway
`.railway/railway.ts`. After installing the Railway IaC SDK locally in this
spike, this read-only command completed with exit code 0:

```sh
railway config plan \
  --file .railway/railway.ts \
  --environment daf9b28b-733a-46a6-97c5-4310d1eb25e5 \
  --json
```

The result had `ok: true` and zero diagnostics. It produced a preview only; no
configuration was applied. The preview correctly described the fixture's
intentional difference from the scratch environment (`Create service web`, and
deletions for existing services/database), confirming that the M1 plan workflow
can execute end to end without applying it.

## Cleanup

Both approved scratch services were deleted after testing:

```text
deleted railway-m0-probe: 6eef80be-8281-4af6-9278-e816a6af4961
deleted Postgres: cbbffbc6-9499-4044-86d5-bac68f155f26
```

A final service-list readback for `fabulous-compassion/production` contained
only the pre-existing `echoes_of_homes` service. No scratch service remained.

## M0 item outcomes

| Item | Status | Scope / decision |
|---|---|---|
| EU-West latency from Cape Town mobile network | **Still-open** | Current plan rejected Amsterdam deployment; obtain a eu-west project/plan and a Cape Town mobile measurement. |
| Postgres private networking | **Resolved** | Same-environment probe reached the managed Postgres service through `postgres.railway.internal` and completed SQL. |
| `railway config plan` | **Resolved** | CLI `5.71.0` ran a read-only plan successfully with the local Railway IaC SDK; no apply was performed. |

## Limitations / follow-ups

- The private-network result is limited to the temporary SFO deployment and the
  tested CLI/SDK versions.
- The latency item remains open; no SFO latency result substitutes for the
  requested Amsterdam/Cape Town evidence.
- The generated IaC fixture is throwaway and was never applied or imported by
  application code.
