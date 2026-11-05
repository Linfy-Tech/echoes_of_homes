# ADR-001: Host on Railway in the EU West (Amsterdam) region

- **Status:** Accepted (platform) · Provisional (region — pending legal review OQ-014)
- **Date:** 2026-11-04

## Context
The product constraint is Railway for hosting and PostgreSQL. Users are in Cape Town. Railway's regions are US West, US East, EU West (Amsterdam, `europe-west4-drams3a`) and Southeast Asia (Singapore); there is no Africa region **[S12]**. Volumes follow their service's region, and changing region later requires a volume migration with downtime **[S12]**. Railway's Config as Code (`railway.json`/`railway.toml`) is deprecated and stops being read on 2026-12-01 **[S13]**; Infrastructure as Code (`.railway/railway.ts`) is the replacement **[S14]**.

## Options
1. Railway EU West — closest plausible latency; EU legal environment may support a POPIA s72(1)(a) argument (legal review).
2. Railway US — larger provider ecosystem; weaker latency and privacy framing for SA users.
3. Non-Railway host with an SA region — violates the stated constraint.

## Decision
Railway, region `europe-west4-drams3a` for all services and the database, managed with Railway IaC (`.railway/railway.ts`). Services: `web`, `api`, `worker`, `ops-cron`, `postgres`.

## Consequences
- All data is processed outside South Africa → explicit `cross_border_processing` consent and DPAs required (`SECURITY_AND_PRIVACY.md` §6).
- Latency from Cape Town to be measured in M0 (ASSUMPTION that EU is best).
- Region must be fixed before production data exists.

## Revisit when
Railway adds an Africa region; counsel advises against EU hosting; latency measurements contradict the assumption.
