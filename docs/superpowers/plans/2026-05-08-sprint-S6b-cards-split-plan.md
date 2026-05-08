# Sprint S6b: Cards Display/Impl Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Write a codemod that splits each of the 824 card files (`shared/cards/<deck>/<file>.ts`) into a display half (`shared/cards-display/<deck>/<file>.ts` — only data + class import) and an impl half (`shared/cards/<deck>/<file>.ts` — only `_impl` + back-reference to display). Drives main bundle from ~541 KB → ≤400 KB by physically isolating impl-only deps (`actions/effects/*`, helpers) from cards-display.

**Architecture:** TypeScript Compiler API codemod at `scripts/codemod-cards-display.ts`. Idempotent: dry-run reports plan + corner cases; wet-run rewrites files. After codemod runs once, ESLint error-level rules enforce the boundary going forward — script becomes documentation, not a CI gate.

**Tech Stack:** TypeScript Compiler API, Vitest, ESLint, Vite (`pnpm run build` for bundle measurement).

**Spec:** `docs/superpowers/specs/2026-05-08-sprint-S6-physical-layering-design.md` §2.

**Setup:** worktree `.worktree/sprint-S6b` on branch `sprint-S6b-cards-split`. **Prerequisite:** S6a merged on main.

---

## File Structure

| File | Action |
|------|--------|
| `scripts/codemod-cards-display.ts` | Create — TS Compiler API split tool |
| `scripts/__tests__/codemod-cards-display.test.ts` | Create — codemod unit tests on 5–10 fixture cards |
| `scripts/__tests__/fixtures/cards-display-codemod/<deck>/<file>.ts` | Create — input fixtures |
| `scripts/__tests__/fixtures/cards-display-codemod/<deck>/<file>.expected.display.ts` | Create — expected display output |
| `scripts/__tests__/fixtures/cards-display-codemod/<deck>/<file>.expected.impl.ts` | Create — expected impl output |
| `shared/cards-display/<deck>/<file>.ts` × 824 | Create (codemod wet-run) |
| `shared/cards/<deck>/<file>.ts` × 824 | Modify (codemod wet-run rewrites these in place) |
| `shared/cards/types.ts` | Delete (S6a transition shim no longer needed after cards inline imports) |
| `shared/cards/catalog.ts` | Modify — change card display imports from `./X/Y` to `../cards-display/X/Y` |
| `shared/cards/index.ts` (and other barrels) | Modify — re-export display const from cards-display |
| `eslint.config.js` | Modify — add cards-display boundary rule |

---

## Phase A: Codemod script + unit tests (TDD)

### Task A1: Create script skeleton + first failing test

**Files:**
- Create: `scripts/codemod-cards-display.ts`
- Create: `scripts/__tests__/codemod-cards-display.test.ts`
- Create: `scripts/__tests__/fixtures/cards-display-codemod/A/A1_Shelter.ts`
- Create: `scripts/__tests__/fixtures/cards-display-codemod/A/A1_Shelter.expected.display.ts`
- Create: `scripts/__tests__/fixtures/cards-display-codemod/A/A1_Shelter.expected.impl.ts`

- [ ] **Step 1: Set up fixture — input**

`scripts/__tests__/fixtures/cards-display-codemod/A/A1_Shelter.ts`:

```typescript
import { MinorImprovement } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A1_Shelter'

export const A1_Shelter = new MinorImprovement({
  id: CARD_ID,
  name: 'Shelter',
  deck: 'A',
  number: 1,
  category: 'FARM_PLANNER',
  desc: ['You can immediately build a stable at no cost, but only if you place it in a pasture covering exactly 1 farmyard space.'],
  cost: { wood: 0 },
  passing: true,
})

export const A1_Shelter_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'stables',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        max: 1,
        costOverride: { wood: -99 },
        zoneFilter: 'pasture-1',
      },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 2: Set up fixture — expected display output**

`scripts/__tests__/fixtures/cards-display-codemod/A/A1_Shelter.expected.display.ts`:

```typescript
import { MinorImprovement } from '../types'

const CARD_ID = 'A1_Shelter'

export const A1_Shelter = new MinorImprovement({
  id: CARD_ID,
  name: 'Shelter',
  deck: 'A',
  number: 1,
  category: 'FARM_PLANNER',
  desc: ['You can immediately build a stable at no cost, but only if you place it in a pasture covering exactly 1 farmyard space.'],
  cost: { wood: 0 },
  passing: true,
})
```

- [ ] **Step 3: Set up fixture — expected impl output**

`scripts/__tests__/fixtures/cards-display-codemod/A/A1_Shelter.expected.impl.ts`:

```typescript
import type { CardImpl } from '../registry'
import { A1_Shelter } from '../../cards-display/A/A1_Shelter'

const CARD_ID = A1_Shelter.id

export const A1_Shelter_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'leaf' as const,
      actionId: 'stables',
      sourceCard: CARD_ID,
      optional: true,
      actionContext: {
        max: 1,
        costOverride: { wood: -99 },
        zoneFilter: 'pasture-1',
      },
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 4: Write failing test**

`scripts/__tests__/codemod-cards-display.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { splitCardFile } from '../codemod-cards-display'

const fixturesDir = resolve(__dirname, 'fixtures/cards-display-codemod')

const readFixture = (relPath: string): string =>
  readFileSync(resolve(fixturesDir, relPath), 'utf8')

describe('codemod-cards-display: splitCardFile', () => {
  it('A1_Shelter — splits MinorImprovement display + _impl', () => {
    const input = readFixture('A/A1_Shelter.ts')
    const expectedDisplay = readFixture('A/A1_Shelter.expected.display.ts')
    const expectedImpl = readFixture('A/A1_Shelter.expected.impl.ts')

    const result = splitCardFile({
      sourcePath: 'shared/cards/A/A1_Shelter.ts',
      sourceText: input,
    })

    expect(result.kind).toBe('split')
    if (result.kind !== 'split') return
    expect(result.displayText.trim()).toBe(expectedDisplay.trim())
    expect(result.implText.trim()).toBe(expectedImpl.trim())
  })
})
```

- [ ] **Step 5: Run failing test**

```bash
pnpm exec vitest run scripts/__tests__/codemod-cards-display.test.ts 2>&1 | tail -10
```

Expected: FAIL with "Cannot find module '../codemod-cards-display'".

- [ ] **Step 6: Commit fixture + failing test**

```bash
git add scripts/__tests__/codemod-cards-display.test.ts scripts/__tests__/fixtures/cards-display-codemod/
git commit -m "test(s6b): add codemod fixture + failing test for A1_Shelter split"
```

---

### Task A2: Implement minimal `splitCardFile` to pass A1_Shelter

**Files:**
- Create: `scripts/codemod-cards-display.ts`

- [ ] **Step 1: Write `splitCardFile`**

`scripts/codemod-cards-display.ts`:

```typescript
// Codemod: split a card file into display + impl halves.
//
// Input:  shared/cards/<deck>/<file>.ts (single file with both display + _impl exports)
// Output: shared/cards-display/<deck>/<file>.ts (display const + only display imports)
//         shared/cards/<deck>/<file>.ts        (_impl const + back-import display const + only impl imports)
//
// Approach: parse with TypeScript Compiler API, walk top-level statements,
// classify each (import / display const / impl const / helper), then
// regenerate two files by emitting only the relevant statements + the
// imports they actually reference.

import * as ts from 'typescript'

export type SplitResult =
  | { kind: 'split'; displayText: string; implText: string }
  | { kind: 'display-only'; displayText: string }  // card has no _impl (rare)
  | { kind: 'skip'; reason: string }                // file doesn't match card pattern

export interface SplitInput {
  sourcePath: string  // e.g. 'shared/cards/A/A1_Shelter.ts'
  sourceText: string
}

const DISPLAY_CTORS = new Set(['MinorImprovement', 'Occupation', 'PlayerActionCard'])

export function splitCardFile(input: SplitInput): SplitResult {
  const sf = ts.createSourceFile(
    input.sourcePath,
    input.sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  // Classify each top-level statement
  const imports: ts.ImportDeclaration[] = []
  const otherStatements: { node: ts.Statement; kind: 'display' | 'impl' | 'shared' }[] = []
  let displayName: string | null = null
  let implName: string | null = null

  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) {
      imports.push(stmt)
      continue
    }
    if (ts.isVariableStatement(stmt)) {
      const decl = stmt.declarationList.declarations[0]
      if (decl && ts.isIdentifier(decl.name)) {
        const name = decl.name.text
        if (decl.initializer && ts.isNewExpression(decl.initializer) &&
            ts.isIdentifier(decl.initializer.expression) &&
            DISPLAY_CTORS.has(decl.initializer.expression.text)) {
          displayName = name
          otherStatements.push({ node: stmt, kind: 'display' })
          continue
        }
        if (name.endsWith('_impl')) {
          implName = name
          otherStatements.push({ node: stmt, kind: 'impl' })
          continue
        }
        // CARD_ID const, helpers, etc — assume "shared" until we see references
        otherStatements.push({ node: stmt, kind: 'shared' })
        continue
      }
    }
    otherStatements.push({ node: stmt as ts.Statement, kind: 'shared' })
  }

  if (!displayName) return { kind: 'skip', reason: 'no display export found' }
  if (!implName) return { kind: 'display-only', displayText: input.sourceText }

  // Build identifier-reference graph for shared statements
  const collectIdentifiers = (node: ts.Node): Set<string> => {
    const ids = new Set<string>()
    const walk = (n: ts.Node) => {
      if (ts.isIdentifier(n)) ids.add(n.text)
      ts.forEachChild(n, walk)
    }
    walk(node)
    return ids
  }

  const displayStmts: ts.Statement[] = []
  const implStmts: ts.Statement[] = []
  for (const entry of otherStatements) {
    if (entry.kind === 'display') displayStmts.push(entry.node)
    else if (entry.kind === 'impl') implStmts.push(entry.node)
    else {
      // shared statement (e.g. CARD_ID const) — needed by both? for now, duplicate to display only;
      // impl will reference display.id
      displayStmts.push(entry.node)
    }
  }

  const displayRefs = new Set<string>()
  for (const s of displayStmts) for (const id of collectIdentifiers(s)) displayRefs.add(id)
  const implRefs = new Set<string>()
  for (const s of implStmts) for (const id of collectIdentifiers(s)) implRefs.add(id)

  // Filter imports per side
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed })
  const printNode = (n: ts.Node): string => printer.printNode(ts.EmitHint.Unspecified, n, sf)

  const filterImports = (refs: Set<string>): string[] => {
    const out: string[] = []
    for (const imp of imports) {
      const clause = imp.importClause
      if (!clause) continue
      const names: string[] = []
      if (clause.name && refs.has(clause.name.text)) names.push(clause.name.text)
      if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        for (const el of clause.namedBindings.elements) {
          if (refs.has(el.name.text)) names.push(printNode(el))
        }
      }
      if (names.length === 0) continue
      const moduleSpec = (imp.moduleSpecifier as ts.StringLiteral).text
      const isTypeOnly = clause.isTypeOnly
      out.push(`import ${isTypeOnly ? 'type ' : ''}{ ${names.join(', ')} } from '${moduleSpec}'`)
    }
    return out
  }

  const displayImports = filterImports(displayRefs)
  const implImports = filterImports(implRefs)

  // Compute back-import path for impl (cards/<deck>/<file>.ts → cards-display/<deck>/<file>.ts)
  // sourcePath = 'shared/cards/A/A1_Shelter.ts'
  // back path  = '../../cards-display/A/A1_Shelter'
  const segments = input.sourcePath.split('/')
  // ['shared', 'cards', 'A', 'A1_Shelter.ts'] → deck='A', filename='A1_Shelter'
  const deck = segments[segments.length - 2]
  const filename = segments[segments.length - 1].replace(/\.ts$/, '')
  const backImportPath = `../../cards-display/${deck}/${filename}`

  const displayText = [
    ...displayImports,
    '',
    ...displayStmts.map(printNode),
  ].join('\n').trim() + '\n'

  // Impl: emit imports, the display back-import, then re-emit CARD_ID const
  // (replacing literal CARD_ID = '...' with CARD_ID = <displayName>.id), then impl const.
  const implTextLines: string[] = []
  implTextLines.push(...implImports)
  implTextLines.push(`import { ${displayName} } from '${backImportPath}'`)
  implTextLines.push('')

  // Find CARD_ID-like const in displayStmts and re-emit it as `const CARD_ID = <displayName>.id`
  // Otherwise, emit CARD_ID = displayName.id directly if any impl statement references it
  let cardIdConstName: string | null = null
  for (const s of displayStmts) {
    if (ts.isVariableStatement(s)) {
      const decl = s.declarationList.declarations[0]
      if (decl && ts.isIdentifier(decl.name) &&
          decl.initializer && ts.isStringLiteral(decl.initializer)) {
        cardIdConstName = decl.name.text
        break
      }
    }
  }
  if (cardIdConstName && implRefs.has(cardIdConstName)) {
    implTextLines.push(`const ${cardIdConstName} = ${displayName}.id`)
    implTextLines.push('')
  }

  for (const s of implStmts) implTextLines.push(printNode(s))

  const implText = implTextLines.join('\n').trim() + '\n'

  return { kind: 'split', displayText, implText }
}
```

- [ ] **Step 2: Run test, expect pass**

```bash
pnpm exec vitest run scripts/__tests__/codemod-cards-display.test.ts 2>&1 | tail -10
```

Expected: PASS. If fail, inspect the diff between output and expected, adjust algorithm.

- [ ] **Step 3: Commit**

```bash
git add scripts/codemod-cards-display.ts
git commit -m "feat(s6b): add splitCardFile codemod (passes A1_Shelter fixture)"
```

---

### Task A3: Add 4 more fixture cards covering edge cases

**Files:**
- Create: 4 more fixtures + expected outputs:
  - `B/B30_WoodPalisades.ts` — display imports a helper that's actually used by impl too (`getPalisadeCount` from `actions/effects/fencing`)
  - `C/C146_WorkshopAssistant.ts` — Occupation with `registerAdHocAction` import only used in impl
  - `D/D139_Chairman.ts` — multiple impl-side IDs in one file
  - `E/E149_MidnightFencer.ts` — display-only (no _impl, deliberate-divergence-style)

Engineer: read each card from current `shared/cards/<deck>/<file>.ts` and capture verbatim into fixtures + manually craft the expected display/impl outputs per the codemod rules.

- [ ] **Step 1: Copy 4 source cards into fixtures**

```bash
cp shared/cards/B/B30_WoodPalisades.ts scripts/__tests__/fixtures/cards-display-codemod/B/B30_WoodPalisades.ts
cp shared/cards/C/C146_WorkshopAssistant.ts scripts/__tests__/fixtures/cards-display-codemod/C/C146_WorkshopAssistant.ts
cp shared/cards/D/D139_Chairman.ts scripts/__tests__/fixtures/cards-display-codemod/D/D139_Chairman.ts
cp shared/cards/E/E149_MidnightFencer.ts scripts/__tests__/fixtures/cards-display-codemod/E/E149_MidnightFencer.ts
```

- [ ] **Step 2: Manually author expected display + impl per fixture**

For each fixture, create `<file>.expected.display.ts` and `<file>.expected.impl.ts` files. Engineer reasons about the split based on actual import dependencies:
- B30: `MinorImprovement` only used by display; `getPalisadeCount` only used by impl. Split clean.
- C146: `Occupation` only used by display; `registerAdHocAction` + `gainResources` only used by impl.
- D139: Two ActionDefinitions — one display ID const, one impl-side. Split.
- E149: No `_impl` export. Result kind = `display-only`; do not generate impl file (codemod returns `display-only`).

- [ ] **Step 3: Add test cases**

Append to `scripts/__tests__/codemod-cards-display.test.ts`:

```typescript
const FIXTURES = [
  'B/B30_WoodPalisades',
  'C/C146_WorkshopAssistant',
  'D/D139_Chairman',
]

for (const id of FIXTURES) {
  it(`${id} — splits cleanly`, () => {
    const input = readFixture(`${id}.ts`)
    const expectedDisplay = readFixture(`${id}.expected.display.ts`)
    const expectedImpl = readFixture(`${id}.expected.impl.ts`)

    const result = splitCardFile({
      sourcePath: `shared/cards/${id}.ts`,
      sourceText: input,
    })

    expect(result.kind).toBe('split')
    if (result.kind !== 'split') return
    expect(result.displayText.trim()).toBe(expectedDisplay.trim())
    expect(result.implText.trim()).toBe(expectedImpl.trim())
  })
}

it('E149_MidnightFencer — display-only (no _impl export)', () => {
  const input = readFixture('E/E149_MidnightFencer.ts')
  const result = splitCardFile({
    sourcePath: 'shared/cards/E/E149_MidnightFencer.ts',
    sourceText: input,
  })
  expect(result.kind).toBe('display-only')
})
```

- [ ] **Step 4: Run tests, iterate codemod until all 5 pass**

```bash
pnpm exec vitest run scripts/__tests__/codemod-cards-display.test.ts 2>&1 | tail -15
```

Expected: 5 tests pass. If any fail, diff output vs expected and patch the algorithm in `scripts/codemod-cards-display.ts`. Possible fixes:
- Helper function references in display side need to migrate to display imports
- Multi-line block formatting whitespace mismatch (normalize trim or use actual TS printer)
- Type-only imports (`import type`) detected via `clause.isTypeOnly`

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(s6b): add 4 more fixtures (B30/C146/D139/E149) + iterate codemod"
```

---

### Task A4: Add CLI driver for batch processing

**Files:**
- Modify: `scripts/codemod-cards-display.ts` — add main() that walks `shared/cards/<deck>/<file>.ts` and writes outputs

- [ ] **Step 1: Add main() driver**

Append to `scripts/codemod-cards-display.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve, relative } from 'path'

interface RunOptions {
  dryRun: boolean
  rootDir: string  // repo root
}

interface RunReport {
  totalCardFiles: number
  splitCount: number
  displayOnlyCount: number
  skipCount: number
  errors: { path: string; reason: string }[]
}

const DECKS = ['A', 'B', 'C', 'D', 'E', 'major', 'community', '__stubs__']

export function runCodemod(opts: RunOptions): RunReport {
  const cardsRoot = resolve(opts.rootDir, 'shared/cards')
  const displayRoot = resolve(opts.rootDir, 'shared/cards-display')

  const report: RunReport = {
    totalCardFiles: 0,
    splitCount: 0,
    displayOnlyCount: 0,
    skipCount: 0,
    errors: [],
  }

  for (const deck of DECKS) {
    const deckPath = join(cardsRoot, deck)
    let files: string[]
    try { files = readdirSync(deckPath) } catch { continue }

    for (const file of files) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts')) continue
      const fullPath = join(deckPath, file)
      const stat = statSync(fullPath)
      if (!stat.isFile()) continue

      report.totalCardFiles++
      const sourceText = readFileSync(fullPath, 'utf8')
      const sourcePath = relative(opts.rootDir, fullPath).replace(/\\/g, '/')

      try {
        const result = splitCardFile({ sourcePath, sourceText })

        if (result.kind === 'skip') {
          report.skipCount++
          report.errors.push({ path: sourcePath, reason: result.reason })
          continue
        }
        if (result.kind === 'display-only') {
          report.displayOnlyCount++
          if (!opts.dryRun) {
            const targetPath = join(displayRoot, deck, file)
            mkdirSync(dirname(targetPath), { recursive: true })
            writeFileSync(targetPath, result.displayText)
            // Leave shared/cards/<deck>/<file>.ts untouched (no _impl to extract)
          }
          continue
        }
        // split
        report.splitCount++
        if (!opts.dryRun) {
          const displayTarget = join(displayRoot, deck, file)
          mkdirSync(dirname(displayTarget), { recursive: true })
          writeFileSync(displayTarget, result.displayText)
          writeFileSync(fullPath, result.implText)
        }
      } catch (e) {
        report.errors.push({ path: sourcePath, reason: (e as Error).message })
      }
    }
  }

  return report
}

// CLI
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  const dryRun = !process.argv.includes('--write')
  const report = runCodemod({ dryRun, rootDir: resolve(__dirname, '..') })
  console.log(`Codemod ${dryRun ? '(dry-run)' : '(WET)'}:`)
  console.log(`  Total card files: ${report.totalCardFiles}`)
  console.log(`  Split:            ${report.splitCount}`)
  console.log(`  Display-only:     ${report.displayOnlyCount}`)
  console.log(`  Skip + errors:    ${report.skipCount + report.errors.length}`)
  if (report.errors.length > 0) {
    console.log('\nErrors:')
    for (const e of report.errors) console.log(`  ${e.path}: ${e.reason}`)
  }
  process.exit(report.errors.length > 0 ? 1 : 0)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
pnpm exec tsc --noEmit scripts/codemod-cards-display.ts 2>&1 | head -10
```

Expected: 0 errors (or minor adjustments).

- [ ] **Step 3: Add package.json script**

Edit `package.json`, add to `"scripts"`:

```json
"codemod:cards-display": "tsx scripts/codemod-cards-display.ts"
```

- [ ] **Step 4: Run dry-run to inspect plan**

```bash
pnpm run codemod:cards-display 2>&1 | head -30
```

Expected: prints totals + any errors. Note count of errors (these are corner cases for Phase B).

- [ ] **Step 5: Commit**

```bash
git add scripts/codemod-cards-display.ts package.json
git commit -m "feat(s6b): add CLI driver for codemod (dry-run by default)"
```

---

## Phase B: Iterate codemod rules to 0 errors on dry-run

### Task B1: Triage corner cases from dry-run

- [ ] **Step 1: Capture full dry-run report**

```bash
pnpm run codemod:cards-display 2>&1 > /tmp/codemod-dryrun.log
cat /tmp/codemod-dryrun.log | head -100
```

- [ ] **Step 2: Categorize errors**

Open `/tmp/codemod-dryrun.log`. For each error, classify:
- **Helper function in same file** (display + impl both reference): need to duplicate or hoist to `shared/cards-display/helpers/`
- **Multi-export pattern** (e.g. one file declares 2 cards): rare but possible — adjust codemod to handle
- **Display const has impl-side helper import** (e.g. `prerequisite` field calls a function): split helper into pure data + runtime
- **Unusual statement order** (e.g. impl before display): codemod should handle order-independent

- [ ] **Step 3: For each error category, patch `scripts/codemod-cards-display.ts`**

Iterate: patch → re-run dry-run → re-categorize remaining errors. Re-add new fixture cases to `codemod-cards-display.test.ts` for each category to lock in.

- [ ] **Step 4: Commit each fix**

```bash
git add scripts/codemod-cards-display.ts scripts/__tests__/
git commit -m "fix(s6b): codemod handles <category> corner case"
```

(Repeat per category. Aim for 0 dry-run errors before Phase C.)

- [ ] **Step 5: Final dry-run — 0 errors**

```bash
pnpm run codemod:cards-display 2>&1 | tail -10
```

Expected: `Errors: 0` AND `Skip + errors: 0`.

---

## Phase C: Wet-run codemod (1 large commit)

### Task C1: Create `shared/cards-display/<deck>/` directory skeletons

- [ ] **Step 1: Pre-create dirs (codemod also does this but make it explicit)**

```bash
for deck in A B C D E major community __stubs__; do
  mkdir -p shared/cards-display/$deck
done
```

### Task C2: Wet-run codemod

- [ ] **Step 1: Run with `--write`**

```bash
pnpm run codemod:cards-display -- --write 2>&1 | tail -10
```

Expected: `Errors: 0`. ~824 split + 0 display-only (or small N).

- [ ] **Step 2: Verify 824 cards-display files exist**

```bash
find shared/cards-display -name "*.ts" -type f | wc -l
```

Expected: ~824 (should match the count of card files — minor depending on `__stubs__` count).

- [ ] **Step 3: Spot-check a few outputs**

```bash
diff <(cat scripts/__tests__/fixtures/cards-display-codemod/A/A1_Shelter.expected.display.ts) <(cat shared/cards-display/A/A1_Shelter.ts)
diff <(cat scripts/__tests__/fixtures/cards-display-codemod/A/A1_Shelter.expected.impl.ts) <(cat shared/cards/A/A1_Shelter.ts)
```

Expected: identical (or only whitespace differences).

- [ ] **Step 4: Run test:fast to catch any regressions immediately**

```bash
pnpm test:fast 2>&1 | tail -5
```

(Expected at this stage: tests likely fail because catalog still imports from `shared/cards/<deck>/<file>` for the display const, but those files now contain only `_impl`. We'll fix in Phase D.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(s6b): wet-run codemod — split 824 cards into display + impl files"
```

---

## Phase D: Connect-fix (catalog + barrels + register-all)

### Task D1: Update `shared/cards/catalog.ts` imports

**Files:**
- Modify: `shared/cards/catalog.ts` — change all card display imports

- [ ] **Step 1: Inspect current catalog imports**

```bash
grep -nE "^import.*from '\\./[A-E]/" shared/cards/catalog.ts | head -10
```

- [ ] **Step 2: Batch-rewrite catalog imports**

```bash
# All `from './A/X'` (display const) need to become `from '../cards-display/A/X'`
sed -i -E "s|from '\\./([A-E]|major|community|__stubs__)/([A-Za-z0-9_]+)'|from '../cards-display/\\1/\\2'|g" shared/cards/catalog.ts
```

- [ ] **Step 3: Verify catalog still compiles**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -E "catalog\.ts|cards-display" | head -10
```

Expected: 0 errors specifically on catalog.

- [ ] **Step 4: Commit**

```bash
git add shared/cards/catalog.ts
git commit -m "refactor(s6b): update catalog.ts imports to cards-display"
```

---

### Task D2: Verify register-all.ts still works (no change expected)

- [ ] **Step 1: Verify register-all imports still valid**

```bash
grep -n "^import" shared/cards/register-all.ts | head -3
# Should still be `from './A/A1_Shelter'` etc — pointing at cards/ files which still export `_impl`.
```

- [ ] **Step 2: Verify ALL_CARD_IMPLS resolves**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep "register-all\|ALL_CARD_IMPLS" | head -10
```

Expected: 0 errors.

(No commit needed if no edits.)

---

### Task D3: Update `shared/cards/index.ts` and other barrel files

- [ ] **Step 1: Find all barrel files**

```bash
ls shared/cards/index.ts shared/cards/major/index.ts 2>&1
grep -rln "^export.*from '\\./" shared/cards/ 2>/dev/null | head -10
```

- [ ] **Step 2: For each barrel, identify which exports are display vs impl**

For `shared/cards/major/index.ts` (and similar): if it re-exports `MajorCardName` (display const), change to import from `shared/cards-display/major/<file>`. If it re-exports `_impl`, leave alone.

Manual inspection per file. Use sed only after confirming the pattern.

```bash
sed -i -E "s|export \\* from '\\./([A-Za-z0-9_]+)'|export \\* from '../../cards-display/major/\\1'|g" shared/cards/major/index.ts
# (or similar — engineer decides based on barrel content)
```

- [ ] **Step 3: Verify**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -10
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(s6b): update card barrels to re-export display from cards-display"
```

---

### Task D4: Fix any remaining cross-imports

- [ ] **Step 1: Find any test/fixture that imports a card display const from old path**

```bash
grep -rln "from '.*/shared/cards/[A-E]/[A-Z]" shared/ server/ client/ 2>/dev/null | head -20
```

(These should now be impl-only imports — display imports should go to `cards-display/`.)

- [ ] **Step 2: For each such reference, decide: is it importing display const (move to cards-display) or `_impl` (leave alone)?**

Engineer reads each match. For display const usages, sed-replace path:

```bash
# Example pattern (verify carefully before sed):
grep -rl "import { A1_Shelter } from '.*/shared/cards/A/A1_Shelter'" . | xargs sed -i 's|/shared/cards/A/A1_Shelter|/shared/cards-display/A/A1_Shelter|g'
```

Or more generally: if a file imports `<CardName>` (no `_impl`), redirect.

- [ ] **Step 3: Run test:fast + tsc**

```bash
pnpm test:fast 2>&1 | tail -3
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(s6b): redirect remaining display-const imports to cards-display"
```

---

## Phase E: Build verification + bundle measurement

### Task E1: Inspect bundle size after split

- [ ] **Step 1: Run build**

```bash
pnpm run build 2>&1 | grep -E "dist/.*\.js\s|dist/.*\.css\s" | head -20
```

Capture sizes for `index-*.js` (main) and `WorkshopPage-*.js` (sandbox-ish chunk).

Expected: main bundle drops significantly. Target: ≤ 400 KB raw / 130 KB gz. If not yet hit, investigate which deps still pull through.

- [ ] **Step 2: Diagnose remaining bundle bloat (if main > 400 KB)**

```bash
pnpm run build -- --mode production 2>&1 | tail -30
# Or use bundle visualizer if installed:
# pnpm exec vite-bundle-visualizer
```

Identify top contributors. Likely candidates: a card whose display side still references an impl-only helper, or a barrel file unintentionally importing impl. Patch and re-codemod the affected card.

- [ ] **Step 3: Commit any fix**

```bash
git add -A
git commit -m "perf(s6b): drop <module> from main bundle by hoisting helper to cards-display"
```

### Task E2: Final test + lint + tsc

- [ ] **Step 1: Run full local CI**

```bash
pnpm run lint 2>&1 | tail -3
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
pnpm exec tsc -p tsconfig.server.json --noEmit 2>&1 | grep -v node_modules | head -5
pnpm test:fast 2>&1 | tail -3
pnpm run build 2>&1 | tail -5
pnpm run check:bundle-size 2>&1 | tail -3
```

Expected: lint 0 errors, tsc 0 errors, test:fast 2271 pass / 0 fail, build success, bundle within 550/170 (NOT yet tightened to 400 — that's S6c).

---

## Phase F: ESLint cards-display boundary rule

### Task F1: Add ESLint error-level rule for cards-display isolation

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Add rule block to `eslint.config.js`**

Append a new rule object before the final closing `]`:

```javascript
// S6b: cards-display is bundle-isolated. Forbid imports of impl layers.
{
  files: ['shared/cards-display/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: [
            '**/shared/actions/**',
            '**/shared/engine/**',
            '**/shared/session/**',
            '**/shared/cards/**',
            '../actions/**',
            '../engine/**',
            '../session/**',
            '../cards/**',
            '../../actions/**',
            '../../engine/**',
            '../../session/**',
            '../../cards/**',
          ],
          message: 'shared/cards-display/** must not import impl layers (actions/engine/session/cards). Use shared/contract/* for shared types.',
        },
      ],
    }],
  },
},
```

- [ ] **Step 2: Run lint**

```bash
pnpm run lint 2>&1 | grep -E "error|cards-display" | head -20
```

Expected: 0 errors if codemod produced clean output. If any errors, the codemod missed an impl-side import in display — patch the affected card manually OR enhance codemod and re-run.

- [ ] **Step 3: Fix any violations**

For each violation:
- If a helper is duplicated to display side (codemod copied it incorrectly): move to `shared/cards-display/helpers/<helper>.ts` and update display files to import from there.
- If a card legitimately needs an impl helper for display (rare): re-evaluate whether it should actually be display.

- [ ] **Step 4: Commit ESLint rule + any fixes**

```bash
git add -A
git commit -m "refactor(s6b): add ESLint error rule for cards-display impl-isolation"
```

---

### Task F2: Delete `shared/cards/types.ts` transition shim from S6a

After cards files have been rewritten by codemod, they should now import directly from `cards-display/types` and `contract/cards`, no longer from `./types` shim.

- [ ] **Step 1: Verify no card file imports from `./types` (the cards/types.ts shim)**

```bash
grep -rln "from '\\.\\./types'\|from '\\./types'" shared/cards/ 2>/dev/null | head -10
```

If any remaining: those need to be redirected to either `shared/cards-display/types` or `shared/contract/cards`. Use sed.

- [ ] **Step 2: Verify codemod outputs use direct imports**

```bash
grep -nE "from '\\.\\./types'" shared/cards/A/A1_Shelter.ts
```

Expected: empty (codemod should have written `from '../../cards-display/A/A1_Shelter'` for the back-import, and `from '../registry'` for `CardImpl` — neither is the shim).

- [ ] **Step 3: Delete shim**

```bash
git rm shared/cards/types.ts
```

- [ ] **Step 4: Run full local CI**

```bash
pnpm run lint 2>&1 | tail -3
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | grep -v node_modules | head -5
pnpm test:fast 2>&1 | tail -3
pnpm run build 2>&1 | tail -3
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(s6b): delete shared/cards/types.ts transition shim (S6a leftover)"
```

---

## Phase G: Push and wait for CI

### Task G1: Final sanity grep + push

- [ ] **Step 1: Sanity grep — no `<CardName>` imported from `shared/cards/<deck>/` (display-only patterns)**

```bash
grep -rln "import { [A-Z][A-Za-z0-9_]*[a-zA-Z] } from '.*shared/cards/[A-E]/" shared/ server/ client/ 2>/dev/null | head -5
```

Expected: only `_impl` imports remain (e.g. `import { A1_Shelter_impl }`). Plain display imports should all go to `cards-display/`.

- [ ] **Step 2: Push**

```bash
git fetch origin main
git checkout main
git merge --ff-only sprint-S6b-cards-split
git push origin main
```

- [ ] **Step 3: Wait for GitHub Actions**

```bash
export $(grep '^GH_TOKEN=' .env | xargs)
HEAD_SHA=$(git rev-parse HEAD)
curl -s -H "Authorization: Bearer $GH_TOKEN" "https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=5" | jq -r ".workflow_runs[] | select(.head_sha == \"$HEAD_SHA\") | \"\\(.name) | \\(.status) | \\(.conclusion)\""
```

Expected: CI / Deploy Backend / Deploy Frontend all `success`.

---

## DoD Checklist

- [ ] D1: `scripts/codemod-cards-display.ts` exists with 5+ unit tests
- [ ] D2: `shared/cards-display/<deck>/` has ~824 display files
- [ ] D3: `shared/cards/<deck>/` files all reduced to `_impl` + back-import display
- [ ] D4: `shared/cards/types.ts` shim deleted
- [ ] D5: `shared/cards/catalog.ts` imports from `cards-display/`
- [ ] D6: ESLint rule blocks `cards-display/**` from impl imports — 0 errors
- [ ] D7: `pnpm test:fast` 2271 pass / 0 fail
- [ ] D8: `pnpm run build` main bundle ≤ 400 KB raw / 130 KB gz (target — measure and tighten in S6c)
- [ ] D9: `pnpm run lint` 0 errors, `tsc app+server` 0 errors
- [ ] D10: GitHub Actions all green
