# M0 Cloudinary spike report

## Test scope

- SDK: Cloudinary Node SDK `2.11.0`
- Account: configured by `.env.local` (`CLOUDINARY_CLOUD_NAME`); usage reports
  the account plan as `Free`
- Asset scope: synthetic silent WAV only, under `eoh/m0-spike/<run-id>/`
- Account operations: synthetic chunked upload, resume, eager derivative,
  authenticated Range delivery, deletion, and backup-version cleanup

The spike did not modify `apps/`, `packages/`, `workers/`, or ADR-003.

## Evidence

Command:

```sh
set -a; source ../../.env.local; set +a
CLOUDINARY_RESUME_GAP_MS=180000 npm test
```

The first run with the previous credential returned this body on the resumed
chunk:

```text
HTTP 403
Request forbidden due to missing permissions (actions=["create"])
```

This is an API-key authorization result, not a Cloudinary chunk-protocol or
file-size result: the first chunk using the same signed upload shape returned
`200`/`done=false`, and the same test with the updated credential completed
successfully. Cloudinary documents that product-environment API keys can be
role-restricted and that Enterprise custom roles can restrict specific Upload
and Admin API methods ([API key credentials and roles](https://cloudinary.com/documentation/developer_onboarding_faq_find_credentials)).

Observed output from the updated-credential run with a three-minute interruption:

```text
account: cloud=ei1xkdjl, plan=not-reported, region=not-reported
usage: plan=Free, tier=not-reported, storage_bytes=0, credits_used=0.02
upload response: status=200
chunk 1: done=false, bytes=6000000
resume gap: interrupted_at=2026-11-05T01:28:41.266Z, resume_attempt_at=2026-11-05T01:31:41.261Z, elapsed_ms=179995
upload response: status=200
chunk resume: done=true, bytes=12000000
eager derivative: count=1, format=mp3
authenticated range: status=206, bytes=1024
destroy: result=ok
derived delete: result=deleted
backup delete: version_ids=1
cleanup: matching assets=0
```

The updated credential accepted the first chunk, then accepted the resumed
final chunk using the same `X-Unique-Upload-Id` and a newly signed timestamp.
The authenticated Range request and eager derivative both worked. The original
was destroyed successfully, and the eager derivative required explicit
deletion. The deleted original exposed one API-visible backup version; the SDK
Admin API deleted that version, and cleanup verified zero matching assets. A
subsequent short validation run reproduced the same result with
`backup delete: version_ids=1` and `cleanup: matching assets=0`.

## OQ-010 corrected validation

After removing the swallowed error handler around the deleted-resource lookup,
the focused rerun produced:

```text
destroy: result=ok
derived delete: result=deleted
backup delete: version_ids=1
cleanup: matching assets=0
```

The `api.resource(..., versions: true)` query now fails the test if Cloudinary
returns an error; it does not fall back to the pre-delete resource object.

## Open-question outcomes

| OQ | Status | Evidence / decision |
|---|---|---|
| OQ-002 | **Still-open** | `api.config()` returned no region. Storage/processing region and at-rest encryption require Cloudinary account-console evidence or vendor confirmation; no residency claim is made. |
| OQ-003 | **Resolved-with-fallback** | The Admin API usage endpoint reports `plan=Free` (no separate `tier` field). Authenticated upload, eager MP3 generation, and proxy-compatible Range delivery work. Token-based delivery and higher-tier features remain unselected/unverified; retain the ADR-003 API streaming proxy fallback. |
| OQ-004 | **Resolved-with-fallback** | The updated credential resumed the final chunk after an actual `179995 ms` (approximately 3-minute) gap using the same upload ID and a refreshed signature. The documented fallback remains: restart from locally retained data if a future account/provider configuration cannot resume; an hours-long gap was not tested. |
| OQ-010 | **Still-open, with partial evidence** | `destroy` returned `ok`, but the eager derivative required explicit deletion (`deleted`), proving explicit derived cleanup is required. One backup version was API-visible and deleted successfully; reserved-public-ID behavior after backup deletion and account-console backup settings remain unverified. |

Cleanup verification found zero authenticated video assets under the spike
prefix after each run. Temporary local WAV files were removed by the test's
`finally` block.
