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
 *   - server/custom-code-executor/engine.ts → isActionHookPhase + isCardListenerScope
 *   - shared/custom-code/ast-validator.ts → DENIED_IDENTIFIERS + DENIED_PROPERTY_ACCESS
 *
 * Targets it cross-checks against:
 *   - docs/CUSTOM_CARD_SANDBOX.md         → <!-- prompt-sync:begin id=... --> blocks
 *   - src/services/llmPrompts.ts          → table-row substring search
 *
 * If a hook / phase / denylist entry exists in the source but is missing from
 * a target — drift detected. By default this prints a warning; pass --strict
 * (in CI) to fail the build.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '..')

const SOURCES = {
  cardEffects: 'shared/cards/card-effects.ts',
  engine: 'server/custom-code-executor/engine.ts',
  astValidator: 'shared/custom-code/ast-validator.ts',
}

const TARGETS = {
  sandboxDoc: 'docs/CUSTOM_CARD_SANDBOX.md',
  llmPrompt: 'src/services/llmPrompts.ts',
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
 * Extract the `isActionHookPhase` whitelist literal from engine.ts.
 * Looks for: `[ 'before', 'during', ... ].includes(value)` near `isActionHookPhase`.
 */
function extractActionHookPhases(): string[] {
  const src = readFile(SOURCES.engine)
  const m = src.match(/isActionHookPhase[\s\S]*?\[([\s\S]*?)\]\.includes/)
  if (!m) throw new Error(`isActionHookPhase array not found in ${SOURCES.engine}`)
  return parseStringArray(m[1])
}

/**
 * Extract the `isCardListenerScope` whitelist from engine.ts.
 * Looks for `value === 'player' || value === 'opponent' || value === 'any'`.
 */
function extractListenerScopes(): string[] {
  const src = readFile(SOURCES.engine)
  const m = src.match(/isCardListenerScope[\s\S]*?\n\s*\}/m)
  if (!m) throw new Error(`isCardListenerScope not found in ${SOURCES.engine}`)
  const scopes = [...m[0].matchAll(/value\s*===\s*'([^']+)'/g)].map(m2 => m2[1])
  if (scopes.length === 0) throw new Error(`No scopes parsed from isCardListenerScope`)
  return scopes
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

// ---------- Target parsers ----------

/**
 * Extract a `<!-- prompt-sync:begin id=X --> ... <!-- prompt-sync:end id=X -->`
 * block from a markdown file and return the bullet-list items as strings.
 */
function extractMarkdownBlock(file: string, blockId: string): string[] | null {
  const src = readFile(file)
  const re = new RegExp(
    `<!--\\s*prompt-sync:begin\\s+id=${blockId}[^>]*-->([\\s\\S]*?)<!--\\s*prompt-sync:end\\s+id=${blockId}\\s*-->`,
    'm',
  )
  const m = src.match(re)
  if (!m) return null
  return [...m[1].matchAll(/^-\s*`([^`]+)`/gm)].map(m2 => m2[1])
}

/**
 * Check that every item in `expected` shows up as a substring (verbatim) in
 * the target file. Used for files (like llmPrompts.ts) that don't carry
 * machine-readable blocks but should still mention every hook / phase name.
 */
function checkTargetMentions(file: string, expected: string[]): { missing: string[] } {
  const src = readFile(file)
  const missing = expected.filter(name => !src.includes(name))
  return { missing }
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
  reports.push(...checkBlock('action-hook-phases', actionHookPhases, `${SOURCES.engine}:isActionHookPhase`))
  reports.push(...checkBlock('listener-scopes', listenerScopes, `${SOURCES.engine}:isCardListenerScope`))
  reports.push(...checkBlock('denied-identifiers', deniedIdentifiers, `${SOURCES.astValidator}:DENIED_IDENTIFIERS`))
  reports.push(...checkBlock('denied-property-access', deniedPropertyAccess, `${SOURCES.astValidator}:DENIED_PROPERTY_ACCESS`))

  // For the LLM prompt we only require that every hook + phase name appears
  // somewhere in the file (substring match). The prompt formats them as
  // markdown table rows / bullet lists so the exact placement varies.
  const promptHookCheck = checkTargetMentions(TARGETS.llmPrompt, cardEffectHooks)
  const promptPhaseCheck = checkTargetMentions(TARGETS.llmPrompt, actionHookPhases)

  let driftCount = 0

  console.log('=== prompt-sync check ===\n')

  console.log(`Sources:`)
  console.log(`  ${SOURCES.cardEffects}     (cardEffectHooks: ${cardEffectHooks.length})`)
  console.log(`  ${SOURCES.engine}          (isActionHookPhase: ${actionHookPhases.length}, scopes: ${listenerScopes.length})`)
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
  if (promptHookCheck.missing.length > 0) {
    driftCount++
    console.log(`  ✗ ${TARGETS.llmPrompt} is missing these hook names entirely:`)
    console.log(`      ${promptHookCheck.missing.join(', ')}`)
  } else {
    console.log(`  ✓ ${TARGETS.llmPrompt} mentions all ${cardEffectHooks.length} hook names`)
  }
  if (promptPhaseCheck.missing.length > 0) {
    driftCount++
    console.log(`  ✗ ${TARGETS.llmPrompt} is missing these phase names entirely:`)
    console.log(`      ${promptPhaseCheck.missing.join(', ')}`)
  } else {
    console.log(`  ✓ ${TARGETS.llmPrompt} mentions all ${actionHookPhases.length} phase names`)
  }

  console.log()
  if (driftCount === 0) {
    console.log('All sources and targets are in sync.')
    return
  }

  const verb = strict ? 'FAIL' : 'WARN'
  console.log(`${verb}: ${driftCount} drift(s) detected.`)
  console.log(`Update docs/CUSTOM_CARD_SANDBOX.md (machine-checkable blocks)`)
  console.log(`and src/services/llmPrompts.ts to match the source files above.`)
  if (strict) process.exit(1)
}

main()
