/**
 * Rebrand this repository from DeepSeek Harness to Dao: the `@deepseek-ai`
 * scope becomes `@daoai`, the `dsh` product token becomes `dao` in every
 * position (package names, the `dsh` manifest section and bin, `DSH_*`
 * environment variables, camelCase and PascalCase identifiers, CSS custom
 * properties, the `.dsh` home directory), the `deepseek-harness-*` product
 * distribution names become `dao-*`, and "DeepSeek Harness" prose becomes
 * "Dao".
 *
 * The pass rewrites content only. Every file or directory whose NAME carries
 * the old token is renamed with `git mv` (see RENAMES) before `--check`
 * passes; nothing here moves files.
 *
 * What the pass deliberately leaves alone:
 * - `.agents/notes/archived/**` (frozen by note policy) and `LICENSE` and
 *   the vendor package LICENSE files (upstream provenance).
 * - `snapshots/**` (recorded expected outputs, re-recorded at the final
 *   stage) and both lockfiles (`pnpm install` and `uv lock` regenerate them).
 * - Generated catalogs and notices (the `gen-*` family regenerates them;
 *   hand-editing a generated file is how drift gets committed).
 * - `.i18n.yaml` pairing records (re-recorded by
 *   `pnpm run verify-translation-pairing --write` after the prose changes).
 * - The DeepSeek API-layer surface: `DEEPSEEK_*` variables, the
 *   `x-deepseek-harness-*` wire headers, `deepseek-v4-*` model ids, and the
 *   upstream repository URLs in `repository.url` fields and prose links are
 *   removed by a later stage, not renamed.
 * - `scripts/rescope-vendor.ts` is rewritten by the same token rules, so the
 *   vendored-framework rescope keeps asserting the post-rebrand tree.
 *
 * Usage: `pnpm run rebrand-dao [--apply|--check]`. Without a mode it reports
 * what would change. `--check` asserts the post-state: no residue, every
 * rename landed, every postcondition holds, and a second `--apply` would be
 * a no-op.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(import.meta.dirname, '..')

/** One substitution, in application order. Longer tokens must come first. */
interface Rule {
  readonly id: string
  readonly find: string | RegExp
  readonly replace: string
  /** Used only with a RegExp find: computes one replacement per match. */
  readonly replaceFn?: (match: string, ...groups: string[]) => string
  readonly note: string
}

const STATIC_RULES: readonly Rule[] = [
  // Scoped package names: `@deepseek-ai/dsh-*` → `@daoai/dao-*`.
  { id: 'scoped-dsh-dash', find: '@deepseek-ai/dsh-', replace: '@daoai/dao-', note: 'scoped dsh-* package names' },
  // The CLI package itself, exactly. The previous rule consumed every dash
  // continuation, so what remains is the bare name in quotes.
  { id: 'scoped-dsh-exact', find: '@deepseek-ai/dsh', replace: '@daoai/dao', note: 'scoped CLI package name' },
  // Remaining scoped names (vendored framework, website, native addons) and
  // every prose mention of the scope.
  { id: 'scoped-rest', find: '@deepseek-ai', replace: '@daoai', note: 'remaining scoped names and scope prose' },
  // `deepseek-harness-*` product distribution and wire-identity names. The
  // `x-deepseek-harness-*` DeepSeek wire headers are deliberately absent:
  // they belong to the API layer a later stage removes.
  { id: 'dist-acp-test-client', find: 'deepseek-harness-acp-test-client', replace: 'dao-acp-test-client', note: 'ACP test-client name' },
  { id: 'dist-sdk-runtime', find: 'deepseek-harness-sdk-runtime', replace: 'dao-sdk-runtime', note: 'Python runtime executable name' },
  { id: 'dist-subagent-acp', find: 'deepseek-harness-subagent-acp', replace: 'dao-subagent-acp', note: 'subagent ACP client name' },
  { id: 'dist-runtime-bin', find: 'deepseek-harness-runtime-bin', replace: 'dao-runtime-bin', note: 'Python runtime wheel name' },
  { id: 'dist-py-module-runtime', find: 'deepseek_harness_runtime', replace: 'dao_runtime', note: 'Python runtime module name' },
  { id: 'dist-runtime', find: 'deepseek-harness-runtime', replace: 'dao-runtime', note: 'Python runtime data file name' },
  { id: 'dist-acp', find: 'deepseek-harness-acp', replace: 'dao-acp', note: 'ACP agent name' },
  { id: 'dist-sdk', find: 'deepseek-harness-sdk', replace: 'dao-sdk', note: 'Python SDK distribution name' },
  { id: 'dist-py-module', find: 'deepseek_harness', replace: 'dao', note: 'Python SDK module name' },
  // The headless test fixture renamed by the plan.
  { id: 'fixture-defaults', find: 'deepseek-defaults', replace: 'dao-defaults', note: 'dao-defaults fixture' },
  // Environment variables and the standalone uppercase token.
  { id: 'env-prefix', find: 'DSH_', replace: 'DAO_', note: 'DSH_* environment variables' },
  { id: 'env-bare', find: /\bDSH\b/g, replace: 'DAO', note: 'standalone DSH' },
  // Identifier families. The bare rule cannot see inside these, so it runs
  // after both. Every regex is global: `replace` without `g` would stop at
  // the first occurrence.
  { id: 'camel', find: /\bdsh([A-Z][A-Za-z0-9]*)/g, replace: 'dao$1', note: 'camelCase dsh* identifiers' },
  { id: 'pascal', find: /\bDsh([A-Z][A-Za-z0-9]*)/g, replace: 'Dao$1', note: 'PascalCase Dsh* identifiers' },
  // The product token in every remaining position: the `dsh` bin and
  // manifest section, `--dsh-*` custom properties, `.dsh` paths, directory
  // and file references, shell and CI invocations, and the unscoped Python
  // closure package `dsh-python-runtime-closure`. `dshunknown` (a test's
  // made-up unknown git-config key) has no boundary after `dsh`, so it
  // survives.
  { id: 'bare', find: /\bdsh\b/g, replace: 'dao', note: 'bare dsh token' },
  // Prose. Both casings map to the product name.
  { id: 'prose-title', find: 'DeepSeek Harness', replace: 'Dao', note: 'product name in prose' },
  { id: 'prose-lower', find: 'deepseek harness', replace: 'Dao', note: 'lowercase product name in prose' },
  // Config-catalog section anchors: package READMEs link the catalog section
  // of their package through a GitHub slug of the package name. The slug of
  // `@daoai/dao-<tail>` is recomputed, not spliced, because the old slugs
  // drop the scope and tail boundaries.
  {
    id: 'css-virtual-prefixes',
    find: "'\\0dsh-css:'",
    replace: "'\\0dao-css:'",
    note: 'client CSS virtual module id',
  },
  {
    id: 'css-virtual-prefixes',
    find: "'\\0dsh-global-css:'",
    replace: "'\\0dao-global-css:'",
    note: 'client global CSS virtual module id',
  },
  {
    id: 'css-virtual-prefixes',
    find: "'\\0dsh-inline-css:'",
    replace: "'\\0dao-inline-css:'",
    note: 'client inline CSS virtual module id',
  },
  {
    id: 'catalog-anchors',
    find: /#deepseek-aidsh-([a-z0-9-]*)/g,
    replace: '',
    replaceFn: (_match: string, tail: string) => `#${githubSlug(`@daoai/dao-${tail}`)}`,
    note: 'config-catalog section anchors',
  },
]

/** GitHub heading-slug algorithm, mirroring `scripts/verify-md-links.ts`. */
function githubSlug(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9 -]/g, '').replace(/ /g, '-')
}

/**
 * Restorations for frozen archived-note references. Archived note files keep
 * their original spellings, so an `archived/<kind>/<name>` reference in a
 * living file must keep its pre-rebrand name: the bare pass rewrites the
 * `dsh` in the reference, and these rules restore the on-disk name. The table
 * is derived from the frozen tree, so a new archived note needs no edit here.
 */
function archivedReferenceRestorations(): readonly Rule[] {
  const dir = resolve(root, '.agents/notes/archived')
  const rules: Rule[] = []
  for (const kind of readdirSync(dir).sort()) {
    const kindDir = join(dir, kind)
    if (!statSync(kindDir).isDirectory()) continue
    for (const entry of readdirSync(kindDir).sort()) {
      // Only the bare `dsh` token can occur in a `YYYY-MM-DD-<slug>` note
      // filename; every other rule needs a character class the slug forbids.
      if (!entry.includes('dsh')) continue
      const renamed = entry.replace(/\bdsh\b/g, 'dao')
      if (renamed === entry) continue
      rules.push({
        id: `archived-${renamed}`,
        find: `archived/${kind}/${renamed}`,
        replace: `archived/${kind}/${entry}`,
        note: 'frozen archived-note reference',
      })
    }
  }
  return rules
}

/** The full pass: the static mapping plus the frozen-reference restorations. */
const RULES: readonly Rule[] = [...STATIC_RULES, ...archivedReferenceRestorations()]

/** A file or directory rename the pass expects to have happened by `--check`. */
interface Rename {
  readonly from: string
  readonly to: string
}

const RENAMES: readonly Rename[] = [
  // Skill directories, one per `dsh-*` skill.
  { from: '.agents/skills/dsh-archive-agent-notes', to: '.agents/skills/dao-archive-agent-notes' },
  { from: '.agents/skills/dsh-code-review', to: '.agents/skills/dao-code-review' },
  { from: '.agents/skills/dsh-doc', to: '.agents/skills/dao-doc' },
  { from: '.agents/skills/dsh-find-simplifications', to: '.agents/skills/dao-find-simplifications' },
  { from: '.agents/skills/dsh-merging-stacked-prs', to: '.agents/skills/dao-merging-stacked-prs' },
  { from: '.agents/skills/dsh-pre-push-checks', to: '.agents/skills/dao-pre-push-checks' },
  { from: '.agents/skills/dsh-prose-standard', to: '.agents/skills/dao-prose-standard' },
  { from: '.agents/skills/dsh-translate-docs', to: '.agents/skills/dao-translate-docs' },
  { from: '.agents/skills/dsh-trim-cot-leakage', to: '.agents/skills/dao-trim-cot-leakage' },
  // The CLI badge e2e and its fixture directory.
  { from: 'apps/cli/tests/dsh-badge.expected.e2e.ts', to: 'apps/cli/tests/dao-badge.expected.e2e.ts' },
  { from: 'apps/cli/tests/fixtures/dsh-badge', to: 'apps/cli/tests/fixtures/dao-badge' },
  // The shipped skill-badge asset.
  { from: 'packages/skill/skill-badge/assets/dsh-badge.md', to: 'packages/skill/skill-badge/assets/dao-badge.md' },
  { from: 'packages/skill/skill-badge/assets/dsh-badge.png', to: 'packages/skill/skill-badge/assets/dao-badge.png' },
  // The out-of-process SDK subagent package directory.
  { from: 'packages/subagent/subagent-dsh-sdk', to: 'packages/subagent/subagent-dao-sdk' },
  // The Python module trees and the runtime data file inside them.
  { from: 'python/sdk/src/deepseek_harness', to: 'python/sdk/src/dao' },
  { from: 'python/sdk-runtime/src/deepseek_harness_runtime', to: 'python/sdk-runtime/src/dao_runtime' },
  { from: 'python/sdk-runtime/src/dao_runtime/deepseek-harness-runtime.json', to: 'python/sdk-runtime/src/dao_runtime/dao-runtime.json' },
  // The cookbook page pair and its pairing record.
  { from: 'docs/cookbook/maintaining-dsh-code-review.md', to: 'docs/cookbook/maintaining-dao-code-review.md' },
  { from: 'docs/cookbook/maintaining-dsh-code-review.zh.md', to: 'docs/cookbook/maintaining-dao-code-review.zh.md' },
  { from: 'docs/cookbook/maintaining-dsh-code-review.i18n.yaml', to: 'docs/cookbook/maintaining-dao-code-review.i18n.yaml' },
  // The license-verification script and its spec.
  { from: 'scripts/verify-dsh-package-licenses.ts', to: 'scripts/verify-dao-package-licenses.ts' },
  { from: 'scripts/verify-dsh-package-licenses.spec.ts', to: 'scripts/verify-dao-package-licenses.spec.ts' },
  // The headless fixture the plan renames to dao-defaults.
  { from: 'apps/cli/tests/profiles/headless/tests/fixtures/deepseek-defaults.cordis.yml', to: 'apps/cli/tests/profiles/headless/tests/fixtures/dao-defaults.cordis.yml' },
  // The recorded VFS fixture directory whose projectKey is `dsh-workspace`.
  { from: 'packages/experimental/webworker-runtime/tests/fixtures/vfs-example/home/sessions/--dsh-workspace--', to: 'packages/experimental/webworker-runtime/tests/fixtures/vfs-example/home/sessions/--dao-workspace--' },
]

/** Files a generator owns: regenerated by the gen-* family, never hand-edited. */
const GENERATED: readonly string[] = [
  'docs/config-catalog.md',
  'docs/tool-catalog.md',
  'docs/persistence-catalog.md',
  'docs/module-graph.md',
  'docs/cordis-api/inherited.md',
  'docs/capability-seams.md',
  'docs/event-producer-consumer.md',
  'docs/agent-lifecycle.md',
  'docs/tool-execution-pipeline.md',
  'docs/graph-atlas.md',
  'apps/cli/composition.md',
  'packages/extensions/tool-cordis/src/api-catalog.ts',
  'packages/extensions/cordis-client-runner/src/client/api-catalog.ts',
  'packages/extensions/cordis-client-runner/src/client/slot-catalog.ts',
  'packages/core/session/src/known-event-types.ts',
  'packages/core/scope/src/scoped-events.generated.ts',
]

/** A string that must appear exactly `count` times once the rebrand has run. */
interface PostCondition {
  readonly file: string
  readonly text: string
  readonly count: number
}

const POSTCONDITIONS: readonly PostCondition[] = [
  { file: 'package.json', text: '"name": "@daoai/dao-root"', count: 1 },
  { file: 'apps/cli/package.json', text: '"name": "@daoai/dao"', count: 1 },
  { file: 'apps/cli/package.json', text: '"dao": "lib/bin.js"', count: 1 },
  { file: 'tsconfig.base.json', text: '"@daoai/dao-session":', count: 1 },
  { file: 'scripts/rescope-vendor.ts', text: "scoped: '@daoai/cordis'", count: 1 },
  { file: 'packages/util/home-paths/src/index.ts', text: "export const DAO_HOME_DIR_NAME = '.dao'", count: 1 },
  { file: 'python/sdk/pyproject.toml', text: 'name = "dao-sdk"', count: 1 },
  { file: 'python/sdk-runtime/pyproject.toml', text: 'name = "dao-runtime-bin"', count: 1 },
  { file: 'packages/acp/acp/src/index.ts', text: "name: 'dao-acp'", count: 2 },
  { file: 'AGENTS.md', text: '@daoScopeScan', count: 1 },
  { file: 'packages/client/tsdown.client.ts', text: "'\\0dao-css:'", count: 1 },
  { file: 'packages/client/tsdown.client.ts', text: "'\\0dao-global-css:'", count: 1 },
  { file: 'packages/client/tsdown.client.ts', text: "'\\0dao-inline-css:'", count: 1 },
]

/** Files the rebrand must never rewrite. */
function excluded(file: string): boolean {
  if (file === 'scripts/rebrand-dao.ts') return true // the mapping itself
  if (file.startsWith('.agents/notes/archived/')) return true // frozen by note policy
  if (file === 'LICENSE' || /^vendor\/[^/]+\/LICENSE$/.test(file)) return true // upstream provenance
  if (file.startsWith('snapshots/')) return true // recorded outputs, re-recorded later
  if (file === 'pnpm-lock.yaml' || file === 'python/sdk/uv.lock') return true // regenerated lockfiles
  if (file === 'THIRD_PARTY_NOTICES.md') return true // regenerated notice
  // The brand statement names the upstream product and organization on
  // purpose; it is provenance, not a rename target.
  if (file === 'BRAND_GUIDELINES.md' || file === 'BRAND_GUIDELINES.zh.md') return true
  if (file.endsWith('.i18n.yaml')) return true // pairing records, re-recorded by the pairing gate
  if (GENERATED.includes(file)) return true // generated catalogs and notices
  return false
}

/**
 * Whether a read buffer looks binary: a NUL-byte density over 1% of the
 * first 8 KiB ends the debate. A stray NUL (a test fixture embedding `\0`
 * in a string literal) does not.
 */
function isBinary(buffer: Buffer): boolean {
  const head = buffer.subarray(0, 8192)
  let nuls = 0
  for (let i = 0; i < head.length; i++) {
    if (head[i] === 0) nuls++
  }
  return nuls * 100 > head.length
}

/** Classify a changed file for the report. */
function classify(file: string): string {
  if (file.endsWith('package.json')) return 'package manifests'
  if (file.endsWith('.ts') || file.endsWith('.tsx')) return 'TypeScript source'
  if (file.endsWith('.py')) return 'Python source'
  if (file.endsWith('.json')) return 'JSON configuration'
  if (file.endsWith('.yml') || file.endsWith('.yaml')) return 'YAML configuration'
  if (file.endsWith('.md')) return 'Markdown prose'
  if (file.endsWith('.css')) return 'CSS custom properties'
  if (file.endsWith('.sh') || file.endsWith('.mjs')) return 'Shell and MJS scripts'
  return 'Other files'
}

function trackedFiles(): readonly string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(file => file !== '')
}

/**
 * One rule's hits in the current text. In check mode the pass is a residue
 * scan: any file a rule would still change carries a pre-rebrand token.
 */
function run(mode: 'dry' | 'apply' | 'check'): void {
  const files = trackedFiles().filter(file => !excluded(file))
  const ruleHits = new Map<string, number>()
  const kindCounts = new Map<string, { files: number; lines: number }>()
  const failures: string[] = []
  const residue: string[] = []

  for (const file of files) {
    const path = resolve(root, file)
    let before: string
    try {
      const stats = lstatSync(path)
      if (stats.isSymbolicLink()) {
        // The tracked content of a symlink is its target path, not the file it
        // resolves to.
        before = readlinkSync(path)
      } else {
        const buffer = readFileSync(path)
        if (isBinary(buffer)) continue
        before = buffer.toString('utf8')
      }
    } catch (error) {
      failures.push(`${file}: unreadable (${(error as Error).message})`)
      continue
    }
    let after = before
    for (const rule of RULES) {
      const hits = typeof rule.find === 'string' ? after.split(rule.find).length - 1 : (after.match(rule.find) ?? []).length
      if (hits > 0) ruleHits.set(rule.id, (ruleHits.get(rule.id) ?? 0) + hits)
      if (typeof rule.find === 'string') {
        after = after.split(rule.find).join(rule.replace)
      } else {
        after = rule.replaceFn !== undefined
          ? after.replace(rule.find, rule.replaceFn)
          : after.replace(rule.find, rule.replace)
      }
    }
    if (after === before) continue
    if (mode === 'check') residue.push(file)
    const kind = classify(file)
    const current = kindCounts.get(kind) ?? { files: 0, lines: 0 }
    kindCounts.set(kind, { files: current.files + 1, lines: current.lines + (after.split('\n').length - before.split('\n').length) })
    if (mode === 'apply') {
      if (lstatSync(path).isSymbolicLink()) {
        unlinkSync(path)
        symlinkSync(after, path)
      } else {
        writeFileSync(path, after)
      }
    }
  }

  console.log(`rebrand-dao: ${mode} over ${String(files.length)} tracked files`)
  for (const id of RULES.map(rule => rule.id)) {
    const hits = ruleHits.get(id)
    if (hits === undefined) continue
    const rule = RULES.find(candidate => candidate.id === id)
    console.log(`  ${id.padEnd(24)} ${String(hits).padStart(6)} hit(s) — ${rule?.note ?? ''}`)
  }
  for (const kind of [...kindCounts.keys()].sort()) {
    const { files: count, lines } = kindCounts.get(kind) ?? { files: 0, lines: 0 }
    console.log(`  ${kind.padEnd(24)} ${String(count).padStart(4)} file(s), ${String(lines)} line delta`)
  }

  if (mode === 'dry') return

  // Rename post-conditions: each target must exist and each source must be
  // gone. Directory entries are checked in the worktree because `git ls-files`
  // lists files only; in apply mode pending renames are reported without
  // failing the write pass, because the git mv step runs after it.
  for (const rename of RENAMES) {
    const fromExists = existsSync(resolve(root, rename.from))
    const toExists = existsSync(resolve(root, rename.to))
    if (fromExists || !toExists) {
      const message = `git mv ${rename.from} → ${rename.to}`
      if (mode === 'check') failures.push(message)
      else console.log(`  rename pending: ${message}`)
    }
  }

  /* jscpd:ignore-start */
  for (const check of POSTCONDITIONS) {
    if (mode === 'apply') continue // post-state asserts belong to --check
    const path = resolve(root, check.file)
    const hits = existsSync(path) ? readFileSync(path, 'utf8').split(check.text).length - 1 : -1
    if (hits !== check.count) {
      failures.push(`postcondition: ${check.file} has ${String(hits)} occurrence(s) of ${JSON.stringify(check.text)}, expected ${String(check.count)}`)
    }
  }
  /* jscpd:ignore-end */

  if (residue.length > 0) {
    for (const file of residue) failures.push(`residue: ${file} still carries a pre-rebrand token`)
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`rebrand-dao: ${failure}`)
    console.error(`rebrand-dao: ${String(failures.length)} problem(s); the mapping or a site moved.`)
    process.exitCode = 1
  } else if (mode === 'check') {
    console.log('rebrand-dao: post-state verified — no residue, every rename landed, idempotent.')
  } else {
    console.log('rebrand-dao: applied. Run the git mv list, `pnpm install`, the gen-* family, and `pnpm run verify-translation-pairing --write --all`.')
  }
}

// Importing this module must not run the codemod.
if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2)
  const mode = args.includes('--apply') ? 'apply' : args.includes('--check') ? 'check' : 'dry'
  run(mode)
}
