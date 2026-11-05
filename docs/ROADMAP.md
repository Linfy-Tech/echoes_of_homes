# Roadmap

Relative sequencing, not dates. Each phase has an entry gate; later phases are re-planned after pilot learning. Milestone detail: `MILESTONES.md`.

```
Phase 0  Research & risk reduction ──► Phase 1 Foundation ──► Phase 2 Release 1 build ──► Phase 3 Closed pilot (R1)
                                                                                                │
             ┌──────────────────────────────────────────────────────────────────────────────────┘
             ▼
Release 2  Language quality ──► Release 3  Family & sharing ──► Release 4  Production hardening & scale ──► Release 5+ Expansion
(R2 and R3 can overlap once R1 pilot learnings are in)
```

## Phase 0 — Research and risk reduction (M0)

Customer discovery (families, elders, reviewers); ASR benchmark v0; Cloudinary/queue/Railway spikes; legal review start; isiXhosa consent script and copy glossary.
**Exit gate:** a provider shortlist that passes gates (or a documented fallback), confirmed media approach, consent wording reviewed by fluent speakers.

## Phase 1 — Foundation (M1)

Monorepo, CI, auth, policy engine, audit, i18n, observability, staging on Railway IaC.
**Exit gate:** M1 acceptance criteria.

## Phase 2 — Release 1 build: the trust workflow (M2–M9)

Consent → record/upload → verify → transcribe with uncertainty → human review → approve → translate → verify → review → final approval → private/family sharing → withdraw/delete/export. Hardened for a closed pilot.
**Exit gate:** M9 acceptance criteria incl. legal checkpoint.

## Phase 3 — Closed pilot (M10)

5–10 invited families in Cape Town; facilitator-supported onboarding; weekly metrics and interviews.
**Exit gate for R2/R3 planning:** pilot retrospective; metrics vs `PRD.md` §6; updated risk register.

> **Demos outside the pilot** (e.g. hackathons, partners) use **staging with synthetic or team-consented recordings only** — never real family stories.

## Release 2 — Language-quality improvement

- Re-benchmark with a larger, more diverse eval set (more varieties, conditions, praise poetry).
- Dual-ASR disagreement signals; improved segmentation; better calibration.
- Manual transcription assistance (for stories without `ai_transcription` consent or with unusable ASR).
- Back-translation diagnostic (FR-VER-03); per-segment "keep in isiXhosa" option for praise poetry.
- Reviewer tooling: keyboard shortcuts, glossary suggestions from resolved flags (human-approved).
- **Consented language-data programme design** (separate `model_training` consent, governance, community benefit, licensing) — design only; launch requires its own ADR + legal review.
- Passkeys (F37); multiple recordings/sessions per story (F38).

## Release 3 — Family and sharing features

- **Public sharing** (F25) gated by: `share_public` consent, legal opinions on IK Act/copyright/third-party content (OQ-019, OQ-023), third-party mention review step, abuse reporting, external penetration test.
- Family archive for deceased storytellers' recordings (requires legal model for rights holders — OQ-019).
- Proxy consent for adults lacking capacity (legal authority model) and storytellers under 18 (competent-person consent) — only with legal sign-off.
- Phone-number sign-in (F40) after cost/SIM-swap analysis (OQ-011).
- Independent second copy of originals (R-12).
- Collections (family trees of stories), printable keepsake booklets (export formats).

## Release 4 — Production hardening and scale

- Multi-replica API with shared rate limiter (OQ-017); load testing at 10× pilot.
- Token-based media delivery if cost-effective (OQ-003).
- Key rotation tooling, re-encryption jobs; evaluate content-column encryption (OQ-009).
- SOC-style controls, formal DPIA, periodic external pentests.
- Native mobile apps if PWA limits recording reliability.

## Release 5+ — Expansion

- Additional source languages (isiZulu, Sesotho, Afrikaans — chosen with users) following `LANGUAGE_STRATEGY.md` §7.
- Additional target languages.
- Community/institutional partnerships (schools, heritage organisations) under explicit consent and benefit-sharing agreements.
- Offline-first review.
