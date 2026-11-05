# M0 Cloudinary spike report

## Test scope

- SDK: Cloudinary Node SDK `2.11.0`
- Account: configured by `.env.local` (`CLOUDINARY_CLOUD_NAME`); exact tier was
  not reported by the tested Admin API credential
- Asset scope: synthetic silent WAV only, under `eoh/m0-spike/<run-id>/`
- Account operations: one partial chunk upload attempt per run; cleanup checked
  with an authenticated-resource prefix listing

The spike did not modify `apps/`, `packages/`, `workers/`, or ADR-003.

## Evidence

Command:

```sh
set -a; source ../../.env.local; set +a
npm test
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

Observed output from the updated-credential run:

```text
account: cloud=ei1xkdjl, plan=not-reported, region=not-reported
usage: storage_bytes=0, credits_used=0
upload response: status=200
chunk 1: done=false, bytes=6000000
upload response: status=200
chunk resume: done=true, bytes=12000000
eager derivative: count=1, format=mp3
authenticated range: status=206, bytes=1024
destroy: result=ok
derived delete: result=deleted
cleanup: matching assets=0
backup delete: no API-visible backup versions; account backup behavior requires console/vendor confirmation
remaining_spike_assets=0
```

The updated credential accepted the first chunk, then accepted the resumed
final chunk using the same `X-Unique-Upload-Id` and a newly signed timestamp.
The authenticated Range request and eager derivative both worked. The original
was destroyed successfully, and the eager derivative required explicit
deletion; cleanup verified zero matching assets.

## Open-question outcomes

| OQ | Status | Evidence / decision |
|---|---|---|
| OQ-002 | **Still-open** | `api.config()` returned no region. Storage/processing region and at-rest encryption require Cloudinary account-console evidence or vendor confirmation; no residency claim is made. |
| OQ-003 | **Still-open** | Usage is now readable, but the tested API still does not report the plan tier or feature matrix. Authenticated upload and eager MP3 generation work; token delivery, plan limits, and backup settings still require console/vendor confirmation. |
| OQ-004 | **Resolved, with fallback retained** | The updated credential resumed the final chunk with the same upload ID and a refreshed signature (`done=true`). The documented fallback remains: restart from locally retained data if a future account/provider configuration cannot resume. |
| OQ-010 | **Still-open, with derived cleanup resolved** | `destroy` returned `ok`, but the eager derivative then required explicit deletion (`deleted`), proving the deletion pipeline must delete derivatives explicitly. No API-visible backup versions were present, so backup-version deletion and reserved-public-ID behavior still require account/vendor evidence. |

Cleanup verification found zero authenticated video assets under the spike
prefix after each run. Temporary local WAV files were removed by the test's
`finally` block.
