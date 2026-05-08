# Sprint S6: 物理分层设计 Spec

> 涉及子 sprint：S6a (contract migration) → S6b (cards display/impl split) → S6c (sandbox + ESLint hardening + bundle)

**Goal**：把当前在 `shared/cards/<deck>/<file>.ts` 单文件双导出（`XxxCard` display + `XxxCard_impl` impl）的 824 张卡物理 split 成两层（display vs impl）；把 `shared/game/`、`shared/logic/`、`shared/protocol/` 三个旧目录拆解搬迁到 `shared/contract/`、`shared/domain/`、`shared/session/`、`shared/utils/`；新建 `client/sandbox/` 入口让 workshop hot-seat 走 dynamic import；落地 5 套 ESLint error 级新规则；让 main bundle 从 541 KB 跌破 400 KB（给 150 KB 余量）。

**驱动目标优先级**（用户确认 D：A→B→C）：
- **A. Bundle 紧迫性**：main 离 550 KB limit 只剩 9 KB，必须立即拆解
- **B. 架构边界硬化**：5 套 ESLint error 级阻断未来误导入
- **C. Sandbox 独立 bundle**：dynamic import + dual chunk 落地

---

## §0 当前架构现状

### 关键数据
- `shared/cards/` 1074 个 .ts（824 张卡 + helpers + __stubs__ + register-all）
- 每张卡单文件双导出：`XxxCard`（display）+ `XxxCard_impl`（impl）
- 主 bundle：**541 KB raw / 165 KB gz**（limit 550/170 — 余量 9 KB）
- WorkshopPage 已 chunk：110 KB（lazy import）
- 现有 ESLint boundary 规则 5 套（domain isolation / 三层 / payment）

### 主 bundle 失控根因
每张卡 top-level `import` 引入 impl 依赖：
- `B30_WoodPalisades.ts` → `actions/effects/fencing` 拖 fencing 进 main bundle
- `C146_WorkshopAssistant.ts` → `actions/helpers/ad-hoc-action-registry`、`actions/effects/gain`
- `A100_Curator.ts` → `cards/helpers/pay-gain-node` → `actions/effects/*`

ESM tree-shaking 干不掉 top-level `import` 的副作用，所以 824 张卡的 effects 和 helpers 全被拖进 main bundle。物理 split 是必须做的。

### Sub-sprint 拆分（S6a/b/c）
依赖串行，每个独立合并：
```
S6a (~1.5 day)  contract 类型迁移 + game/logic/protocol 旧目录拆解
  ↓
S6b (~2 day)    codemod 824 张卡 split + cards-display 落地
  ↓
S6c (~1 day)    sandbox entry + ESLint error 级 + bundle limit 紧缩
```
spec 1 份覆盖全 S6；plan 各 sub-sprint 独立写；每个 sub-sprint push 后等 GitHub Actions 全绿才进下一个。

---

## §1 S6a — Contract Migration

### §1.1 目标
- 创建 `shared/contract/`（pure type only）+ `shared/utils/` 两个新目录
- 拆掉 `shared/game/`、`shared/logic/`、`shared/protocol/` 三个旧目录
- `shared/cards/types.ts` 拆三份

### §1.2 文件迁移矩阵

| 现路径 | 新路径 | 处理 |
|--------|--------|------|
| `shared/game/types.ts`（23KB pure type）| `shared/contract/types.ts` | 整搬 |
| `shared/game/prompt-keys.ts` | `shared/contract/prompt-keys.ts` | 整搬 |
| `shared/game/resource-keys.ts` | `shared/contract/resource-keys.ts` | 整搬 |
| `shared/game/animals.ts` | type → `shared/contract/animals.ts`，runtime → `shared/domain/animals.ts` | 拆 |
| `shared/game/farm.ts` / `field.ts` / `space.ts` / `player.ts` | `shared/domain/{farm,field,space,player}.ts` | 整搬 |
| `shared/game/serialization.ts` | `shared/session/serialization.ts` | 整搬 |
| `shared/game/{major,minor}-improvements.ts`、`occupations.ts`（150-590 字节小数据）| `shared/cards-display/_lookup.ts` 或内联 | 整搬到 cards-display |
| `shared/protocol/{game,ws}.ts` | `shared/contract/protocol/{game,ws}.ts` | 整搬 |
| `shared/cards/types.ts` 中 type 部分（CardType / CardExchange / CardPrerequisites / CardDefinition）| `shared/contract/cards.ts` | 拆 |
| `shared/cards/types.ts` 中 class 部分（CardBase / MinorImprovement / Occupation / PlayerActionCard）| `shared/cards-display/types.ts`（S6a 仅创建文件 + 占位 export，S6b 才拓展使用）| 拆 |
| `shared/cards/types.ts` 中 register helper（`registerCardLookups` 等 5 个）| `shared/cards/registry-runtime.ts`（cards/ 内部）| 拆 |
| `shared/logic/state.ts` | `shared/session/state-bootstrap.ts` | 整搬 |
| `shared/logic/round.ts` / `stats.ts` / `work-phase-resources.ts` | `shared/session/{round,stats,work-phase-resources}.ts` | 整搬 |
| `shared/logic/state-constants.ts` | `shared/contract/state-constants.ts` | 检查后整搬 |
| `shared/logic/rng.ts` | `shared/utils/rng.ts` | 整搬 |
| `shared/logic/format.ts` | `client/utils/format.ts`（仅 client UI 用）| 整搬 |

### §1.3 执行策略
用 `git mv` + sed 批量改 import path（不写 codemod 脚本——一次性迁移）。

阶段化（4 phase）：
1. **Phase A**：建 `shared/contract/`、`shared/utils/` 骨架 + 移 `shared/protocol/*` → `shared/contract/protocol/*`（独立、无依赖）；test:fast 验证
2. **Phase B**：移 `shared/game/types.ts` → `shared/contract/types.ts`；批量 sed；test:fast 验证
3. **Phase C**：移 `shared/game/{prompt-keys,resource-keys}.ts` + 拆 `shared/cards/types.ts` → 三份；test:fast 验证
4. **Phase D**：剩余 runtime 文件搬到 domain/session/utils；删空目录；test:fast + lint + build 全绿

每 phase 1 commit。S6a 总计 4 commit。

### §1.4 S6a DoD
- ✅ `shared/contract/`、`shared/utils/` 创建
- ✅ `shared/game/`、`shared/logic/`、`shared/protocol/` 物理删除
- ✅ `shared/cards/types.ts` 拆三份
- ✅ `pnpm test:fast` 2271 pass / 0 fail
- ✅ `pnpm run lint` / `tsc app+server` / `pnpm run build` 全绿
- ✅ main bundle 大小**保持 ~541 KB**（S6a 不动 cards 内容，bundle 不缩 — 是 S6b 的事）

### §1.5 风险
- **Catalog 循环依赖**（D95 SiteManager / minor-improvements 顺序，setup-register-all.ts 注释提到）：搬迁过程可能放大或修复。**缓解**：每 phase test:fast 验证；setup phase 报 "TDZ" / undefined 是早期信号。
- **测试 fixture 引用 game types**：sed 全局替换处理。
- **不动卡文件**：S6a 不 split 任何 card；那是 S6b 的事。

---

## §2 S6b — Cards Display/Impl Split

### §2.1 目标
写 codemod 脚本一次性 split 824 张卡 → 824 cards-display 文件 + 824 cards-impl 文件（覆盖原路径）。

### §2.2 卡文件 split 规则

**Before**（如 `shared/cards/B/B30_WoodPalisades.ts`）：
```typescript
import { MinorImprovement } from '../types'
import { getPalisadeCount } from '../../actions/effects/fencing'  // ← impl-side dep
import type { CardImpl } from '../registry'

const CARD_ID = 'B30_WoodPalisades'

// === DISPLAY 段 ===
export const B30_WoodPalisades = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Palisades',
  // ...
})

// === IMPL 段 ===
export const B30_WoodPalisades_impl = {
  effect: { ... },
  reaches: [...],
} satisfies CardImpl
```

**After A**（新建 `shared/cards-display/B/B30_WoodPalisades.ts`）：
```typescript
import { MinorImprovement } from '../types'

const CARD_ID = 'B30_WoodPalisades'

export const B30_WoodPalisades = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Palisades',
  // ...
})
```

**After B**（覆盖 `shared/cards/B/B30_WoodPalisades.ts`）：
```typescript
import { getPalisadeCount } from '../../actions/effects/fencing'
import type { CardImpl } from '../registry'
import { B30_WoodPalisades } from '../../cards-display/B/B30_WoodPalisades'

const CARD_ID = B30_WoodPalisades.id  // single source of CARD_ID

export const B30_WoodPalisades_impl = {
  effect: { ... },
  reaches: [...],
} satisfies CardImpl
```

### §2.3 Codemod 脚本设计

`scripts/codemod-cards-display.ts`（用 TypeScript Compiler API）。

**步骤** per card file：
1. 解析 source file 为 AST
2. 找 default class export（`new MinorImprovement(...)` / `new Occupation(...)` / `new PlayerActionCard(...)`）—— display const
3. 找 `<CardId>_impl` export —— impl const
4. **分析 import 依赖**：
   - DISPLAY 需要的 imports：被 display const 引用的标识符（`MinorImprovement`、`CardExchange` 类型等）
   - IMPL 需要的 imports：被 `_impl` 引用的标识符（`getPalisadeCount`、`payLeaf` 等）
5. **生成两份新文件**：
   - `shared/cards-display/<deck>/<file>.ts` —— DISPLAY 段 + 仅 display 需要的 imports
   - `shared/cards/<deck>/<file>.ts`（覆盖原文件）—— IMPL 段 + 仅 impl 需要的 imports + 反向 import display const

**特殊情况**：
- helper 函数 display 和 impl 都引用：复制到两边，或抽到 `shared/cards-display/helpers/`
- helper 函数仅 display 引用：移到 cards-display
- helper 函数仅 impl 引用：留 cards
- import 链跨边界（display 段意外引用 impl helper）：脚本报错列出，人工修

**安全网**：dry-run mode 先打印 plan + 统计；人工 review 后再 wet-run。

**生命周期**：
- S6b 期间：用脚本一次性 split + 迭代调整规则
- S6b 之后：脚本变 dead code 留在 `scripts/`（文档作用）；新卡靠手工 + ESLint error 级规则守门

### §2.4 后续连接修复
1. **`shared/cards/catalog.ts`**：当前 import 824 个 card 文件取 display const。改成 import cards-display（sed 批改 `from '../A/A100_Curator'` → `from '../../cards-display/A/A100_Curator'`）
2. **`shared/cards/register-all.ts`**：仍 import 824 个 `_impl`，路径不变，无需改
3. **聚合 barrel**（`shared/cards/index.ts` 等）：display const re-export from cards-display
4. **client UI 引用具体卡 display**（如 `getMajorCard`）：改 import path

### §2.5 阶段化（6 phase）
1. **Phase A**：写 codemod 脚本 + 单测（5-10 张代表卡 fixture）；commit 脚本
2. **Phase B**：dry-run，列 corner case；如 ≤30 张就修脚本规则 re-run，直到 dry-run 0 corner case
3. **Phase C**：wet-run 生成 824 cards-display + 改写 824 cards；commit（1 巨 commit，1648 文件）
4. **Phase D**：批量 sed 改 catalog.ts；其他 import path 修；commit
5. **Phase E**：跑 build 看 main bundle 跌多少；test:fast 验证；commit 修复
6. **Phase F**：加 S6b ESLint 规则（cards-display 不 import impl）；新违例修；commit

### §2.6 S6b DoD
- ✅ `shared/cards-display/<deck>/` 824 文件齐全
- ✅ `shared/cards/<deck>/` 仍 824 个 `_impl` 文件，从 cards-display 反向 import
- ✅ `shared/cards/catalog.ts` 改 import cards-display
- ✅ `pnpm test:fast` 2271 pass / 0 fail
- ✅ `pnpm run build` main bundle ≤ **400 KB raw / 130 KB gz**
- ✅ ESLint：`cards-display/**` 不 import `shared/{actions,engine,session}/**` —— 0 violation
- ✅ codemod 脚本保留在 `scripts/codemod-cards-display.ts`

### §2.7 风险
- **circular import 加深**：catalog ↔ D95 已有循环。**缓解**：每 phase test:fast 验证；setup 报错是早期信号
- **display 段引用 helpers**（B30 → fencing 用于 prerequisite 判定）：codemod 报告依赖图，人工 review 决定 helper 归属
- **测试 fixture 引用具体卡**：sed 全局替换

---

## §3 S6c — Sandbox + ESLint + Bundle Hardening

### §3.1 `client/sandbox/` 落地

新建 3 个文件（C1：最小动量）：
```
client/sandbox/
  ├ index.tsx        # entry: lazy import SandboxApp
  ├ SandboxApp.tsx   # 套壳：dynamic import shared/session/* + render workshop
  └ README.md        # 边界说明
```

**关键变化**：`WorkshopPage.tsx` 内部 `import { GameSession } from '...'` 改成 `await import(...)` 异步加载。其他 `client/app/workshop/*` 子树**保留原位**。

### §3.2 ESLint 5 套新 error 级规则

**6. `shared/contract/**` 零 runtime 依赖**：禁止 import `actions/engine/session/cards/cards-display/domain/utils`
**7. `shared/cards-display/**` 不依赖 impl**：禁止 import `actions/engine/session/cards`
**8. main client（除 sandbox + tests）不 import session/engine**：阻断 main bundle 拖 session
**9. `shared/{actions,engine,session}/**` 不 import `shared/cards-display/**`**：防 impl 反向拖 display 重复
**10. `shared/utils/**` 零 game/session 依赖**：守住 utils 是纯工具

### §3.3 Bundle 紧缩
`scripts/check-bundle-size.ts` 当前限制：main 550 KB raw / 170 KB gz。S6c 紧缩到：
- main: **400 KB raw / 130 KB gz**（给 150 KB 余量）
- sandbox: 700 KB raw（含 session/engine/cards-impl）

如 S6b 跌破 400 KB 还多，进一步收紧到 380 KB。

### §3.4 Vite 配置
依靠 `await import('shared/session/...')` 自然 split，**不显式 manualChunks**——Rollup tree-shake 会根据 dynamic import 自动切 chunk。S6c 验证 `dist/assets/sandbox-*.js` 出现即可。

### §3.5 S6c DoD
- ✅ `client/sandbox/{index.tsx,SandboxApp.tsx}` 创建
- ✅ Workshop dynamic import shared/session
- ✅ 5 套 ESLint error 级新规则加入 `eslint.config.js`
- ✅ `pnpm run lint` 0 errors
- ✅ `pnpm run build` 产出 main + sandbox 两个 chunk
- ✅ `pnpm run check:bundle-size` 用紧缩 limit pass
- ✅ `pnpm test:fast` 2271 pass / 0 fail
- ✅ Workshop 浏览器实际能打开（playwright e2e smoke）

### §3.6 风险
- **lazy import 顺序**：进 workshop 有 loading state，`<Suspense fallback={...}>` 包住
- **某些 main client import session 类型**（`HttpGameTransport` / `WsGameTransport` 用 `SessionResponse`）：如果 ESLint `import-type` 例外不生效，把 SessionResponse 类型移到 contract
- **测试不算 main client**：`client/**/__tests__/` 例外让测试合法

---

## §4 S6 整体 DoD

### 结构性
- ✅ `shared/contract/`、`shared/cards-display/`、`shared/utils/`、`client/sandbox/` 4 个新目录
- ✅ `shared/game/`、`shared/logic/`、`shared/protocol/` 3 个旧目录物理删除
- ✅ `shared/cards/types.ts` 拆三份完成
- ✅ 824 张卡 split 完成，cards-display ↔ cards 1:1

### ESLint 边界（5 套新 error 级）
- ✅ contract 零 runtime
- ✅ cards-display 不 import impl
- ✅ main client 不 import session/engine
- ✅ session/engine/actions 不 import cards-display
- ✅ utils 零 game/session 依赖
- ✅ `pnpm run lint` 0 errors

### Bundle
- ✅ main bundle ≤ **400 KB raw / 130 KB gz**
- ✅ `dist/assets/sandbox-*.js` 独立 chunk（含 session/engine/cards-impl）
- ✅ `pnpm run check:bundle-size` 紧缩 limit pass

### 回归零变化
- ✅ `pnpm test:fast` 2271 pass / 0 fail
- ✅ `tsc app+server` 0 errors
- ✅ `pnpm run build` 成功
- ✅ Workshop e2e smoke pass

### 文档
- ✅ `docs/ENGINE_NEW_ARCHITECTURE.md` §15 S6 收口段落
- ✅ codemod 脚本保留在 `scripts/codemod-cards-display.ts`

---

## §5 测试策略

S6 是**纯搬迁，零行为变化**。测试策略：

- **每 phase test:fast 验证**：每个文件迁移 / 卡 split / ESLint 规则添加都立即跑全量测试，确保没意外回归
- **bundle-size 守门**：每个 sub-sprint 验证 bundle 不变大；S6b/c 验证 bundle 跌破新 limit
- **playwright e2e smoke**（仅 S6c）：跑一遍打开 workshop 的最小 happy-path，确认 lazy import 实际工作
- **不引入新单测**：搬迁不应该有新测试覆盖范围；现有测试覆盖足够

---

## §6 文档同步

S6 完成后更新：
- `docs/ENGINE_NEW_ARCHITECTURE.md` §15：S6 收口段落
- `docs/ENGINE_NEW_ARCHITECTURE.md` 顶部进度行（L18）：`S6 ✅（2026-05-XX，物理分层 + cards-display split + dual bundle）`
- `docs/master-plan.md` §8：S6 入表
- `docs/skip-tracker.md`：无变化（S6 是搬迁，不解 skip）

S7（卡牌效果测试回归）下一阶段处理 skip-tracker 剩余 2 项（B104 behavior-regression + E70 private-field-access）。
