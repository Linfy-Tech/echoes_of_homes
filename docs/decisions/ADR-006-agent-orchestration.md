# ADR-006: Deterministic pipeline; no agent framework in Release 1

- **Status:** Proposed
- **Date:** 2026-11-04

## Context
The concept describes six roles (Guardian, Listener, Cultural Context Assistant, Translator, Verifier, Story Publisher). The OpenAI Agents SDK for TypeScript (`@openai/agents`, MIT, Node 22+) offers guardrails, tool approvals (`needsApproval`), interruptions, and resumable serialised run state **[S5][S6]**. OpenAI's data-controls page lists "Agents" among endpoints not eligible for Zero Data Retention **[S4]** (applicability to the SDK's calls UNVERIFIED). Our steps have fixed order and typed I/O; security-critical decisions must be deterministic.

## Options
1. Agents SDK orchestrating the whole workflow with handoffs.
2. Agents SDK for selected interactive helpers only.
3. **Deterministic job pipeline with structured model calls per role.**

## Decision
Option 3 for R1. Guardian and Story Publisher are pure code. Listener, Context Assistant, Translator, Verifier are typed modules making single structured model calls validated by Zod; ordering, retries, cancellation, approvals, and resumability come from the state machines and the durable job queue.

## Consequences
- Predictable cost/latency, full provenance, small injection surface, simple testing.
- We forgo agent conveniences; acceptable because no R1 step needs autonomous planning or tool selection.

## Revisit when
An interactive reviewer helper (R2+) needs multi-turn tool use — then evaluate option 2 with tracing disabled or self-hosted and ZDR applicability confirmed (OQ-007).
