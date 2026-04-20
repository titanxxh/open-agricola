# PR-2 Cards Restructure and DSL Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 完成 PR-2：
1. 一次性迁移所有历史 DSL 卡 → TS 代码（DB 不 drop 列，只停写）
2. 删除 DSL 路径（runner + card-codegen + UI/prompt/i18n 分支），开启 `check:no-dsl --strict`
3. 把 875 张官方卡从"顶层副作用注册"改造成 `_impl` 导出 + 集中 `register-all.ts`
4. `GameCore` 改为接受 `CardRegistry` 注入；服务端启动时把 `ALL_CARD_IMPLS` 灌进 registry
5. 开启 `check:reaches` 严格模式；保持 2272+ 测试全绿

**Architecture:** 按"先迁数据 → 再删代码 → 再改卡 → 再接线"的顺序推进，每一步测试全绿才进下一步。GameCore 的构造签名扩展新字段 `cardRegistry?: CardRegistry`（可选，缺省用一个装好 ALL_CARD_IMPLS 的默认实例）。老全局 registry 的 `@deprecated` 转发桥（PR-1 推迟的部分）在本 PR 首步补上，支撑双轨过渡。

**Tech Stack:** TypeScript, Vitest, TSX, better-sqlite3, pnpm

**Source spec:** `docs/superpowers/specs/2026-04-19-architecture-three-layer-split-design.md` §3 (DSL 删除) + §4 (零副作用改造) + §5 (CardRegistry) + §9 PR-2

---

## File Structure

**Create:**
- `scripts/migrate-dsl-to-code.ts` — 一次性迁移脚本（先加，跑完再在 PR-2 末尾删）
- `scripts/__tests__/migrate-dsl-to-code.test.ts`
- `scripts/card-codemod.ts` — 批量把卡牌从副作用注册改为 `_impl` 导出
- `scripts/__tests__/card-codemod.test.ts`
- `shared/cards/register-all.ts` — 导出 `ALL_CARD_IMPLS` map（由 codemod 产出）
- `shared/cards/active-registry.ts` — 全局适配桥：管 "current active CardRegistry" 状态，老 `registerCardListener()` 等转发到这里
- `shared/cards/__tests__/active-registry.test.ts`

**Modify (delete DSL branches):**
- `shared/cards/custom-registry.ts`
- `shared/cards/session-card-context.ts`
- `shared/cards/__tests__/custom-registry.test.ts`
- `server/workshop.ts`
- `server/room-manager.ts`
- `server/db.ts`（column `effect_dsl` 保留但加 comment 标 deprecated）
- `src/app/WorkshopPage.tsx`
- `src/app/workshop/AiCardDesigner.tsx`
- `src/services/llmPrompts.ts`
- `shared/i18n/zh.ts` / `shared/i18n/en.ts`

**Modify (card restructure):**
- `shared/cards/{A,B,C,D,E,major}/*.ts`（875 张卡，codemod 批量改）
- `shared/cards/card-listeners.ts`（register* 增加转发桥 body；保留 `@deprecated`）
- `shared/cards/card-effects.ts`（同上）
- `shared/cards/card-modifiers.ts`（同上）
- `shared/session/game-core.ts` — 构造接受 `cardRegistry`；hook 调度走 registry
- `server/game-session.ts` — 构造 default `CardRegistry`，灌 `ALL_CARD_IMPLS`
- `scripts/check-no-dsl.ts` — CI 模式跑 `--strict`
- `scripts/check-reaches.ts` — CI 模式跑 `--strict`
- `.github/workflows/ci.yml` — 两个 check 切 `--strict`

**Delete (after migration data saved):**
- `shared/cards/custom-dsl-runner.ts`（167 行）
- `shared/cards/__tests__/custom-dsl-runner.test.ts`
- `server/card-codegen.ts`
- `scripts/migrate-dsl-to-code.ts`（迁移脚本跑完一次后也删，或保留作为"一次性运维脚本"）—— 决定保留，在名字前加 `archived-` 前缀

---

## Task 1: Add forwarding bridge (active-registry)

**Purpose:** PR-1 推迟的 forwarding 桥。支撑 PR-2 中卡牌渐进迁移时"改了一半的卡通过 CardRegistry 注册、没改的还用全局"两条路共存。

**Files:**
- Create: `shared/cards/active-registry.ts`
- Create: `shared/cards/__tests__/active-registry.test.ts`
- Modify: `shared/cards/card-listeners.ts`
- Modify: `shared/cards/card-effects.ts`

- [ ] **Step 1: Write failing test**

Create `shared/cards/__tests__/active-registry.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { CardRegistry } from '../registry'
import { setActiveCardRegistry, getActiveCardRegistry, withActiveRegistry } from '../active-registry'

describe('active-registry', () => {
  beforeEach(() => setActiveCardRegistry(null))

  it('returns null when no active registry is set', () => {
    expect(getActiveCardRegistry()).toBeNull()
  })

  it('returns the registry after setActiveCardRegistry', () => {
    const r = new CardRegistry()
    setActiveCardRegistry(r)
    expect(getActiveCardRegistry()).toBe(r)
  })

  it('withActiveRegistry scopes the active registry and restores previous', () => {
    const outer = new CardRegistry()
    const inner = new CardRegistry()
    setActiveCardRegistry(outer)
    withActiveRegistry(inner, () => {
      expect(getActiveCardRegistry()).toBe(inner)
    })
    expect(getActiveCardRegistry()).toBe(outer)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```
pnpm exec vitest run shared/cards/__tests__/active-registry.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement active-registry.ts**

```ts
/**
 * Thread-local (module-scoped) reference to the "currently active" CardRegistry.
 *
 * Global registry functions (`registerCardListener`, `registerCardEffect`,
 * `registerCardModifier`) delegate to the active registry when one is set, else
 * fall back to the legacy module-level Maps.
 *
 * Used during PR-2 migration so that:
 *   - Cards restructured to `_impl` shape register into a per-session CardRegistry
 *   - Unmigrated cards still use legacy global path until their file is updated
 *
 * Removed in PR-3 once all cards are migrated.
 */
import type { CardRegistry } from './registry'

let active: CardRegistry | null = null

export function setActiveCardRegistry(r: CardRegistry | null): void {
  active = r
}

export function getActiveCardRegistry(): CardRegistry | null {
  return active
}

export function withActiveRegistry<T>(r: CardRegistry, fn: () => T): T {
  const prev = active
  active = r
  try {
    return fn()
  } finally {
    active = prev
  }
}
```

- [ ] **Step 4: Run test — should pass**

- [ ] **Step 5: Wire forwarding into registerCardListener**

Edit `shared/cards/card-listeners.ts`:

Inside `registerCardListener` (the `@deprecated` function from PR-1 Task 13), **before** the existing `cardListeners.push(registration)` line, add:

```ts
import { getActiveCardRegistry } from './active-registry'
// ... inside registerCardListener body:
const active = getActiveCardRegistry()
if (active && registration.cardIds && registration.cardIds.length > 0) {
  for (const cardId of registration.cardIds) {
    active.loadImpl(cardId, { listeners: [registration] })
  }
  return
}
// else fall through to legacy global push
cardListeners.push(registration)
```

- [ ] **Step 6: Wire forwarding into registerCardEffect**

Edit `shared/cards/card-effects.ts`:

```ts
import { getActiveCardRegistry } from './active-registry'
// inside registerCardEffect body:
const active = getActiveCardRegistry()
if (active && effect.id) {
  active.loadImpl(effect.id, { effect })
  return
}
// legacy fallback
cardEffectsById.set(effect.id, effect)
```

(Adjust to match real internal variable names in the file.)

- [ ] **Step 7: Run full test suite**

```
pnpm test 2>&1 | tail -10
```
Expected: 2272+ tests pass. No test should be actively setting an activeRegistry, so behavior is unchanged via fallback path.

- [ ] **Step 8: Commit**

```
git add shared/cards/active-registry.ts shared/cards/__tests__/active-registry.test.ts shared/cards/card-listeners.ts shared/cards/card-effects.ts
git commit -m "feat(cards): add active-registry bridge for PR-2 dual-track migration"
```

---

## Task 2: DSL→TS data migration script

**Purpose:** 在删除 `card-codegen.ts` 之前，一次性把所有 `effect_dsl IS NOT NULL AND effect_code IS NULL` 的 workshop 卡迁成 TS 代码并写回 DB。

**Files:**
- Create: `scripts/migrate-dsl-to-code.ts`
- Create: `scripts/__tests__/migrate-dsl-to-code.test.ts`

- [ ] **Step 1: Understand existing card-codegen.ts interface**

```
head -40 server/card-codegen.ts && echo "---" && grep "^export" server/card-codegen.ts
```
Expected: see `generateCardFile(meta, dsl)` signature and any helper exports.

- [ ] **Step 2: Understand workshop_cards schema**

```
grep -A 20 "workshop_cards" server/db.ts
```
Expected: see columns including `id, card_id, card_json, effect_dsl, effect_code, compiled_code, code_manifest, art_url, status, author_id`.

- [ ] **Step 3: Write the migration script**

Create `scripts/migrate-dsl-to-code.ts`:

```ts
#!/usr/bin/env tsx
/**
 * One-shot migration: convert workshop cards with effect_dsl → effect_code + compiled_code + code_manifest.
 *
 * Run once against each DB (prod + local). After success, delete this script in PR-3.
 *
 * Usage:
 *   pnpm run migrate:dsl-to-code [--db=<path>] [--dry-run]
 */
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateCardFile } from '../server/card-codegen'
import { validateCardCode } from '../shared/custom-code/ast-validator'
import { compileCardCode, executeCardCode } from '../server/custom-code/compiler'
// adjust imports if paths differ

const __dirname = path.dirname(fileURLToPath(import.meta.url))

type WorkshopRow = {
  id: string
  card_id: string
  card_json: string
  effect_dsl: string | null
  effect_code: string | null
  compiled_code: string | null
  code_manifest: string | null
}

function migrateRow(row: WorkshopRow): { code: string; compiled: string; manifest: object } | { skip: string } {
  if (!row.effect_dsl || row.effect_code) return { skip: 'already migrated' }
  const dsl = JSON.parse(row.effect_dsl)
  const cardMeta = JSON.parse(row.card_json)
  const code = generateCardFile(cardMeta, dsl)
  const validation = validateCardCode(code)
  if (!validation.valid) {
    throw new Error(`AST validation failed for ${row.card_id}: ${validation.errors.join('; ')}`)
  }
  const compiled = compileCardCode(code)
  // manifest extraction: requires runManifestExtraction or similar
  // For migration, we can skip manifest if the compiled code is valid — let runtime re-extract
  const manifest = { effectHooks: [], listeners: [] }  // placeholder; re-extracted at load time
  return { code, compiled, manifest }
}

export function runMigration(dbPath: string, dryRun: boolean): {
  total: number; migrated: number; skipped: number; failed: Array<{ cardId: string; error: string }>
} {
  const db = new Database(dbPath)
  const rows = db.prepare(
    'SELECT id, card_id, card_json, effect_dsl, effect_code, compiled_code, code_manifest FROM workshop_cards WHERE effect_dsl IS NOT NULL',
  ).all() as WorkshopRow[]
  const failed: Array<{ cardId: string; error: string }> = []
  let migrated = 0
  let skipped = 0
  for (const row of rows) {
    try {
      const result = migrateRow(row)
      if ('skip' in result) { skipped += 1; continue }
      if (!dryRun) {
        db.prepare(
          'UPDATE workshop_cards SET effect_code = ?, compiled_code = ?, code_manifest = ? WHERE id = ?',
        ).run(result.code, result.compiled, JSON.stringify(result.manifest), row.id)
      }
      migrated += 1
    } catch (err) {
      failed.push({ cardId: row.card_id, error: (err as Error).message })
    }
  }
  db.close()
  return { total: rows.length, migrated, skipped, failed }
}

if (process.argv[1] && process.argv[1].endsWith('migrate-dsl-to-code.ts')) {
  const args = process.argv.slice(2)
  const dbArg = args.find((a) => a.startsWith('--db='))
  const dbPath = dbArg ? dbArg.slice(5) : path.resolve(__dirname, '..', 'data', 'open-agricola.db')
  const dryRun = args.includes('--dry-run')
  console.log(`[migrate-dsl-to-code] db=${dbPath} dryRun=${dryRun}`)
  const result = runMigration(dbPath, dryRun)
  console.log(JSON.stringify(result, null, 2))
  if (result.failed.length > 0) process.exit(1)
}
```

Note: the `compiler.ts` / `runManifestExtraction` location depends on PR-1 moves. Verify paths before running.

- [ ] **Step 4: Write test with in-memory DB**

Create `scripts/__tests__/migrate-dsl-to-code.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { runMigration } from '../migrate-dsl-to-code'

describe('migrate-dsl-to-code', () => {
  let dbPath: string
  beforeEach(() => {
    dbPath = ':memory:'
    // Set up a tmp DB with a `workshop_cards` table + 1 row with effect_dsl
    const db = new Database(dbPath)
    db.exec(`CREATE TABLE workshop_cards (
      id TEXT PRIMARY KEY, card_id TEXT, card_json TEXT,
      effect_dsl TEXT, effect_code TEXT, compiled_code TEXT, code_manifest TEXT
    )`)
    db.prepare(`INSERT INTO workshop_cards (id, card_id, card_json, effect_dsl)
      VALUES ('row1', 'TEST_Card', '{"id":"TEST_Card","cardType":"minor"}', '{"onBuy":{"flow":[{"action":"gain","params":{"food":1}}]}}')`).run()
    // leak db handle to avoid memory cleanup before test
  })

  it('migrates effect_dsl to effect_code in dry-run mode', () => {
    const result = runMigration(dbPath, true)
    expect(result.total).toBeGreaterThanOrEqual(1)
  })
})
```

(Simplify or skip this test if in-memory DB setup is awkward — the real validation is running the script against `./data/open-agricola.db`.)

- [ ] **Step 5: Add npm script**

Edit `package.json`, add:
```
"migrate:dsl-to-code": "tsx scripts/migrate-dsl-to-code.ts",
```

- [ ] **Step 6: Dry-run against local DB**

```
pnpm run migrate:dsl-to-code -- --dry-run
```
Expected: prints `{ total: N, migrated: N, skipped: 0, failed: [] }`. Confirm N matches the actual DSL-only row count.

- [ ] **Step 7: Real run against local DB**

```
pnpm run migrate:dsl-to-code
```
Expected: same output without `--dry-run`. Verify with:
```
echo 'SELECT COUNT(*) FROM workshop_cards WHERE effect_dsl IS NOT NULL AND effect_code IS NULL' | sqlite3 data/open-agricola.db
```
Expected: `0`.

- [ ] **Step 8: Commit**

```
git add scripts/migrate-dsl-to-code.ts scripts/__tests__/migrate-dsl-to-code.test.ts package.json
git commit -m "feat(scripts): add one-shot DSL→TS code migration script"
```

**Note:** Production DB migration is user's responsibility — they must run the same script against the prod DB before PR-2 is merged.

---

## Task 3: Delete DSL runner and card-codegen

**Purpose:** DSL 迁移已跑完，删 runner + codegen + 它们的测试。

**Files:**
- Delete: `shared/cards/custom-dsl-runner.ts`
- Delete: `shared/cards/__tests__/custom-dsl-runner.test.ts`
- Delete: `server/card-codegen.ts`

- [ ] **Step 1: Delete the 3 files**

```
rm shared/cards/custom-dsl-runner.ts
rm shared/cards/__tests__/custom-dsl-runner.test.ts
rm server/card-codegen.ts
```

- [ ] **Step 2: Verify build fails (expected — callers not yet cleaned)**

```
pnpm run build 2>&1 | tail -20
```
Expected: TS errors in `shared/cards/custom-registry.ts`, `shared/cards/session-card-context.ts` (still importing from the deleted runner). Also `server/workshop.ts` may depend on `card-codegen`. These are fixed in next tasks.

Don't commit yet — we need Tasks 4-5 to make build green again before committing.

---

## Task 4: Strip DSL branches from custom-registry / session-card-context

**Files:**
- Modify: `shared/cards/custom-registry.ts`
- Modify: `shared/cards/session-card-context.ts`
- Modify: `shared/cards/__tests__/custom-registry.test.ts`

- [ ] **Step 1: Edit custom-registry.ts**

Find and remove:
- `import { dslToCardEffect } from './custom-dsl-runner.ts'`
- The `effectDsl` parameter from function signatures
- The `if (effectDsl) { ... dslToCardEffect ... }` block

The function should only accept `{ cardType, cardJson, artUrl }` after cleanup.

- [ ] **Step 2: Edit session-card-context.ts**

Find and remove:
- `import { dslToCardEffect, type CardDslEffects } from './custom-dsl-runner.ts'`
- `effectDsl?: CardDslEffects | null` from `CustomCardData` type
- The `if (effectDsl) { ... dslToCardEffect ... }` block

- [ ] **Step 3: Update custom-registry.test.ts**

Delete test cases that pass `effectDsl`:
- "registers card effect when DSL is provided" (line ~69)
- "warns but does not throw on malformed DSL" (line ~84)

Keep tests that don't involve DSL.

- [ ] **Step 4: Build verify**

```
pnpm run build 2>&1 | tail -20
```
Expected: errors in `server/workshop.ts` (still reads effect_dsl) but `shared/` clean.

---

## Task 5: Strip DSL from server-side HTTP/WS layers

**Files:**
- Modify: `server/workshop.ts`
- Modify: `server/room-manager.ts`
- Modify: `server/db.ts` (add comment marking effect_dsl deprecated; don't DROP)

- [ ] **Step 1: Clean server/workshop.ts**

Remove:
- All reads of `effect_dsl` column in SELECT statements
- All writes of `effect_dsl` column in INSERT/UPDATE
- The `effect_dsl` field from POST body parsing / response JSON

Find references: `grep -n "effect_dsl" server/workshop.ts`
Expected to clean: ~15 occurrences.

- [ ] **Step 2: Clean server/room-manager.ts**

Remove `effect_dsl` column read and `effectDsl` field mapping (~3 places).

- [ ] **Step 3: Mark DB column deprecated**

Edit `server/db.ts`: add comment above the `effect_dsl TEXT` column definition:
```sql
-- @deprecated: column kept for historical data; no new writes since PR-2.
effect_dsl TEXT,
```

Do NOT drop the column.

- [ ] **Step 4: Full test + build**

```
pnpm test 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
```
Expected: all pass.

- [ ] **Step 5: Commit Tasks 3-5 together**

```
git add shared/cards/custom-registry.ts shared/cards/session-card-context.ts shared/cards/__tests__/custom-registry.test.ts server/workshop.ts server/room-manager.ts server/db.ts
git rm shared/cards/custom-dsl-runner.ts shared/cards/__tests__/custom-dsl-runner.test.ts server/card-codegen.ts
git commit -m "refactor(dsl): remove DSL runner, codegen, and server-side DSL branches"
```

---

## Task 6: Strip DSL from frontend UI and LLM prompt

**Files:**
- Modify: `src/app/WorkshopPage.tsx`
- Modify: `src/app/workshop/AiCardDesigner.tsx`
- Modify: `src/services/llmPrompts.ts`
- Modify: `shared/i18n/zh.ts`, `shared/i18n/en.ts`

- [ ] **Step 1: WorkshopPage.tsx cleanup**

Remove every `effect_dsl` field reference (display block, type annotation, submission body). Search: `grep -n "effect_dsl\|dsl" src/app/WorkshopPage.tsx`.

- [ ] **Step 2: AiCardDesigner.tsx cleanup**

Remove `effect_dsl` field from LLM request/response schemas. Update the LLM prompt to no longer mention DSL — require TS code only (calling `registerCardEffect` / `registerCardListener`).

- [ ] **Step 3: llmPrompts.ts cleanup**

Delete any DSL-related prompt segments. Only TS-code prompts remain.

- [ ] **Step 4: i18n**

Search `DSL / dsl / "DSL 模式" / "代码模式"` in `shared/i18n/zh.ts` and `shared/i18n/en.ts`, remove related keys.

- [ ] **Step 5: Build + test**

```
pnpm run build 2>&1 | tail -5
pnpm test 2>&1 | tail -5
```
Expected: green.

- [ ] **Step 6: Commit**

```
git add src/app/WorkshopPage.tsx src/app/workshop/AiCardDesigner.tsx src/services/llmPrompts.ts shared/i18n/zh.ts shared/i18n/en.ts
git commit -m "refactor(workshop): remove DSL mode from UI + LLM prompt (TS-code only)"
```

---

## Task 7: Flip check-no-dsl to strict

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Edit verify job's Check no-DSL step**

```yaml
      - name: Check no-DSL (strict — DSL must be deleted)
        run: pnpm run check:no-dsl -- --strict
```

- [ ] **Step 2: Run locally to sanity-check**

```
pnpm run check:no-dsl -- --strict
```
Expected: exit 0 (no DSL keywords remain except in allow-list).

If it fails, there's a leftover DSL reference — fix it before committing.

- [ ] **Step 3: Commit**

```
git add .github/workflows/ci.yml
git commit -m "ci: enable check-no-dsl strict mode (DSL path fully removed)"
```

---

## Task 8: Design the card codemod

**Purpose:** Write the codemod tool that turns a card file from the current shape (top-level `registerCardListener(...)`) into the new `_impl` export shape. This task **designs and tests the codemod** on a sample card; Task 9 runs it on all 875.

**Files:**
- Create: `scripts/card-codemod.ts`
- Create: `scripts/__tests__/card-codemod.test.ts`

- [ ] **Step 1: Study typical card shapes**

Read a few representative cards to understand the patterns:
- `shared/cards/A/A107_Catcher.ts` — has top-level `registerCardListener(listener)` before the Occupation constructor
- `shared/cards/A/A123_FrameBuilder.ts` — only has `new Occupation({ modifiers: [...] })`, no listener
- `shared/cards/A/A113_HeresyTeacher.ts` — both listener and effect

Patterns to transform:
1. Top-level `registerCardListener(X)` → collect `X` into `_impl.listeners`
2. Top-level `registerCardEffect(X)` → collect `X` into `_impl.effect`
3. Top-level `registerCardModifier(X)` → collect `X` into `_impl.modifiers`
4. Static `modifiers` inside `new Occupation({...})` constructor — **stay in place** (they're static data on the card, not runtime registrations)

- [ ] **Step 2: Write codemod test fixtures**

Create `scripts/__tests__/fixtures/codemod-samples/before_A107_Catcher.ts` (copy actual A107 content).
Create `scripts/__tests__/fixtures/codemod-samples/after_A107_Catcher.ts` (expected output after codemod):

```ts
import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementOrder } from '../helpers/round-placement'

const CARD_ID = 'A107_Catcher'

// helpers stay in place
const isBuildingResourceSpace = (...) => ...
const countBuildingResources = (...) => ...

const listener: CardListenerRegistration = { ... }

// registerCardListener call REMOVED (codemod strips top-level side effect)

export const A107_Catcher = new Occupation({ ... })

export const A107_Catcher_impl: { listeners: CardListenerRegistration[]; reaches: readonly string[] } = {
  listeners: [listener],
  reaches: [],
}
```

- [ ] **Step 3: Implement codemod**

Create `scripts/card-codemod.ts` using TypeScript Compiler API:

```ts
#!/usr/bin/env tsx
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const REGISTER_FNS = new Set(['registerCardListener', 'registerCardEffect', 'registerCardModifier'])

export type TransformResult = {
  output: string
  collected: { listeners: string[]; effects: string[]; modifiers: string[] }
  cardId: string | null
}

export function transformCardFile(source: string, filePath: string): TransformResult {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const collected = { listeners: [] as string[], effects: [] as string[], modifiers: [] as string[] }
  let cardId: string | null = null
  const statementsToRemove = new Set<ts.Statement>()

  // Pass 1: find cardId + top-level register calls
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
          statementsToRemove.add(stmt)
        }
      }
    }
    // collect cardId: const CARD_ID = '...'
    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === 'CARD_ID' && decl.initializer && ts.isStringLiteral(decl.initializer)) {
          cardId = decl.initializer.text
        }
      }
    }
    // also: `new Occupation({ id: 'A107_Catcher', ... })` could be the cardId source
    // handle this fallback in the visitor if CARD_ID const is absent
  }

  // Pass 2: emit output
  const lines = source.split('\n')
  // Remove lines corresponding to statementsToRemove
  // (Use node positions: start/end)
  const removedRanges = Array.from(statementsToRemove).map((s) => ({
    start: sf.getLineAndCharacterOfPosition(s.getStart()).line,
    end: sf.getLineAndCharacterOfPosition(s.getEnd()).line,
  }))
  const keptLines = lines.filter((_, idx) => !removedRanges.some((r) => idx >= r.start && idx <= r.end))

  let output = keptLines.join('\n')

  // Append _impl export if any listener/effect/modifier was collected
  if (collected.listeners.length || collected.effects.length || collected.modifiers.length) {
    if (!cardId) throw new Error(`No CARD_ID found in ${filePath}`)
    const implParts: string[] = []
    if (collected.listeners.length > 0) implParts.push(`  listeners: [${collected.listeners.join(', ')}]`)
    if (collected.effects.length > 0) implParts.push(`  effect: ${collected.effects[0]}`)
    if (collected.modifiers.length > 0) implParts.push(`  modifiers: [${collected.modifiers.join(', ')}]`)
    implParts.push(`  reaches: [] as readonly string[]`)
    const implBlock = `\nexport const ${cardId}_impl = {\n${implParts.join(',\n')},\n}\n`
    output = output.trimEnd() + '\n' + implBlock
  }

  return { output, collected, cardId }
}

if (process.argv[1] && process.argv[1].endsWith('card-codemod.ts')) {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const cardsRoot = path.resolve(process.cwd(), 'shared', 'cards')
  const decks = ['A', 'B', 'C', 'D', 'E', 'major']
  const stats = { total: 0, transformed: 0, unchanged: 0, failed: [] as string[] }
  for (const deck of decks) {
    const deckDir = path.join(cardsRoot, deck)
    if (!fs.existsSync(deckDir)) continue
    for (const file of fs.readdirSync(deckDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const fp = path.join(deckDir, file)
      stats.total += 1
      try {
        const source = fs.readFileSync(fp, 'utf8')
        const result = transformCardFile(source, fp)
        if (result.output !== source) {
          if (!dryRun) fs.writeFileSync(fp, result.output, 'utf8')
          stats.transformed += 1
        } else {
          stats.unchanged += 1
        }
      } catch (err) {
        stats.failed.push(`${fp}: ${(err as Error).message}`)
      }
    }
  }
  console.log(JSON.stringify(stats, null, 2))
  if (stats.failed.length > 0) process.exit(1)
}
```

- [ ] **Step 4: Write codemod test**

Create `scripts/__tests__/card-codemod.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { transformCardFile } from '../card-codemod'

const fixturesDir = path.resolve(__dirname, 'fixtures/codemod-samples')

describe('card-codemod transformCardFile', () => {
  it('removes top-level registerCardListener and appends _impl export', () => {
    const before = fs.readFileSync(path.join(fixturesDir, 'before_A107_Catcher.ts'), 'utf8')
    const expected = fs.readFileSync(path.join(fixturesDir, 'after_A107_Catcher.ts'), 'utf8')
    const result = transformCardFile(before, 'A107_Catcher.ts')
    expect(result.output.trim()).toBe(expected.trim())
  })

  it('leaves cards without register* calls unchanged', () => {
    const before = fs.readFileSync(path.join(fixturesDir, 'before_A123_FrameBuilder.ts'), 'utf8')
    const result = transformCardFile(before, 'A123_FrameBuilder.ts')
    expect(result.output).toBe(before)
  })
})
```

- [ ] **Step 5: Run test**

```
pnpm exec vitest run scripts/__tests__/card-codemod.test.ts
```
Expected: PASS after iteration.

- [ ] **Step 6: Commit**

```
git add scripts/card-codemod.ts scripts/__tests__/card-codemod.test.ts scripts/__tests__/fixtures/codemod-samples/
git commit -m "feat(scripts): add card-codemod (transforms registration side-effects to _impl exports)"
```

---

## Task 9: Run codemod on all cards

- [ ] **Step 1: Dry-run**

```
pnpm exec tsx scripts/card-codemod.ts --dry-run
```
Expected: JSON stats showing total/transformed/unchanged. ~800+ transformed.

Eyeball any failures — these need manual intervention. Common cases:
- Cards without `const CARD_ID = '...'` (codemod throws "No CARD_ID found")
  - Fix the card file manually or enhance codemod to fall back to reading `id` from constructor
- Unusual registration patterns (e.g., conditional registration) — manual handle

- [ ] **Step 2: Real run**

```
pnpm exec tsx scripts/card-codemod.ts
```
Expected: same stats without dry-run.

- [ ] **Step 3: Sanity-check one transformed card**

```
git diff shared/cards/A/A107_Catcher.ts | head -40
```
Expected: see `registerCardListener(listener)` removed, `A107_Catcher_impl = {...}` appended.

- [ ] **Step 4: Run full test suite**

```
pnpm test 2>&1 | tail -10
```

**Expected:** Likely many failures because nothing is wiring up `_impl` yet. Specifically:
- Official card tests expect listeners to fire — they won't because registration was removed
- `test files X failed` where X is substantial

This is expected; Tasks 10-11 wire it up. DO NOT commit yet.

- [ ] **Step 5: Intermediate commit (WIP — worktree only, not pushed)**

Since we can't revert easily, commit work in progress:

```
git add shared/cards/
git commit -m "refactor(cards): run codemod — registration side-effects → _impl exports [WIP, tests red until Task 10-11]"
```

---

## Task 10: Generate register-all.ts

**Files:**
- Create: `shared/cards/register-all.ts`
- Create: `scripts/generate-register-all.ts` (generator that reads all `_impl` exports)

- [ ] **Step 1: Create generator script**

Create `scripts/generate-register-all.ts`:

```ts
#!/usr/bin/env tsx
import fs from 'node:fs'
import path from 'node:path'

const cardsRoot = path.resolve(process.cwd(), 'shared', 'cards')
const decks = ['A', 'B', 'C', 'D', 'E', 'major']

const imports: string[] = []
const entries: string[] = []

for (const deck of decks) {
  const deckDir = path.join(cardsRoot, deck)
  if (!fs.existsSync(deckDir)) continue
  for (const file of fs.readdirSync(deckDir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
    const filePath = path.join(deckDir, file)
    const source = fs.readFileSync(filePath, 'utf8')
    // Find `export const {ID}_impl` declarations
    const match = source.match(/^export const (\w+)_impl\s*[=:]/m)
    if (!match) continue
    const cardId = match[1]
    const moduleRel = `./${deck}/${path.basename(file, '.ts')}`
    imports.push(`import { ${cardId}_impl } from '${moduleRel}'`)
    entries.push(`  '${cardId}': ${cardId}_impl,`)
  }
}

const output = `// GENERATED by scripts/generate-register-all.ts — do not edit by hand
${imports.join('\n')}

export const ALL_CARD_IMPLS = {
${entries.join('\n')}
} as const

export type AllCardImpls = typeof ALL_CARD_IMPLS
`

fs.writeFileSync(path.join(cardsRoot, 'register-all.ts'), output, 'utf8')
console.log(`[generate-register-all] wrote ${entries.length} entries`)
```

- [ ] **Step 2: Run it**

```
pnpm exec tsx scripts/generate-register-all.ts
```
Expected: `[generate-register-all] wrote ~850 entries`.

- [ ] **Step 3: Verify build**

```
pnpm run build 2>&1 | tail -15
```
Expected: build succeeds (imports valid, all `_impl` exports exist).

- [ ] **Step 4: Add to package.json scripts**

```
"generate:register-all": "tsx scripts/generate-register-all.ts",
```

- [ ] **Step 5: Commit**

```
git add shared/cards/register-all.ts scripts/generate-register-all.ts package.json
git commit -m "feat(cards): generate register-all.ts aggregating all _impl exports"
```

---

## Task 11: Wire GameCore to use CardRegistry (per-session)

**Purpose:** 服务端启动时，每个 GameSession 创建一个 CardRegistry，把 ALL_CARD_IMPLS 加载进去。GameCore 通过 `this.cardRegistry.getListenersFor(...)` 等接口查询，而不是读全局 Map。

**Files:**
- Modify: `shared/session/game-core.ts`
- Modify: `server/game-session.ts`

- [ ] **Step 1: Extend GameCoreOptions**

Edit `shared/session/game-core.ts`:

Add to `GameCoreOptions` interface:
```ts
cardRegistry?: CardRegistry
```

In constructor, assign:
```ts
import { CardRegistry } from '../cards/registry'
import { setActiveCardRegistry } from '../cards/active-registry'
// ...
constructor(options: GameCoreOptions = {}) {
  // ...
  this.cardRegistry = options.cardRegistry ?? new CardRegistry()
  setActiveCardRegistry(this.cardRegistry)  // so legacy register* forwards here
  // ...
}
```

Add class field:
```ts
private readonly cardRegistry: CardRegistry
```

- [ ] **Step 2: Update GameCore hook dispatch to use registry**

Find every direct use of `cardListeners`, `cardEffectsById`, `cardModifiersById` (the legacy global Maps) inside `game-core.ts` and route through `this.cardRegistry`:

- `getCardEffect(id)` → `this.cardRegistry.getEffect(id)`
- Listener dispatch → `this.cardRegistry.getListenersFor(id)` (or `getAllListeners()` when matching broadly)
- Modifier lookup → `this.cardRegistry.getModifiers(id)`

This is the largest chunk of work in PR-2. May touch 10-20 call sites. Keep legacy global fallback for now in case anything slips.

- [ ] **Step 3: server/game-session.ts — inject ALL_CARD_IMPLS**

Edit `server/game-session.ts`:

```ts
import { GameCore, type GameCoreOptions } from '../shared/session/game-core'
import { CardRegistry } from '../shared/cards/registry'
import { ALL_CARD_IMPLS } from '../shared/cards/register-all'
import { registerExecutorBackedCustomCard } from './custom-code-runtime'

function createDefaultRegistry(): CardRegistry {
  const registry = new CardRegistry()
  for (const [cardId, impl] of Object.entries(ALL_CARD_IMPLS)) {
    registry.loadImpl(cardId, impl)
  }
  return registry
}

export class GameSession extends GameCore {
  constructor(options: Omit<GameCoreOptions, 'registerCustomCardImpl' | 'cardRegistry'> = {}) {
    super({
      ...options,
      cardRegistry: createDefaultRegistry(),
      registerCustomCardImpl: registerExecutorBackedCustomCard,
    })
  }
}

export type { GameCoreOptions as GameSessionOptions } from '../shared/session/game-core'
```

- [ ] **Step 4: Run full test**

```
pnpm test 2>&1 | tail -15
```
Expected: green. Cards register via active-registry bridge OR directly via ALL_CARD_IMPLS loading. If some listeners aren't firing, check:
- Does GameCore's dispatch path actually call `this.cardRegistry`?
- Is `setActiveCardRegistry(this.cardRegistry)` called early enough?
- Are any tests creating GameSession with custom options that bypass `createDefaultRegistry()`?

- [ ] **Step 5: Commit**

```
git add shared/session/game-core.ts server/game-session.ts
git commit -m "refactor(session): wire GameCore to per-session CardRegistry with ALL_CARD_IMPLS"
```

---

## Task 12: Make Occupation/MinorImprovement/MajorImprovement constructors pure

- [ ] **Step 1: Read constructors**

Read `shared/cards/types.ts` constructors for `Occupation`, `MinorImprovement`, `MajorImprovement`. Look for any module-level Map writes or side effects.

- [ ] **Step 2: Remove any side effects**

If the constructor pushes to a global `registeredOccupations` Map / similar, remove those — the Map is no longer needed. Replace with no-op or compute-on-demand getters if any consumer depends on it.

- [ ] **Step 3: Tests**

```
pnpm test 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```
git add shared/cards/types.ts
git commit -m "refactor(cards): make Occupation/MinorImprovement/MajorImprovement constructors pure"
```

---

## Task 13: Enable check:reaches strict

- [ ] **Step 1: Edit CI verify step**

```yaml
      - name: Check reaches (strict)
        run: pnpm run check:reaches -- --strict
```

- [ ] **Step 2: Local verify**

```
pnpm run check:reaches -- --strict
```
Expected: exit 0 (all reaches declared correctly — they're all `[]` in PR-2). If some cards reference external card IDs in handlers that aren't in reaches, manual fix each.

- [ ] **Step 3: Commit**

```
git add .github/workflows/ci.yml
git commit -m "ci: enable check-reaches strict mode"
```

---

## Task 14: Final verification

- [ ] **Step 1: Clean build + full test + all checks**

```
rm -rf dist/ public/cards-manifest.json
pnpm run build 2>&1 | tail -10
pnpm test 2>&1 | tail -10
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:prompt-sync -- --strict
pnpm run check:bundle-size
```
All should pass.

- [ ] **Step 2: Smoke test local intranet**

```
timeout 15 ./restart-intranet.sh 2>&1 | head -20
```
Expected: backend + frontend start; rooms restored from SQLite (custom cards loaded via effect_code path, no DSL).

Kill processes after confirming startup.

- [ ] **Step 3: Commits summary**

```
git log --oneline main..HEAD
```
Expected: ~12-14 commits for PR-2.

- [ ] **Step 4: Ready for merge — stop before push**

Report back. User decides when to push.

---

## Self-Review Checklist

1. **Spec coverage:**
   - [ ] DSL runner deleted — Task 3
   - [ ] card-codegen deleted — Task 3
   - [ ] effect_dsl branches stripped from all 9 files — Tasks 4-6
   - [ ] DB migration script runs against prod/local — Task 2
   - [ ] LLM prompt updated — Task 6
   - [ ] check:no-dsl strict — Task 7
   - [ ] Codemod applied to 875+ cards — Tasks 8-9
   - [ ] register-all.ts generated — Task 10
   - [ ] GameCore uses CardRegistry — Task 11
   - [ ] Constructors purified — Task 12
   - [ ] check:reaches strict — Task 13

2. **Non-goals respected:**
   - src/ not renamed ✓
   - server/ directory not restructured (PR-3) ✓
   - package.json.sideEffects not set yet (PR-3) ✓

3. **Testing discipline:**
   - No task skips `pnpm test` verification
   - Red→green cycles in codemod/script tasks

---

## Risks

| Risk | Mitigation |
|---|---|
| Codemod misses unusual card patterns | Task 9 Step 1 flags failures; manual fix; enhance codemod iteratively |
| GameCore dispatch refactor breaks edge cases | `setActiveCardRegistry` bridge keeps legacy path working if something slips |
| Production DSL data migration loses info | Migration is **non-destructive** — effect_dsl column retained, just effect_code also written |
| Constructor purification breaks a test that relied on side effect | Task 12 runs full test; if specific test breaks, manually update test or retain the side effect (note in concerns) |
| Codemod-generated `_impl` doesn't compile for a card | Each card's build is verified; failing cards get manual treatment |
