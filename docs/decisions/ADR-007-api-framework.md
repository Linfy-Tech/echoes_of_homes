# ADR-007: Fastify (with Zod) for the API

- **Status:** Proposed
- **Date:** 2026-11-04

## Context
Requirements: TypeScript; strict schema validation shared with web and worker; generated OpenAPI; fine control of hooks (sessions, CSRF, rate limits, correlation); Range streaming; small team.

## Options
| | Fastify | NestJS |
|---|---|---|
| Model | Lightweight, plugin + hook based | Opinionated framework with DI, modules, decorators (can run on Fastify or Express) |
| Schema validation | First-class route schemas; Zod via type provider | Class-validator/DTO by default; Zod possible with extra glue |
| Learning/boilerplate | Low | Higher; more structure out of the box |
| Testability | `inject()` without network | Good, via testing module |
| Fit for AI-assisted coding | Explicit, little magic | Decorators/DI can hide control flow |

## Decision
Fastify + a Zod type provider; OpenAPI 3.1 generated from Zod schemas; domain services as plain functions shared with the worker. Structure (routes → domain services → repositories) is enforced by convention and lint rules rather than a DI container.

## Consequences
We write a little more structure ourselves; we gain explicit, testable request handling. Specific library versions (type provider, OpenAPI generator, rate-limit plugin) are verified for maintenance and licence in M1.

## Revisit when
Team grows substantially and wants framework-enforced modularity.
