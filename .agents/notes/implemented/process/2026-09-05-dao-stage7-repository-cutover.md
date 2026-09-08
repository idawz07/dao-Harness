# Agent Note: Stage 7 repository cutover constants and bootstrap renames

Status: implemented

## Problem

After the Dao rebrand, every `package.json` `repository.url` and the workspace constraint scripts still pointed at the upstream DeepSeek Harness home (via split-fragment encoding so Stage-3 residue scans stayed clean). Product-owned bootstrap tokens also still used the `__dsh_*` prefix (`__dsh_main__`, persistent-bash status, webserver invariant probes). Stage 7 owns rewriting those to the new private home and Dao naming before snapshot re-record and the `daoAI/dao` remote cutover.

## Decision

1. Set every workspace `package.json` `repository.url` to `git+https://github.com/daoAI/dao.git`.
2. Replace the split-fragment `upstreamBrand` constants used for **package.json** URLs in `scripts/check-workspace-constraints.ts` with direct `daoAI/dao`. Keep split encoding only for the retired legacy SDK reject string in `verify-public-repository-links` so residue scans stay clean.
3. Rename product-owned `__dsh_*` bootstrap tokens to `__dao_*` in code-runtime, persistent bash, and webserver invariant probes; keep upstream wire names such as pi-ai `thinkingFormat: 'deepseek'` and experimental `BUILTIN_PROVIDER_IDS` entries that are not product identity.

Snapshot re-record (`test:snapshot:record`), the full local gate suite, and creating/pushing the private `daoAI/dao` repository remain the remaining Stage 7 exit steps — they need the farm router key and GitHub `gh` auth against the `daoAI` org.

## Alternatives considered

- **Leave package.json URLs on upstream until the new repo exists** — rejected: Stage 7 already owns the URL rewrite; constraints would disagree with manifests once the repo lands.
- **Rename pi-ai `thinkingFormat: 'deepseek'`** — rejected: upstream wire-format name, KEEP per the Stage 3 handoff.

## Consequences

Local clones still have `origin` on `deepseek-ai/deepseek-harness` until the private repo is created and remotes are flipped. Generated website `.dist` / `.generated` trees may still mention old URLs until `website:build` regenerates them. Frozen archived Agent Notes are untouched.

## Required verification

- `tsx scripts/check-workspace-constraints.ts`
- `tsx scripts/verify-public-repository-links.ts`
- `vitest run scripts/verify-public-repository-links.spec.ts`
- Remaining Stage 7 exit: `pnpm run test:snapshot:record` → `test:snapshot` / `test:expected`, full suite, `gh repo create daoAI/dao --private` + remotes.
