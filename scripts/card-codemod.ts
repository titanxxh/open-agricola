#!/usr/bin/env tsx
/**
 * Card codemod: convert registration side-effects (registerCardListener /
 * registerCardEffect / registerCardModifier / registerBonusScoreHandler)
 * into a single `export const {CARD_ID}_impl = { ... }` block.
 *
 * Input:  `registerCardListener(listener)` or `registerCardListener({...})` at
 *         the top level of a card file.
 * Output: Those calls are removed (the identifier declarations they reference
 *         are left in place) and a `_impl` export is appended:
 *
 *   export const A107_Catcher_impl = {
 *     listeners: [listener],
 *     reaches: [] as readonly string[],
 *   }
 *
 * Idempotency: if the file already contains `export const <CARD_ID>_impl`, the
 * codemod is a no-op.
 *
 * Usage:
 *   pnpm exec tsx scripts/card-codemod.ts --dry-run     # report only
 *   pnpm exec tsx scripts/card-codemod.ts               # write in place
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const REGISTER_FNS = new Set([
  'registerCardListener',
  'registerCardEffect',
  'registerCardModifier',
  'registerBonusScoreHandler',
])

const CARD_CLASSES = new Set(['Occupation', 'MinorImprovement', 'MajorImprovement'])

export type CollectedRegistrations = {
  listeners: string[]
  effects: string[]
  modifiers: string[]
  bonusScoreHandlers: string[]
}

export type TransformResult = {
  output: string
  collected: CollectedRegistrations
  cardId: string | null
  changed: boolean
  /** Only set when `changed === false`. Describes why. */
  reason?: string
}

function extractCardIdFromNewExpr(sf: ts.SourceFile): string | null {
  let result: string | null = null
  const visit = (node: ts.Node): void => {
    if (result) return
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      CARD_CLASSES.has(node.expression.text)
    ) {
      const arg = node.arguments?.[0]
      if (arg && ts.isObjectLiteralExpression(arg)) {
        for (const prop of arg.properties) {
          if (
            ts.isPropertyAssignment(prop) &&
            ts.isIdentifier(prop.name) &&
            prop.name.text === 'id'
          ) {
            const init = prop.initializer
            if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
              result = init.text
              return
            }
            // Common case: `id: CARD_ID` — skip here, let CARD_ID const path handle it.
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return result
}

function extractCardIdFromConst(sf: ts.SourceFile): string | null {
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.name.text === 'CARD_ID' &&
          decl.initializer &&
          (ts.isStringLiteral(decl.initializer) ||
            ts.isNoSubstitutionTemplateLiteral(decl.initializer))
        ) {
          return decl.initializer.text
        }
      }
    }
  }
  return null
}

export function transformCardFile(source: string, filePath: string): TransformResult {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const collected: CollectedRegistrations = {
    listeners: [],
    effects: [],
    modifiers: [],
    bonusScoreHandlers: [],
  }

  const cardId = extractCardIdFromConst(sf) ?? extractCardIdFromNewExpr(sf)

  // Find top-level register* expression-statements only. Nested calls (e.g. inside
  // for-loops in D124_Emissary) are deliberately left alone — the codemod is only
  // safe for the simple "declare listener + register it at top level" pattern.
  const statementsToRemove: Array<{ start: number; end: number }> = []
  for (const stmt of sf.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isCallExpression(stmt.expression)) {
      const call = stmt.expression
      if (ts.isIdentifier(call.expression) && REGISTER_FNS.has(call.expression.text)) {
        const arg = call.arguments[0]
        if (arg) {
          const argText = arg.getText(sf)
          const fn = call.expression.text
          if (fn === 'registerCardListener') collected.listeners.push(argText)
          else if (fn === 'registerCardEffect') collected.effects.push(argText)
          else if (fn === 'registerCardModifier') collected.modifiers.push(argText)
          else if (fn === 'registerBonusScoreHandler') collected.bonusScoreHandlers.push(argText)
          statementsToRemove.push({ start: stmt.getFullStart(), end: stmt.getEnd() })
        }
      }
    }
  }

  const nothingCollected =
    collected.listeners.length === 0 &&
    collected.effects.length === 0 &&
    collected.modifiers.length === 0 &&
    collected.bonusScoreHandlers.length === 0
  if (nothingCollected) {
    return { output: source, collected, cardId, changed: false, reason: 'no register* calls' }
  }

  // Idempotency: if `export const {CARD_ID}_impl` already exists, leave file alone.
  if (cardId && new RegExp(`export\\s+const\\s+${cardId}_impl\\b`).test(source)) {
    return { output: source, collected, cardId, changed: false, reason: 'already has _impl' }
  }

  if (!cardId) {
    throw new Error(
      `cannot determine cardId for ${path.basename(filePath)} (no CARD_ID const and no static card id)`,
    )
  }

  // Strip register* statements. Sort by descending start so slicing doesn't shift later offsets.
  statementsToRemove.sort((a, b) => b.start - a.start)
  let out = source
  for (const range of statementsToRemove) {
    out = out.slice(0, range.start) + out.slice(range.end)
  }

  // Collapse excess blank lines left by stripped statements.
  out = out.replace(/\n{3,}/g, '\n\n')

  // Build `_impl` export.
  const parts: string[] = []
  if (collected.listeners.length > 0) {
    parts.push(`  listeners: [${collected.listeners.join(', ')}]`)
  }
  if (collected.effects.length > 0) {
    // `registerCardEffect` is typed to take a single effect; if a file has
    // multiple we just keep the first and note the rest in collected (Task 9
    // should investigate these manually). Current codebase has at most 1.
    parts.push(`  effect: ${collected.effects[0]}`)
  }
  if (collected.modifiers.length > 0) {
    parts.push(`  modifiers: [${collected.modifiers.join(', ')}]`)
  }
  if (collected.bonusScoreHandlers.length > 0) {
    parts.push(`  bonusScoreHandlers: [${collected.bonusScoreHandlers.join(', ')}]`)
  }
  parts.push(`  reaches: [] as readonly string[]`)

  const implBlock = `\nexport const ${cardId}_impl = {\n${parts.join(',\n')},\n} satisfies CardImpl\n`
  out = out.trimEnd() + '\n' + implBlock

  // Post-processing:
  // 1. Strip the now-unused *value* imports of register* functions that we removed
  //    calls of. The type import (`CardListenerRegistration`, etc.) must stay.
  // 2. Ensure `import type { CardImpl } from '../registry'` is present so the
  //    `satisfies CardImpl` expression typechecks.
  const strippedFns: string[] = []
  if (collected.listeners.length > 0) strippedFns.push('registerCardListener')
  if (collected.effects.length > 0) strippedFns.push('registerCardEffect')
  if (collected.modifiers.length > 0) strippedFns.push('registerCardModifier')
  if (collected.bonusScoreHandlers.length > 0) strippedFns.push('registerBonusScoreHandler')

  for (const fn of strippedFns) {
    const esc = fn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    // Case 1: sole value in a named-only import — delete the whole line.
    //   import { fn } from '...'\n
    out = out.replace(
      new RegExp(`^[ \\t]*import\\s*\\{\\s*${esc}\\s*\\}\\s*from\\s*['\"][^'\"]+['\"];?[ \\t]*\\n`, 'gm'),
      '',
    )
    // Case 2: first in a multi-name import — `{ fn, Other }` -> `{ Other }`
    out = out.replace(new RegExp(`\\{\\s*${esc}\\s*,\\s*`, 'g'), '{ ')
    // Case 3: last in a multi-name import — `{ Other, fn }` -> `{ Other }`
    out = out.replace(new RegExp(`,\\s*${esc}\\s*\\}`, 'g'), ' }')
    // Case 4: middle of a list — `{ A, fn, B }` -> `{ A, B }` (catches the general case)
    out = out.replace(new RegExp(`,\\s*${esc}\\s*,`, 'g'), ',')
  }
  // Clean up any `import { } from '...'` lines left as residue.
  out = out.replace(/^[ \t]*import\s*\{\s*\}\s*from\s*['"][^'"]+['"];?[ \t]*\n/gm, '')

  // Insert `import type { CardImpl } from '../registry'` once if missing. We
  // locate the last import statement (handling multi-line forms via the parsed
  // AST) and insert right after it so the new import doesn't split a
  // multi-line import block.
  if (!/import\s+type\s*\{[^}]*\bCardImpl\b[^}]*\}\s*from\s*['"][^'"]*registry['"]/.test(out)) {
    // Re-parse `out` to find import-statement boundaries accurately.
    const sfOut = ts.createSourceFile(filePath, out, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    let lastImportEnd = -1
    for (const stmt of sfOut.statements) {
      if (ts.isImportDeclaration(stmt)) {
        lastImportEnd = stmt.getEnd()
      } else {
        break
      }
    }
    const injected = `\nimport type { CardImpl } from '../registry'`
    if (lastImportEnd > 0) {
      out = out.slice(0, lastImportEnd) + injected + out.slice(lastImportEnd)
    } else {
      out = `import type { CardImpl } from '../registry'\n${out}`
    }
  }

  // Collapse excess blank lines one more time after mutation.
  out = out.replace(/\n{3,}/g, '\n\n')

  return { output: out, collected, cardId, changed: true }
}

// ─── CLI ────────────────────────────────────────────────────────────────────
const isMain = (() => {
  const arg1 = process.argv[1] ?? ''
  return arg1.endsWith('card-codemod.ts') || arg1.endsWith('card-codemod.js')
})()

if (isMain) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const cardsRoot = path.resolve(process.cwd(), 'shared', 'cards')
  const decks = ['A', 'B', 'C', 'D', 'E', 'major']

  type FailureEntry = { file: string; error: string }
  const stats = {
    total: 0,
    transformed: 0,
    unchangedNoRegister: 0,
    unchangedAlreadyImpl: 0,
    failed: [] as FailureEntry[],
  }

  for (const deck of decks) {
    const deckDir = path.join(cardsRoot, deck)
    if (!fs.existsSync(deckDir)) continue
    const files = fs
      .readdirSync(deckDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    for (const file of files) {
      const fp = path.join(deckDir, file)
      stats.total += 1
      try {
        const source = fs.readFileSync(fp, 'utf8')
        const result = transformCardFile(source, fp)
        if (result.changed) {
          if (!dryRun) fs.writeFileSync(fp, result.output, 'utf8')
          stats.transformed += 1
        } else if (result.reason === 'already has _impl') {
          stats.unchangedAlreadyImpl += 1
        } else {
          stats.unchangedNoRegister += 1
        }
      } catch (err) {
        stats.failed.push({
          file: path.relative(process.cwd(), fp),
          error: (err as Error).message,
        })
      }
    }
  }

  console.log(JSON.stringify(stats, null, 2))
  if (stats.failed.length > 0) process.exit(1)
}
