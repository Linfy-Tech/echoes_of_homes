# Consent and Ownership

**Authority:** Rank 1 (see `AGENTS.md` §2). Every rule here is enforced in deterministic code (`packages/auth`, domain services, DB constraints). **Nothing here is legal advice**; items marked **LEGAL REVIEW** must be confirmed by a qualified South African attorney before the pilot (`OPEN_QUESTIONS.md`).

---

## 1. Principles

1. **The storyteller decides.** The person whose voice and life is in the story controls whether it is recorded, processed, translated, and shared.
2. **Informed, specific, voluntary.** POPIA defines consent as "any voluntary, specific and informed expression of will" **[VERIFIED S25]**. We therefore ask per use (scopes), explain in the storyteller's language, and never bundle optional uses with required ones.
3. **Narrowing is easy; expanding requires the storyteller.** Anyone with authority (storyteller or rights holder) can reduce exposure at any time. Only the storyteller can grant a new use.
4. **Private by default.** Nothing is visible beyond the storyteller, rights holder, recorder, and explicitly invited reviewers/collaborators until the rights holder shares it within the consented scopes.
5. **Evidence, not assumptions.** Every consent is recorded with what was shown, how, by whom, and when.
6. **Family is not authority.** Being a family member, family-circle admin, or recorder confers no right to consent for the storyteller.

## 2. People and roles

| Role | Who | How established |
|---|---|---|
| **Storyteller** | The Person telling the story | Selected at story creation; immutable for the story |
| **Rights holder** | Decides use and sharing within granted scopes | Storyteller (if they have an account) or a **custodian** they designate |
| **Custodian** | A User the storyteller trusts to act for them on this story | Designated by the storyteller during consent; must accept an invitation |
| **Recorder** | User who creates the story and captures audio | Creator of the story |
| **Transcript reviewer** | Corrects isiXhosa transcript | Granted per story by rights holder; requires `human_review` scope |
| **Translation reviewer** | Reviews English translation | Granted per story by rights holder; requires `human_review` + `translation` scopes |
| **Viewer** | Private collaborator who can read/listen to the approved story | Granted per story by rights holder; provisionally requires the `share_family` scope (OQ-024) |
| **Family member** | Member of the story's family circle | Sees approved story only if audience = `family` |
| **Platform admin** | Linfy Tech operator | No content access by default; break-glass only |

## 3. Establishing consent and authority

### 3.1 Supported in Release 1

**(a) Self consent (`self_digital`).** The storyteller uses their own account (or the device with their own session) and taps through the explanation and choices themselves.

**(b) Assisted consent (`assisted_verbal`).** For storytellers who cannot or prefer not to operate the device:
1. The recorder (or another family member) hands over or sits with the storyteller (handover screen S-20).
2. Explanation cards are **played aloud** in the storyteller's chosen language (human-recorded audio) and shown as text.
3. The storyteller states their choices; the assistant taps them.
4. The app shows a short scripted summary of the choices, which is **read aloud** (audio playback), and the storyteller is asked to respond in their own words; this response is recorded as **consent evidence audio** (≥ 5 s) — stored as an `authenticated` media asset with role `consent_evidence`.
5. The comprehension check (§10) is asked aloud.
6. The assistant attests: "I read/played everything to [name]; they answered for themselves; nobody pressured them."

The consent-evidence audio is personal data and is protected like story audio; it is not transcribed by AI and is used only as evidence of consent.

### 3.2 Not supported in Release 1 (blocked in code, documented exits)

| Case | Why deferred | R1 behaviour |
|---|---|---|
| Storyteller under 18 | POPIA treats children's information specially (s34–35) and requires a competent person's consent — **LEGAL REVIEW** | Adult attestation required (FR-PER-03); otherwise cannot proceed |
| Living adult who cannot give informed consent (e.g. advanced dementia) | Proxy consent requires legal authority (e.g. curatorship) — **LEGAL REVIEW** | The app explains that this is not yet supported and suggests waiting |
| Deceased storyteller (archival recordings) | POPIA "personal information" covers *living* persons **[VERIFIED S25]**, but family/cultural rights, third parties in the story, and copyright remain — **LEGAL REVIEW** | Not supported; roadmap R3 "Family archive" |
| Group storytelling (multiple main storytellers) | Each voice needs its own consent | One storyteller per story; others present are handled per §3.3 |

### 3.3 Other voices and other people

- **Other audible speakers** (the recorder asking questions, relatives interjecting): the recording flow asks the recorder to confirm everyone audible knows they are being recorded. Reviewers may mark their segments `excluded` with reason `not_storyteller`. Their voices remain in the original audio — disclosed in the consent explanation for the recorder (**LEGAL REVIEW**: whether separate consent from incidental speakers is required, OQ-022).
- **People mentioned in stories** (living relatives, neighbours): stories may contain personal — even special personal — information about third parties (e.g. health, religion, criminal allegations), which POPIA s26 treats as *special personal information* (UNVERIFIED wording; **LEGAL REVIEW**, OQ-023). R1 mitigations: private by default; family-only sharing; the final-approval screen reminds the rights holder that the story may mention other people; public sharing deferred to R3 with an explicit third-party review step.

## 4. Rights holder and custodian rules

- Default rights holder = storyteller, **only if** the storyteller has their own linked User account.
- A storyteller without an account must designate a custodian; until the custodian accepts, rights-holder actions are unavailable (recording and machine processing may proceed within scopes).
- The custodian acts **only within scopes the storyteller granted**. The custodian may revoke scopes, make the story private, or request deletion. The custodian may not grant scopes, change storyteller, or designate another custodian.
- The storyteller (self or assisted) may revoke the custodian at any time; rights holder reverts to the storyteller (if they have an account) or the story becomes rights-holder-less (only narrowing actions available) until a new custodian accepts.
- **Expanding audience via a custodian** (`private → family`) additionally requires a fresh *assisted confirmation* within the last 24 h: custodian confirms the storyteller agreed now, optionally with a short spoken confirmation (**required** in R1 when the storyteller has no account). Rationale: consent was given in advance; sharing is the moment of greatest exposure.

## 5. Policy matrix (authoritative)

✅ allowed · ❌ denied · ◐ conditional (see notes). "Content" = transcript/translation in review, audio. Deny for unknown resources returns 404.

| Action | Storyteller (own account) | Rights holder (if custodian) | Recorder | Transcript reviewer | Translation reviewer | Viewer | Family member | Family admin (no story role) | Platform admin | Admin + break-glass |
|---|---|---|---|---|---|---|---|---|---|---|
| `story.read` (metadata, status) | ✅ | ✅ | ✅ | ✅ | ✅ | ◐¹ | ◐¹ | ❌ | ◐² | ✅ |
| `transcript.read` (in review) | ✅ | ✅ | ◐³ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `story.audio.stream` | ✅ | ✅ | ◐³ | ✅ | ✅ | ◐¹ | ◐¹ | ❌ | ❌ | ✅ |
| `story.version.read` | ✅ | ✅ | ◐³ | ✅ | ✅ | ◐¹ | ◐¹ | ❌ | ❌ | ✅ |
| `recording.create` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `consent.create` (initial / grant) | ✅ | ❌ | ◐⁴ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `consent.revoke` / `consent.withdraw` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `consent.read` | ✅ | ✅ | ◐⁵ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `story.role.manage` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `transcript.segment.edit` / `transcript.flag.resolve` / `transcript.review.complete` | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `transcript.flag.accept_uncertain` | ✅⁶ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `transcript.approve` | ✅⁶ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `translation.segment.edit` / `translation.issue.manage` / `translation.approve` | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `story.approve_final` | ✅⁶ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `story.audience.change` (widen) | ✅⁶ | ◐⁷ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `story.audience.change` (narrow) | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `story.delete` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐⁸ | ◐⁸ |
| `story.export` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `story.activity.read` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ◐² | ✅ |
| `glossary.propose` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| `glossary.approve` | ✅⁶ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

Notes:
1. Only when the story has an `approved` version and (Viewer) an active `viewer` role, or (Family member) audience = `family` for their circle and current membership. Viewer access requires `human_review` *or* `share_family` scope — R1 rule pending OQ-024 (provisional: viewer grants require `share_family`, treating named collaborators as a subset of family-level sharing).
2. IDs, states, sizes, error codes only — no titles, names, or content.
3. Being the recorder grants **no content access** after upload. The recorder sees story status only, unless the rights holder grants them a reviewer role (requires `human_review`) or a viewer role. Before upload, the recorder can play back the local recording on the device they recorded with. (Prevents the person holding the phone from gaining access the storyteller didn't intend.)
4. Recorder may *operate* the device for assisted consent; the consent is the storyteller's (method `assisted_verbal`, evidence required). The recorder cannot consent on the storyteller's behalf.
5. Recorder sees which scopes are granted (needed to know what's possible), not the evidence audio.
6. Only when the storyteller is also the current rights holder (no active custodian).
7. Custodian widening requires `share_family` scope + assisted confirmation within 24 h (§4).
8. Admin may initiate deletion only for `admin_legal` reasons (e.g. court order, abuse report upheld), with two-person approval and audit; never for convenience.

**Derived and non-story actions** (same engine, `packages/auth`):
- `translation.read` follows `transcript.read`, except transcript reviewers without `translation_reviewer` see the translation only after it is approved.
- `recording.read` / `recording.complete` follow `recording.create`. `consent.evidence.upload` is allowed for whoever operates an assisted consent session (storyteller or recorder) and only while that session is open.
- `story.metadata.edit`: rights holder always; recorder until the first story version is approved.
- Family actions: `family.invite`, `family.member.remove` → `family_admin`; `family.read` → members; leaving → self. Person actions: creator and linked user; `person.link_account` via invitation only.
- `account.close` → self. `admin.jobs`, `admin.break_glass` → `platform_admin` with second factor.

## 6. Consent scopes

| Scope | Permits | Required? | R1 |
|---|---|---|---|
| `record_and_store` | Recording and keeping the original audio and derived playback audio | Required | ✅ |
| `cross_border_processing` | Storing and processing outside South Africa with the named processors | Required (no SA-hosted alternative exists for the chosen stack) | ✅ |
| `ai_transcription` | Sending audio (and approved glossary hints) to the named ASR/LLM processors to draft a transcript and flags | Optional | ✅ |
| `human_review` | Letting named family helpers read/listen to unapproved content to check it | Optional | ✅ |
| `translation` | Sending the approved transcript to the named LLM processors to draft English, and translation review | Optional | ✅ |
| `share_family` | Allowing the rights holder to share the approved story with the family circle (and named viewers) | Optional | ✅ |
| `share_public` | Allowing public sharing | Optional | ❌ (R3) |
| `model_training` | Using the story to improve AI models | Optional, separate programme | ❌ (not offered) |

If `ai_transcription` is not granted, the storyteller can still have the story preserved, and a human may type the transcript manually (manual transcription UI: R2; R1 shows "Writing it down by computer is turned off").

## 7. Changes and propagation

| Change | Effect (same transaction unless noted) |
|---|---|
| Grant scope | New consent record (`grant`); paused stories resume; jobs enqueued as applicable |
| Revoke `ai_transcription` | Queued/running ASR/context jobs → `cancelled` at next checkpoint; existing machine transcript **kept** unless rights holder also requests its deletion (option shown) |
| Revoke `human_review` | All reviewer story roles revoked; review UI locked for others |
| Revoke `translation` | Translation jobs cancelled; existing translations hidden from viewers; story version without translation offered |
| Revoke `share_family` | Audience → `private`; viewer roles revoked; next request denied |
| Withdraw all / revoke `record_and_store` or `cross_border_processing` | Deletion request created (72 h cancellable window); story inaccessible to all but requester immediately |
| Custodian revoked | Rights holder switches back; pending custodian actions void |
| Consent script updated | Existing consent remains valid for already-consented uses; next consent change shows new script |

Authorisation is evaluated per request with no cross-request cache (FR-SHR-03), so effects apply on the next request.

## 8. Sharing levels

| Audience | Who can access the approved story | Requirements |
|---|---|---|
| `private` (default) | Storyteller, rights holder, named viewers and reviewers (recorder sees status only unless granted a role) | — |
| `family` | + all current members of the story's family circle | Approved version; `share_family`; custodian assisted confirmation (§4) |
| `public` (R3) | Anyone with the link; optional listing | `share_public`; third-party mention review; re-confirmation; abuse reporting; `FEATURE_PUBLIC_SHARING` |

Unapproved content (in review) is never visible to family members or viewers regardless of audience.

## 9. Ownership and intellectual property

- **The storyteller (and/or their family, per their wishes) owns their story.** Echoes of Home claims no ownership. Terms of service grant the platform only the limited rights needed to store, process (within consented scopes), and display the story to permitted audiences.
- **No training, no resale, no advertising use.** Hard rule in code and terms.
- **LEGAL REVIEW (OQ-019):**
  - Copyright in oral works: whether and when a spoken story attracts copyright, who is the author/owner of the recording (storyteller vs recorder), and what licence the platform needs.
  - **Indigenous Knowledge Act 6 of 2019** **[S28]**: whether clan praises, communal histories, or traditional knowledge in stories fall under community rights, and what that means for sharing and consent (an individual may not have authority to share communal heritage publicly).
  - Moral rights and attribution of storytellers in exports/public sharing.
- Until legal review completes, public sharing remains disabled (consistent with R1 scope).

## 10. Consent script outline (English source; isiXhosa by human translators)

Cards (each ≤ 60 words, with audio). **Draft wording — must be reviewed by fluent isiXhosa speakers and legal counsel before use; never machine-translated.**

1. **What we're doing.** "We'd like to record you telling a story, so your family can keep it. Your voice will be kept exactly as you speak."
2. **Where it is kept.** "The recording is kept safely on computers run by companies outside South Africa [names: Railway — Netherlands; Cloudinary — region TBC (OQ-002)]. Only people you allow can open it."
3. **Who helps write it down.** "If you agree, a computer program [named processors] will try to write down your words. It makes mistakes, so family helpers you choose will check it. Unclear parts will be marked, not guessed."
4. **Translation.** "If you agree, a computer program will help translate the checked words into English, and a person will check the translation."
5. **Who can hear it.** "At first, only you and the people you choose. Later you can decide to share it with your family circle. It will not be shown to the public."
6. **Your choices.** "You can say no to any part, even if family asks. You can change your mind later, ask us to stop, or delete the story. Copies in our safety backups disappear within 35 days (`RETENTION_AND_DELETION.md` §3)."
7. **What we will never do.** "We will never copy your voice to make it say new things. We will never use your story to train computer programs or sell it."

## 11. Comprehension check (audio-supported)

1. "Who can hear your story right now?" (Expected: only me and people I choose.)
2. "Can you change your mind later?" (Expected: yes.)
3. "Will a person check what the computer writes?" (Expected: yes / if I agree.)

Results stored on the consent record (`comprehension_result`). Failure → re-explanation of the missed card; proceeding is still allowed (comprehension checks must not become a barrier for elders), and the result is visible to the rights holder.

## 12. Consent evidence retention

Consent records and evidence audio are retained for the life of the story and deleted with it; after deletion, only content-free audit events and the tombstone remain. Whether consent evidence must be retained *after* deletion to demonstrate lawful prior processing is a **LEGAL REVIEW** item (OQ-015).
