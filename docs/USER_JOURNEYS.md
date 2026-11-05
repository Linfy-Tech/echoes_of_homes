# User Journeys, Screens, and Accessibility

Personas are defined in `PRD.md` §3 (illustrative, fictional). Requirement IDs refer to `SPEC.md`. States refer to `MACHINE.md`.

---

## 1. Design principles for elders and families

1. **One decision per screen.** Large, single primary action; secondary actions visually quieter.
2. **Say it, show it, play it.** Key text (consent, status, approval) has an audio version in isiXhosa and English, recorded by a human voice actor — never synthetic speech imitating anyone.
3. **Plain language.** Short sentences; no jargon ("AI" is explained as "a computer program that writes down what it hears"). Reading level target: understandable when read aloud to someone.
4. **Assisted use is normal, not an edge case.** Every storyteller flow works when a family member holds the phone, and the UI says so ("If someone is helping you, they can tap for you. Your words are what count.").
5. **Nothing irreversible without a pause.** Deletion and sharing have a confirmation step that restates the consequence in plain language.
6. **Respectful tone.** Address storytellers respectfully (copy reviewed by fluent isiXhosa speakers for register — e.g. appropriate honorifics). Never infantilising.
7. **Low bandwidth first.** Text before media; media on demand; progress always visible; nothing lost when the connection drops.

## 2. Journeys

Each journey lists steps, screens (S-xx, §3), key states, risks, and acceptance criteria (AC). AC are testable and map to e2e tests in `tests/e2e/`.

### J1 — First-time onboarding (recorder)

Steps: open invite or landing → choose language (isiXhosa/English) → enter email → receive link or code → sign in → short intro (3 cards, audio available) → create family circle → add storyteller.

Screens: S-01, S-02, S-03, S-04, S-10.

Risks: user reads email on another device (code fallback); shared family phone (sign-out visible; session list).

AC:
- J1-AC1: A new user can sign in with a 6-digit code entered on a different device from where the email was opened.
- J1-AC2: Language choice persists across sessions and is applied before sign-in.
- J1-AC3: After onboarding, the user has a family circle with themselves as `family_admin` and can add a storyteller Person with only a name and preferred language.

### J2 — Consent and permissions (storyteller, self or assisted)

Steps: recorder taps "Record a story" → selects storyteller → **handover screen** ("Please give the phone to [name], or sit with them") → explanation in storyteller's language (text + play audio; 5 short cards: what we record, where it is kept, who helps write it down, who can hear it, you can change your mind) → choose assisted or self → scopes (required: keep the recording safely; acknowledge storage/processing outside South Africa. Optional: computer writes it down; family helpers check it; translate to English; share with family circle) → choose rights holder (me / someone I trust) → if assisted: record spoken consent to a short scripted summary → comprehension check (3 questions with audio) → summary of choices → done.

Screens: S-20 to S-26.

Risks: coercion by family member (explanation states "You can say no, even if family asks"); misunderstanding of cross-border storage; fatigue.

AC:
- J2-AC1: Recording cannot start until a consent record with `record_and_store` and `cross_border_processing` exists (FR-REC-01).
- J2-AC2: Optional scopes default to unselected; skipping them leaves them not granted.
- J2-AC3: Assisted consent cannot complete without a consent-evidence audio asset ≥ 5 s that has finished uploading (or is queued locally with upload pending, blocking AI processing until verified).
- J2-AC4: The comprehension-check result is stored on the consent record; a failure shows re-explanation and still allows proceeding.
- J2-AC5: The summary screen lists every granted and not-granted scope in the storyteller's language.
- J2-AC6: Every explanation card has a working audio play control and visible text.

### J3 — Record a story

Steps: "Ready when you are" screen with tips (quiet room, phone close) → mic permission (explained first) → record (big timer, level meter, pause, stop) → listen back → keep or record again → upload starts automatically on Wi-Fi or with user confirmation on mobile data (shows estimated size).

Screens: S-30, S-31, S-32, S-33.

AC:
- J3-AC1: Killing the browser tab during recording and reopening the app offers to recover the recording with at most ~10 s lost (FR-REC-02).
- J3-AC2: If mic permission is denied, the user sees platform-specific instructions and an "upload a file instead" option.
- J3-AC3: Estimated upload size is shown before upload on a metered connection (Network Information API where available, otherwise always shown).

### J4 — Upload a file and recover from interruption

Steps: choose file → client hashes (progress) → request upload session → chunked upload with progress → connection lost → "Paused — will continue when you're back online" → resumes → "Checking the recording" → verified.

Screens: S-34, S-35.

AC:
- J4-AC1: Simulated network loss at 50% resumes without re-uploading confirmed chunks where supported, or restarts automatically from local data otherwise; final hash matches (FR-UPL-04/05).
- J4-AC2: Closing the app mid-upload and reopening within 7 days resumes the upload from locally stored data.
- J4-AC3: A corrupt or non-audio file ends in `failed` with a plain-language reason and keeps the local copy until the user discards it.

### J5 — Processing status

Steps: story card shows steps: Saved safely ✓ → Writing it down (working) → Ready for checking. Email when ready (no content).

Screens: S-40.

AC:
- J5-AC1: Status reflects job states within 10 s of change (polling with backoff; no websockets required in R1).
- J5-AC2: A permanently failed job shows "We couldn't finish this step. We're looking into it." and the admin is alerted; retryable failures retry automatically without user action.

### J6 — Transcript review and uncertainty resolution (reviewer)

Steps: rights holder invites reviewer → reviewer opens review screen → segment list with play buttons; unclear parts marked with icon + label + underline → "Next unclear part" → listen (replay, 0.75× speed) → edit / confirm / mark inaudible / ask storyteller → progress bar → "Review complete".

Screens: S-50, S-51, S-52.

AC:
- J6-AC1: Only Users with the `transcript_reviewer` role (or the rights holder/storyteller) on the story can open it; others get 404 (no existence leak).
- J6-AC2: Every flag is reachable via keyboard and "next unclear" navigation; flags are distinguishable without colour.
- J6-AC3: Saving with a stale version returns a conflict message and preserves the reviewer's unsaved text locally.
- J6-AC4: "Review complete" is disabled while any segment is unreviewed or any flag is open, and the UI says exactly what remains.

### J7 — Transcript approval for translation (rights holder)

Steps: notification → summary: segments, corrections made, parts accepted as uncertain → listen/read → approve for translation (requires `translation` scope; if not granted, offer to grant it with explanation).

Screens: S-53.

AC:
- J7-AC1: Approval creates an immutable transcript version; later edits create a new version and mark existing translations `superseded`.
- J7-AC2: Without `translation` consent, approval completes but no translation job is enqueued.

### J8 — Translation review (bilingual reviewer)

Steps: side-by-side isiXhosa / English (natural, toggle close) per segment, play audio → verification issues listed at top, blocking first → resolve or dismiss with reason → approve translation.

Screens: S-60, S-61.

AC:
- J8-AC1: Approve is disabled while blocking verification issues are unresolved.
- J8-AC2: Names and glossary terms are visually marked in both languages.

### J9 — Final story approval (rights holder)

Steps: bilingual preview exactly as readers will see it → provenance panel → approve → choose sharing now or later (default "Keep private").

Screens: S-70, S-71.

AC:
- J9-AC1: Approval creates a `story_version`; audience remains `private` unless separately changed.
- J9-AC2: Preview rendering is byte-identical in content to what a family viewer later sees.

### J10 — Playback and bilingual reading (family member)

Steps: open story from family circle → reader with audio player; tap segment to play; toggle languages; uncertainty markers; provenance.

Screens: S-80.

AC:
- J10-AC1: A family member can read and listen only when audience = `family` for their circle and they are a current member.
- J10-AC2: Audio continues to play through Range requests on a throttled connection; seeking works.

### J11 — Sharing and permission management

Steps: rights holder → Sharing → current audience + who that includes (names list) → change → plain-language consequence → confirm → audit entry.

Screens: S-90, S-91.

AC:
- J11-AC1: Switching `family` → `private` revokes access on the next request (test: viewer request immediately after returns 404).
- J11-AC2: Granting `family` without `share_family` consent routes through the consent update flow first.

### J12 — Withdrawal, deletion, export

Steps: Story settings → "Change my mind" → options: stop sharing / stop further processing / delete this story / download a copy → plain-language explanation of backup limits → confirm → status.

Screens: S-92, S-93, S-94.

AC:
- J12-AC1: Deletion request makes the story inaccessible to all non-requesters immediately and to the requester except for a "cancel deletion" view.
- J12-AC2: After the cancellation window, deletion executes and a deletion certificate is available to the requester for 90 days (IDs/outcomes only).
- J12-AC3: Export produces a downloadable archive within 15 minutes for a 60-minute story; the link expires in 24 h.

### J13 — Account and family management

Steps: profile (name, language, email) → sessions → family circles (members, invites, leave) → linked storyteller profiles → close account.

Screens: S-10 to S-14.

AC:
- J13-AC1: Closing an account with pending rights-holder responsibilities is blocked until each story is resolved (FR-ACC-01).
- J13-AC2: Leaving a circle removes family-level access immediately.

## 3. Screen inventory

Every screen must define: **loading**, **empty**, **success**, **partial-success**, **error**, and **offline** states. "Standard" means: skeleton loading; friendly empty message with one next action; inline error with retry; offline banner with queued-action notice.

| ID | Screen | Primary users | Notable states |
|---|---|---|---|
| S-01 | Language choice | All | Standard |
| S-02 | Sign in (email) | All | Rate-limited state; "check your email" success |
| S-03 | Enter code | All | Expired/used code error |
| S-04 | Intro cards | New users | Audio unavailable offline → text only |
| S-10 | Profile & language | User | Standard |
| S-11 | Sessions | User | Current device highlighted |
| S-12 | Family circles list / detail | User | Empty: "Create your family circle" |
| S-13 | Invite member | family_admin | Invite expired; already member |
| S-14 | Close account | User | Blocked state listing stories needing decisions |
| S-15 | People (storytellers) | User | Empty: "Add the first storyteller" |
| S-16 | Family glossary | Rights holder, reviewers | Pending-approval entries marked |
| S-20 | Handover to storyteller | Recorder | — |
| S-21 | Explanation cards (5) | Storyteller | Audio loading/failed → text remains |
| S-22 | Self vs assisted choice | Storyteller | — |
| S-23 | Scope choices | Storyteller | Required scopes explained if declined → cannot continue, "That's okay" exit |
| S-24 | Rights holder choice | Storyteller | Custodian must accept invitation before taking effect |
| S-25 | Spoken consent recording | Storyteller (assisted) | Mic denied; upload pending |
| S-26 | Comprehension check & summary | Storyteller | Failed check → re-explain |
| S-30 | Ready to record | Recorder | Consent missing → blocked with explanation |
| S-31 | Recording | Recorder | Interrupted (call) → auto-pause; storage low warning |
| S-32 | Listen back | Recorder | — |
| S-33 | Upload confirmation (metered data) | Recorder | — |
| S-34 | Upload progress | Recorder | Paused offline; resumed; failed |
| S-35 | Recovery prompt | Recorder | Found unsent recording(s) |
| S-40 | Story home / processing status | All with access | Partial success (transcript ready, translation not consented) |
| S-50 | Transcript review list | Reviewer | Empty flags → "Nothing marked unclear" |
| S-51 | Segment editor | Reviewer | Conflict; saving; saved |
| S-52 | Flag resolution sheet | Reviewer, rights holder | Ask storyteller → creates a question for the rights holder |
| S-53 | Approve transcript | Rights holder | Missing translation consent → offer |
| S-60 | Translation review | Bilingual reviewer | Verification running |
| S-61 | Verification issues | Bilingual reviewer | Blocking vs warning |
| S-70 | Final preview | Rights holder | — |
| S-71 | Approve & sharing choice | Rights holder | — |
| S-80 | Story reader | Viewers | Audio buffering; offline text-only |
| S-90 | Sharing settings | Rights holder | Public option hidden while feature flag off |
| S-91 | Sharing confirmation | Rights holder | — |
| S-92 | Change my mind (withdraw) | Storyteller, rights holder | — |
| S-93 | Delete story | Storyteller, rights holder | Cancellation window countdown |
| S-94 | Export | Storyteller, rights holder | Building; ready; expired |
| S-95 | Activity log | Storyteller, rights holder | — |
| S-A1 | Admin operations | Platform admin | No content fields rendered at all |
| S-A2 | Break-glass request | Platform admin | Reason required; time remaining |

## 4. Accessibility requirements

- WCAG 2.2 AA (NFR-A11Y-01). Automated checks with axe in CI on every screen; manual screen-reader passes (TalkBack on Android, VoiceOver on iOS) per milestone touching UI.
- Primary actions ≥ 56 px high; body text ≥ 18 px default; supports system font scaling; high-contrast mode respected.
- Never rely on colour alone (uncertainty markers use icon + text label + underline style).
- Audio controls: large play/pause, ±10 s skip, 0.75× speed; keyboard operable; visible focus.
- Captions-like experience: the transcript *is* the text alternative for audio; segments highlight during playback.
- Motion minimal; respects `prefers-reduced-motion`.
- Timeouts: no session-critical timeouts during consent or review; drafts saved locally.
- Language attributes: `lang="xh"` / `lang="en"` set on content so screen readers switch pronunciation where supported.

## 5. Low-bandwidth considerations

- PWA with service worker caching of the app shell and static copy (not story content).
- Story content never cached in the service worker or Cache Storage beyond the session (privacy on shared devices). Local recording buffers are encrypted-at-rest by the browser only — treat shared devices as a risk and offer "Remove from this phone" after upload.
- Images avoided; icons as inline SVG.
- Polling uses exponential backoff (2 s → 30 s) and pauses when the tab is hidden.
- Explicit data-size warnings before large transfers.

## 6. Language and copy

- All copy keys exist in `xh` and `en`. isiXhosa copy is authored/reviewed by at least two fluent speakers (one from the Eastern Cape, one Cape Town-based) — OQ-018 tracks recruitment.
- Terms like "consent", "translation", "family circle" get agreed isiXhosa renderings captured in a copy glossary.
- Copy is tested aloud with elders during usability sessions.

## 7. Validating the interface with real users

| Stage | Method | Participants | Exit criteria |
|---|---|---|---|
| Phase 0 discovery | Semi-structured interviews (no product pitch) | 8–12 families incl. ≥ 6 elders | Documented needs, fears, family decision patterns, consent norms |
| Pre-M2 | Paper/clickable prototype of consent flow, read aloud | 5 elders + 5 family members | Comprehension ≥ 4/5 on key points; no confusing step left untested |
| M5/M6 | Moderated usability of review screens | 5 reviewers | Task success without help ≥ 4/5 |
| R1 pilot | Diary + follow-up interviews | 5–10 families | Pilot metrics in `PRD.md` §6 |

Ethics: participants are compensated fairly for their time, give informed consent for the research itself, and research recordings are kept separate from product data. Discovery is for learning, not selling.
