# Risk Register

Scale: Likelihood (L) and Impact (I) 1–5; Score = L × I. Reviewed at every milestone checkpoint and weekly during the pilot. Owner defaults to the founder unless assigned.

| ID | Risk | L | I | Score | Mitigation | Trigger / indicator | Status |
|---|---|---|---|---|---|---|---|
| R-01 | isiXhosa ASR too inaccurate for review to be worthwhile on oral storytelling audio | 4 | 5 | 20 | M0 benchmark with gates; uncertainty flags; manual transcription fallback (R2 pulled forward); recording guidance | Review > 6 min/audio min; reviewers retype instead of correcting | Open |
| R-02 | Translation distorts meaning, names, or relationships | 3 | 5 | 15 | Close + natural variants; glossary constraints; deterministic + model verifier; mandatory bilingual review | Critical-error rate above gate | Open |
| R-03 | Consent design legally insufficient under POPIA (cross-border, special information, evidence) | 3 | 5 | 15 | Legal review before pilot (M9-AC4); conservative scopes; dual basis for s72 | Counsel flags gaps | Open |
| R-04 | Consent/ownership model misaligned with family and cultural norms (communal stories, clan praises, elders' authority) | 3 | 4 | 12 | Discovery interviews; language-community advisor; custodian model; public sharing deferred | Pilot feedback, refusals | Open |
| R-05 | No South African hosting region; regulatory or trust concerns about data abroad | 3 | 3 | 9 | EU region; DPAs; transparent disclosure; revisit if SA regions appear | Counsel advice; user concerns | Open |
| R-06 | Coercion of elders by family during assisted consent | 2 | 5 | 10 | "You can say no" messaging; evidence audio; comprehension check; storyteller can revoke; facilitator guidance in pilot | Reports, inconsistent evidence | Open |
| R-07 | Private audio leaks via shareable media URLs | 2 | 5 | 10 | Authenticated delivery; proxy streaming; no provider URLs to clients; test TH-07 | Any provider URL in client responses | Mitigated by design |
| R-08 | Deletion doesn't reach all copies (backups, provider logs, derivatives) | 3 | 4 | 12 | Copy inventory; targets with outcomes; ledger replay; short backup retention; ZDR applications | Post-deletion scan finds data | Open |
| R-09 | Provider/model churn (deprecations, pricing, terms) | 4 | 3 | 12 | Provider abstraction; re-benchmark triggers; known shutdown of `gpt-4o-transcribe` family on 2027-02-26 **[S1]** avoided | Deprecation notices | Open |
| R-10 | Elders cannot use the interface even with assistance | 3 | 4 | 12 | Assisted-first design; audio explanations; usability testing at M0/M2/M5 | Task failure in sessions | Open |
| R-11 | Not enough fluent reviewers/translators (families or community) | 3 | 4 | 12 | Recruit and pay community reviewers; reviewer tooling; review effort metric | Stories stuck in review | Open |
| R-12 | Loss of irreplaceable originals (single provider copy) | 2 | 5 | 10 | Cloudinary backups **[S10]**; hash records; restore drills; independent copy in R3 | Provider incident | Partially mitigated |
| R-13 | AI/media costs exceed budget | 2 | 3 | 6 | Budgets, low-bitrate playback, cost reports | Weekly cost report | Open |
| R-14 | Upload failures on low bandwidth / older phones | 3 | 4 | 12 | Local buffering, chunked upload, resume or restart from local data, spike OQ-004 | Upload failure rate | Open |
| R-15 | Shared or stolen device exposes stories or local buffers | 3 | 3 | 9 | Session management; no content in caches; delete buffers after verification | Support reports | Open |
| R-16 | Prompt injection or adversarial content manipulates AI outputs | 2 | 3 | 6 | No tools; structured outputs; deterministic validation; human review | Injection test failures | Mitigated by design |
| R-17 | Scope creep turns R1 into a platform before trust workflow works | 3 | 3 | 9 | Milestone discipline; AGENTS.md scope rules | Unplanned features in PRs | Open |
| R-18 | Key-person dependency (founder as sole engineer/reviewer) | 4 | 3 | 12 | Documentation-first; AI-assisted development with specs; second reviewer for security changes | Delays | Open |
| R-19 | Railway platform changes (Config-as-Code deprecation 2026-12-01 **[S13]**, IaC evolution) | 3 | 2 | 6 | Use IaC from start **[S14]**; minimal config | Deploy breakages | Mitigated |
| R-20 | Stories contain sensitive third-party information (health, accusations) | 4 | 4 | 16 | Private default; family-only sharing; approval reminder; public sharing gated with review; legal review OQ-023 | Complaints | Open |
| R-21 | Eval data licences (e.g. third-party model training data) prevent commercial use | 3 | 3 | 9 | Licence gate in selection (G-LIC); prefer verified permissive licences | Diligence findings | Open |
| R-22 | Self-hosted ASR ops burden (GPU hosting, scaling, security) | 3 | 3 | 9 | Prefer hosted if gates pass; if self-hosted, isolate service, no persistent storage of audio | Ops incidents | Open |
