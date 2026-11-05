# M0 Cloudinary spike

This throwaway experiment tests the configured Cloudinary product environment
for OQ-002, OQ-003, OQ-004, and OQ-010. It is never imported by application
code.

The test generates a synthetic silent WAV, uploads it as an authenticated
Cloudinary `video` asset, exercises chunk resume with a refreshed signature,
checks an eager low-bitrate MP3 derivative, performs an authenticated Range
request, inspects account usage/configuration, and deletes the synthetic asset
and any derived resources. It logs only account metadata, asset IDs, sizes,
HTTP statuses, and outcomes.

## Prerequisites

- Node.js 22 or newer
- A Cloudinary account configured in the repository `.env.local`:
  `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET`
- Permission to create and delete synthetic assets in that account

Install and run from this directory:

```sh
npm install
set -a
source ../../.env.local
set +a
npm test
```

The test uses a unique `eoh/m0-spike/<run-id>` public ID and cleans up in a
`finally` block. Do not run it against an account containing irreplaceable
production assets without reviewing the generated prefix and cleanup behavior.
