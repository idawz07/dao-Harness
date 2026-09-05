/**
 * Gate that the product ships English-only Client UI dictionaries.
 *
 * Product copy still enters through typed locale dictionaries and
 * `verify-client-ui-i18n`; this companion rejects a reintroduced `zh`
 * (or other non-`en`) built-in dictionary export so English-only stays
 * mechanical rather than review-only.
 */

import type { Dirent } from 'node:fs'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

/** Repo-relative path with `/` separators. */
function relative(file: string): string {
  return file.slice(root.length).replaceAll('\\', '/')
}

/** Immediate subdirectory names, or none when the path is not a directory. */
function directories(dir: string): string[] {
  return readEntries(dir).filter(entry => entry.isDirectory()).map(entry => entry.name)
}

/**
 * Directory entries, treating only a genuinely absent directory as empty.
 * @param dir - absolute directory path.
 * @returns entries, or none when the directory does not exist.
 */
function readEntries(dir: string): Dirent[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

function walk(dir: string, out: string[]): void {
  for (const entry of readEntries(dir)) {
    const full = resolve(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(full)
  }
}

/** Every `.ts` source file under each workspace package's `src`. */
function sourceFiles(): string[] {
  const files: string[] = []
  const packagesRoot = resolve(root, 'packages')
  for (const group of directories(packagesRoot)) {
    for (const pkg of directories(resolve(packagesRoot, group))) {
      walk(resolve(packagesRoot, group, pkg, 'src'), files)
    }
  }
  return files.sort()
}

/**
 * Names of top-level `export const <name> = { ... }` objects whose name is a
 * locale id (`en`, `zh`, …) or a locale-prefixed/suffixed dictionary export.
 * @param file - absolute path of a candidate module.
 * @returns locale-bearing export names.
 */
function localeExportNames(file: string): string[] {
  const text = readFileSync(file, 'utf8')
  if (!/\b(zh|en)\b/.test(text) && !/[A-Za-z][Hh](?:[A-Z]|Settings|Dict)/.test(text)) return []
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const names: string[] = []
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)
      && node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer !== undefined) {
          const name = decl.name.text
          if (name === 'zh' || name === 'en' || /^(zh|en)[A-Z]/.test(name) || /(Zh|En)$/.test(name)) {
            names.push(name)
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return names
}

describe('shipped locale dictionaries', () => {
  it('exports only English built-in dictionaries (no zh product locale)', () => {
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(500)

    const violations: string[] = []
    let englishExports = 0
    for (const file of files) {
      for (const name of localeExportNames(file)) {
        if (name === 'en' || name.startsWith('en') || name.endsWith('En')) {
          englishExports += 1
          continue
        }
        violations.push(`${relative(file)} exports dictionary ${name}`)
      }
    }
    expect(englishExports, 'expected to discover English dictionary exports').toBeGreaterThan(10)
    expect(violations, violations.join('\n')).toEqual([])
  })
})
