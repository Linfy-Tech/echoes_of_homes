# M0 Railway spike

This throwaway spike records evidence for the Railway M0 risks. It is never
imported by application code.

The temporary probe service connects to a temporary Railway Postgres service
using `DATABASE_URL` wired from the database service. The probe only logs
non-sensitive network/database metadata and exposes `/health` for latency
measurement.

The IaC fixture used by `railway config plan` is supplied separately during the
spike run and is not an application deployment.
