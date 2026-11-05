# Vision

## The problem

Across South Africa, family histories, migrations, clan lineages, praise poetry (*izibongo*), and everyday memories live in spoken form — often only in the memories of elders. When elders pass on, those stories go with them. Families who try to record them face real barriers:

- Recording is easy; **keeping** recordings safe, findable, and understandable is not. Voice notes scatter across phones and messaging apps.
- Younger family members may not be fluent in isiXhosa; older storytellers may not be comfortable in English. A story that cannot be understood across generations is only half-preserved.
- Generic AI transcription and translation tools are weakest exactly where these stories are richest: isiXhosa speech, regional variation, code-switching, names, clan names, praise names, idioms.
- Consumer tools rarely give storytellers real control. Recordings get forwarded, posted, or fed into systems the storyteller never agreed to.

> **Evidence status:** The problem statement above is a hypothesis based on the founder's context and general knowledge. It has **not** yet been validated through structured customer discovery. `docs/ROADMAP.md` Phase 0 includes discovery interviews with families and elders before the first pilot.

## The vision

A family can sit with their grandmother, record her telling the story of how the family came to Cape Town, and know that:

1. Her voice is kept exactly as she spoke it.
2. The isiXhosa transcript is checked by someone who understands her, with unclear parts marked honestly rather than guessed.
3. The English translation is faithful, keeps her names and expressions, and never claims more certainty than it has.
4. Nobody sees or hears the story unless she (or the person she trusts with her stories) said they may.
5. She can change her mind later.

## Who it is for

- **Storytellers** — often elders — whose stories, voice, and decisions are at the centre.
- **Families** who want to preserve and pass on their histories.
- **Reviewers** — fluent family members or trusted community volunteers — who verify transcripts and translations.
- Later: community organisations, schools, heritage projects, and researchers — **only** with explicit, separate permission.

## What success looks like

| Horizon | Signal of success |
|---|---|
| Pilot (Release 1) | 5–10 families complete the full trust workflow end-to-end; storytellers report understanding what they consented to; reviewers can correct transcripts without technical help; no privacy incidents. |
| Year 1 | Families return to add stories; review time per minute of audio falls as language quality improves; elders and families describe the product as respectful. |
| Long term | A trusted, family-controlled archive for African-language oral histories, extensible to other South African languages, with community and institutional partners who share the same consent-first principles. |

## What it is not

- Not a social network or a public content platform. Public sharing is a carefully gated, later capability.
- Not a generic transcription tool. The trust workflow — consent, review, approval, controlled sharing — *is* the product.
- Not a voice-cloning, voice-synthesis, or "talk to grandma" product. Ever.
- Not a data source for training AI models without separate, explicit, revocable consent.
- Not an authority on cultural meaning. The system helps people record meaning; it does not invent it.

## Principles (non-negotiable)

1. Preserve the original audio and language. The original recording is the source of truth.
2. Never silently replace uncertain speech with a confident guess.
3. Separate transcript correction from translation; translate only approved transcripts.
4. Private is the default. Never share or publish without explicit permission.
5. Make uncertainty, provenance, and human review visible.
6. Do not invent cultural meaning, family relationships, praise names, clan names, places, or historical facts.
7. Never clone or synthesise a person's voice.
8. Never train models on submitted stories without separate, explicit consent.
9. Security, access control, consent enforcement, and deletion live in deterministic code — never in an AI's judgment.
10. Build for reliability, maintainability, and measurable quality — not just a compelling demo.
