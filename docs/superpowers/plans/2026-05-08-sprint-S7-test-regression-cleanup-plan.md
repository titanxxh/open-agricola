# Sprint S7: 测试回归 + S6 已知遗留清理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 解 `docs/skip-tracker.md` 仅余的 2 个 active skip（B104 behavior-regression + E70 private-field-access），清理 S6b 期间 codemod 留下的 cards-impl `export { X }` re-export 桥，并手工实跑一次 S6c 添加但未跑过的 Playwright workshop smoke。

**Architecture:** 单 sprint 4 个 batch 串行 push（每 batch 独立 commit 链 + push + 等 CI 全绿才进下一个）。Batch 1 = B104 诊断后 X/Y/Z 三选一修复；Batch 2 = E70 测试 rewrite 走 public API；Batch 3 = 写 TS Compiler API codemod 重定向 ~85 callers + perl -i 删 825 cards-impl 文件的 `export { X }` bridge；Batch 4 = 手工跑 Playwright workshop-smoke 一次（不入 CI）。

**Tech Stack:** TypeScript 5.x、vitest、Playwright、TS Compiler API（codemod）、perl、pnpm、ESLint。

**Spec:** `docs/superpowers/specs/2026-05-08-sprint-S7-design.md`

---

## Setup: Worktree

- [ ] **Step 0.1: 创建 sprint-S7 worktree**

S7 必须在独立 worktree 工作，避免污染 main。

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola
git fetch origin
git worktree add .worktree/sprint-S7 -b sprint-S7 origin/main
cd .worktree/sprint-S7
pnpm install
```

Expected: `.worktree/sprint-S7/` 存在，`git branch --show-current` 输出 `sprint-S7`，`pnpm install` 成功（注意 Node 22）。

后续所有命令默认在 `.worktree/sprint-S7` 下执行。

- [ ] **Step 0.2: 验证起点 baseline**

```bash
pnpm run lint
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm test:fast
```

Expected: 全部通过；test:fast 中 B104 + E70 的 `it.skip` 显示为 skipped（不计入 fail）。

---

## Task 1 (Batch 1): B104 SheepWalker 诊断 + 修复

**Files:**
- Modify: `server/__tests__/B104_SheepWalker-session.test.ts:39` (unskip)
- Modify: `shared/session/session-core.ts:2269-2289` (条件性，方案 X 时改)
- Modify: `shared/cards/B/B104_SheepWalker.ts` (条件性，方案 Y 时改)
- Modify: `docs/skip-tracker.md`

**Goal**: B104 测试 unskip 后通过；`pnpm test:slow` 全绿；skip-tracker 中 B104 移到 Resolved。

### 1A. 诊断阶段

- [ ] **Step 1.1: unskip B104 测试**

`server/__tests__/B104_SheepWalker-session.test.ts:39` —— 把 `it.skip(` 改为 `it(`，删除上面的 `// SKIP[behavior-regression]:` 注释块（L31-38）。

```typescript
// Before (L31-39)
  // SKIP[behavior-regression]: shape codemod applied (S7 Batch 3), but
  // B104.enforceReorganizeOnLastHarvest no longer surfaces an animal-reorg
  // request after feed-phase confirm in round 14. Stage-flow's breed leaf
  // does emit `{ type: 'request', request: { kind: 'animal-reorg' } }`
  // (verified with engine.proceed instrumentation), but the engineStack /
  // runEngineSteps choice-path does not pivot into the reorganize sub-flow,
  // ending the harvest with `stateId: 'idle'` instead. Out of scope for the
  // shape codemod; track separately as a behavior regression.
  it.skip('forces animalReorg in last harvest even when no breeding occurs (single sheep)', () => {

// After (L31)
  it('forces animalReorg in last harvest even when no breeding occurs (single sheep)', () => {
```

- [ ] **Step 1.2: 跑 B104 单测看 actual vs expected**

```bash
pnpm exec vitest run server/__tests__/B104_SheepWalker-session.test.ts
```

Expected: `forces animalReorg in last harvest even when no breeding occurs (single sheep)` FAIL。记录实际错误：
- `resp.interaction.stateId` 实际值（spec 推测是 `'idle'`，期望 `'wait'`）
- `resp.interaction.request.kind` 实际值
- `resp.state.gameOver` 实际值

- [ ] **Step 1.3: 添加临时 instrumentation 定位 emit 路径**

在 `shared/session/session-core.ts:2269` 上面加诊断 log（**临时**，验证后删除）：

```typescript
      if (step.type === 'choice') {
        const interaction = this.engineStack.peekInteraction()
        // TEMP[S7-B104-diag]: dump engine choice path state
        // eslint-disable-next-line no-console
        console.error('[S7-B104-diag] choice step', {
          frameSourceKind: frame.source.kind,
          frameActionId: (frame.source as any)?.flow?.actionId,
          interactionRequestKind: interaction?.request?.kind ?? null,
          isSyntheticInteractionFrame: isSyntheticInteractionFrame(frame),
          deferredPlayerSwitch: frame.deferredPlayerSwitch,
          choiceOptionsCount: step.choice.options.length,
        })
        const isReorgSubFlow =
          frame.source.kind === 'flow'
          && (frame.source.flow as { actionId?: string }).actionId === 'reorganize'
        // ... rest unchanged
```

- [ ] **Step 1.4: 重跑 B104 测试，捕获 instrumentation 输出**

```bash
pnpm exec vitest run server/__tests__/B104_SheepWalker-session.test.ts 2>&1 | grep "S7-B104-diag" | head -20
```

Expected: 看到 1 条或多条 `[S7-B104-diag]` 行。记下：
- `interactionRequestKind` 是否是 `'animal-reorg'`？
- `isSyntheticInteractionFrame` 是否 `true`（导致 early return 没触发 pivot）？
- `frameActionId` 是否是 `'reorganize'`（导致 isReorgSubFlow=true）？
- `frameSourceKind` 是什么？

- [ ] **Step 1.5: 决定 X/Y/Z 修复方案**

根据 instrumentation 输出选一：

| 观察现象 | 选方案 | 实施步骤 |
|---|---|---|
| `interactionRequestKind === 'animal-reorg'` 但 `isSyntheticInteractionFrame === true` | **X**（修引擎）— 调整 synthetic frame 判定，让 animal-reorg 不被错杀 | 跳到 Step 1.6 |
| 没有任何 `[S7-B104-diag]` 行（说明 step 没走到 choice 分支）；OR `interactionRequestKind === null`（说明 emit 没走 InteractionNode 路径） | **Y**（修 B104 listener）— B104 的 `enforceReorganizeOnLastHarvest` 改用 InteractionNode 显式 emit | 跳到 Step 1.7 |
| BGA 同等情境下也不 enforce reorg（参考 `../bga-agricola/states/breed.state.php`） | **Z**（测试已过期）— 调整断言或 demote 到 `card_progress.md` deliberate divergence | 跳到 Step 1.8 |

记录决策：在 plan 这一格旁边写下 `Selected: X/Y/Z; Reason: <一句话>`。

- [ ] **Step 1.6: 方案 X — 修引擎 pivot 路径**

如果 instrumentation 显示 `isSyntheticInteractionFrame(frame) === true` 但 interaction 是 animal-reorg，把 pivot 检查提前到 synthetic-frame 检查之前：

`shared/session/session-core.ts:2269-2304`（删 instrumentation；调整顺序）：

```typescript
      if (step.type === 'choice') {
        const interaction = this.engineStack.peekInteraction()
        const isReorgSubFlow =
          frame.source.kind === 'flow'
          && (frame.source.flow as { actionId?: string }).actionId === 'reorganize'
        // Pivot to reorganize sub-flow BEFORE synthetic-frame early-return:
        // animal-reorg requests can surface inside synthetic harvest frames
        // (e.g. B104.enforceReorganizeOnLastHarvest pushed under a feed
        // confirm). The pivot itself is the only correct handling.
        if (
          interaction?.request?.kind === 'animal-reorg'
          && !isReorgSubFlow
        ) {
          const pIdx = frame.ownerPlayerIndex
          this.startReorganizeSubFlow(pIdx, 'anytime')
          return
        }
        if (isSyntheticInteractionFrame(frame)) {
          return
        }
        // ... rest unchanged
```

- [ ] **Step 1.7: 方案 Y — 修 B104 listener emit kind**

如果 instrumentation 显示 emit 没走 InteractionNode（interactionRequestKind 为 null），改 B104 自己 host 一个 InteractionNode：

定位 `shared/cards/B/B104_SheepWalker.ts` 中 `enforceReorganizeOnLastHarvest` 函数（用 grep 找）。把它 emit 的 `ActionExecutionResult` 改成走 startReorganizeSubFlow 风格的直接 push（与已有 reorg 卡看齐）。具体改法依赖该函数当前形态——根据 instrumentation 输出和现有代码决定。**注意 spec §7 风险 1：scope 蔓延**——如果发现方案 Y 需要改 helper 影响其他卡，回到 Step 1.5 重新评估方案 X。

- [ ] **Step 1.8: 方案 Z — 测试已过期**

参考 `../bga-agricola` 的 `breed.state.php` 或相应 last-harvest enforcement 代码：

```bash
ls ../bga-agricola/states/ 2>/dev/null
grep -rn "B104\|SheepWalker\|enforceReorganize" ../bga-agricola/ 2>/dev/null | head
```

如果 BGA 同等条件不 enforce reorg：
- 删除整个 `it('forces animalReorg ...')` 测试块（含 setup）
- 在 `docs/card_progress.md` §5「刻意不同」加一行：`B104 SheepWalker: BGA 在最终收获不强制 reorg；以 BGA 行为为准；测试 'forces animalReorg in last harvest' 在 S7 删除`

- [ ] **Step 1.9: 删除 instrumentation**

把 Step 1.3 加的 `// TEMP[S7-B104-diag]` console.error 块整段删除。

```bash
grep -n "S7-B104-diag" shared/session/session-core.ts
```

Expected: 0 行。

- [ ] **Step 1.10: 跑 B104 单测验证修复**

```bash
pnpm exec vitest run server/__tests__/B104_SheepWalker-session.test.ts
```

Expected: 3 个 it 全部 PASS（含原本 unskipped 的 forces 行 + 已有的 'no sheep' / 'non-last harvest'）。

- [ ] **Step 1.11: 跑 full slow project 验证无连锁回归**

```bash
pnpm test:slow
```

Expected: 全部 PASS。如果 fail 数 > 2，按 spec §7.1 风险缓解：评估 sprint 范围扩张 vs 退回方案 Y/Z。

- [ ] **Step 1.12: 跑 fast project + lint + tsc**

```bash
pnpm test:fast
pnpm run lint
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 全部 PASS。

- [ ] **Step 1.13: 更新 docs/skip-tracker.md**

把 B104 行从 "Active skips" 移到 "Resolved skips"：

```markdown
# In Active skips, delete the B104 row.
# In Resolved skips, append:
| server/__tests__/B104_SheepWalker-session.test.ts > "forces animalReorg in last harvest even when no breeding occurs (single sheep)" | S1 → S7-shape (2026-05-08) | S7 Batch 1 (2026-05-XX) | Engine pivot path fix: choice-step now checks animal-reorg request before synthetic-frame early-return. (方案 X — 或填实际选的方案 + 一句话原因) |
```

替换 `2026-05-XX` 为实际日期、替换 `方案 X` 为实际选的方案。

- [ ] **Step 1.14: commit Batch 1**

```bash
git add -A
git status
```

Expected: 仅修改 `server/__tests__/B104_SheepWalker-session.test.ts`、`docs/skip-tracker.md`、（条件性）`shared/session/session-core.ts` 或 `shared/cards/B/B104_SheepWalker.ts`。

```bash
git commit -m "$(cat <<'EOF'
fix(s7): unskip B104 SheepWalker last-harvest reorg test

Previously the B104 'forces animalReorg in last harvest' test was
skipped because the engine choice-step path did not pivot into
startReorganizeSubFlow when the InteractionNode carried an
animal-reorg request inside a synthetic harvest frame.

[替换为实际方案 X/Y/Z 的描述：
- X: Reorder pivot check before isSyntheticInteractionFrame early-return
- Y: B104 listener now hosts its own InteractionNode for reorg
- Z: BGA does not enforce reorg in this case — test deleted, deliberate divergence noted in card_progress.md]

Closes skip-tracker B104 entry (was last behavior-regression).
EOF
)"
```

- [ ] **Step 1.15: rebase main + push + 等 CI**

```bash
git fetch origin
git rebase origin/main
pnpm test:fast
pnpm run lint
git push -u origin sprint-S7
```

如有 conflict，先解决；如本地 lint/test 失败，先修。

```bash
# 等 GitHub Actions
sleep 30
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3&branch=sprint-S7' \
  | jq '.workflow_runs[] | {name, status, conclusion, html_url}'
```

Expected: 等到 status 全部 `completed`、conclusion 全部 `success`。如失败，按 CLAUDE.md 立刻定位修复。

---

## Task 2 (Batch 2): E70 CropRotationField 测试 rewrite

**Files:**
- Modify: `server/__tests__/E70_CropRotationField-session.test.ts:178-204` (rewrite test body)
- Modify: `docs/skip-tracker.md`

**Goal**: E70 `'fromSelectedFields rejects committing a different extra sow field'` 测试 unskip + 用 public API rewrite 后通过。

- [ ] **Step 2.1: unskip E70 测试**

`server/__tests__/E70_CropRotationField-session.test.ts:178` —— 把 `it.skip(` 改为 `it(`，先保留原测试体不动以观察失败现象。

- [ ] **Step 2.2: 跑 E70 单测看错误**

```bash
pnpm exec vitest run server/__tests__/E70_CropRotationField-session.test.ts -t "fromSelectedFields rejects"
```

Expected: FAIL。捕获错误信息（应该是 `session.activeSpaceId` 是 getter-only / 或 `session.pending` 不存在）。

- [ ] **Step 2.3: rewrite 测试用 public API**

替换 L179-204 的整段测试体：

```typescript
    it('fromSelectedFields rejects committing a different extra sow field', () => {
      const session = setup({ vegetable: 1 })
      addMinorCard(session, OTHER_EXTRA_CARD_ID)

      // Drive the session through a real grain-utilization action so it
      // reaches the sow-select interaction (with E70's selectedPositions
      // narrowing the allowed fields to just the card field).
      const player = session.getState().state.players[0]!
      writeCardExtraData(player, CARD_ID, 'selectedPositions', ['-1-70'])
      session.loadState(session.getState().state)

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
        .toBe('ui.interactionSowSelect')

      // Attempt to commit sow on a DIFFERENT extra-sow field (E69 MelonPatch
      // at -1/69 instead of E70's selected -1/70). The interaction's
      // selectableFields filter should reject this.
      resp = session.resolveChoice(0, 'confirm', {
        crops: [{ row: -1, col: 69, crop: 'vegetable' }],
      })

      expect(resp.ok).toBe(false)
      expect(session.getState().state.players[0]!.resources.vegetable).toBe(1)
      expect(
        readCardExtraData<{ crop: string; remaining: number }>(
          session.getState().state.players[0]!,
          OTHER_EXTRA_CARD_ID,
          'cardCrop',
        ),
      ).toBeUndefined()
    })
```

注意：删除原测试中 `;(session as unknown as { activeSpaceId: string | null }).activeSpaceId = ...` 这种私有字段 mutate。

- [ ] **Step 2.4: 跑 E70 单测验证**

```bash
pnpm exec vitest run server/__tests__/E70_CropRotationField-session.test.ts
```

Expected: 整文件全部 PASS。如果新版断言不符（比如 `resp.ok` 实际是 true），调试：
1. 先 `console.log(resp)` 看实际返回。
2. 如果 selectableFields 过滤生效，应该返回 `ok: false` 且 `error` 含 "field not selectable" 之类。
3. 如果 sow 确实 commit 成功了（说明 fromSelectedFields filter 没生效），则该测试在揭示一个 BUG —— **暂停 batch 2**，先打开 issue 评估，按情况退到 deliberate divergence 或修 selectableFields 过滤逻辑。

- [ ] **Step 2.5: 跑 fast + slow + lint + tsc 全量**

```bash
pnpm test:fast
pnpm test:slow
pnpm run lint
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 全部 PASS。

- [ ] **Step 2.6: 更新 docs/skip-tracker.md**

把 E70 行从 "Active skips" 移到 "Resolved skips"。Active 表此时应为空（仅留表头）。

```markdown
# Active skips
# (空 — S7 Batch 1 + 2 全部清理)

# In Resolved skips, append:
| server/__tests__/E70_CropRotationField-session.test.ts > "fromSelectedFields rejects committing a different extra sow field" | S1 | S7 Batch 2 (2026-05-XX) | Rewrite via public takeAction + resolveChoice; no longer mutates private session.pending / activeSpaceId. |
```

替换 `2026-05-XX` 为实际日期。

- [ ] **Step 2.7: commit Batch 2**

```bash
git add -A
git commit -m "$(cat <<'EOF'
test(s7): rewrite E70 'rejects different extra sow field' via public API

The skipped test mutated session.pending / activeSpaceId directly,
which became getter-only after S2 Task 10. Rewrite to drive the
interaction through takeAction + resolveChoice and assert the
selectableFields filter rejects the cross-card sow commit.

Closes skip-tracker E70 entry (was last private-field-access skip).
skip-tracker.md Active table is now empty.
EOF
)"
```

- [ ] **Step 2.8: rebase + push + 等 CI**

```bash
git fetch origin
git rebase origin/main
pnpm test:fast
pnpm run lint
git push
sleep 30
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3&branch=sprint-S7' \
  | jq '.workflow_runs[] | {name, status, conclusion, html_url}'
```

Expected: 全绿。

---

## Task 3 (Batch 3): cards re-export 桥清理

**Files:**
- Create: `scripts/codemod-cards-display-redirect.ts`
- Create: `scripts/__tests__/codemod-cards-display-redirect.test.ts`
- Modify: ~77 caller files in `server/__tests__/`、`shared/cards/__tests__/`、其他 `shared/` `client/` `tests/` `scripts/` `src/`
- Modify: 825 `shared/cards/[A-E]/*.ts` (删除 `export { X }` 桥)

**Goal**: 所有 callers 直接 from `cards-display/<deck>/<file>` import display const；825 cards-impl 文件无 `export { X }` 桥；tsc/lint/test/build/check:bundle-size 全绿。

### 3A. Codemod TDD：先写 fixture tests

- [ ] **Step 3.1: 创建 codemod fixture 测试文件**

`scripts/__tests__/codemod-cards-display-redirect.test.ts`：

```typescript
import { describe, expect, it } from 'vitest'
import { redirectCardImport, type RedirectInput, type RedirectResult } from '../codemod-cards-display-redirect'

describe('codemod-cards-display-redirect', () => {
  it('display-only import: redirects path to cards-display', () => {
    const input: RedirectInput = {
      sourcePath: 'server/__tests__/A20_DoubleTurnPlow-session.test.ts',
      sourceText: `import { A20_DoubleTurnPlow } from '../../shared/cards/A/A20_DoubleTurnPlow'\n`,
    }
    const result = redirectCardImport(input)
    expect(result.kind).toBe('rewritten')
    if (result.kind !== 'rewritten') throw new Error('expected rewritten')
    expect(result.text).toBe(
      `import { A20_DoubleTurnPlow } from '../../shared/cards-display/A/A20_DoubleTurnPlow'\n`,
    )
  })

  it('impl-only import: leaves path untouched', () => {
    const input: RedirectInput = {
      sourcePath: 'server/__tests__/E53_BoarSpear-session.test.ts',
      sourceText: `import { E53_BoarSpear_impl } from '../../shared/cards/E/E53_BoarSpear'\n`,
    }
    const result = redirectCardImport(input)
    expect(result.kind).toBe('unchanged')
  })

  it('mixed display + impl: splits into two import lines', () => {
    const input: RedirectInput = {
      sourcePath: 'server/__tests__/D62_BeerTap-session.test.ts',
      sourceText:
        `import { D62_BeerTap, D62_BeerTap_impl } from '../../shared/cards/D/D62_BeerTap'\n`,
    }
    const result = redirectCardImport(input)
    expect(result.kind).toBe('rewritten')
    if (result.kind !== 'rewritten') throw new Error('expected rewritten')
    expect(result.text).toBe(
      `import { D62_BeerTap } from '../../shared/cards-display/D/D62_BeerTap'\n` +
      `import { D62_BeerTap_impl } from '../../shared/cards/D/D62_BeerTap'\n`,
    )
  })

  it('non-card-binding helper export: leaves path untouched', () => {
    // C117 exports both the display const AND a helper `hasAdjacentWorker`
    // from cards-impl side. If the import is just the helper, do not redirect.
    const input: RedirectInput = {
      sourcePath: 'server/__tests__/C117_Legworker-session.test.ts',
      sourceText: `import { hasAdjacentWorker } from '../../shared/cards/C/C117_Legworker'\n`,
    }
    const result = redirectCardImport(input)
    expect(result.kind).toBe('unchanged')
  })

  it('mixed display + helper: splits, keeps helper on impl path', () => {
    const input: RedirectInput = {
      sourcePath: 'server/__tests__/X1_Foo-session.test.ts',
      sourceText:
        `import { X1_Foo, helperFn } from '../../shared/cards/X/X1_Foo'\n`,
    }
    const result = redirectCardImport(input)
    expect(result.kind).toBe('rewritten')
    if (result.kind !== 'rewritten') throw new Error('expected rewritten')
    expect(result.text).toBe(
      `import { X1_Foo } from '../../shared/cards-display/X/X1_Foo'\n` +
      `import { helperFn } from '../../shared/cards/X/X1_Foo'\n`,
    )
  })

  it('display + impl + helper: keeps impl + helper together, splits display', () => {
    const input: RedirectInput = {
      sourcePath: 'server/__tests__/X1_Foo-session.test.ts',
      sourceText:
        `import { X1_Foo, X1_Foo_impl, helperFn } from '../../shared/cards/X/X1_Foo'\n`,
    }
    const result = redirectCardImport(input)
    expect(result.kind).toBe('rewritten')
    if (result.kind !== 'rewritten') throw new Error('expected rewritten')
    expect(result.text).toBe(
      `import { X1_Foo } from '../../shared/cards-display/X/X1_Foo'\n` +
      `import { X1_Foo_impl, helperFn } from '../../shared/cards/X/X1_Foo'\n`,
    )
  })

  it('multiple imports in same file: each handled independently', () => {
    const input: RedirectInput = {
      sourcePath: 'server/__tests__/multi.test.ts',
      sourceText:
        `import { A1_Shelter } from '../../shared/cards/A/A1_Shelter'\n` +
        `import { B27_Toolbox_impl } from '../../shared/cards/B/B27_Toolbox'\n` +
        `import { D62_BeerTap, D62_BeerTap_impl } from '../../shared/cards/D/D62_BeerTap'\n`,
    }
    const result = redirectCardImport(input)
    expect(result.kind).toBe('rewritten')
    if (result.kind !== 'rewritten') throw new Error('expected rewritten')
    expect(result.text).toBe(
      `import { A1_Shelter } from '../../shared/cards-display/A/A1_Shelter'\n` +
      `import { B27_Toolbox_impl } from '../../shared/cards/B/B27_Toolbox'\n` +
      `import { D62_BeerTap } from '../../shared/cards-display/D/D62_BeerTap'\n` +
      `import { D62_BeerTap_impl } from '../../shared/cards/D/D62_BeerTap'\n`,
    )
  })

  it('non-card import path: untouched', () => {
    const input: RedirectInput = {
      sourcePath: 'shared/foo.ts',
      sourceText: `import { something } from './bar'\n`,
    }
    const result = redirectCardImport(input)
    expect(result.kind).toBe('unchanged')
  })
})
```

注意：第 4-6 个 case 区分「helper 函数」和「display const」需要靠**命名约定**——display const 的名字与 cards-display 文件中导出的 const 同名（即 deck-prefix + number + name 模式，如 `A20_DoubleTurnPlow`）。helper 是 camelCase。codemod 应该判断每个 named binding：
- 形如 `[A-E]\d+_[A-Z][A-Za-z0-9]*` 不带 `_impl` 后缀 → display const → 重定向
- 形如 `[A-E]\d+_[A-Z][A-Za-z0-9]*_impl` → impl → 留原路径
- 其他（如 `hasAdjacentWorker`）→ helper → 留原路径

为了校验「这个名字真的是 cards-display 中的 export」，codemod 在 wet-run 时可以读 `shared/cards-display/<deck>/<file>.ts` 验证；但 unit test 用 fixture 不依赖文件系统，靠正则判定即可。

- [ ] **Step 3.2: 跑 unit test 看 fail**

```bash
pnpm exec vitest run scripts/__tests__/codemod-cards-display-redirect.test.ts
```

Expected: 全部 FAIL（找不到模块 `../codemod-cards-display-redirect`）。

### 3B. 实现 codemod

- [ ] **Step 3.3: 创建 codemod 实现文件**

`scripts/codemod-cards-display-redirect.ts`：

```typescript
// Codemod: redirect callers' display-const imports from
//   shared/cards/<deck>/<file>
// to
//   shared/cards-display/<deck>/<file>
// while leaving _impl imports and unrelated helper exports on the
// original path. Used to clean up the S6b re-export bridge.

import * as ts from 'typescript'
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, relative } from 'path'
import { fileURLToPath } from 'url'

export interface RedirectInput {
  sourcePath: string
  sourceText: string
}

export type RedirectResult =
  | { kind: 'unchanged' }
  | { kind: 'rewritten'; text: string }

const CARD_BINDING_RE = /^[A-E]\d+_[A-Z][A-Za-z0-9]*$/
const CARD_IMPL_BINDING_RE = /^[A-E]\d+_[A-Z][A-Za-z0-9]*_impl$/
const CARD_PATH_RE = /(['"])(.*\/)shared\/cards\/([A-E])\/([A-Z]\d+_[A-Za-z0-9]+)\1/

interface BindingClass {
  display: string[]   // card display const (no _impl)
  rest: string[]      // _impl + helpers + types — stay on cards/ path
}

const classifyBindings = (raw: string[]): BindingClass => {
  const display: string[] = []
  const rest: string[] = []
  for (const name of raw) {
    if (CARD_IMPL_BINDING_RE.test(name)) rest.push(name)
    else if (CARD_BINDING_RE.test(name)) display.push(name)
    else rest.push(name)
  }
  return { display, rest }
}

export const redirectCardImport = (input: RedirectInput): RedirectResult => {
  const sf = ts.createSourceFile(
    input.sourcePath,
    input.sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )

  let mutated = false
  const edits: { start: number; end: number; replacement: string }[] = []

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt)) continue
    const moduleSpec = (stmt.moduleSpecifier as ts.StringLiteral).text
    const m = moduleSpec.match(/^(.*\/)shared\/cards\/([A-E])\/([A-Z]\d+_[A-Za-z0-9]+)$/)
    if (!m) continue

    const [, prefix, deck, file] = m

    const clause = stmt.importClause
    if (!clause || !clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue

    const elements = clause.namedBindings.elements
    const names = elements.map((el) => el.name.text)
    const { display, rest } = classifyBindings(names)

    if (display.length === 0) continue

    const isTypeOnly = clause.isTypeOnly
    const typeMarker = isTypeOnly ? 'type ' : ''
    const lines: string[] = []
    if (display.length > 0) {
      lines.push(`import ${typeMarker}{ ${display.join(', ')} } from '${prefix}shared/cards-display/${deck}/${file}'`)
    }
    if (rest.length > 0) {
      lines.push(`import ${typeMarker}{ ${rest.join(', ')} } from '${prefix}shared/cards/${deck}/${file}'`)
    }

    edits.push({
      start: stmt.getStart(sf),
      end: stmt.getEnd(),
      replacement: lines.join('\n'),
    })
    mutated = true
  }

  if (!mutated) return { kind: 'unchanged' }

  let text = input.sourceText
  for (let i = edits.length - 1; i >= 0; i--) {
    const e = edits[i]!
    text = text.slice(0, e.start) + e.replacement + text.slice(e.end)
  }
  return { kind: 'rewritten', text }
}

// ---------- CLI driver ----------

const SCAN_ROOTS = [
  'server',
  'shared',
  'client',
  'src',
  'tests',
  'scripts',
  'e2e-tests',
]

const walk = (dir: string, out: string[]): void => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.worktree' || entry === 'output') continue
      walk(full, out)
    } else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) {
      out.push(full)
    }
  }
}

const runCodemod = (mode: 'dry-run' | 'wet-run'): void => {
  const repoRoot = resolve(__dirname, '..')
  const files: string[] = []
  for (const root of SCAN_ROOTS) {
    const abs = join(repoRoot, root)
    try { walk(abs, files) } catch { /* root may not exist */ }
  }
  // Skip cards-impl files themselves (they self-host the bridge — Step 3D).
  const filtered = files.filter((f) => !/\/shared\/cards\/[A-E]\/[A-Z]\d+_/.test(f))

  let touched = 0
  for (const f of filtered) {
    const text = readFileSync(f, 'utf8')
    const result = redirectCardImport({ sourcePath: f, sourceText: text })
    if (result.kind === 'rewritten') {
      touched++
      console.log(`[${mode}] ${relative(repoRoot, f)}`)
      if (mode === 'wet-run') {
        writeFileSync(f, result.text)
      }
    }
  }
  console.log(`\n${mode}: ${touched} file(s) ${mode === 'wet-run' ? 'rewritten' : 'would be rewritten'}`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mode = process.argv.includes('--wet-run') ? 'wet-run' : 'dry-run'
  runCodemod(mode)
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
```

注：脚本顶部 `__filename`/`__dirname` 在 ESM 下无内置——按 `scripts/codemod-cards-display.ts` 现有模式处理。如果项目用 commonjs，把这两行删掉用原生 `__dirname`。

- [ ] **Step 3.4: 跑 unit test 验证 codemod 通过**

```bash
pnpm exec vitest run scripts/__tests__/codemod-cards-display-redirect.test.ts
```

Expected: 8 个 it 全部 PASS。

### 3C. Dry-run 评估范围

- [ ] **Step 3.5: 跑 codemod dry-run，看报告**

```bash
pnpm exec tsx scripts/codemod-cards-display-redirect.ts
```

Expected: 看到一份「[dry-run] <file>」列表 + 总数（spec 估算 ~85 文件 + ~150 import 语句）。Sanity check：
```bash
pnpm exec tsx scripts/codemod-cards-display-redirect.ts | tee /tmp/s7-codemod-dry-run.log
wc -l /tmp/s7-codemod-dry-run.log
grep -c '^\[dry-run\]' /tmp/s7-codemod-dry-run.log
```

Expected: 数量在 70-100 区间。如果 < 50 或 > 150，说明 classifyBindings 或路径正则有问题，回 Step 3.3 调整。

### 3D. Wet-run + 删 825 文件 export bridge

- [ ] **Step 3.6: Wet-run codemod（重定向 callers）**

```bash
pnpm exec tsx scripts/codemod-cards-display-redirect.ts --wet-run
```

Expected: 修改 ~85 文件。

- [ ] **Step 3.7: 跑 tsc + tests，验证重定向不破坏运行时**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
pnpm test:fast
```

Expected: 全部 PASS。**因为 cards-impl 还有 `export { X }` 桥**，即使 caller 还偶尔从 cards/ 导 display 也能 work；这一步只验证「重定向后的 import 也能 resolve」。

- [ ] **Step 3.8: commit 重定向（middle commit，让 bisect 可定位）**

```bash
git add -A
git status  # 看修改文件数 ~85
git commit -m "refactor(s7): redirect display-const callers to cards-display

Codemod scripts/codemod-cards-display-redirect.ts rewrites ~85 caller
files (server tests, shared internals, client) so display-const
imports point at shared/cards-display/<deck>/<file> directly,
removing the implicit dependency on the cards-impl re-export bridge.

The 825 cards-impl files still re-export display consts as a bridge
(removed in the next commit)."
```

- [ ] **Step 3.9: 删除 825 cards-impl 文件的 `export { X }` 桥**

用 perl -i 跨所有 `shared/cards/[A-E]/` 文件删除单行 `export { ... }` 紧跟在 import 之后的那行：

```bash
# 先 grep 确认匹配范围（仅 cards-impl 文件中、紧接 cards-display import 之后的 export）
grep -rn "^export { [A-E][0-9].*_[A-Za-z0-9]* }$" shared/cards/[A-E]/ | wc -l
```

Expected: ~825。

```bash
# perl -i 删除：仅匹配「单独一行 export { <name> }」并且 <name> 形如 `[A-E]\d+_...`
find shared/cards/[A-E]/ -name '*.ts' -type f -print0 | \
  xargs -0 perl -i -ne 'print unless /^export \{ [A-E]\d+_[A-Za-z0-9]+ \}$/'
```

- [ ] **Step 3.10: 验证 export 桥已删**

```bash
grep -rn "^export { [A-E][0-9].*_[A-Za-z0-9]* }$" shared/cards/[A-E]/ | wc -l
```

Expected: 0。

- [ ] **Step 3.11: 跑 tsc 看是否复活 TS6133 unused import**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit 2>&1 | tee /tmp/s7-tsc-app.log
pnpm exec tsc -p tsconfig.server.json --noEmit 2>&1 | tee /tmp/s7-tsc-server.log
```

Expected: 大概率有 TS6133 错误，每个 cards-impl 文件中保留的 `import { X } from '../../cards-display/<deck>/<file>'` 在删了 `export { X }` 后可能 unused。

```bash
grep -E "TS6133" /tmp/s7-tsc-app.log /tmp/s7-tsc-server.log | head -10
```

- [ ] **Step 3.12: 处理 unused import**

按 spec §4.2 Step 2 + §7.2 风险缓解：

对每个 TS6133：
1. 看该 cards-impl 文件——`X` 是否还在 `_impl` 体内被使用（如 `const CARD_ID = X.id`）？
   - 是 → 保留 import，TS6133 不该报；说明 tsc 误报，跳过。
   - 否 → 该 cards-impl 文件是「纯 helper」，不需要 cards-display 里的 const；perl -i 删除该行 import。

写个一次性脚本 `scripts/fix-cards-impl-unused-imports.sh`（或直接 inline）：

```bash
# 收集所有 TS6133 涉及的 (file, name) 对
grep -E "TS6133" /tmp/s7-tsc-app.log /tmp/s7-tsc-server.log | \
  sed -E "s/^([^:]+):[^:]+:[^:]+: error TS6133: '([^']+)' is declared but its value is never read\.$/\1\t\2/" | \
  sort -u > /tmp/s7-unused.tsv

cat /tmp/s7-unused.tsv | head -10
wc -l /tmp/s7-unused.tsv
```

对每行 `file<TAB>name`，删除 `file` 中的 `import { <name> } from '...'` 行（**仅当那行只有 <name>**——否则需要更精细处理）：

```bash
while IFS=$'\t' read -r file name; do
  # 如果 file 中的 import 仅这一个 binding，整行删除
  perl -i -ne "print unless /^import \{ ${name} \} from '[^']+'\$/" "$file"
done < /tmp/s7-unused.tsv
```

- [ ] **Step 3.13: 重跑 tsc 直到全绿**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 0 error。如果还有 TS6133，说明 import 里有其他 binding 同行——手动处理（用 Edit 工具按文件逐个改）。

- [ ] **Step 3.14: 跑 lint + 全量 test + build + check:bundle-size**

```bash
pnpm run lint
pnpm test:fast
pnpm test:slow
pnpm run build
pnpm run check:bundle-size
```

Expected: 全部 PASS。bundle size 限制 550/170 不变（spec §0 不期望瘦身）。

- [ ] **Step 3.15: grep 确认 callers 已干净**

```bash
# 仅余 cards-impl 内部的 cards-display 反向 import，不应有任何 caller 还从 cards/<deck>/ 导 display const
grep -rn "from '.*shared/cards/[A-E]/[A-Z]" --include="*.ts" \
  server/__tests__ shared/cards/__tests__ shared/actions shared/session client/ src/ 2>/dev/null \
  | grep -vE "shared/cards/[A-E]/[A-Z][0-9]+_[A-Za-z0-9]+'$" \
  | grep -vE "_impl }" \
  | head -10
```

Expected: 0 行（或仅余 helper imports 如 `hasAdjacentWorker`）。

- [ ] **Step 3.16: commit 删 export 桥 + 修 unused import**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(s7): remove cards-impl re-export bridge (S6b residual)

After redirecting all callers to cards-display in the previous commit,
the 'export { X }' lines in shared/cards/[A-E]/*.ts (added by S6b
codemod to satisfy TS6133 + legacy callers) are no longer load-bearing.

- perl -i removed 825 single-line 'export { Xnn_Foo }' bridges.
- For cards-impl files where the cards-display import became unused
  after removing the bridge, the import is also dropped (helper-only
  files). For files still referencing X.id internally, the import stays.

Cards-impl files now contain only their _impl object + the back-import
of the display const used internally — matching the S6 spec §2.2 target.
EOF
)"
```

- [ ] **Step 3.17: rebase + push + 等 CI**

```bash
git fetch origin
git rebase origin/main
pnpm test:fast
pnpm run lint
git push
sleep 60
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3&branch=sprint-S7' \
  | jq '.workflow_runs[] | {name, status, conclusion, html_url}'
```

Expected: 全绿。如果 CI 失败，按 CLAUDE.md 立刻修复。

---

## Task 4 (Batch 4): e2e workshop-smoke 实跑

**Files:**
- Modify: `docs/ENGINE_NEW_ARCHITECTURE.md` §15 (mark 已知遗留 #1 + #3 闭环)
- Modify: `docs/master-plan.md` §8 (加 S7 行)

**Goal**: `e2e-tests/workshop-smoke.spec.ts` 在本地手工跑过通过；S6 已知遗留 #1 + #3 标记为 resolved。

- [ ] **Step 4.1: 确认 Playwright browsers 已装**

```bash
pnpm exec playwright install --with-deps chromium 2>&1 | tail -5
```

Expected: 已装或自动装好。

- [ ] **Step 4.2: 启动 dev server（后台）**

```bash
# 确认端口未占
lsof -i:5173 2>/dev/null
lsof -i:5175 2>/dev/null
# 如有占用，kill 之
```

```bash
# 启动（后台）
nohup ./restart-intranet.sh > /tmp/s7-server.log 2>&1 &
echo "server PID: $!"
```

- [ ] **Step 4.3: 等 health check**

```bash
# 等后端
for i in {1..30}; do
  if curl -s http://localhost:5175/api/health | grep -q ok; then
    echo "backend up"; break
  fi
  sleep 2
done

# 等前端
for i in {1..30}; do
  if curl -s -o /dev/null -w '%{http_code}' http://localhost:5173/ | grep -q 200; then
    echo "frontend up"; break
  fi
  sleep 2
done
```

Expected: 看到 `backend up` + `frontend up`。

- [ ] **Step 4.4: 跑 Playwright workshop-smoke**

```bash
pnpm exec playwright test e2e-tests/workshop-smoke.spec.ts 2>&1 | tee /tmp/s7-e2e.log
```

Expected: `1 passed (Xs)`。如果 fail：
- 看 `/tmp/s7-e2e.log` 错误
- 看 `output/playwright/` 截图 trace
- 检查 `data-testid="workshop-root"` 是否真的渲染（可能 sandbox lazy chunk 加载失败 / 路由参数 `?page=workshop` 不识别）

如果是真问题（spec §5.1 step 4 未通过），不要硬上 fail——先文档化为 follow-up issue（在 ENGINE_NEW_ARCHITECTURE.md §15 已知遗留段记录），跳过此 batch 并把 #3 标 deferred。

- [ ] **Step 4.5: 关闭 dev server**

```bash
pkill -f "pnpm run server" || true
pkill -f "pnpm run dev" || true
pkill -f "node.*vite" || true
lsof -i:5173 -i:5175  # 应无输出
```

- [ ] **Step 4.6: 更新 docs/ENGINE_NEW_ARCHITECTURE.md §15**

打开文件，找到「已知遗留（S7 之前需要决定）」段。把：
- #1 cards-impl re-export bridge → 标 `(已闭环 — S7 Batch 3, 2026-05-XX)`
- #2 cards-display/major/** ESLint 豁免 → 保留（spec §0 已声明走 ADR）
- #3 e2e workshop-smoke → 标 `(已闭环 — S7 Batch 4 手工实跑通过, 2026-05-XX)`

同时找到「Sprint 进度」头段（约 L18），加 `S7 ✅（2026-05-XX）`。

在文件末尾或 §15 末尾加 Sprint S7 收口段：

```markdown
### Sprint S7（测试回归 + S6 已知遗留清理） ✅ 2026-05-XX

**DoD 达成**：
- ✅ skip-tracker.md Active 表清空（B104 + E70 全部 Resolved）
- ✅ 825 cards-impl 文件无 `export { X }` 桥（S6b 残留全清）
- ✅ ~85 callers 重定向到 cards-display
- ✅ e2e workshop-smoke 手工跑过通过
- ✅ test:fast / test:slow / lint / build / check:bundle-size / GitHub Actions 全绿

**关键演进**：
- B104 修复方案: [实际选的 X/Y/Z + 一句话]
- 新增 codemod: scripts/codemod-cards-display-redirect.ts（display-const 重定向，TS Compiler API）

**已知遗留（仍未闭环）**：
- #2 cards-display/major/** ESLint 豁免 —— ADR 处理（不进 sprint）
```

替换 `2026-05-XX` 为实际日期、`[实际选的 X/Y/Z + 一句话]` 为 Task 1 实际选的方案。

- [ ] **Step 4.7: 更新 docs/master-plan.md §8**

打开 `docs/master-plan.md`，在 §8 Sprint 进度表加新行：

```markdown
| S7 | 2026-05-XX | ✅ | 测试回归 + S6 已知遗留清理：B104 / E70 unskip；cards-impl re-export bridge 清理；e2e workshop-smoke 实跑 |
```

- [ ] **Step 4.8: commit 文档**

```bash
git add docs/ENGINE_NEW_ARCHITECTURE.md docs/master-plan.md
git commit -m "$(cat <<'EOF'
docs(sprint-S7): closeout — DoD + skip-tracker resolution

- ENGINE_NEW_ARCHITECTURE.md §15: mark Sprint S7 ✅; close known
  leftovers #1 (cards-impl re-export bridge) and #3 (e2e
  workshop-smoke). #2 (cards-display/major/** ESLint exemption)
  remains open, deferred to ADR per spec §0.
- master-plan.md §8: add S7 row.
EOF
)"
```

- [ ] **Step 4.9: rebase + push + 等 CI**

```bash
git fetch origin
git rebase origin/main
pnpm test:fast
pnpm run lint
git push
sleep 60
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=5&branch=sprint-S7' \
  | jq '.workflow_runs[] | {name, status, conclusion, html_url}'
```

Expected: 全绿。

---

## Closeout: Merge to main + 验证

- [ ] **Step C.1: PR 创建（用户决策点）**

按 CLAUDE.md：从 sprint-S7 分支创建 PR，挂到 main。

```bash
gh pr create --title "Sprint S7: test regression + S6 leftover cleanup" \
  --body "$(cat <<'EOF'
## Summary
- Batch 1: Unskip B104 SheepWalker last-harvest reorg test ([方案 X/Y/Z])
- Batch 2: Rewrite E70 'rejects different extra sow field' via public API
- Batch 3: Redirect ~85 callers to cards-display + remove 825 cards-impl `export { X }` bridges (S6b residual)
- Batch 4: Run Playwright workshop-smoke locally (not in CI per spec §5.2)

## Test plan
- [x] B104 + E70 unskip pass
- [x] skip-tracker.md Active table empty
- [x] tsc app + server clean
- [x] lint clean
- [x] test:fast + test:slow green
- [x] build + check:bundle-size pass
- [x] e2e workshop-smoke passes locally
- [x] GitHub Actions all green on sprint-S7
EOF
)"
```

- [ ] **Step C.2: 合并到 main（用 rebase merge，按 CLAUDE.md 不用 merge commit）**

由用户决定时机。合入后：

```bash
git checkout main
git pull --rebase origin main
git branch -D sprint-S7  # 本地分支
git worktree remove .worktree/sprint-S7
```

- [ ] **Step C.3: 等 main 上 CI 全绿**

```bash
sleep 60
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=5&branch=main' \
  | jq '.workflow_runs[] | {name, status, conclusion, html_url}'
```

Expected: 最新 3 个 run（CI / Deploy Backend / Deploy Frontend）全绿。

---

## 整体 DoD（与 spec §6 对齐）

- [ ] `docs/skip-tracker.md` Active skip 数 2 → 0
- [ ] `shared/cards/<deck>/<file>.ts` 825 文件无 `export { X }` re-export 桥
- [ ] 所有 callers 直接 import cards-display 取 display const
- [ ] e2e workshop-smoke 手工跑过通过
- [ ] `pnpm test:fast` + `pnpm test:slow` + `tsc app+server` + `pnpm run lint` + `pnpm run build` + `pnpm run check:bundle-size` 全绿
- [ ] 所有 4 batch 推到 main 后 GitHub Actions 全绿
- [ ] `docs/ENGINE_NEW_ARCHITECTURE.md` §15 加 S7 收口段；已知遗留 #1 + #3 标闭环（#2 单独 ADR）
- [ ] `docs/master-plan.md` §8 加 S7 行
