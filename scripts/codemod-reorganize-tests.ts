#!/usr/bin/env tsx
/**
 * Codemod: migrate confirmAnimalReorg test sites to engine.resolveChoice.
 *
 * Transforms:
 *  1. session.confirmAnimalReorg(X, zones)
 *     → session.resolveChoice(X, 'confirm', zones)
 *
 *  2. pending.type === 'animalReorg'   (in conditions)
 *     → pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg'
 *     NOTE: this is simplified; the codemod replaces with a marker, then context
 *     must be fixed manually for complex cases.
 *
 *  3. .toBe('animalReorg')
 *     → .toBe('choice')
 *     NOTE: also adds promptKey assertion comment for manual review.
 */

import fs from 'node:fs'
import path from 'node:path'

// Find all test files
const roots = [
  'server/__tests__',
  'tests',
]

const cwd = process.cwd()
const files: string[] = []

for (const root of roots) {
  const fullRoot = path.join(cwd, root)
  if (!fs.existsSync(fullRoot)) continue
  const found = fs.readdirSync(fullRoot, { recursive: true }) as string[]
  for (const f of found) {
    if (f.endsWith('.ts') && !f.endsWith('.d.ts')) {
      files.push(path.join(fullRoot, f))
    }
  }
}

let totalCallSites = 0
let totalAssertions = 0
let totalConditions = 0
let filesModified = 0

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8')
  const original = content

  // Pattern 1: confirmAnimalReorg(X, Y) → resolveChoice(X, 'confirm', Y)
  // Handles single-line: confirmAnimalReorg(X, singleArgExpr)
  // Also handles multi-line where the call starts with confirmAnimalReorg(X, [
  //
  // Strategy: replace "confirmAnimalReorg(" with "resolveChoice(" and
  // then insert "'confirm', " after the first argument.
  // We do this by matching "confirmAnimalReorg(ARG1," and replacing with
  // "resolveChoice(ARG1, 'confirm',"
  //
  // ARG1 is one of: a number literal, resp.pending.playerIndex, playerIdx, pi, etc.
  // We match a simple expression up to the first comma that is not inside parens/brackets.

  // Use a simple regex that matches the first argument (no nested commas in first arg)
  // This covers: integer literals, simple member expressions
  const callRegex = /\.confirmAnimalReorg\(([^,)]+),/g
  const newContent1 = content.replace(callRegex, (_match, arg1) => {
    totalCallSites++
    return `.resolveChoice(${arg1}, 'confirm',`
  })

  content = newContent1

  // Pattern 2: pending.type === 'animalReorg' in conditions (while/if/else if)
  // Replace with: pending.type === 'choice' && (resp.pending as any).promptKey === 'ui.interactionAnimalReorg'
  // This is complex because the binding for `resp.pending` may vary (resp, initial, current, etc.)
  // We use a simpler replacement: just 'choice' and add a TODO comment
  // Actually we need correct behavior: replace with compound check
  //
  // Match: X.pending.type === 'animalReorg'
  // where X can be: resp, initial, current, takeResp, resp2, etc.
  const condRegex = /(\w+)\.pending\.type\s*===\s*'animalReorg'/g
  const newContent2 = content.replace(condRegex, (_match, varName) => {
    totalConditions++
    return `${varName}.pending.type === 'choice' && (${varName}.pending as any).promptKey === 'ui.interactionAnimalReorg'`
  })
  content = newContent2

  // Also handle: resp.pending.type !== 'animalReorg'
  const condNeqRegex = /(\w+)\.pending\.type\s*!==\s*'animalReorg'/g
  content = content.replace(condNeqRegex, (_match, varName) => {
    totalConditions++
    return `(${varName}.pending.type !== 'choice' || (${varName}.pending as any).promptKey !== 'ui.interactionAnimalReorg')`
  })

  // Pattern 3: .toBe('animalReorg') → .toBe('choice')
  const toBeRegex = /\.toBe\('animalReorg'\)/g
  const newContent3 = content.replace(toBeRegex, () => {
    totalAssertions++
    return `.toBe('choice')`
  })
  content = newContent3

  // Pattern 4: validTypes array containing 'animalReorg' (keep for now, it's a type union test)
  // Leave as-is; will be fixed in Task 4.

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8')
    filesModified++
    console.log(`  Modified: ${path.relative(cwd, filePath)}`)
  }
}

console.log(`\nSummary:`)
console.log(`  ${totalCallSites} call sites migrated (confirmAnimalReorg → resolveChoice)`)
console.log(`  ${totalConditions} conditions migrated (pending.type === 'animalReorg')`)
console.log(`  ${totalAssertions} assertions migrated (.toBe('animalReorg') → .toBe('choice'))`)
console.log(`  ${filesModified} files modified`)
console.log(`\nNOTE: 'interaction.zones' pass-through patterns need manual fix.`)
console.log(`      Search: resolveChoice.*interaction.zones`)
