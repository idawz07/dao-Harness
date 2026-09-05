# Agent Note: Farm-backed real-API e2e (self-skip, no public LLM CI)

Status: implemented

## Problem

The harness leans hard on real-API tests by policy: [docs/testing.md](../../../../docs/testing.md) argues that a no-key suite proves the plumbing but not the product, and the [ACP inject postmortem](../../../../docs/postmortem/0001-acp-default-export-drops-inject.md) is the standing proof — 178 keyless tests stayed green while a real ACP client session crashed instantly. The real-API e2e suite (`pnpm run test:e2e`, the `*.e2e.ts` files) exists to close that gap: it drives the agent against a live model — real model calls, real tools, multi-turn, resume, ACP-over-stdio.

Dao has no public LLM API. The sole backend is the owner's local llama-router farm ([farm default route](../architecture/2026-08-29-local-llama-router-farm-default-route.md)). A secret-bearing GitHub Actions workflow against an external vendor API is therefore the wrong merge signal: it would invent a public dependency the product does not have.

## Decision

Farm-backed e2e runs locally (and optionally on a private runner with Tailscale reachability) against the resident llama-router. The suite self-skips when the router is unreachable (`DAO_FARM_REACHABLE` from `vitest.e2e.config.ts`), so offline and public CI stay green without a false "covered" claim. There is no separate secret-bearing `e2e.yml` workflow and no `DEEPSEEK_*` / public-API secret in CI.

Keyless CI ([.github/workflows/ci.yml](../../../../.github/workflows/ci.yml)) remains the forkable merge gate. Real-model coverage is an owner-local (or private-farm) signal, not a public Actions check.

### Self-skip, never false-green on missing farm

When the farm is expected (owner machine, private runner), an empty or unreachable router must not silently pass the real suites as skipped without the operator noticing. Locally, operators run `pnpm run test:e2e` with the farm up and treat skips as "farm down," not as coverage. CI without Tailscale to the farm correctly skips — that is intentional, not a missing-secret false green against a public key.

### Credential names

Farm routes read `LLAMA_ROUTER_API_KEY` and per-card `QWEN38_*_API_KEY` from the environment or repo-root `.env`. Those keys never ship as public Actions secrets for a vendor API.

## Alternatives considered

- **A secret-bearing public-API workflow** — rejected: Dao has no public LLM API; the farm is private.
- **Requiring farm reachability in public CI** — rejected: forks and hosted runners lack Tailscale to the owner's farm; keyless CI must stay forkable.

## Consequences

Real-model e2e is an owner-local / private-farm duty. Keyless CI never claims farm coverage. Operators who need the merge-blocking real-model signal run `pnpm run test:e2e` with the farm reachable before release, matching the [testing policy](../../../../docs/testing.md) farm-backed lane.
