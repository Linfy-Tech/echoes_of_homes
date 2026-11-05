# Definition of Done

A change (PR), a feature, and a milestone each have a definition of done. Nothing is "done" if any applicable item is unchecked — state explicitly which items are not applicable and why.

## 1. Pull request

**Functionality**
- [ ] Implements only items in the current milestone; references requirement/AC IDs.
- [ ] Behaviour matches `MACHINE.md`, `DATA_MODEL.md`, `API_CONTRACTS.md`; spec updated in the same PR if behaviour changed.

**Tests**
- [ ] Required tests per `AGENTS.md` §8 added and passing; AC IDs in test names.
- [ ] CI green: typecheck, lint, unit, integration, contract, security checks.

**Security & privacy**
- [ ] Every new route declares a policy action; denial tests included.
- [ ] Consent gates applied where data is processed.
- [ ] No content, names, emails, tokens, or URLs to media in logs/traces/errors (redaction tests extended if new fields).
- [ ] No secrets committed; `.env.example` updated with placeholders for new variables; `ENVIRONMENT_VARIABLES.md` updated.
- [ ] New dependencies: purpose, licence (no GPL/AGPL/NC without ADR), maintenance status noted.

**Accessibility (UI changes)**
- [ ] axe clean; keyboard path works; touch targets ≥ 44 px (primary 56 px); not colour-only.
- [ ] All new copy keys exist in `xh` and `en`; isiXhosa copy marked for fluent review if not yet reviewed (blocks release, not merge).

**Observability**
- [ ] New jobs/routes emit metrics and spans with correlation IDs; error codes stable.

**Documentation**
- [ ] Report per `AGENTS.md` §9 in the PR description (assumptions, limitations, open questions).

## 2. Feature

- [ ] All AC in `FEATURE_CATALOG.md` / `USER_JOURNEYS.md` for the feature pass (automated where possible).
- [ ] Loading/empty/success/partial/error/offline states implemented for its screens.
- [ ] Usability-validated with target users when the feature is storyteller- or reviewer-facing (per `USER_JOURNEYS.md` §7 schedule).
- [ ] Audit events emitted per catalogue.

## 3. Milestone

- [ ] All milestone AC pass; AC coverage report has no gaps for this milestone.
- [ ] Demo outcome shown on staging (synthetic/consented data only).
- [ ] Threat model reviewed for changed boundaries; new threats have controls and tests.
- [ ] `RISK_REGISTER.md` and `OPEN_QUESTIONS.md` updated.
- [ ] Deployment to staging via IaC reproducible; migrations applied cleanly; rollback path documented.
- [ ] Human review checkpoint held; decisions recorded.

## 4. Release (adds to milestone DoD)

- [ ] `DEPLOYMENT.md` §8 production checklist complete, signed off by two people.
- [ ] Restore drill (with deletion-ledger replay) within the last 30 days.
- [ ] DAST and dependency scans: no open High/Critical.
- [ ] Provider data-controls checklist (`AI_PROVIDER_STRATEGY.md` §4) complete for every active provider.
- [ ] isiXhosa copy reviewed by two fluent speakers; consent script version published.
- [ ] Legal checkpoint items for the release resolved or explicitly accepted with mitigations.
- [ ] Release notes, including model IDs and prompt versions in use.
