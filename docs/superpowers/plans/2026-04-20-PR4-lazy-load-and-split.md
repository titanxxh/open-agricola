# PR-4 懒加载与路由切分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把主 bundle 从 **834KB / gzip 234KB** 压到 **< 200KB raw / < 80KB gzip**，方式是阻断 `shared/cards/register-all.ts` 与 `catalog.ts` 大阵列进入多人对局主入口的静态 import 链，同时把工坊 / 沙盒路由做成按需 lazy import，卡牌注册改由 server 侧注入。

**Architecture:** 多人对局完全服务端权威，客户端是纯显示端；register-all（875 卡 IMPL）在 client 主入口完全不需要，只对 Workshop + Sandbox 有用。核心改动是让 `shared/session/game-core.ts` 不再 fallback 到静态 `ALL_CARD_IMPLS`，强制调用方（server / sandbox / workshop）显式注入 `CardRegistry`。然后把残留大型 `catalog.ts` 聚合对象在 client 主路径上替换成从 `cards-manifest.json` 运行时 fetch 的 metadata 服务。

**Tech Stack:** Vite、Rollup code splitting、TypeScript AST、React.lazy、pnpm scripts。

---

## 依赖现状（Explore 子代理已确认）

- `client/main.tsx` → `client/App.tsx` → `client/app/PageRouter.tsx`
- `PageRouter` 已 `React.lazy()` WorkshopPage，但 **主 bundle 仍 834KB** — 主 bundle 已经 NOT 含 WorkshopPage.js（后者 89KB 单独 chunk）。
- 客户端**没有**任何地方实例化 `GameCore` 或调 `Engine.step()`（grep 零匹配）。
- **主 bundle 的 register-all 来自哪里**：有两条可能的静态 import 链需要 Task 1 先用 bundle analyzer 定位：
  - A. `client/**` 某处 → `shared/cards/card-effects.ts`（或 card-listeners.ts）→ `active-registry.ts` → `register-all.ts`？
  - B. `client/components/common/cardText.ts:3-4` → `getOccupationCard` / `getMinorImprovementCard` / `getMajorCardEffect` → `shared/cards/catalog.ts`（`catalog.ts` 889 个卡实例静态 import）→ 这才是元凶？
- `applyMajorEffectsToAllPlayers` 被 `client/app/hooks/use-round-flow.ts` 导出，但多人模式下**不在 client 调用**；仅测试与 server-side `shared/logic/round.ts:101` 使用。
- `cards-manifest.json` 已经由 `scripts/build-cards-manifest.ts` 生成（875 卡，418KB），覆盖 `Occupation / MinorImprovement / MajorImprovement` 三种 constructor 模式；**缺**：
  - 12 个 `PlayerActionCard`（`registerPlayerActionSpace({...})` 模式）
  - 8 个 major 字面量对象（`export const X: MajorCardEffect = {...}` 模式）

---

## File Structure

**新建：**

- `scripts/analyze-bundle.ts` — 一次性工具，用 Vite 的 `rollup-plugin-visualizer` 或 `vite-bundle-visualizer` 打印主 bundle 模块组成（Task 1 用，分析完可删或保留作为调试脚本）。
- `client/services/card-meta.ts` — 客户端 metadata 服务：懒加载 `cards-manifest.json`，提供 `getCardMetaById(id)`、`getAllCardMetas()` 等；替换 client 对 `catalog.ts / card-effects.ts` 中 `getOccupationCard / getMinorImprovementCard / getMajorCardEffect` 的直接调用。
- `client/app/SandboxPage.tsx`（或复用现有内嵌 sandbox）— lazy 加载入口，import register-all + GameCore。

**修改：**

- `scripts/build-cards-manifest.ts` — 新增对 `PlayerActionCard`（通过 `registerPlayerActionSpace` 调用）与 major 字面量对象的支持。
- `shared/session/game-core.ts` — 移除 `ALL_CARD_IMPLS` 的静态 import；把 `GameCoreOptions.cardRegistry` 从可选改成必传（或引入明确的 factory `createGameCoreForServer()`）。
- `shared/cards/register-all.ts` — 保持原样（继续被 server/sandbox/workshop 通过显式 import 消费）。
- `server/game/authoritative-session.ts` — 构造 GameSession 时显式构建 CardRegistry 并注入（而不是靠 GameCore 默认 fallback）。
- `client/components/common/cardText.ts`、`client/components/common/PlayerCard.tsx`、`client/components/board/ActionBoard.tsx`、`client/components/board/FarmBoard.tsx` — 改用 `client/services/card-meta.ts` 获取 metadata。
- `client/app/hooks/use-round-flow.ts` — 判断：`applyMajorEffectsToAllPlayers` 若仅测试使用则从 client runtime path 解耦（留给 server），否则登记 TODO。
- `scripts/check-bundle-size.ts` — 启严格模式；raw 阈值初期 300KB（逐步往下压），gzip < 100KB。
- `scripts/check-reaches.ts` — 启严格模式（不允许新卡缺 `reaches`）。
- `package.json` / `vite.config.ts` — 可能新增 `build.rollupOptions.manualChunks` 做更细拆分（仅在测量结果明显需要时用）。
- `.github/workflows/ci.yml` — `pnpm run check:bundle-size` 去掉 "print-only" 备注，提升为 strict（配合上面阈值）。

**删除：** 无（PR-4 只加不删代码层；仅配置收紧）。

---

## Task 1 — 测量主 bundle 组成，定位 register-all 入侵路径

**Files:**

- Create (可能一次性): `scripts/analyze-bundle.ts` 或修改 `vite.config.ts` 注入 `rollup-plugin-visualizer`

**目标：** 在动任何代码前，先精确量化主 bundle 里**哪些模块**贡献了前 50% 的体积，并定位 `register-all.ts` / `catalog.ts` 进入 client 的**具体 import 链条**。没有这个前置数据后续任务很可能跑偏。

- [ ] **Step 1：安装 rollup-plugin-visualizer（开发依赖）**

```bash
pnpm add -D rollup-plugin-visualizer
```

- [ ] **Step 2：临时在 `vite.config.ts` 开启 visualizer**

在 `plugins` 数组追加：

```ts
import { visualizer } from 'rollup-plugin-visualizer'
// ...
plugins: [
  react(),
  serveBgaImages(bgaImagePath),
  // ... other plugins
  visualizer({
    filename: 'dist/stats.html',
    template: 'treemap',
    gzipSize: true,
    brotliSize: true,
    open: false,
  }) as PluginOption,
],
```

- [ ] **Step 3：构建并读取 stats**

```bash
pnpm run build
```

- [ ] **Step 4：解析 stats.html，记录**

打开 `dist/stats.html`（若 headless，用 `pnpm view dist/stats.html` 或直接读 HTML 提取 JSON 数据）。记录：

1. 主 bundle（`index-*.js`）体积 raw / gzip
2. 按模块分组，前 10 大的模块路径（按 gzip 占用排序）
3. 重点：`shared/cards/register-all.ts`、`shared/cards/catalog.ts`、`shared/cards/A/*.ts`、`shared/cards/major/**` 是否出现在主 bundle
4. 如果它们出现了，用 `vite build --debug` 或手查 import chain，定位"为什么它们被 pull 进 main"

- [ ] **Step 5：产出 Investigation Report**

在 `/tmp/pr4-bundle-analysis.md` 写下：

- 主 bundle 组成 top-10
- register-all / catalog 进入 main 的精确 import 链（A 链或 B 链）
- 基于发现提出 Task 3 的切分策略

把 `analyze-bundle.ts` / visualizer 配置先**不 commit**（只是测量工具）。

- [ ] **Step 6：Commit（仅记录发现）**

因为这一 task 只做测量，代码零改动，不 commit。报告直接在 subagent 回报里给回主线。

---

## Task 2 — 扩展 build-cards-manifest.ts 覆盖 22 张跳过卡

**Files:**

- Modify: `scripts/build-cards-manifest.ts`
- Test: `scripts/__tests__/build-cards-manifest.test.ts`（如已存在则扩展；否则新增）

**目标：** 让 manifest 覆盖所有在战斗中可能被 client 展示 / server 注册的卡——包括 12 个 PlayerActionCard（E81/E161/C162/C39/C104/B42/A162/A39/D116/D127/D23/D51）和 8 个 major 字面量对象（`major/{basketmaker,clay-oven,cooking-hearth,fireplace,joinery,pottery,stone-oven,well}.ts`）。

**两类额外模式：**

1. **PlayerActionCard**：文件里无 `new Occupation(...)` / `new MinorImprovement(...)` 构造，而是 `registerPlayerActionSpace({ cardId, access, createDefinition })`。元数据散落在 `createDefinition` 的 `id` / `nameKey` / `descriptionKey`，还要靠 `CARD_ID` 常量。脚本需要：
   - 识别 `registerPlayerActionSpace(...)` 调用
   - 从其 object literal 参数中提取 `cardId`（推断 deck+number）
   - 通过 `nameKey` / `descriptionKey` 反查 i18n（可选）
   - 若 i18n 查找复杂，退化为直接从 `CARD_ID` 常量 + 文件名提取 id，然后 `name` 给空或 `'(PlayerActionCard)'`
2. **Major 字面量**：`export const fireplace1: MajorCardEffect = { id, cost, vp, description, ... }`。脚本需识别这种 `export const <name>: MajorCardEffect = {...}` 并提取对象字面量属性。注意 `fireplace2 = { ...fireplace1, id, cost }` 这种 spread 要解析（解决方法：先 pass 1 收集所有命名常量，再 pass 2 把 spread 展开）。

- [ ] **Step 1：跑现状，记录基线**

```bash
pnpm run build:cards-manifest 2>&1 | tail -2
wc -l public/cards-manifest.json
```

记录下当前 875 卡的 baseline。

- [ ] **Step 2：为 PlayerActionCard 写失败测试**

新增或扩展测试 fixture：一个最小 PlayerActionCard 示例文件和对应预期 manifest 条目；运行 `pnpm exec vitest run scripts/__tests__/build-cards-manifest.test.ts` 期望失败。

- [ ] **Step 3：扩展脚本识别 PlayerActionCard**

在 `CARD_CLASSES` 之外，新增 `REGISTER_CALLS = new Set(['registerPlayerActionSpace'])`；扫描顶层 `CallExpression`，匹配这些函数，从 object literal 参数提取 `cardId` → 推断 deck + number；meta 其它字段若无则留空。

- [ ] **Step 4：测试通过**

- [ ] **Step 5：为 major 字面量写失败测试**

小型 fixture 导出一个 `MajorCardEffect` 字面量 + 一个 spread 变体。

- [ ] **Step 6：扩展脚本识别 major 字面量**

两轮解析：

1. Pass 1：扫 `export const <ident>: MajorCardEffect = <ObjectLiteral>`；把每个 ident 对应的字面量 shape 记下来。
2. Pass 2：遇到 spread `{ ...<ident>, ... }` 时从 pass 1 的表里拷字段。
3. 把每个 MajorCardEffect 条目写入 manifest（`module: 'shared/cards/major/<filename>.ts'`，reaches 取 `[]` 或从字段推断）。

- [ ] **Step 7：最终跑**

```bash
pnpm run build:cards-manifest 2>&1 | grep -E "wrote|skipped"
```

期望：卡数增加 20（12 PlayerActionCard + 8 major）→ 总数 ~895。跑 `pnpm run check:reaches -- --strict`（此时尚未开 strict，仅验证脚本仍通过）。

- [ ] **Step 8：提交**

```bash
git add scripts/build-cards-manifest.ts scripts/__tests__/build-cards-manifest.test.ts public/cards-manifest.json
git commit -m "feat(manifest): include PlayerActionCard and major-effect literal cards"
```

---

## Task 3 — 切断 register-all → GameCore → client 的静态 import 链

**Files:**

- Modify: `shared/session/game-core.ts`
- Modify: `server/game/authoritative-session.ts`
- Modify: `shared/cards/register-all.ts`（只补导出 helper，不删功能）
- Possibly Modify: `shared/cards/active-registry.ts`

**目标：** 让 `shared/session/game-core.ts` 的顶层 import 不再出现 `register-all.ts`，也不再隐式 fallback 到 `ALL_CARD_IMPLS`。server 构造 `GameSession` 时必须显式注入 `CardRegistry`。

**关键约束：** 不能破坏 session tests（258 个），它们 `new GameSession()` 不带参数 → 要么 `GameSession` 自己在构造时 import register-all（仅 server 侧路径，不拖累 client），要么默认参数保持 work。

**推荐实现策略：**

1. `shared/session/game-core.ts` 保留 `GameCoreOptions.cardRegistry` 可选；**但**改成：
   - 顶层只 `import type { CardImpl } from '../cards/registry.ts'`（纯类型，不触发 runtime）
   - 不再顶层 `import { ALL_CARD_IMPLS } from '../cards/register-all.ts'`
   - 构造器中若 `options.cardRegistry` 未提供，抛 error `throw new Error('cardRegistry is required — use server-side factory or inject one')`
2. `server/game/authoritative-session.ts`（即 GameSession）在自己的构造器里 `import { ALL_CARD_IMPLS } from '../../shared/cards/register-all.ts'`，构建 registry 后传给 `super({ ...options, cardRegistry })`。server-side module 有此 import 完全 OK。
3. 新增 `shared/cards/register-all-lazy.ts`：导出 `export async function loadAllCardImpls(): Promise<CardRegistry>`。sandbox/workshop 客户端通过它 dynamic `import(...)` 按需加载。

- [ ] **Step 1：记录当前所有 register-all 静态 consumer**

```bash
grep -rn "from ['\"].*register-all" --include='*.ts' --include='*.tsx' .
```

应该看到：`shared/session/game-core.ts`、`shared/cards/__tests__/setup-register-all.ts`、`scripts/generate-register-all.ts`（不算代码）、`server/__tests__/*` 偶尔直接 import。记录每处。

- [ ] **Step 2：改 `shared/session/game-core.ts`**

- 删除 `import { ALL_CARD_IMPLS } from '../cards/register-all.ts'`
- 在构造器内 `if (!options.cardRegistry) throw new Error(...)`（或默认构造空 registry 并记录 warning，视 test 冲击选）
- 保留 `setActiveCardRegistry(this.cardRegistry)` 逻辑

- [ ] **Step 3：改 `server/game/authoritative-session.ts`**

在文件顶部 `import { ALL_CARD_IMPLS } from '../../shared/cards/register-all.ts'`；构造器里：

```ts
const cardRegistry = options.cardRegistry ?? (() => {
  const reg = new CardRegistry()
  for (const [id, impl] of Object.entries(ALL_CARD_IMPLS)) reg.loadImpl(id, impl)
  return reg
})()
super({ ...options, cardRegistry })
```

注意 super 调用前初始化 registry 的 TDZ 问题；必要时用局部函数或把初始化放到构造器最前。

- [ ] **Step 4：跑测试**

```bash
pnpm test
```

期望全绿（258 session tests 仍用 new GameSession() 走 server-side fallback）。

- [ ] **Step 5：跑 build，对比 bundle**

```bash
pnpm run build
ls -la dist/assets/*.js
```

**关键 success criterion：** 主 bundle raw < 600KB（中间里程碑）。如果仍 ~834KB 说明 register-all 不是主要体积来源，另有元凶（catalog.ts 可能），进入 Task 4。如果降到 < 400KB 说明 register-all 是主凶。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "refactor(engine): require explicit CardRegistry injection in GameCore"
```

---

## Task 4 — 客户端 metadata 服务：剥离 catalog.ts 静态 import

**Files:**

- Create: `client/services/card-meta.ts`
- Modify: `client/components/common/cardText.ts`
- Modify: `client/components/common/PlayerCard.tsx`
- Modify: `client/components/board/ActionBoard.tsx`
- Modify: `client/components/board/FarmBoard.tsx`

**目标：** 客户端不再 import `shared/cards/catalog.ts`（889 个静态构造的卡实例）；改为运行时 fetch `cards-manifest.json`。目标主 bundle 再降 300–400KB。

**前置假设：** Task 1 的 bundle 分析**确认** `catalog.ts` 是主 bundle 大头。如果结论是别的，本 task 策略需调整。

- [ ] **Step 1：设计 `client/services/card-meta.ts`**

API：

```ts
// fetch on first call, memoize
export async function loadCardsManifest(): Promise<CardsManifest>
// sync after manifest loaded — undefined pre-load
export function getCardMeta(id: string): CardMeta | undefined
// forces await; for routes that need meta before render
export async function requireCardMeta(id: string): Promise<CardMeta>
```

初始化：App 启动时先 await `loadCardsManifest()` 再 render；或者各页面用 React `use()` + Suspense。选简单方案：`main.tsx` 或 `PageRouter` 里 `const [ready] = useCardsManifest()` hook，未 ready 显示 loading。

- [ ] **Step 2：写失败测试**

`client/services/__tests__/card-meta.test.tsx`：mock fetch、验证 `loadCardsManifest` 正确解析、`getCardMeta('A123_FrameBuilder')` 命中。

- [ ] **Step 3：实现 service**

实现 fetch + in-memory memoize + `getCardMeta` 同步查询。

- [ ] **Step 4：测试通过**

- [ ] **Step 5：迁移 client 组件**

逐个文件把

```ts
import { getOccupationCard } from '../../shared/cards/catalog'
const card = getOccupationCard(id) // 返回完整卡对象
```

改为

```ts
import { getCardMeta } from '../../services/card-meta'
const meta = getCardMeta(id) // 返回 metadata only
```

组件里只用 `meta.name`、`meta.desc`、`meta.vp` 这些纯显示字段，不要调 card 的方法。如果原代码调了 card 的非 metadata 属性（如 `.cost`、`.prerequisite`），manifest 对应字段应已覆盖；若缺失，回到 Task 2 补。

- [ ] **Step 6：lint + test + build**

```bash
pnpm run lint
pnpm test
pnpm run build
ls -la dist/assets/*.js
```

期望：主 bundle 显著缩减，进入 < 300KB gzip？具体数字待测。

- [ ] **Step 7：commit**

```bash
git add -A
git commit -m "refactor(client): replace catalog.ts lookups with cards-manifest service"
```

---

## Task 5 — Sandbox / Workshop 路由 lazy register-all

**Files:**

- Modify: `client/app/PageRouter.tsx`
- Modify: `client/app/WorkshopPage.tsx`（如直接 import register-all 则改成 lazy）
- Possibly Create: `client/app/SandboxPage.tsx`（若 sandbox 是独立页而非工坊内嵌）
- Possibly Modify: `shared/cards/register-all-lazy.ts`（Task 3 创建的 helper）

**目标：** 确认 register-all 不在主 bundle；确保 WorkshopPage chunk 包含 register-all + GameCore；sandbox 也走 lazy chunk。

- [ ] **Step 1：审查 WorkshopPage import**

```bash
grep -n "^import" client/app/WorkshopPage.tsx | head
grep -n "register-all\|ALL_CARD_IMPLS\|GameCore" client/app/WorkshopPage.tsx client/app/workshop/*.tsx
```

- [ ] **Step 2：若直接 import register-all，改为 dynamic import**

在 Workshop 组件 mount 时 `const { ALL_CARD_IMPLS } = await import('../../shared/cards/register-all')`。

- [ ] **Step 3：sandbox 入口审查**

根据 Explore 报告，sandbox 在 WorkshopPage 里通过 iframe `?page=game&player=p1&embedded=1&devMode=1` 启动——这其实仍是 server-side game，无本地 GameCore。**结论：sandbox 不需要 register-all 客户端化**。记录这一发现到 `docs/ENGINE_ARCHITECTURE.md`。

如果未来要做 local-only sandbox（spec §3 提到的浏览器沙盒 future 方案），再单独规划。

- [ ] **Step 4：build + 测 chunk 分布**

```bash
pnpm run build
ls -la dist/assets/*.js
```

期望：
- `index-*.js`（主）< 250KB raw
- `WorkshopPage-*.js` 包含 register-all（可能 500KB+），首屏不加载 OK

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat(client): lazy-load register-all inside Workshop route"
```

---

## Task 6 — CardRegistry 动态 load / unload 接口

**Files:**

- Modify: `shared/cards/registry.ts`
- Test: `shared/cards/__tests__/registry.test.ts`

**目标：** 给 `CardRegistry` 加 `loadByIds(ids)` 与 `unload(id)`，为 PR-5 draft 玩法提前铺路；房间关闭时清理 registry。

- [ ] **Step 1：API 设计**

```ts
class CardRegistry {
  loadImpl(id: string, impl: CardImpl): void  // 已有
  unload(id: string): void                    // 新增：清 listeners/effect/modifiers
  loadByIds(ids: string[], lookup: (id: string) => CardImpl): void  // 新增
  snapshot(): string[]                        // 已有
}
```

- [ ] **Step 2：TDD**

先写失败测试 `CardRegistry.unload` 能正确清理所有 phase hooks + effect + modifier。

- [ ] **Step 3：实现**

- [ ] **Step 4：集成到 RoomManager**

`server/game/room-manager.ts` 在 `dissolveRoomById` 时调 `session.cardRegistry.unload(...)` 清理（如果有 per-room registry）。

实际上 server side GameSession 每局一个 registry，房间关闭时整个对象 GC 就够了——`unload` 主要为未来 draft flow（打开房间时部分加载）准备。可以先只做单元测试验证 API 正确，RoomManager 集成延到 PR-5。

- [ ] **Step 5：Commit**

```bash
git add -A
git commit -m "feat(registry): add loadByIds/unload APIs for dynamic lifecycle"
```

---

## Task 7 — 启用 check:bundle-size --strict + check:reaches --strict

**Files:**

- Modify: `scripts/check-bundle-size.ts`
- Modify: `scripts/check-reaches.ts`（如有 print-only flag）
- Modify: `.github/workflows/ci.yml`

**目标：** 把 check:bundle-size 从 print-only 升为 strict；设置阈值略高于 Task 5 实测值（留 10% buffer），避免 flakiness。check:reaches --strict 若尚未严格，本 task 也补上。

- [ ] **Step 1：读现状**

```bash
cat scripts/check-bundle-size.ts | head -40
cat scripts/check-reaches.ts | grep -n "strict\|threshold\|BUDGET\|LIMIT"
```

- [ ] **Step 2：check-bundle-size strict**

设 `MAIN_RAW_LIMIT_KB = 300`（或根据 Task 5 实测 + 10% buffer），gzip 80KB；若超限 `process.exit(1)`。

- [ ] **Step 3：CI workflow 去 "print-only" 注释**

修改 `.github/workflows/ci.yml` 的 `check:bundle-size` 步骤描述。

- [ ] **Step 4：check-reaches strict**

若 `check:reaches --strict` 已 strict（PR-1 commit 9530337 已启），本 step 确认即可。

- [ ] **Step 5：测试**

```bash
pnpm run check:bundle-size
pnpm run check:reaches -- --strict
```

两者都 exit 0。

- [ ] **Step 6：Commit**

```bash
git add -A
git commit -m "ci: enforce bundle-size and reaches strict"
```

---

## Task 8 — 最终验证 + 文档同步

**Files:**

- Modify: `docs/ENGINE_ARCHITECTURE.md`
- Modify: `docs/card_progress.md §3 基础设施清单`

- [ ] **Step 1：完整本地验证**

```bash
pnpm install
pnpm run lint                                    # exit 0
pnpm exec tsc -p tsconfig.server.json --noEmit   # 0 errors
pnpm exec tsc -p tsconfig.app.json --noEmit      # 0 errors
pnpm test                                        # 2262 pass
pnpm run build                                   # dist/
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:prompt-sync -- --strict
pnpm run check:bundle-size                       # strict
```

- [ ] **Step 2：最终 bundle 数据**

```bash
ls -la dist/assets/*.js | sort -k5 -n
```

记录：main raw / gzip，WorkshopPage raw / gzip，合计。

- [ ] **Step 3：本地启动冒烟**

```bash
./restart-intranet.sh
sleep 8
curl -sI http://localhost:5173/ | head -1
curl -s  http://localhost:5175/api/health
pkill -f 'node_modules/.bin/(tsx|vite)' || true
```

- [ ] **Step 4：浏览器端手测（可选，若环境允许）**

- 访问 `/` → 登录 → lobby 正常渲染
- 进多人房 → 卡牌名字 / desc / cost 正确显示（证明 card-meta service 工作）
- 打开 workshop → 能 lazy 加载 register-all，custom card 功能可用

若 headless，跳过此步，写明。

- [ ] **Step 5：更新 `docs/ENGINE_ARCHITECTURE.md`**

- 目录图：`client/services/card-meta.ts`
- 新增段落说明"客户端不再静态 import register-all / catalog；metadata 通过 cards-manifest.json 运行时加载"
- "服务端显式注入 CardRegistry"

- [ ] **Step 6：更新 `docs/card_progress.md §3`**

加入 PR-4 落地小节：主 bundle 从 834KB → XKB（实测），register-all/catalog 出主路径，check:bundle-size strict。

- [ ] **Step 7：Commit**

```bash
git add -A
git commit -m "docs: sync architecture notes for PR-4 lazy-load"
```

---

## Self-Review

- **Spec §9 PR-4 coverage**：
  - 多人对局路由不 import register-all ✅（Task 3 + Task 4）
  - 工坊 lazy AST validator + 自定义卡 UI ✅（Task 5；WorkshopPage 已 lazy）
  - 沙盒 lazy register-all + GameCore → 当前 sandbox 本身仍 server-driven，结论记录，未来再议 ✅（Task 5 Step 3）
  - 服务器 RoomManager draft 时 await import 注册 CardRegistry：**延后到 PR-5**（draft 功能本身在 PR-5），Task 6 只准备 API
  - CardRegistry 支持 dynamic unload ✅（Task 6）
  - check:bundle-size 严格 ✅（Task 7）
  - check:reaches 严格 ✅（Task 7；若 PR-1 已做仅确认）
- **Placeholder scan**：所有命令可执行；阈值依赖 Task 1 实测。
- **Type consistency**：`CardRegistry`、`CardImpl`、`GameCoreOptions`、`CardsManifest` 名字贯穿 plan 一致。

## Deferred to future PRs

- Draft flow UI + 协议（PR-5）
- 浏览器本地沙盒（`pending: 'cardDraft'` 类型延后）
- `applyMajorEffectsToAllPlayers` 服务端预计算迁移
- A92 / B38 / D95 flaky 根因修复
- ~1169 lint warning 清理 + 规则抬回 error
