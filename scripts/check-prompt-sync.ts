/**
 * Verify that LLM prompt strings + docs/CUSTOM_CARD_SANDBOX.md stay in sync
 * with the actual sandbox / AST whitelist sources of truth.
 *
 * Usage:
 *   pnpm run check:prompt-sync                 # warn-only mode (default)
 *   pnpm run check:prompt-sync -- --strict     # exit 1 on any drift
 *
 * Sources of truth this script reads:
 *   - shared/cards/card-effects.ts        → cardEffectHooks array
 *   - shared/custom-code/sandbox-listener-phases.ts → sandboxListenerPhases array
 *   - shared/custom-code/sandbox-listener-scopes.ts → sandboxListenerScopes array
 *   - shared/custom-code/ast-validator.ts → DENIED_IDENTIFIERS + DENIED_PROPERTY_ACCESS
 *
 * Targets it cross-checks against:
 *   - docs/CUSTOM_CARD_SANDBOX.md         → <!-- prompt-sync:begin id=... --> blocks
 *
 * NOTE: client/services/llmPrompts.ts is no longer cross-checked here — it
 * renders the hook / phase / scope / actionId tables at runtime from the source-of-truth
 * arrays + description metadata (shared/custom-code/*-meta, sandbox-*.ts), so
 * those four tables cannot drift by construction. The runtime render is guarded
 * by client/services/__tests__/llmPrompts.test.ts (set-equality assertions).
 *
 * If a hook / phase / denylist entry exists in the source but is missing from
 * a target — drift detected. By default this prints a warning; pass --strict
 * (in CI) to fail the build.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SANDBOX_ALLOWED_ACTION_IDS } from '../shared/custom-code/sandbox-action-ids'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const SOURCES = {
  cardEffects: 'shared/cards/card-effects.ts',
  sandboxListenerPhases: 'shared/custom-code/sandbox-listener-phases.ts',
  sandboxListenerScopes: 'shared/custom-code/sandbox-listener-scopes.ts',
  astValidator: 'shared/custom-code/ast-validator.ts',
  injectedHelpers: 'server/custom-code/injected-helpers.ts',
}

const TARGETS = {
  sandboxDoc: 'docs/CUSTOM_CARD_SANDBOX.md',
}

type DriftReport = {
  blockId: string
  target: string
  source: string
  missingInTarget: string[]
  extraInTarget: string[]
}

function readFile(rel: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf-8')
}

// ---------- Source extractors ----------

/**
 * Extract `cardEffectHooks` array literal from card-effects.ts.
 * Looks for: `export const cardEffectHooks: CardEffectHook[] = [ 'a', 'b', ... ]`
 */
function extractCardEffectHooks(): string[] {
  const src = readFile(SOURCES.cardEffects)
  const m = src.match(/export const cardEffectHooks[^=]*=\s*\[([\s\S]*?)\]/)
  if (!m) throw new Error(`cardEffectHooks array not found in ${SOURCES.cardEffects}`)
  return parseStringArray(m[1])
}

/**
 * Extract the `sandboxListenerPhases` array literal.
 */
function extractActionHookPhases(): string[] {
  const src = readFile(SOURCES.sandboxListenerPhases)
  const m = src.match(/export const sandboxListenerPhases\s*=\s*\[([\s\S]*?)\]\s*as const/)
  if (!m) throw new Error(`sandboxListenerPhases array not found in ${SOURCES.sandboxListenerPhases}`)
  return parseStringArray(m[1])
}

function extractListenerScopes(): string[] {
  const src = readFile(SOURCES.sandboxListenerScopes)
  const m = src.match(/export const sandboxListenerScopes\s*=\s*\[([\s\S]*?)\]\s*as const/)
  if (!m) throw new Error(`sandboxListenerScopes array not found in ${SOURCES.sandboxListenerScopes}`)
  return parseStringArray(m[1])
}

/**
 * Extract a `new Set([...])` initialised constant from ast-validator.ts.
 */
function extractDeniedSet(constName: string): string[] {
  const src = readFile(SOURCES.astValidator)
  const re = new RegExp(`const\\s+${constName}\\s*=\\s*new Set\\(\\[([\\s\\S]*?)\\]\\)`)
  const m = src.match(re)
  if (!m) throw new Error(`${constName} set not found in ${SOURCES.astValidator}`)
  return parseStringArray(m[1])
}

function parseStringArray(body: string): string[] {
  return [...body.matchAll(/'([^']+)'|"([^"]+)"/g)]
    .map(m => m[1] ?? m[2])
    .filter(Boolean)
}

/**
 * Scan `server/custom-code/injected-helpers.ts` for top-level `function NAME(...)`
 * declarations. These are the helpers the sandbox injects into user code.
 */
export function extractInjectedHelpers(): string[] {
  const src = readFile(SOURCES.injectedHelpers)
  const re = /^function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/gm
  const names: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    names.push(m[1]!)
  }
  return names.sort()
}

/**
 * Parse the `<!-- prompt-sync:begin id=sandbox-injections -->` block in
 * CUSTOM_CARD_SANDBOX.md and extract helper names from the first column of
 * the markdown table. Strips backticks + arg list.
 */
export function extractSandboxDocInjections(): string[] {
  const src = readFile(TARGETS.sandboxDoc)
  const startIdx = src.indexOf('<!-- prompt-sync:begin id=sandbox-injections -->')
  const endIdx = src.indexOf('<!-- prompt-sync:end id=sandbox-injections -->')
  if (startIdx < 0 || endIdx < 0) {
    throw new Error('sandbox-injections markers not found in CUSTOM_CARD_SANDBOX.md')
  }
  const block = src.slice(startIdx, endIdx)
  const re = /^\|\s*`([a-zA-Z_][a-zA-Z0-9_]*)/gm
  const names = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    names.add(m[1]!)
  }
  return Array.from(names).sort()
}

// ---------- Target parsers ----------

/**
 * Extract a `<!-- prompt-sync:begin id=X --> ... <!-- prompt-sync:end id=X -->`
 * block from a markdown file and return the bullet-list items as strings.
 *
 * The list-item regex tolerates an optional backslash around the backticks so
 * the same block parses in both contexts:
 *   - `.md` files: bare backticks      `- `gain` ...`
 *   - `.ts` template literals: escaped `- \`gain\` ...` (backtick must be
 *     escaped inside a template string)
 */
function extractMarkdownBlock(file: string, blockId: string): string[] | null {
  const src = readFile(file)
  const re = new RegExp(
    `<!--\\s*prompt-sync:begin\\s+id=${blockId}[^>]*-->([\\s\\S]*?)<!--\\s*prompt-sync:end\\s+id=${blockId}\\s*-->`,
    'm',
  )
  const m = src.match(re)
  if (!m) return null
  return [...m[1].matchAll(/^-\s*\\?`([^`\\]+)\\?`/gm)].map(m2 => m2[1])
}

// ---------- Main ----------

function diff(blockId: string, target: string, source: string, expected: string[], actual: string[]): DriftReport {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  return {
    blockId,
    target,
    source,
    missingInTarget: expected.filter(x => !actualSet.has(x)),
    extraInTarget: actual.filter(x => !expectedSet.has(x)),
  }
}

function checkBlock(
  blockId: string,
  expected: string[],
  source: string,
): DriftReport[] {
  const reports: DriftReport[] = []
  const docItems = extractMarkdownBlock(TARGETS.sandboxDoc, blockId)
  if (docItems === null) {
    reports.push({
      blockId,
      target: TARGETS.sandboxDoc,
      source,
      missingInTarget: expected,
      extraInTarget: [],
    })
  } else {
    reports.push(diff(blockId, TARGETS.sandboxDoc, source, expected, docItems))
  }
  return reports
}

function main() {
  const strict = process.argv.includes('--strict')

  const cardEffectHooks = extractCardEffectHooks()
  const actionHookPhases = extractActionHookPhases()
  const listenerScopes = extractListenerScopes()
  const deniedIdentifiers = extractDeniedSet('DENIED_IDENTIFIERS')
  const deniedPropertyAccess = extractDeniedSet('DENIED_PROPERTY_ACCESS')

  const reports: DriftReport[] = []

  reports.push(...checkBlock('card-effect-hooks', cardEffectHooks, `${SOURCES.cardEffects}:cardEffectHooks`))
  reports.push(...checkBlock('action-hook-phases', actionHookPhases, `${SOURCES.sandboxListenerPhases}:sandboxListenerPhases`))
  reports.push(...checkBlock('listener-scopes', listenerScopes, `${SOURCES.sandboxListenerScopes}:sandboxListenerScopes`))
  reports.push(...checkBlock('denied-identifiers', deniedIdentifiers, `${SOURCES.astValidator}:DENIED_IDENTIFIERS`))
  reports.push(...checkBlock('denied-property-access', deniedPropertyAccess, `${SOURCES.astValidator}:DENIED_PROPERTY_ACCESS`))
  reports.push(...checkBlock('action-ids', [...SANDBOX_ALLOWED_ACTION_IDS], 'shared/custom-code/sandbox-action-ids.ts:SANDBOX_ALLOWED_ACTION_IDS'))

  // sandbox-injections sub-check (S9 B4): verify every function in
  // injected-helpers.ts is documented in the §1 table of CUSTOM_CARD_SANDBOX.md.
  // The doc block additionally documents `MinorImprovement` / `Occupation` /
  // `console.*` stubs which are not pure JS functions in injected-helpers.ts —
  // hence we only check the injected helpers ⊆ doc direction.
  {
    const injectedHelpers = extractInjectedHelpers()
    const sandboxDocInjections = extractSandboxDocInjections()
    const docSet = new Set(sandboxDocInjections)
    const missingInDoc = injectedHelpers.filter(h => !docSet.has(h))
    reports.push({
      blockId: 'sandbox-injections',
      target: TARGETS.sandboxDoc,
      source: `${SOURCES.injectedHelpers}:functions`,
      missingInTarget: missingInDoc,
      extraInTarget: [],
    })
  }

  let driftCount = 0

  console.log('=== prompt-sync check ===\n')

  console.log(`Sources:`)
  console.log(`  ${SOURCES.cardEffects}     (cardEffectHooks: ${cardEffectHooks.length})`)
  console.log(`  ${SOURCES.sandboxListenerPhases} (sandboxListenerPhases: ${actionHookPhases.length})`)
  console.log(`  ${SOURCES.sandboxListenerScopes} (scopes: ${listenerScopes.length})`)
  console.log(`  ${SOURCES.astValidator}    (denied: ${deniedIdentifiers.length} ids + ${deniedPropertyAccess.length} props)`)
  console.log()

  for (const r of reports) {
    if (r.missingInTarget.length === 0 && r.extraInTarget.length === 0) {
      console.log(`  ✓ [${r.blockId}] ${r.target} ↔ ${r.source}`)
      continue
    }
    driftCount++
    console.log(`  ✗ [${r.blockId}] ${r.target} ↔ ${r.source}`)
    if (r.missingInTarget.length > 0) {
      console.log(`      missing in ${path.basename(r.target)} block: ${r.missingInTarget.join(', ')}`)
    }
    if (r.extraInTarget.length > 0) {
      console.log(`      extra in   ${path.basename(r.target)} block: ${r.extraInTarget.join(', ')}`)
    }
  }

  console.log()
  if (driftCount === 0) {
    console.log('All sources and targets are in sync.')
    return
  }

  const verb = strict ? 'FAIL' : 'WARN'
  console.log(`${verb}: ${driftCount} drift(s) detected.`)
  console.log(`Update docs/CUSTOM_CARD_SANDBOX.md (machine-checkable blocks)`)
  console.log(`and client/services/llmPrompts.ts to match the source files above.`)
  if (strict) process.exit(1)
}

main()
