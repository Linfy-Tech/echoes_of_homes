# packages/validation

Zod schemas for API requests/responses, environment config, provider-response normalisation, and AI role outputs re-exported for the API contract. Source of truth for the generated OpenAPI document.

Rules: object schemas are `.strict()` for request bodies; string length limits everywhere; IDs validated as UUIDs; no schema accepts `audience` on story creation or `share_public`/`model_training` scopes in R1.
