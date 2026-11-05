# Feature Catalog

Each feature maps to requirements (`SPEC.md`), journeys and acceptance criteria (`USER_JOURNEYS.md`), and the milestone that delivers it (`MILESTONES.md`). A feature is **done** only when every listed AC passes and `DEFINITION_OF_DONE.md` is satisfied.

| ID | Feature | Release | Requirements | Journey AC | Milestone |
|---|---|---|---|---|---|
| F01 | Email sign-in (link + code), sessions | R1 | FR-AUTH-01..04 | J1-AC1, J1-AC2 | M1 |
| F02 | Family circles and invitations | R1 | FR-FAM-01..05 | J1-AC3, J13-AC2 | M2 |
| F03 | Storyteller (Person) profiles, account linking | R1 | FR-PER-01..03 | J1-AC3 | M2 |
| F04 | Story creation (private by default) | R1 | FR-STY-01..05 | — (F04-AC below) | M2 |
| F05 | Consent explanation and capture (self) | R1 | FR-CON-01, 02, 04..07 | J2-AC1, 2, 4, 5, 6 | M2 |
| F06 | Assisted verbal consent with evidence audio | R1 | FR-CON-03 | J2-AC3 | M3 |
| F07 | Rights-holder designation (self or custodian) | R1 | FR-CON-05, FR-STY-04 | F07-AC below | M2 |
| F08 | In-browser recording with local buffering | R1 | FR-REC-01..04 | J3-AC1..3 | M3 |
| F09 | File upload (signed, chunked) | R1 | FR-UPL-01..03 | J4-AC3 | M3 |
| F10 | Upload recovery and resume | R1 | FR-UPL-04 | J4-AC1, J4-AC2 | M3 |
| F11 | Media verification (hash, probe) | R1 | FR-UPL-05, 06 | J4-AC1 | M3 |
| F12 | Secure playback via API stream | R1 | FR-MED-01..03 | J10-AC2 | M3 |
| F13 | Durable processing pipeline and status | R1 | FR-PRC-01..04, FR-CON-08 | J5-AC1, J5-AC2 | M4 |
| F14 | isiXhosa ASR with segments and timestamps | R1 | FR-ASR-01..03 | F14-AC below | M4 |
| F15 | Uncertainty flags | R1 | FR-UNC-01..04 | J6-AC2 | M4/M5 |
| F16 | Cultural-context flags and family glossary | R1 | FR-CTX-01, 02 | F16-AC below | M5 |
| F17 | Transcript review | R1 | FR-REV-01..05 | J6-AC1, 3, 4 | M5 |
| F18 | Transcript approval for translation | R1 | FR-APR-01, 02 | J7-AC1, J7-AC2 | M5 |
| F19 | Translation (close + natural) | R1 | FR-TRN-01..05 | F19-AC below | M6 |
| F20 | Translation verification report | R1 | FR-VER-01, 02 | J8-AC1 | M6 |
| F21 | Translation review and approval | R1 | FR-TRV-01 | J8-AC1, J8-AC2 | M6 |
| F22 | Final approval → immutable story version | R1 | FR-FIN-01, 02 | J9-AC1, J9-AC2 | M7 |
| F23 | Bilingual reader with synchronised audio | R1 | FR-READ-01, 02 | J10-AC1, J10-AC2 | M7 |
| F24 | Sharing: private and family | R1 | FR-SHR-01..04 | J11-AC1, J11-AC2 | M7 |
| F25 | Sharing: public | R3 | FR-SHR-01, 02 | Defined at R3 gate | R3 |
| F26 | Permission change propagation | R1 | FR-SHR-03 | J11-AC1 | M7 |
| F27 | Consent withdrawal | R1 | FR-WDR-01, 02 | F27-AC below | M8 |
| F28 | Deletion request and propagation | R1 | FR-DEL-01, 02 | J12-AC1, J12-AC2 | M8 |
| F29 | Story export | R1 | FR-EXP-01 | J12-AC3 | M8 |
| F30 | Account closure | R1 | FR-ACC-01 | J13-AC1 | M8 |
| F31 | Per-story activity log | R1 | FR-AUD-01, 02 | F31-AC below | M1 (events), M8 (UI) |
| F32 | Admin operations and break-glass | R1 | FR-ADM-01, 02 | F32-AC below | M9 |
| F33 | AI budgets and quota enforcement | R1 | FR-COST-01 | F33-AC below | M4 |
| F34 | Per-story reviewer invitations | R1 | FR-REV-01 | J6-AC1 | M5 |
| F35 | Content-free email notifications | R1 | FR-NOT-01 | F35-AC below | M5 |
| F36 | Bilingual UI (isiXhosa / English) | R1 | FR-I18N-01 | J1-AC2 | M1 (framework), all UI milestones |
| F37 | Passkeys | R2 | FR-AUTH-05 | — | R2 |
| F38 | Multiple recordings per story | R2 | FR-UPL-06 (extension) | — | R2 |
| F39 | Back-translation diagnostic | R2 | FR-VER-03 | — | R2 |
| F40 | Phone-number sign-in | R3 | FR-AUTH-06 | — | R3 |

## Acceptance criteria for features without a journey AC

- **F04-AC:** Creating a story via API returns `status=draft`, `audience=private`; attempting to create with any other audience is rejected (400); the creator gets `recorder` role only.
- **F07-AC:** A designated custodian becomes rights holder only after accepting the invitation; until then the storyteller remains rights holder. The custodian cannot change the storyteller.
- **F14-AC:** For a fixture recording, the transcript has contiguous, non-overlapping segments covering all non-silent audio; each segment has `start_ms < end_ms`; a `model_run` exists for every provider call; re-running the job produces no duplicate transcript version.
- **F16-AC:** Cultural-context output never modifies segment text (test: text hash unchanged before/after); glossary terms not approved by the rights holder are not sent to providers as hints.
- **F19-AC:** Attempting to create a translation from a transcript version not in `approved_for_translation` fails at the DB constraint and the service layer; each source segment has exactly one translation segment with both variants.
- **F27-AC:** Withdrawing `ai_transcription` while an ASR job is queued results in the job being `cancelled` at start with no provider call recorded.
- **F31-AC:** Every action listed in `SECURITY_AND_PRIVACY.md` §8 writes exactly one audit event in the same transaction; tampering with an event breaks hash-chain verification.
- **F32-AC:** Admin API responses never include transcript/translation text or audio URLs without an active break-glass grant; break-glass creates an audit event and notifies the rights holder.
- **F33-AC:** When the daily budget is exhausted, new model jobs are not enqueued, stories show "waiting", and an admin alert fires; no job fails due to budget.
- **F35-AC:** Notification email templates contain no story title, storyteller name, or content (snapshot test of rendered templates).
