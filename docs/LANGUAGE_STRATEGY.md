# Language Strategy — isiXhosa first

**Position:** isiXhosa speech recognition and translation quality is the **largest product risk**. We treat language quality as something to measure and improve with fluent people, not something a model provides out of the box. Nothing in this document is a claim about any model's quality on our data — no benchmark has been run yet.

> Linguistic statements below are general considerations for system design. They must be validated with fluent isiXhosa speakers and, ideally, a linguist (OQ-018) before being encoded as rules.

## 1. Why isiXhosa is hard for ASR and translation

| Characteristic | Impact | Design response |
|---|---|---|
| **Conjunctive orthography / agglutinative morphology** — many morphemes written as one word | Word error rate (WER) is inflated: one wrong morpheme = whole word wrong | Use **CER** as a primary metric alongside WER (`ASR_BENCHMARK.md`) |
| **Click consonants** (written c, q, x and combinations) | Acoustic confusions between click types; spelling errors | Reviewer UI makes spelling correction fast; benchmark tracks click-letter confusions |
| **Tone not marked in standard orthography** | Homographs; translation ambiguity | Translator receives neighbouring context; reviewers check meaning |
| **Regional varieties** (e.g. varieties associated with Gcaleka, Ngqika, Thembu, Mpondomise, Bhaca, Hlubi communities — list to validate) and **urban Cape Town speech** | Vocabulary and pronunciation differ; models trained on read speech may struggle | Evaluation set stratified by variety; dialect words preserved, not "standardised" |
| **Code-switching** with English (and Afrikaans in the Western Cape) | Language-ID errors; mixed-script expectations | Language hints for xh + en; `code_switch` flags informational; reviewers keep words as spoken |
| **Oral storytelling style** — long turns, repetition, call-and-response, interruptions, laughter, singing, praise poetry recitation | Segmentation and hallucination risks; poetry recited rapidly | Silence-based segmentation; hallucination heuristics; reviewers can mark segments; praise poetry flagged for special care |
| **Older voices, home recording conditions** (TV, children, wind, phone mics) | Higher error rates | Recording tips; evaluation stratified by condition; uncertainty flags |
| **Names: personal names, clan names (*iziduko*), praise names, place names** | Rare in training data; high cultural importance; errors are hurtful | Family glossary as hints; always flagged; verbatim preservation in translation |
| **Kinship terms** with meanings broader than English equivalents | Literal translation can misstate relationships | Kinship terms flagged; close translation keeps the isiXhosa term with human-written gloss only |
| **Respect/avoidance language** (*hlonipha*) and honorific address | Vocabulary substitutions; register matters | Do not normalise; flag unfamiliar words; reviewers decide |
| **Idioms and proverbs** (*amaqhalo*/*izaci* — terms to validate) | Literal translation loses meaning; natural translation may over-interpret | Two variants: close + natural; no model-written cultural explanations |

## 2. Orthography and normalisation policy

- Reviewers write in **standard isiXhosa orthography** for general words, but **preserve dialect words, names, and the storyteller's own forms** as spoken.
- System normalisation is limited to whitespace and documented punctuation rules (FR-ASR-03). No automatic spelling correction.
- For evaluation, a documented normalisation (lowercasing, punctuation removal, Unicode NFC, hyphen policy) is applied identically to references and hypotheses (`ASR_BENCHMARK.md` §5).
- A **copy glossary** (UI terms) and **family glossaries** (names/terms) are separate.

## 3. Representing uncertainty

- Uncertainty is first-class data (`uncertainty_flags`) with reason codes (FR-UNC-01), spans, and source.
- The UI never displays a guess as fact: model suggestions appear as "Possible: …" and require a human action.
- Accepted uncertainty remains visible in the final story and the translation ("[unclear in the original]").
- Confidence numbers are provider-specific and are never shown raw to users; they are converted into flags using thresholds calibrated per provider/model (`AI_EVALUATION.md` §4).

## 4. Literal vs culturally appropriate translation

- **Close translation:** stays near the isiXhosa structure; keeps culturally significant terms in isiXhosa; useful for family members learning the language and for faithful archiving.
- **Natural translation:** reads as fluent English for younger relatives; must not add meaning, explanations, or "smoothing" that changes facts.
- Explanations of cultural terms come **only** from human-written glossary entries, attributed to who wrote them.
- Praise poetry and clan praises: translation is optional per segment; the rights holder may choose "keep in isiXhosa only" for such segments (R2 option; R1: reviewer can mark translation segments as "keep original" by editing both variants to the isiXhosa text with a note — to validate with users).

## 5. Human correction loop

1. Machine transcript → reviewer corrections → approved transcript (per story).
2. On approval, the system computes **content-free quality metrics** (CER/WER between `machine_text` and final text, flags raised vs corrected) and stores only numbers per story/model (OQ-027 tracks whether this needs explicit consent).
3. These metrics feed model/provider monitoring dashboards and threshold recalibration.
4. **Corrections are not used to train or fine-tune models** without the separate `model_training` consent programme (not in R1). A future programme would require: separate consent, data governance, licence decisions, and community benefit terms.

## 6. People

| Role | Need | When |
|---|---|---|
| Fluent isiXhosa reviewers (Eastern Cape + Cape Town) | Consent script, UI copy, evaluation annotation | Before M2 (copy), M0 (annotation) |
| Professional or experienced isiXhosa–English translators | Reference translations, translation evaluation | M0–M6 |
| Linguist / language-community advisor | Validate this strategy, annotation guidelines, cultural handling | M0 |
| Elders and families (paid participants) | Usability and acceptability | Phase 0, M2, M5 |

## 7. Expansion to other languages (later)

Adding a language requires: consent script and UI copy by fluent humans; an evaluation set; benchmark across providers; language-specific normalisation; reviewer community. Candidate next languages (to be decided with users): isiZulu, Sesotho, Afrikaans. The data model already carries `source_language`/`target_language`.
