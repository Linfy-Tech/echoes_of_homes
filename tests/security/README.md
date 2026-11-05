# tests/security

Security suites (`docs/THREAT_MODEL.md`, `docs/TEST_STRATEGY.md` §6): authorisation matrix (generated from the policy table), route inventory, CSRF/session/cookie/header tests, log/trace redaction with sentinel strings, provider-URL leakage scanner, prompt-injection fixtures (`prompt-injection/`), admin content-exposure tests, webhook forgery. ASVS L2 checklist tracking (`asvs-checklist.md`, created in M1). DAST (ZAP baseline) configuration for staging before releases.
