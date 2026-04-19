# PR-1 Architecture Infrastructure Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为三层架构重构铺好基础设施（CI、manifest 构建、CardRegistry 类骨架、GameCore 搬迁到 shared/、custom-code 共享目录），不改动任何卡牌文件、不删 DSL、不改 src/→client/，保证所有现有测试和本地启动零回归。

**Architecture:** 纯"**加法**"式改造——新增代码 + 对老入口加 `@deprecated` + 用兼容 re-export 桥接老位置。`server/game-session.ts` 的 GameSession 类改由 `shared/session/game-core.ts` 的 `GameCore` 基类 + server 侧 DI 子类提供，依赖注入唯一的 Node-only 入口（`registerExecutorBackedCustomCard`）。CardRegistry 类只建骨架、不接线，PR-2 才把卡牌改造完后切入。

**Tech Stack:** TypeScript, Vitest, TSX, GitHub Actions, pnpm (workspace-free 单仓)

**Source spec:** `docs/superpowers/specs/2026-04-19-architecture-three-layer-split-design.md` §9 PR-1

---

## File Structure

**Create:**
- `.github/workflows/ci.yml` — CI workflow（非严格模式）
- `scripts/build-cards-manifest.ts` — AST 扫所有卡，产 `public/cards-manifest.json`
- `scripts/check-reaches.ts` — CI 校验：reaches 声明一致性（PR-1 warn-only，无 `_impl` 导出就 no-op）
- `scripts/check-no-dsl.ts` — CI 校验：代码库不得出现 DSL 关键字（PR-1 warn-only）
- `scripts/check-bundle-size.ts` — CI 校验：主包大小（PR-1 print-only）
- `scripts/__tests__/build-cards-manifest.test.ts`
- `scripts/__tests__/check-reaches.test.ts`
- `scripts/__tests__/check-no-dsl.test.ts`
- `scripts/__tests__/check-bundle-size.test.ts`
- `shared/cards/registry.ts` — CardRegistry 类（未接线）
- `shared/cards/__tests__/registry.test.ts`
- `shared/custom-code/types.ts` — 从 `shared/cards/custom-code-types.ts` 搬来
- `shared/custom-code/executor.ts` — `CustomCodeExecutor` 接口定义
- `shared/custom-code/ast-validator.ts` — 从 `server/ast-validator.ts` 搬来
- `shared/session/game-core.ts` — 从 `server/game-session.ts` 搬来，改名 `GameCore`，加 DI
- `public/cards-manifest.json` — 构建期产物（构建时生成，不 commit）

**Modify:**
- `package.json` — 加 4 条 npm scripts，加 prebuild hook
- `.gitignore` — 忽略 `public/cards-manifest.json`（构建产物）
- `shared/cards/custom-code-types.ts` — 改为薄 re-export（`export * from '../custom-code/types'`）
- `server/ast-validator.ts` — 改为薄 re-export（`export * from '../shared/custom-code/ast-validator'`）
- `server/game-session.ts` — 改为 `GameCore` 的 server 子类（注入 `registerExecutorBackedCustomCard`）
- `shared/cards/card-listeners.ts` — `registerCardListener` 上加 `@deprecated` JSDoc
- `shared/cards/card-effects.ts` — `registerCardEffect` 上加 `@deprecated` JSDoc
- `shared/cards/card-modifiers.ts` — `registerCardModifier`（若存在）上加 `@deprecated` JSDoc

**Keep unchanged in PR-1:**
- 所有 `shared/cards/{A,B,C,D,E,major}/*.ts` 卡牌文件
- 所有 `server/custom-code-executor/` 文件
- 所有 `src/` 前端文件
- ESLint 规则（`no-restricted-imports` 还不启用）
- `package.json.sideEffects` 字段（还不启用）

---

## Task 1: Add npm script placeholders

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Read current scripts block**

Run: `grep -n '"scripts":' package.json`
Expected: line number (currently line 7).

- [ ] **Step 2: Add 4 check scripts + cards-manifest script**

Edit `package.json`'s `"scripts"` block. After the existing `"verify"` line, insert:

```json
    "check:reaches": "tsx scripts/check-reaches.ts",
    "check:no-dsl": "tsx scripts/check-no-dsl.ts",
    "check:bundle-size": "tsx scripts/check-bundle-size.ts",
    "build:cards-manifest": "tsx scripts/build-cards-manifest.ts",
    "prebuild": "pnpm run build:cards-manifest",
```

（`prebuild` hook 让 `pnpm run build` 自动先跑 manifest 脚本）

- [ ] **Step 3: Verify scripts registered**

Run: `pnpm run check:reaches 2>&1 | head -5`
Expected: 报错说 "Cannot find module scripts/check-reaches.ts"（因为还没建）—— 脚本名已经被 npm 识别，只是目标文件不存在。

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: add npm script placeholders for CI checks and manifest build"
```

---

## Task 2: Build cards-manifest.ts (AST meta extractor)

**Purpose:** 读 `shared/cards/{A,B,C,D,E}/*.ts` 和 `shared/cards/major/*.ts`，AST 解析每张卡的 `new Occupation({...})` / `new MinorImprovement({...})` / `new MajorImprovement({...})` 构造调用，提取 meta 字段（id、name、deck、number、category、desc、cost、players、newSet、prerequisite），生成 `public/cards-manifest.json`。PR-1 的 `reaches` 字段对所有卡都是空数组（`[]`），因为卡牌还没改造成 `_impl` 形式。

**Files:**
- Create: `scripts/build-cards-manifest.ts`
- Create: `scripts/__tests__/build-cards-manifest.test.ts`
- Create: `public/` 下构建产物（不 commit）
- Modify: `.gitignore`

- [ ] **Step 1: Add `public/cards-manifest.json` to .gitignore**

Append to `.gitignore`:

```
# Build product from scripts/build-cards-manifest.ts
public/cards-manifest.json
```

- [ ] **Step 2: Create test fixture cards**

Create `scripts/__tests__/fixtures/cards/A/A999_TestCard.ts`:

```ts
import { Occupation } from '../../../../shared/cards/types'

export const A999_TestCard = new Occupation({
  id: 'A999_TestCard',
  name: 'Test Card',
  deck: 'A',
  number: 999,
  category: 'FOOD_PROVIDER',
  desc: ['A test card for unit tests.'],
  cost: {},
  players: '1+',
})
```

Create `scripts/__tests__/fixtures/cards/major/MA_Test.ts`:

```ts
import { MajorImprovement } from '../../../../shared/cards/types'

export const MA_Test = new MajorImprovement({
  id: 'MA_Test',
  name: 'Major Test',
  deck: 'major',
  number: 1,
  desc: ['A test major improvement.'],
  cost: { wood: 2, clay: 1 },
})
```

- [ ] **Step 3: Write the failing test**

Create `scripts/__tests__/build-cards-manifest.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { buildCardsManifest } from '../build-cards-manifest'

const fixturesRoot = path.resolve(__dirname, 'fixtures/cards')

describe('buildCardsManifest', () => {
  it('extracts meta from a single Occupation card', () => {
    const manifest = buildCardsManifest(fixturesRoot)
    expect(manifest['A999_TestCard']).toBeDefined()
    expect(manifest['A999_TestCard'].meta).toEqual({
      id: 'A999_TestCard',
      name: 'Test Card',
      deck: 'A',
      number: 999,
      category: 'FOOD_PROVIDER',
      desc: ['A test card for unit tests.'],
      cost: {},
      players: '1+',
    })
    expect(manifest['A999_TestCard'].reaches).toEqual([])
    expect(manifest['A999_TestCard'].module).toMatch(/A\/A999_TestCard$/)
  })

  it('extracts meta from a MajorImprovement card', () => {
    const manifest = buildCardsManifest(fixturesRoot)
    expect(manifest['MA_Test']).toBeDefined()
    expect(manifest['MA_Test'].meta.deck).toBe('major')
    expect(manifest['MA_Test'].meta.cost).toEqual({ wood: 2, clay: 1 })
  })

  it('defaults reaches to empty array for all cards', () => {
    const manifest = buildCardsManifest(fixturesRoot)
    for (const id of Object.keys(manifest)) {
      expect(manifest[id].reaches).toEqual([])
    }
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/__tests__/build-cards-manifest.test.ts`
Expected: FAIL with "Cannot find module '../build-cards-manifest'"

- [ ] **Step 5: Implement build-cards-manifest.ts**

Create `scripts/build-cards-manifest.ts`:

```ts
#!/usr/bin/env tsx
/**
 * Build cards manifest for lazy loading.
 *
 * Scans shared/cards/{A,B,C,D,E,major}/*.ts and extracts meta fields
 * from each card's constructor call (Occupation / MinorImprovement / MajorImprovement).
 *
 * Output: public/cards-manifest.json
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export type CardMeta = {
  id: string
  name: string
  deck: string
  number: number
  category?: string
  desc?: string[]
  cost?: Record<string, number>
  players?: string
  newSet?: boolean
  prerequisite?: unknown
}

export type CardManifestEntry = {
  meta: CardMeta
  module: string
  reaches: string[]
}

export type CardsManifest = Record<string, CardManifestEntry>

const META_FIELDS = new Set([
  'id', 'name', 'deck', 'number', 'category', 'desc',
  'cost', 'players', 'newSet', 'prerequisite',
])

const CARD_CLASSES = new Set(['Occupation', 'MinorImprovement', 'MajorImprovement'])

function extractValueFromExpr(expr: ts.Expression): unknown {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text
  if (ts.isNumericLiteral(expr)) return Number(expr.text)
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return true
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return false
  if (expr.kind === ts.SyntaxKind.NullKeyword) return null
  if (ts.isArrayLiteralExpression(expr)) {
    return expr.elements.map((el) => extractValueFromExpr(el))
  }
  if (ts.isObjectLiteralExpression(expr)) {
    const obj: Record<string, unknown> = {}
    for (const prop of expr.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const key = prop.name.getText()
      obj[key.replace(/["']/g, '')] = extractValueFromExpr(prop.initializer)
    }
    return obj
  }
  // Identifier reference (like `CARD_ID`) — return the text; caller can resolve later
  if (ts.isIdentifier(expr)) return { __identifier: expr.text }
  // Unresolvable (e.g., computed modifiers array)
  return undefined
}

function parseCardFile(filePath: string, constants: Map<string, unknown>): CardMeta | null {
  const source = fs.readFileSync(filePath, 'utf8')
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)

  // Collect const declarations (like `const CARD_ID = '...'`)
  for (const stmt of sf.statements) {
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.initializer) {
          const val = extractValueFromExpr(decl.initializer)
          if (typeof val === 'string' || typeof val === 'number') {
            constants.set(decl.name.text, val)
          }
        }
      }
    }
  }

  // Find `new Occupation({...})` / `new MinorImprovement({...})` / `new MajorImprovement({...})`
  let result: CardMeta | null = null
  const visit = (node: ts.Node): void => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && CARD_CLASSES.has(node.expression.text)) {
      const arg = node.arguments?.[0]
      if (arg && ts.isObjectLiteralExpression(arg)) {
        const meta: Record<string, unknown> = {}
        for (const prop of arg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue
          const keyName = ts.isIdentifier(prop.name) ? prop.name.text
            : ts.isStringLiteral(prop.name) ? prop.name.text
            : prop.name.getText().replace(/["']/g, '')
          if (!META_FIELDS.has(keyName)) continue
          let value = extractValueFromExpr(prop.initializer)
          // Resolve identifier references to constants
          if (value && typeof value === 'object' && '__identifier' in value) {
            const resolved = constants.get((value as { __identifier: string }).__identifier)
            value = resolved !== undefined ? resolved : null
          }
          meta[keyName] = value
        }
        result = meta as unknown as CardMeta
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return result
}

export function buildCardsManifest(cardsRoot: string): CardsManifest {
  const manifest: CardsManifest = {}
  const decks = ['A', 'B', 'C', 'D', 'E', 'major']
  for (const deck of decks) {
    const deckDir = path.join(cardsRoot, deck)
    if (!fs.existsSync(deckDir)) continue
    const files = fs.readdirSync(deckDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    for (const file of files) {
      const filePath = path.join(deckDir, file)
      const constants = new Map<string, unknown>()
      const meta = parseCardFile(filePath, constants)
      if (!meta || !meta.id) continue
      const modulePath = path.relative(
        path.resolve(cardsRoot, '..', '..'),
        filePath.replace(/\.ts$/, ''),
      )
      manifest[meta.id] = {
        meta,
        module: modulePath,
        reaches: [],
      }
    }
  }
  return manifest
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith('build-cards-manifest.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const cardsRoot = path.join(repoRoot, 'shared', 'cards')
  const outputPath = path.join(repoRoot, 'public', 'cards-manifest.json')
  const manifest = buildCardsManifest(cardsRoot)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')
  console.log(`[build-cards-manifest] wrote ${Object.keys(manifest).length} cards to ${outputPath}`)
}
```

- [ ] **Step 6: Run test**

Run: `pnpm exec vitest run scripts/__tests__/build-cards-manifest.test.ts`
Expected: PASS — all three tests green.

- [ ] **Step 7: Smoke-run on real cards**

Run: `pnpm run build:cards-manifest`
Expected: logs `[build-cards-manifest] wrote N cards to .../public/cards-manifest.json` with N ≥ 300.

- [ ] **Step 8: Sanity-check output**

Run: `node -e 'const m = JSON.parse(require("fs").readFileSync("public/cards-manifest.json")); console.log("cards:", Object.keys(m).length); console.log("A107_Catcher meta:", JSON.stringify(m["A107_Catcher"]?.meta))'`
Expected: 
- cards count ≥ 300
- `A107_Catcher` meta has `name: 'Catcher'`, `deck: 'A'`, `number: 107`

- [ ] **Step 9: Commit**

```bash
git add scripts/build-cards-manifest.ts scripts/__tests__/build-cards-manifest.test.ts scripts/__tests__/fixtures/ .gitignore package.json
git commit -m "feat(scripts): add cards manifest builder for lazy-load prep"
```

---

## Task 3: check-no-dsl.ts (warn-only)

**Purpose:** CI 脚本，grep 整个代码库看是否含 DSL 关键字。PR-1 里 DSL 代码还在，所以此脚本**打印警告但不 fail**，PR-2 删完 DSL 后再改成 fail 模式。

**Files:**
- Create: `scripts/check-no-dsl.ts`
- Create: `scripts/__tests__/check-no-dsl.test.ts`
- Create: `scripts/__tests__/fixtures/dsl-samples/`

- [ ] **Step 1: Create test fixtures**

Create `scripts/__tests__/fixtures/dsl-samples/clean.ts`:
```ts
export const FOO = 'bar'
```

Create `scripts/__tests__/fixtures/dsl-samples/dirty.ts`:
```ts
export const x: CardDslEffects = {}
const y = dslToCardEffect('X', {})
```

- [ ] **Step 2: Write the failing test**

Create `scripts/__tests__/check-no-dsl.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { findDslHits } from '../check-no-dsl'

const fixturesRoot = path.resolve(__dirname, 'fixtures/dsl-samples')

describe('check-no-dsl', () => {
  it('finds DSL keywords in dirty file', () => {
    const hits = findDslHits([path.join(fixturesRoot, 'dirty.ts')])
    expect(hits.length).toBeGreaterThan(0)
    expect(hits.some((h) => h.keyword === 'CardDslEffects')).toBe(true)
    expect(hits.some((h) => h.keyword === 'dslToCardEffect')).toBe(true)
  })

  it('returns empty for clean file', () => {
    const hits = findDslHits([path.join(fixturesRoot, 'clean.ts')])
    expect(hits).toEqual([])
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/__tests__/check-no-dsl.test.ts`
Expected: FAIL with "Cannot find module '../check-no-dsl'"

- [ ] **Step 4: Implement check-no-dsl.ts**

Create `scripts/check-no-dsl.ts`:

```ts
#!/usr/bin/env tsx
/**
 * CI guard: ensure DSL path is completely removed.
 *
 * PR-1: warn-only (DSL still present, don't fail the build).
 * PR-2: flipped to strict — any DSL keyword fails CI.
 *
 * Usage:
 *   pnpm run check:no-dsl [--strict]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const DSL_KEYWORDS = [
  'effect_dsl',
  'effectDsl',
  'dslToCardEffect',
  'custom-dsl-runner',
  'CardDslEffects',
  'DslStep',
  'DslEffect',
  'DslCondition',
]

const ALLOW_LIST_PATTERNS = [
  /^CHANGELOG\.md$/,
  /^docs\/superpowers\/specs\/.*\.md$/,
  /^docs\/superpowers\/plans\/.*\.md$/,
  /^scripts\/check-no-dsl\.ts$/,
  /^scripts\/__tests__\/check-no-dsl\.test\.ts$/,
  /^scripts\/__tests__\/fixtures\/dsl-samples\//,
]

const SCAN_DIRS = ['shared', 'server', 'src', 'scripts']
const SCAN_EXTS = new Set(['.ts', '.tsx', '.js', '.jsx', '.json'])
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '__stubs__'])

export type DslHit = { file: string; line: number; keyword: string; text: string }

function walkDir(dir: string, repoRoot: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    const rel = path.relative(repoRoot, full)
    if (ALLOW_LIST_PATTERNS.some((rx) => rx.test(rel))) continue
    if (entry.isDirectory()) {
      walkDir(full, repoRoot, out)
    } else if (SCAN_EXTS.has(path.extname(entry.name))) {
      out.push(full)
    }
  }
  return out
}

export function findDslHits(files: string[]): DslHit[] {
  const hits: DslHit[] = []
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const lines = content.split('\n')
    lines.forEach((line, idx) => {
      for (const kw of DSL_KEYWORDS) {
        if (line.includes(kw)) {
          hits.push({ file, line: idx + 1, keyword: kw, text: line.trim() })
        }
      }
    })
  }
  return hits
}

if (process.argv[1] && process.argv[1].endsWith('check-no-dsl.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const strict = process.argv.includes('--strict')
  const allFiles: string[] = []
  for (const dir of SCAN_DIRS) {
    const full = path.join(repoRoot, dir)
    if (fs.existsSync(full)) walkDir(full, repoRoot, allFiles)
  }
  const hits = findDslHits(allFiles)
  if (hits.length === 0) {
    console.log('[check-no-dsl] ✓ no DSL keywords found')
    process.exit(0)
  }
  const byKeyword: Record<string, number> = {}
  for (const h of hits) byKeyword[h.keyword] = (byKeyword[h.keyword] ?? 0) + 1
  console.warn(`[check-no-dsl] ${hits.length} hits across ${new Set(hits.map((h) => h.file)).size} files:`)
  for (const [kw, n] of Object.entries(byKeyword)) console.warn(`  ${kw}: ${n}`)
  if (strict) {
    console.error('[check-no-dsl] strict mode: failing build')
    for (const h of hits.slice(0, 20)) {
      console.error(`  ${path.relative(repoRoot, h.file)}:${h.line}  [${h.keyword}]  ${h.text}`)
    }
    process.exit(1)
  } else {
    console.warn('[check-no-dsl] warn mode (PR-1): DSL deletion scheduled for PR-2, not failing build')
    process.exit(0)
  }
}
```

- [ ] **Step 5: Run test**

Run: `pnpm exec vitest run scripts/__tests__/check-no-dsl.test.ts`
Expected: PASS.

- [ ] **Step 6: Smoke-run**

Run: `pnpm run check:no-dsl`
Expected: warn summary listing DSL hits by keyword (DSL still in repo pre-PR-2), exit code 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-no-dsl.ts scripts/__tests__/check-no-dsl.test.ts scripts/__tests__/fixtures/dsl-samples/
git commit -m "feat(scripts): add check-no-dsl CI guard (warn-only, PR-2 flips to strict)"
```

---

## Task 4: check-reaches.ts (warn-only, no-op if no _impl)

**Purpose:** CI 脚本，扫卡牌 `_impl` 导出，对比 handler 里字符串字面量与 `reaches` 声明。PR-1 没有任何卡被改造成 `_impl` 形态，所以脚本运行应输出"0 卡需要检查"。PR-2 卡牌改造完后，此脚本开始做实质工作。

**Files:**
- Create: `scripts/check-reaches.ts`
- Create: `scripts/__tests__/check-reaches.test.ts`
- Create: `scripts/__tests__/fixtures/reaches-samples/`

- [ ] **Step 1: Create test fixtures**

Create `scripts/__tests__/fixtures/reaches-samples/A_no_impl.ts`:
```ts
import { Occupation } from '../../../shared/cards/types'
export const A1_NoImpl = new Occupation({ id: 'A1_NoImpl', name: 'No Impl', deck: 'A', number: 1 })
```

Create `scripts/__tests__/fixtures/reaches-samples/B_impl_clean.ts`:
```ts
import { Occupation } from '../../../shared/cards/types'
export const B1_Clean = new Occupation({ id: 'B1_Clean', name: 'Clean', deck: 'B', number: 1 })
export const B1_Clean_impl = {
  listeners: [{ id: 'x', cardIds: ['B1_Clean'], handler: () => {} }],
  reaches: [] as readonly string[],
}
```

Create `scripts/__tests__/fixtures/reaches-samples/C_impl_missing.ts`:
```ts
import { Occupation } from '../../../shared/cards/types'
export const C1_Missing = new Occupation({ id: 'C1_Missing', name: 'Missing', deck: 'C', number: 1 })
export const C1_Missing_impl = {
  listeners: [{ id: 'x', cardIds: ['C1_Missing'], handler: () => {
    const other = 'D99_SomeOtherCard'  // should require reaches: ['D99_SomeOtherCard']
    return other
  } }],
  reaches: [] as readonly string[],
}
```

- [ ] **Step 2: Write the failing test**

Create `scripts/__tests__/check-reaches.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { checkReaches } from '../check-reaches'

const fixtures = path.resolve(__dirname, 'fixtures/reaches-samples')

describe('check-reaches', () => {
  it('returns no violations for cards without _impl', () => {
    const result = checkReaches([path.join(fixtures, 'A_no_impl.ts')])
    expect(result.violations).toEqual([])
    expect(result.cardsChecked).toBe(0)
  })

  it('returns no violations for clean _impl card', () => {
    const result = checkReaches([path.join(fixtures, 'B_impl_clean.ts')])
    expect(result.violations).toEqual([])
    expect(result.cardsChecked).toBe(1)
  })

  it('detects missing reach declaration', () => {
    const result = checkReaches([path.join(fixtures, 'C_impl_missing.ts')])
    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.violations[0]).toMatchObject({
      cardId: 'C1_Missing',
      missingReach: 'D99_SomeOtherCard',
    })
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/__tests__/check-reaches.test.ts`
Expected: FAIL with "Cannot find module '../check-reaches'"

- [ ] **Step 4: Implement check-reaches.ts**

Create `scripts/check-reaches.ts`:

```ts
#!/usr/bin/env tsx
/**
 * CI guard: each card's _impl.reaches must declare all external card IDs
 * referenced from its handler bodies.
 *
 * PR-1: warn-only (no cards have _impl yet).
 * PR-2: flipped to strict.
 */
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const CARD_ID_PATTERN = /^[A-E]\d+_[A-Z]\w*$/
const DECK_PATTERN = /^[A-E]:(all|\d+-\d+)$/

export type ReachViolation = {
  file: string
  cardId: string
  missingReach: string
  location: string
}

export type CheckReachesResult = {
  violations: ReachViolation[]
  cardsChecked: number
}

function extractStringLiterals(node: ts.Node): string[] {
  const out: string[] = []
  const visit = (n: ts.Node): void => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) out.push(n.text)
    ts.forEachChild(n, visit)
  }
  visit(node)
  return out
}

function findImplExport(sf: ts.SourceFile): { cardId: string; implNode: ts.Node; reaches: string[] } | null {
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt) || !stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue
    for (const decl of stmt.declarationList.declarations) {
      if (!ts.isIdentifier(decl.name)) continue
      const name = decl.name.text
      const implMatch = name.match(/^([A-E]\d+_\w+)_impl$/)
      if (!implMatch) continue
      const cardId = implMatch[1]
      if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue
      const reaches: string[] = []
      for (const prop of decl.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue
        const key = ts.isIdentifier(prop.name) ? prop.name.text : prop.name.getText()
        if (key === 'reaches' && ts.isArrayLiteralExpression(prop.initializer)) {
          for (const el of prop.initializer.elements) {
            if (ts.isStringLiteral(el)) reaches.push(el.text)
          }
        }
      }
      return { cardId, implNode: decl.initializer, reaches }
    }
  }
  return null
}

export function checkReaches(files: string[]): CheckReachesResult {
  const violations: ReachViolation[] = []
  let cardsChecked = 0
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    const implInfo = findImplExport(sf)
    if (!implInfo) continue
    cardsChecked += 1
    const { cardId, implNode, reaches } = implInfo
    const literals = extractStringLiterals(implNode)
    const allowedIds = new Set<string>([cardId, ...reaches.filter((r) => !DECK_PATTERN.test(r))])
    // Expand deck-range reaches to permit wildcard — PR-1 keeps this simple: only exact card-id check
    for (const literal of literals) {
      if (CARD_ID_PATTERN.test(literal) && !allowedIds.has(literal)) {
        // Skip if declared as deck-range (PR-2 will refine)
        if (reaches.some((r) => DECK_PATTERN.test(r))) continue
        violations.push({
          file,
          cardId,
          missingReach: literal,
          location: `line in ${path.basename(file)}`,
        })
      }
    }
  }
  return { violations, cardsChecked }
}

function walkCardFiles(cardsRoot: string): string[] {
  const out: string[] = []
  if (!fs.existsSync(cardsRoot)) return out
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === '__stubs__') continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) out.push(full)
    }
  }
  walk(cardsRoot)
  return out
}

if (process.argv[1] && process.argv[1].endsWith('check-reaches.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const strict = process.argv.includes('--strict')
  const cardsRoot = path.join(repoRoot, 'shared', 'cards')
  const files = walkCardFiles(cardsRoot)
  const { violations, cardsChecked } = checkReaches(files)
  if (cardsChecked === 0) {
    console.log('[check-reaches] 0 cards with _impl export (PR-1 state — cards not yet restructured)')
    process.exit(0)
  }
  console.log(`[check-reaches] checked ${cardsChecked} cards`)
  if (violations.length === 0) {
    console.log('[check-reaches] ✓ all reaches declarations consistent')
    process.exit(0)
  }
  console.warn(`[check-reaches] ${violations.length} violation(s):`)
  for (const v of violations.slice(0, 20)) {
    console.warn(`  ${path.relative(repoRoot, v.file)}  card=${v.cardId}  missing=${v.missingReach}`)
  }
  if (strict) process.exit(1)
  console.warn('[check-reaches] warn mode (PR-1): not failing build')
  process.exit(0)
}
```

- [ ] **Step 5: Run test**

Run: `pnpm exec vitest run scripts/__tests__/check-reaches.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 6: Smoke-run on real cards**

Run: `pnpm run check:reaches`
Expected: `[check-reaches] 0 cards with _impl export (PR-1 state ...)`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add scripts/check-reaches.ts scripts/__tests__/check-reaches.test.ts scripts/__tests__/fixtures/reaches-samples/
git commit -m "feat(scripts): add check-reaches CI guard (warn-only, no-op until PR-2)"
```

---

## Task 5: check-bundle-size.ts (print-only)

**Purpose:** CI 脚本，跑完 build 后读 `dist/assets/*.js` 找主 chunk，打印大小。PR-1 纯打印，PR-4 切严格模式（主包 > 300KB 失败）。

**Files:**
- Create: `scripts/check-bundle-size.ts`
- Create: `scripts/__tests__/check-bundle-size.test.ts`

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/check-bundle-size.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { findMainChunk, formatBytes } from '../check-bundle-size'

describe('check-bundle-size', () => {
  it('finds the largest JS chunk as main', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-test-'))
    const assetsDir = path.join(tmp, 'assets')
    fs.mkdirSync(assetsDir)
    fs.writeFileSync(path.join(assetsDir, 'index-abc.js'), 'a'.repeat(1000))
    fs.writeFileSync(path.join(assetsDir, 'chunk-xyz.js'), 'b'.repeat(500))
    fs.writeFileSync(path.join(assetsDir, 'style.css'), 'c'.repeat(100))

    const main = findMainChunk(assetsDir)
    expect(main).toMatchObject({ name: 'index-abc.js', size: 1000 })

    fs.rmSync(tmp, { recursive: true, force: true })
  })

  it('formats bytes to human-readable', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1500)).toBe('1.5 KB')
    expect(formatBytes(1500000)).toBe('1.4 MB')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run scripts/__tests__/check-bundle-size.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement check-bundle-size.ts**

Create `scripts/check-bundle-size.ts`:

```ts
#!/usr/bin/env tsx
/**
 * CI guard: main bundle size budget.
 *
 * PR-1: print-only.
 * PR-4: enforces main chunk < 300KB.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export type ChunkInfo = { name: string; size: number; path: string }

export function findMainChunk(assetsDir: string): ChunkInfo | null {
  if (!fs.existsSync(assetsDir)) return null
  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  let main: ChunkInfo | null = null
  for (const f of jsFiles) {
    const full = path.join(assetsDir, f)
    const size = fs.statSync(full).size
    if (!main || size > main.size) main = { name: f, size, path: full }
  }
  return main
}

export function listAllChunks(assetsDir: string): ChunkInfo[] {
  if (!fs.existsSync(assetsDir)) return []
  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  return jsFiles
    .map((f) => {
      const full = path.join(assetsDir, f)
      return { name: f, size: fs.statSync(full).size, path: full }
    })
    .sort((a, b) => b.size - a.size)
}

if (process.argv[1] && process.argv[1].endsWith('check-bundle-size.ts')) {
  const repoRoot = path.resolve(__dirname, '..')
  const assetsDir = path.join(repoRoot, 'dist', 'assets')
  const strict = process.argv.includes('--strict')
  if (!fs.existsSync(assetsDir)) {
    console.warn(`[check-bundle-size] no dist/assets/ — run "pnpm run build" first`)
    process.exit(0)
  }
  const chunks = listAllChunks(assetsDir)
  const main = chunks[0]
  console.log('[check-bundle-size] chunks:')
  for (const c of chunks.slice(0, 10)) {
    console.log(`  ${formatBytes(c.size).padStart(8)}  ${c.name}`)
  }
  if (!main) {
    console.warn('[check-bundle-size] no JS chunks found')
    process.exit(0)
  }
  console.log(`[check-bundle-size] main chunk: ${main.name} = ${formatBytes(main.size)}`)
  const LIMIT_STRICT = 300 * 1024
  if (strict && main.size > LIMIT_STRICT) {
    console.error(`[check-bundle-size] main chunk exceeds strict limit (${formatBytes(LIMIT_STRICT)})`)
    process.exit(1)
  }
  process.exit(0)
}
```

- [ ] **Step 4: Run test**

Run: `pnpm exec vitest run scripts/__tests__/check-bundle-size.test.ts`
Expected: PASS.

- [ ] **Step 5: Smoke-run (build must exist, or will warn gracefully)**

Run: `pnpm run check:bundle-size`
Expected: either warning about missing `dist/assets/`, or a list of chunk sizes. Exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/check-bundle-size.ts scripts/__tests__/check-bundle-size.test.ts
git commit -m "feat(scripts): add check-bundle-size CI guard (print-only, PR-4 flips to strict)"
```

---

## Task 6: GitHub Actions ci.yml

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Read existing workflow for reference**

Run: `cat .github/workflows/deploy-pages.yml | head -30`
Expected: See pnpm setup pattern used in repo.

- [ ] **Step 2: Create ci.yml**

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - name: Install deps
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm run lint

      - name: Unit tests
        run: pnpm test

      - name: Build (includes cards manifest)
        run: pnpm run build

      - name: Check reaches (warn-only in PR-1)
        run: pnpm run check:reaches

      - name: Check no-DSL (warn-only in PR-1)
        run: pnpm run check:no-dsl

      - name: Check bundle size (print-only in PR-1)
        run: pnpm run check:bundle-size
```

- [ ] **Step 3: Validate YAML syntax locally (optional)**

Run: `pnpm exec tsx -e "import yaml from 'js-yaml'; import fs from 'fs'; yaml.load(fs.readFileSync('.github/workflows/ci.yml', 'utf8')); console.log('YAML ok')" 2>&1 | tail -5`
Expected: "YAML ok" OR "Cannot find js-yaml" (acceptable — this is optional sanity check; skip if lib missing).

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add CI workflow for lint/test/build/checks (non-strict PR-1)"
```

---

## Task 7: CardRegistry class + tests

**Purpose:** 为 PR-2 准备的 per-session 卡牌注册表类。PR-1 只建骨架 + 单元测试，**不接线到 `GameCore` / 老全局**。

**Files:**
- Create: `shared/cards/registry.ts`
- Create: `shared/cards/__tests__/registry.test.ts`

- [ ] **Step 1: Read existing registration types**

Run: `grep -n "export type\|export interface" shared/cards/card-listeners.ts shared/cards/card-effects.ts shared/cards/card-modifiers.ts | head -20`
Expected: see existing types for `CardListenerRegistration`, `CardEffect`, `TradeModifier`, etc.

- [ ] **Step 2: Write failing test**

Create `shared/cards/__tests__/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { CardRegistry } from '../registry'
import type { CardListenerRegistration } from '../card-listeners'
import type { CardEffect } from '../card-effects'

describe('CardRegistry', () => {
  it('stores listeners by cardId after loadImpl', () => {
    const registry = new CardRegistry()
    const listener: CardListenerRegistration = {
      id: 'test-listener',
      cardIds: ['X1_Test'],
      phases: ['before'],
      actions: ['collect'],
      handler: () => undefined,
    }
    registry.loadImpl('X1_Test', { listeners: [listener] })
    expect(registry.getListenersFor('X1_Test')).toEqual([listener])
  })

  it('returns empty listeners for unknown card', () => {
    const registry = new CardRegistry()
    expect(registry.getListenersFor('X_Unknown')).toEqual([])
  })

  it('stores and retrieves effect by cardId', () => {
    const registry = new CardRegistry()
    const effect: CardEffect = { id: 'X1_Test', onBuy: () => undefined }
    registry.loadImpl('X1_Test', { effect })
    expect(registry.getEffect('X1_Test')).toBe(effect)
  })

  it('unload removes card entries', () => {
    const registry = new CardRegistry()
    const listener: CardListenerRegistration = {
      id: 'test-listener',
      cardIds: ['X1_Test'],
      handler: () => undefined,
    }
    registry.loadImpl('X1_Test', { listeners: [listener] })
    registry.unload('X1_Test')
    expect(registry.getListenersFor('X1_Test')).toEqual([])
  })

  it('snapshot returns current state copy', () => {
    const registry = new CardRegistry()
    registry.loadImpl('X1_Test', { effect: { id: 'X1_Test' } })
    const snap = registry.snapshot()
    expect(snap.cardIds).toContain('X1_Test')
  })

  it('keeps separate registries independent', () => {
    const r1 = new CardRegistry()
    const r2 = new CardRegistry()
    r1.loadImpl('X1_Test', { effect: { id: 'X1_Test' } })
    expect(r2.getEffect('X1_Test')).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm exec vitest run shared/cards/__tests__/registry.test.ts`
Expected: FAIL — "Cannot find module '../registry'".

- [ ] **Step 4: Implement CardRegistry**

Create `shared/cards/registry.ts`:

```ts
/**
 * CardRegistry — per-session, injectable card registration container.
 *
 * Replaces the current module-level global registries in `card-listeners.ts` /
 * `card-effects.ts` / `card-modifiers.ts`. PR-1 creates the class; PR-2 wires
 * GameCore to use it; PR-3 deletes the legacy global layer.
 *
 * Design:
 * - Each session (multiplayer room or local sandbox) owns one registry
 * - `loadImpl(cardId, impl)` is called when a card is added to the pool
 * - `unload(cardId)` is called when a room closes to free references
 * - Getters are read-only queries the engine uses during `step()`
 */
import type { CardListenerRegistration } from './card-listeners'
import type { CardEffect } from './card-effects'

export type TradeLikeModifier = {
  type: string
  cardId: string
  [key: string]: unknown
}

export type CardImpl = {
  listeners?: CardListenerRegistration[]
  effect?: CardEffect
  modifiers?: TradeLikeModifier[]
  reaches?: readonly string[]
}

export type RegistrySnapshot = {
  cardIds: string[]
  listenerCount: number
  effectCount: number
  modifierCount: number
}

export class CardRegistry {
  private readonly listenersByCard = new Map<string, CardListenerRegistration[]>()
  private readonly effectsByCard = new Map<string, CardEffect>()
  private readonly modifiersByCard = new Map<string, TradeLikeModifier[]>()

  loadImpl(cardId: string, impl: CardImpl): void {
    if (impl.listeners && impl.listeners.length > 0) {
      this.listenersByCard.set(cardId, impl.listeners)
    }
    if (impl.effect) {
      this.effectsByCard.set(cardId, impl.effect)
    }
    if (impl.modifiers && impl.modifiers.length > 0) {
      this.modifiersByCard.set(cardId, impl.modifiers)
    }
  }

  unload(cardId: string): void {
    this.listenersByCard.delete(cardId)
    this.effectsByCard.delete(cardId)
    this.modifiersByCard.delete(cardId)
  }

  getListenersFor(cardId: string): CardListenerRegistration[] {
    return this.listenersByCard.get(cardId) ?? []
  }

  getAllListeners(): CardListenerRegistration[] {
    return Array.from(this.listenersByCard.values()).flat()
  }

  getEffect(cardId: string): CardEffect | undefined {
    return this.effectsByCard.get(cardId)
  }

  getModifiers(cardId: string): TradeLikeModifier[] {
    return this.modifiersByCard.get(cardId) ?? []
  }

  hasCard(cardId: string): boolean {
    return this.listenersByCard.has(cardId) || this.effectsByCard.has(cardId) || this.modifiersByCard.has(cardId)
  }

  snapshot(): RegistrySnapshot {
    const cardIds = new Set<string>([
      ...this.listenersByCard.keys(),
      ...this.effectsByCard.keys(),
      ...this.modifiersByCard.keys(),
    ])
    return {
      cardIds: Array.from(cardIds),
      listenerCount: Array.from(this.listenersByCard.values()).reduce((a, l) => a + l.length, 0),
      effectCount: this.effectsByCard.size,
      modifierCount: Array.from(this.modifiersByCard.values()).reduce((a, m) => a + m.length, 0),
    }
  }
}
```

- [ ] **Step 5: Run test**

Run: `pnpm exec vitest run shared/cards/__tests__/registry.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 6: Ensure no existing tests regress**

Run: `pnpm test 2>&1 | tail -20`
Expected: all existing tests still pass (CardRegistry is unreferenced by the rest of the code).

- [ ] **Step 7: Commit**

```bash
git add shared/cards/registry.ts shared/cards/__tests__/registry.test.ts
git commit -m "feat(cards): add CardRegistry class skeleton (unwired, PR-2 integrates)"
```

---

## Task 8: Move custom-code-types.ts to shared/custom-code/types.ts

**Purpose:** 建立 `shared/custom-code/` 目录，把类型定义搬进去，老位置改为薄 re-export 保证现有 import 不破。

**Files:**
- Create: `shared/custom-code/types.ts`
- Modify: `shared/cards/custom-code-types.ts` (becomes re-export)

- [ ] **Step 1: Read old file to copy**

Run: `cat shared/cards/custom-code-types.ts`
Expected: See all type exports (small file, 61 lines).

- [ ] **Step 2: Create new file with same content**

Create `shared/custom-code/types.ts`:
- Copy the **entire content** of `shared/cards/custom-code-types.ts` verbatim
- Keep all imports relative — adjust if any are relative paths that break from the new location

(If `shared/cards/custom-code-types.ts` imports `'./card-effects'`, in the new file that becomes `'../cards/card-effects'`.)

- [ ] **Step 3: Replace old file with re-export stub**

Overwrite `shared/cards/custom-code-types.ts` with:

```ts
/**
 * @deprecated Import from `shared/custom-code/types` instead.
 * This re-export will be removed in PR-3.
 */
export * from '../custom-code/types'
export type * from '../custom-code/types'
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `pnpm run build 2>&1 | tail -30`
Expected: Build succeeds (no type errors). If errors, likely a missed import path — fix and retry.

- [ ] **Step 5: Verify tests pass**

Run: `pnpm test 2>&1 | tail -10`
Expected: All tests pass unchanged.

- [ ] **Step 6: Commit**

```bash
git add shared/custom-code/types.ts shared/cards/custom-code-types.ts
git commit -m "refactor(custom-code): move types to shared/custom-code/types (old location re-exports)"
```

---

## Task 9: CustomCodeExecutor interface

**Files:**
- Create: `shared/custom-code/executor.ts`

- [ ] **Step 1: Verify types.ts has the Invocation/Result types**

Run: `grep -E "CustomCodeEffectInvocation|CustomCodeEffectResult|CustomCodeListenerInvocation|CustomCodeListenerResult" shared/custom-code/types.ts`
Expected: All 4 types exported.

- [ ] **Step 2: Create executor.ts**

Create `shared/custom-code/executor.ts`:

```ts
/**
 * CustomCodeExecutor — injection-friendly interface for running custom card code.
 *
 * Two implementations (wired in later PRs):
 *   - ServerIsolateExecutor (server, isolated-vm + Worker Thread) — multiplayer
 *   - LocalBrowserExecutor (client, direct execution) — sandbox
 *
 * `shared/custom-code/runtime.ts` and `GameCore` depend on this interface,
 * not on either implementation.
 */
import type {
  CustomCodeEffectInvocation,
  CustomCodeEffectResult,
  CustomCodeListenerInvocation,
  CustomCodeListenerResult,
} from './types'

export interface CustomCodeExecutor {
  runEffect(req: CustomCodeEffectInvocation): CustomCodeEffectResult
  runListener(req: CustomCodeListenerInvocation): CustomCodeListenerResult
}
```

- [ ] **Step 3: Verify compilation**

Run: `pnpm run build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add shared/custom-code/executor.ts
git commit -m "feat(custom-code): add CustomCodeExecutor interface (no implementations yet)"
```

---

## Task 10: Move ast-validator.ts to shared/custom-code/

**Purpose:** AST validator 今天在 `server/` 但它只依赖 `typescript` 包（纯 JS，浏览器可用），搬进 `shared/custom-code/` 方便前端工坊本地预校验。老位置保留薄 re-export。

**Files:**
- Create: `shared/custom-code/ast-validator.ts`
- Modify: `server/ast-validator.ts` (becomes re-export)

- [ ] **Step 1: Copy ast-validator**

Run: `cp server/ast-validator.ts shared/custom-code/ast-validator.ts`

Verify: `head -15 shared/custom-code/ast-validator.ts`
Expected: Copy is identical.

- [ ] **Step 2: Adjust any import paths (if any were relative to server/)**

Run: `grep "^import\|^from" shared/custom-code/ast-validator.ts`
Expected: Only `import ts from 'typescript'` (top-level import, no relative paths). Nothing to adjust.

- [ ] **Step 3: Replace old file with re-export**

Overwrite `server/ast-validator.ts` with:

```ts
/**
 * @deprecated Import from `shared/custom-code/ast-validator` instead.
 * This re-export will be removed in PR-3.
 */
export * from '../shared/custom-code/ast-validator'
```

- [ ] **Step 4: Find callers and verify they still work**

Run: `grep -rn "from.*ast-validator" server/ shared/ src/ scripts/ | grep -v node_modules`
Expected: List of 2-3 callers. All should still compile because re-export preserves the API.

- [ ] **Step 5: Run tests**

Run: `pnpm test 2>&1 | tail -10`
Expected: All tests pass.

- [ ] **Step 6: Run build**

Run: `pnpm run build 2>&1 | tail -10`
Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add shared/custom-code/ast-validator.ts server/ast-validator.ts
git commit -m "refactor(custom-code): move ast-validator to shared/ (server/ becomes re-export)"
```

---

## Task 11: Move farm/validation helpers to shared/logic/farm/

**Purpose:** `server/game-session.ts` 直接 import 4 个纯 TS 文件（`farm-choice`、`plow-validation`、`validators`、`fence-validation`），它们的传递依赖还有 `sow-validation`。这 5 个文件**没有任何 `node:*` 使用**，只是历史上放在 `server/`。GameCore 搬到 shared 后，这些 sibling import 也必须在 shared 里才能解析。本任务把这 5 个文件搬到 `shared/logic/farm/`，老位置留薄 re-export 保证其它 server 文件（farm-interaction / payload-validation 等）照常工作。

**Files:**
- Create: `shared/logic/farm/farm-choice.ts`
- Create: `shared/logic/farm/plow-validation.ts`
- Create: `shared/logic/farm/validators.ts`
- Create: `shared/logic/farm/fence-validation.ts`
- Create: `shared/logic/farm/sow-validation.ts`
- Modify: `server/farm-choice.ts`, `server/plow-validation.ts`, `server/validators.ts`, `server/fence-validation.ts`, `server/sow-validation.ts` — all become re-export stubs

- [ ] **Step 1: Verify these files have no node dependencies**

Run:
```bash
grep -c "node:\|require(" server/farm-choice.ts server/plow-validation.ts server/validators.ts server/fence-validation.ts server/sow-validation.ts
```
Expected: all 0.

- [ ] **Step 2: Copy fence-validation first (it's imported by the others)**

```bash
mkdir -p shared/logic/farm
cp server/fence-validation.ts shared/logic/farm/fence-validation.ts
```

- [ ] **Step 3: Adjust shared-side imports in new fence-validation.ts**

Edit `shared/logic/farm/fence-validation.ts`:
- Change `'../shared/game/types'` → `'../../game/types'`
- Change `'../shared/game/farm.ts'` → `'../../game/farm.ts'`

Verify:
```bash
grep "^import" shared/logic/farm/fence-validation.ts
```
Expected: all imports use `'../../...'` prefix (reaching up to shared/).

- [ ] **Step 4: Copy + adjust each of the other 4 files**

For each of `plow-validation.ts`, `validators.ts`, `sow-validation.ts`, `farm-choice.ts`:

1. `cp server/<name>.ts shared/logic/farm/<name>.ts`
2. Edit the new file:
   - `'./fence-validation.ts'` or `'./fence-validation'` → `'./fence-validation'` (sibling, unchanged)
   - `'./validators.ts'` → `'./validators'` (sibling)
   - `'./plow-validation.ts'` → `'./plow-validation'` (sibling)
   - `'./sow-validation.ts'` → `'./sow-validation'` (sibling)
   - `'../shared/...'` → `'../../...'` (reach up 2 levels to shared/)

Verify after each:
```bash
grep "^import" shared/logic/farm/<name>.ts
```
Expected: no paths contain `'./'` reaching into server/, no `'../shared/'` (must be `'../../'`).

- [ ] **Step 5: Replace each server/ file with a re-export stub**

For each of `farm-choice.ts`, `plow-validation.ts`, `validators.ts`, `fence-validation.ts`, `sow-validation.ts`:

Overwrite `server/<name>.ts` with:

```ts
/**
 * @deprecated Import from `shared/logic/farm/<name>` instead.
 * This re-export is kept for backward compat during PR-1 → PR-3.
 */
export * from '../shared/logic/farm/<name>'
export type * from '../shared/logic/farm/<name>'
```

(Replace `<name>` in path with the actual filename without `.ts`.)

- [ ] **Step 6: Build**

Run: `pnpm run build 2>&1 | tail -20`
Expected: Build succeeds.

If TS errors complain about missing exports (e.g., `FARM_COLS`), the re-export stub might need `export { FARM_COLS, FARM_ROWS } from '...'` explicitly — add as needed.

- [ ] **Step 7: Run all tests**

Run: `pnpm test 2>&1 | tail -15`
Expected: All tests pass (no test code changes; callers use re-export stubs).

- [ ] **Step 8: Commit**

```bash
git add shared/logic/farm/ server/farm-choice.ts server/plow-validation.ts server/validators.ts server/fence-validation.ts server/sow-validation.ts
git commit -m "refactor(logic): move farm/validation helpers to shared/logic/farm (server/ becomes re-exports)"
```

---

## Task 12: Migrate GameSession to shared/session/GameCore

**Purpose:** 把 `server/game-session.ts` 的 `GameSession` 类搬到 `shared/session/game-core.ts` 改名 `GameCore`，用依赖注入隔离唯一的 Node-only 调用（`registerExecutorBackedCustomCard`）。`server/game-session.ts` 保留，变成 server 子类，注入 server-specific 的 `registerExecutorBackedCustomCard`——所有 242 个 session 测试文件的 `new GameSession(...)` 调用**零改动**仍可工作。

**Dependencies:** Task 11 must be complete (5 farm helpers now live in `shared/logic/farm/`).

**Files:**
- Create: `shared/session/game-core.ts`
- Modify: `server/game-session.ts` (becomes thin subclass)

- [ ] **Step 1: Identify the ONE node-only call in game-session.ts**

Run: `grep -n "registerExecutorBackedCustomCard" server/game-session.ts`
Expected: line 55 (import) and line 256 (call).

- [ ] **Step 2: Identify the relevant constructor option field**

Run: `sed -n '200,260p' server/game-session.ts | grep -nE "customCards|constructor|interface GameSession"`
Expected: see the place where `customCards` option is accepted and looped.

- [ ] **Step 3: Copy game-session.ts to new location as game-core.ts**

Run: `cp server/game-session.ts shared/session/game-core.ts`

- [ ] **Step 4: Adjust imports in new file for new location**

Every relative import in `shared/session/game-core.ts` that previously looked like `'../shared/...'` now becomes `'../...'` (because we moved from server/ one level up).

Specifically, `sed` replace:
```
../shared/  →  ../
```

Run:
```bash
sed -i 's|from '"'"'\.\./shared/|from '"'"'\.\./|g' shared/session/game-core.ts
```

Verify:
```bash
grep "from '" shared/session/game-core.ts | head -20
```
Expected: paths now look like `'../game/types.ts'`, `'../protocol/game.ts'` etc. — all pointing into `shared/`.

- [ ] **Step 5: Remove Node-only import; replace the call site with DI**

Edit `shared/session/game-core.ts`:

1. Delete the line `import { registerExecutorBackedCustomCard } from './custom-code-runtime.ts'`

2. Find the call site (originally line 256 `registerExecutorBackedCustomCard(cardData)`). Replace with `this.registerCustomCardImpl(cardData)`.

3. Find the existing constructor options interface (or add a new optional field). Add:
```ts
registerCustomCardImpl?: (data: CustomCardData) => void
```
(If there's already an options interface, augment it. If the constructor takes positional args, you may need to add an options object — but `GameSession` today uses an options object, check around the constructor.)

4. In the constructor body, store:
```ts
this.registerCustomCardImpl = options.registerCustomCardImpl ?? (() => {
  // No-op default: used in sandbox mode (browser) or tests not needing executor
})
```

Add as a class field:
```ts
private readonly registerCustomCardImpl: (data: CustomCardData) => void
```

5. Rename the class to `GameCore`:

Find: `export class GameSession {`
Replace: `export class GameCore {`

(There should be only one class declaration. If `GameSession` is referenced elsewhere within the file for internal types like `type: typeof GameSession`, adjust those too — typically `this` works.)

6. Also rename any `GameSession` type references within the file to `GameCore`. Grep:
```bash
grep -n "GameSession" shared/session/game-core.ts
```
Expected: after rename, 0 occurrences. (The class was the only reference inside the file.)

- [ ] **Step 6: Replace server/game-session.ts with subclass**

Overwrite `server/game-session.ts` with:

```ts
/**
 * @deprecated For backward compatibility during PR-1 through PR-3.
 * New code should use `shared/session/game-core.ts` directly and inject
 * `registerExecutorBackedCustomCard` via constructor options.
 *
 * This wrapper preserves the existing `GameSession` API for all 242+ session
 * test files, while routing custom card registration through the server's
 * isolated-vm executor path.
 */
import { GameCore, type GameCoreOptions } from '../shared/session/game-core'
import { registerExecutorBackedCustomCard } from './custom-code-runtime'

export class GameSession extends GameCore {
  constructor(options: Omit<GameCoreOptions, 'registerCustomCardImpl'> = {}) {
    super({
      ...options,
      registerCustomCardImpl: registerExecutorBackedCustomCard,
    })
  }
}

// Re-export any supporting types tests might reference
export type { GameCoreOptions as GameSessionOptions } from '../shared/session/game-core'
```

- [ ] **Step 7: Export GameCoreOptions from game-core.ts**

Ensure `shared/session/game-core.ts` exports `GameCoreOptions`:

If the file today has a `constructor(options: { ... }: SomeType)` kind of shape, formalize it as:
```ts
export interface GameCoreOptions {
  // ... existing fields
  registerCustomCardImpl?: (data: CustomCardData) => void
}
```
and use it in the constructor signature.

If options were previously inline type literal, extract to named interface.

- [ ] **Step 8: Build**

Run: `pnpm run build 2>&1 | tail -30`
Expected: Build succeeds.

If TypeScript errors related to unknown `GameCoreOptions` fields, check that the interface declaration covers everything the old inline type had.

- [ ] **Step 9: Run all tests**

Run: `pnpm test 2>&1 | tail -30`
Expected: All 242+ session tests pass. Same count as before PR-1.

Capture baseline count first if needed:
```bash
git stash
pnpm test 2>&1 | grep -E "Tests|pass|fail" | tail -5 > /tmp/baseline.txt
git stash pop
pnpm test 2>&1 | grep -E "Tests|pass|fail" | tail -5 > /tmp/new.txt
diff /tmp/baseline.txt /tmp/new.txt
```
Expected: no diff.

- [ ] **Step 10: Run local startup smoke test**

Run: `./restart-intranet.sh 2>&1 | tail -15`
Expected: Backend and frontend both start without errors. Check ports 5175 and 5173 are serving.

Kill it: `Ctrl+C` / manually stop the processes as appropriate.

- [ ] **Step 11: Commit**

```bash
git add shared/session/game-core.ts server/game-session.ts
git commit -m "refactor(session): migrate GameSession to shared/session/GameCore with DI for custom card registrar"
```

---

## Task 13: Mark global registry functions @deprecated

**Purpose:** 加 JSDoc 注释把老全局 registry 函数标为 `@deprecated`，引导将来新代码走 `CardRegistry`。不改运行时行为，只是文档标注。

**Note on the "forwarding bridge":** spec §9 PR-1 提到"内部函数转发到当前请求关联的 `CardRegistry`"。经评估，该 bridge 的语义（listener 有多 cardIds 时挂哪里、优先级、线程安全）最好和 PR-2 卡牌迁移同步设计。**本 PR-1 仅做 @deprecated 文档标注，forwarding bridge 推到 PR-2 第一步**，不影响 PR-1 的零回归目标。

**Files:**
- Modify: `shared/cards/card-listeners.ts`
- Modify: `shared/cards/card-effects.ts`
- Modify: `shared/cards/card-modifiers.ts`

- [ ] **Step 1: Find target functions in card-listeners.ts**

Run: `grep -n "^export const register\|^export function register\|^export const clear" shared/cards/card-listeners.ts`
Expected: `registerCardListener`, `clearCardListeners`, `clearCustomCardListeners`.

- [ ] **Step 2: Add @deprecated JSDoc above registerCardListener**

In `shared/cards/card-listeners.ts`, find:
```ts
export const registerCardListener = (registration: CardListenerRegistration) => {
```

Replace with:
```ts
/**
 * @deprecated Use `CardRegistry.loadImpl(cardId, { listeners })` instead.
 * This module-level global registry is kept for backward compatibility during
 * PR-1 → PR-3 migration; it will be removed once all cards adopt the
 * `_impl` export pattern and `GameCore` wires into per-session `CardRegistry`.
 *
 * See `shared/cards/registry.ts` for the new per-session approach.
 */
export const registerCardListener = (registration: CardListenerRegistration) => {
```

- [ ] **Step 3: Repeat for card-effects.ts**

In `shared/cards/card-effects.ts`, find `registerCardEffect` and add the analogous JSDoc (adjust wording: "Use `CardRegistry.loadImpl(cardId, { effect })` instead").

- [ ] **Step 4: Repeat for card-modifiers.ts**

Run: `grep -n "^export" shared/cards/card-modifiers.ts`

If there's a `registerCardModifier` or equivalent, add `@deprecated` JSDoc pointing to `CardRegistry.loadImpl(cardId, { modifiers })`.

If `card-modifiers.ts` only has getter functions (no register*), skip this step.

- [ ] **Step 5: Verify nothing breaks**

Run: `pnpm run build 2>&1 | tail -5`
Expected: Build succeeds. TypeScript treats `@deprecated` as informational — no errors, only warnings in IDEs.

Run: `pnpm test 2>&1 | tail -5`
Expected: All tests pass.

- [ ] **Step 6: Verify lint doesn't choke on JSDoc**

Run: `pnpm run lint 2>&1 | tail -10`
Expected: Same warnings as baseline, no new errors.

- [ ] **Step 7: Commit**

```bash
git add shared/cards/card-listeners.ts shared/cards/card-effects.ts shared/cards/card-modifiers.ts
git commit -m "refactor(cards): mark global registry functions as @deprecated (migration to CardRegistry)"
```

---

## Task 14: Final verification

- [ ] **Step 1: Clean build + full test suite**

Run:
```bash
rm -rf dist/ public/cards-manifest.json
pnpm run build 2>&1 | tail -15
```
Expected:
- `[build-cards-manifest] wrote N cards to .../public/cards-manifest.json` (N ≥ 300)
- `dist/assets/` populated with JS + CSS chunks
- No TypeScript errors

- [ ] **Step 2: Run all checks**

Run:
```bash
pnpm run check:reaches
pnpm run check:no-dsl
pnpm run check:bundle-size
```
Expected:
- check:reaches → "0 cards with _impl export"
- check:no-dsl → warn summary listing DSL hits (DSL still present); exits 0
- check:bundle-size → chunk sizes printed; exits 0

- [ ] **Step 3: Run all tests**

Run: `pnpm test 2>&1 | tail -10`
Expected: All tests pass with the same count as baseline.

- [ ] **Step 4: Run lint**

Run: `pnpm run lint 2>&1 | tail -5`
Expected: Same number of pre-existing warnings (~340 `any` warnings acceptable), 0 new errors.

- [ ] **Step 5: Local intranet smoke test**

Run: `./restart-intranet.sh` and in a browser visit the printed URL + `?player=p1`.
Expected: Game loads, lobby or game state shows up.

Then open a second browser tab with `?player=p2` and verify both players see a synced room.

Kill servers.

- [ ] **Step 6: Push to remote and wait for GitHub Actions**

```bash
git fetch
git log --oneline origin/main..HEAD | head
git push origin main
```

Per CLAUDE.md, after push:
- Watch https://github.com/titanxxh/open-agricola/actions for the `CI` run triggered by this push
- Expected: ci.yml run is green (lint/test/build/checks all pass)
- If fails: fetch logs, fix the root cause, push a new commit, repeat

Commands to watch runs:
```bash
export $(grep '^GH_TOKEN=' .env | xargs)
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3' \
  | jq '.workflow_runs[] | {name, head_sha, status, conclusion, html_url}'
```

Also wait for existing `Deploy Pages` workflow: should still be green (no frontend changes affect Pages).

- [ ] **Step 7: Mark PR-1 complete**

Only after CI is fully green. If any step in this task failed, return to the specific task and fix.

---

## Self-Review Checklist

Run through this after implementation:

1. **Spec coverage**:
   - [ ] CI workflow created (§9 PR-1 "新增 `.github/workflows/ci.yml`") — Task 6
   - [ ] check-reaches.ts, check-bundle-size.ts, check-no-dsl.ts all as non-strict — Tasks 3-5
   - [ ] build-cards-manifest.ts + `public/cards-manifest.json` — Task 2
   - [ ] CardRegistry class — Task 7
   - [ ] Farm/validation helpers moved to shared/logic/farm/ (enables GameCore move) — Task 11
   - [ ] GameCore migration with DI + re-export compat — Task 12
   - [ ] shared/custom-code skeleton (types + executor interface + ast-validator) — Tasks 8-10
   - [ ] Global registry @deprecated annotations — Task 13
   - [ ] Final verification + CI push check — Task 14

2. **Non-goals respected**:
   - Cards unchanged ✓
   - DSL not deleted ✓
   - src/ not renamed ✓
   - ESLint boundaries not enforced ✓
   - package.json.sideEffects not added ✓

3. **Verification commands are real**:
   - All `Run:` commands actually runnable from repo root
   - Expected outputs realistic

4. **No placeholders**:
   - Every code block is complete and copy-pasteable
   - No "similar to above" or "TODO" in task bodies

---

Plan complete and saved to `docs/superpowers/plans/2026-04-19-PR1-architecture-infrastructure-bootstrap.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
