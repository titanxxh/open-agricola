# 三层架构重构：前端 / 后端 / shared 的物理边界 + 卡牌池化加载

**日期**：2026-04-19
**状态**：设计草案，待落地拆为 4 个 PR
**范围**：目录结构、卡牌加载机制、沙盒模式、bundle 瘦身、DSL 路径删除

---

## 1. 背景与动机

### 现状

- 项目声明是"后端权威 + 前后端分离"架构，但代码层面边界模糊：
  - `src/` (前端) 直接 import `shared/cards/**`，把带规则逻辑的文件也拖进前端 bundle
  - `shared/cards/` 下每张卡牌文件含 meta + flow + listeners + modifiers 全部混合
  - 卡牌文件**顶层副作用**（如 `registerCardListener(listener)`）让 tree-shake 失效
  - 主包约 **1.1MB 未压缩**，其中大量是前端根本跑不到的规则代码
- `shared/cards/custom-dsl-runner.ts` 是历史 DSL 路径，已不再需要
- 沙盒能力当前**全在服务端**（isolated-vm + Worker Thread），有 DoS 风险
- 没有 test/lint CI workflow

### 目标

1. **目录层物理体现三层架构**：`shared/` / `server/` / `client/`，按"**运行环境约束**"切分
2. **前端主包瘦身**：多人对局前端只加载渲染所需的 meta，不加载规则执行代码；目标主包 ~150KB
3. **支持按需卡牌加载**：为将来的 draft 玩法打基础——每局只加载本局卡池
4. **支持浏览器沙盒模式**：卡作者可以在本地模拟整局游戏（p1↔p2 自切），服务端零参与
5. **保留多人对局自定义卡能力**：服务端 isolated-vm 继续作为多人对局路径的权威执行器
6. **删除 DSL 路径**：自定义卡只保留"TS 代码 + AST 校验 + isolated-vm 执行"一条路径
7. **边界靠机制强制**：ESLint + `package.json.sideEffects` + TS project references + CI 校验

### 非目标

- 不重写引擎、不改卡牌规则实现
- 不引入 pnpm workspace（一次到位的 workspace 化作为未来可能的演进，本次不做）
- Draft 玩法本身的 UI/协议设计**不在本次范围**；本次只铺池化加载基础设施
- 浏览器版自定义卡 executor 属于未来能力，本次只**抽象出接口**让将来能接；不实现浏览器 executor

---

## 2. 三层新语义

```
shared/   纯 TS，同时能在 Node 和浏览器运行（不依赖 node:*、不依赖 DOM）
          → 领域、引擎、GameCore、官方卡、跨端工具

server/   允许 node:* / native module / ws / fs
          → RoomManager、传输、持久化、isolated-vm 执行器、认证

client/   允许 DOM / React / 浏览器 API
          → UI、本地沙盒宿主、transport 客户端
```

**核心口号**：三层按"**运行环境约束**"切分，不按"前端/后端职责"切分。
"后端权威"通过"**谁 new GameCore 谁就是权威**"体现——多人对局是 server，本地沙盒是 client 自己。

### 2.1 目标目录结构

```
open-agricola/
├── shared/
│   ├── engine/              # 流程节点框架（不动）
│   ├── game/                # GameState/Resource/玩家类型（不动）
│   ├── actions/             # 行动 effects / factories / hooks（不动）
│   ├── cards/               # 官方卡 meta + impl（改造：消除顶层副作用）
│   │   └── registry.ts      # 🆕 CardRegistry 类（per-session 实例）
│   ├── session/             # 🆕 GameCore（从 server/game-session.ts 搬来）
│   │   ├── game-core.ts
│   │   └── draft.ts         # 🆕 draft 纯函数（抽卡 + reaches 闭包展开）
│   ├── custom-code/         # 🆕 跨端自定义卡基础设施
│   │   ├── types.ts         # Invocation/Result/Manifest 类型（不含 DSL）
│   │   ├── ast-validator.ts # 从 server/ 搬来，typescript 包纯 JS
│   │   └── executor.ts      # CustomCodeExecutor 接口
│   ├── i18n/, logic/, protocol/ ...（不动）
│
├── server/
│   ├── game/
│   │   ├── authoritative-session.ts   # 薄包装：new GameCore + 广播 + 持久化
│   │   └── room-manager.ts            # 从根目录搬进来
│   ├── custom-code/                    # 🆕 聚合目录
│   │   ├── isolate-executor.ts        # 原 custom-code-executor/engine.ts
│   │   ├── worker-client.ts           # 原 custom-code-executor/client.ts
│   │   ├── executor-worker.ts         # 原 custom-code-executor/executor-worker.ts
│   │   ├── compiler.ts                # 原 card-compiler.ts
│   │   └── runtime.ts                 # 原 custom-code-runtime.ts
│   ├── http/                          # game-router, workshop 路由
│   ├── auth/, db/, persistence/
│   └── index.ts
│
├── client/                            # 🆕 src/ 改名
│   ├── app/, components/, hooks/, services/, contexts/ ...
│   ├── sandbox/                       # 🆕 本地沙盒宿主
│   │   ├── local-session-host.ts
│   │   ├── local-custom-executor.ts   # 浏览器里直接执行用户代码（无 isolate）
│   │   └── sandbox-transport.ts       # GameTransport 的本地实现
│   ├── workshop/                      # 工坊页（未来含 "submit PR to GitHub"）
│   └── main.tsx, config.ts, index.css
│
├── scripts/
│   ├── build-cards-manifest.ts        # 🆕 构建期产出 cards-manifest.json
│   ├── check-reaches.ts               # 🆕 CI 校验：reaches 声明一致性
│   ├── migrate-dsl-to-code.ts         # 🆕 一次性数据迁移：DSL → TS 代码
│   └── check-no-dsl.ts                # 🆕 CI 断言：代码库不得再出现 DSL 关键字
│
├── public/
│   └── cards-manifest.json            # 🆕 构建产物，前端懒加载
│
└── .github/workflows/
    ├── deploy-pages.yml               # 现有
    └── ci.yml                         # 🆕 lint + test + build + reaches + bundle 预算 + no-dsl
```

### 2.2 已删除内容概览

- **DSL 路径**（详见 §3，这是本次重构的**核心删除动作之一**）
- 所有"全局 mutable card registry"的使用点（由 §5 per-session `CardRegistry` 取代）

### 2.3 关键搬家对照表

| 今天位置 | 新位置 | 备注 |
|---|---|---|
| `src/` | `client/` | 纯改名 |
| `server/game-session.ts` | `shared/session/game-core.ts` | 重命名 + 挪位；清理 Node-only import（预计 1-2 处） |
| `server/room-manager.ts` | `server/game/room-manager.ts` | 移位 |
| `server/ast-validator.ts` | `shared/custom-code/ast-validator.ts` | 搬进共享 |
| `server/card-compiler.ts` | `server/custom-code/compiler.ts` | 保守留后端 |
| `server/custom-code-executor/*` | `server/custom-code/*` | 整体迁移 |
| `server/custom-code-runtime.ts` | `server/custom-code/runtime.ts` | 跟执行器走 |
| `server/card-codegen.ts` | **删除** | DSL 没了就不需要 |
| `shared/cards/custom-dsl-runner.ts` | **删除** | DSL 路径整条作废 |
| `shared/cards/custom-registry.ts` | 原位不动 | 自定义卡 meta 投影，前端要读（DSL 分支删除后更薄） |

---

## 3. DSL 路径的完整删除

**背景**：`shared/cards/custom-dsl-runner.ts` 是一条历史路径——工坊的 LLM 产出 JSON DSL，服务端运行时把 DSL 翻译成 ActionFlow 节点树执行。决定：**本次重构一次性删除**。自定义卡只保留"TS 代码 + AST 校验 + isolated-vm 执行"一条路径（§7）。

### 3.1 要删除的文件

| 文件 | 说明 |
|---|---|
| `shared/cards/custom-dsl-runner.ts` | 167 行，DSL → ActionFlow 转换器 + 类型定义 |
| `shared/cards/__tests__/custom-dsl-runner.test.ts` | 整个测试文件 |
| `server/card-codegen.ts` | 从 DSL 生成 TS 文件的代码生成器（DSL 没了就不需要） |

### 3.2 要清理 DSL 分支的文件

| 文件 | 清理内容 |
|---|---|
| `shared/cards/custom-registry.ts` | 删 `dslToCardEffect` import 和 `effectDsl` 参数分支（约第 17、36、57、79-84 行） |
| `shared/cards/session-card-context.ts` | 删 `effectDsl` 字段、`dslToCardEffect` 调用（约第 18、26、52、67-72 行） |
| `shared/cards/__tests__/custom-registry.test.ts` | 删 `effectDsl` 相关测试用例（第 69-97 行附近） |
| `server/workshop.ts` | 删 `effect_dsl` 字段接收 / 返回 / 写库的所有路径（约 15 处） |
| `server/room-manager.ts` | 删 `effect_dsl` 列的读取和 `effectDsl` 字段映射（约第 21、25、39 行） |
| `src/app/WorkshopPage.tsx` | 删 `effect_dsl` 字段显示和提交（约第 17、33、139、162、269、341 行） |
| `src/app/workshop/AiCardDesigner.tsx` | LLM prompt 改为只产 TS 代码；删 `effect_dsl` 字段（约第 77、1087、1168、1198 行） |
| `shared/i18n/zh.ts` / `shared/i18n/en.ts` | 删 DSL 相关 i18n key（作者模式切换提示、DSL 错误文案等） |
| `src/services/llmPrompts.ts` | 若有 DSL 生成相关的 prompt 段落全部删掉 |

### 3.3 数据库 schema 迁移

`workshop_cards` 和 `workshop_card_versions` 表有 `effect_dsl TEXT` 列。策略：

1. **一次性 migration 脚本**（`scripts/migrate-dsl-to-code.ts`）：
   - 遍历所有 `effect_dsl IS NOT NULL` 且 `effect_code IS NULL` 的行
   - 用今天的 `card-codegen.ts`（未删之前）把 DSL 一次性转成 TS 代码
   - 跑 `ast-validator` 校验
   - 跑 `card-compiler` + manifest 提取
   - 把生成的 `effect_code` / `compiled_code` / `code_manifest` 写回该行
   - 脚本完成后 `effect_dsl` 可保留但不再被读取（永久 dead 字段）
2. **schema cleanup**（可选，后续 PR）：写一个 migration 把 `effect_dsl` 列删除。由于 SQLite `ALTER TABLE DROP COLUMN` 需要较新版本（3.35+），保守做法是**先放着**，标记 deprecated，不阻塞重构落地。
3. **新写入行**：`effect_dsl = NULL`，数据库列仍存在但所有代码不再写入。

### 3.4 LLM prompt 更新（`AiCardDesigner.tsx`）

- 今天的 prompt 里有一段描述 `effect_dsl` 的 JSON schema，让 LLM 产 DSL JSON
- 新 prompt 只要求 LLM 产 **TS 代码字符串**，调 `registerCardEffect(...)` / `registerCardListener(...)`
- Prompt 里附上 AST validator 的白名单/黑名单规则，让 LLM 产能过校验的代码
- 产出后立即走 AST 校验 + 编译 + manifest 提取，失败就把错误回灌 LLM 自改（今天可能已经有这个循环，保留）

### 3.5 工坊 UI 改动

- 删除"DSL 模式"和"TS 代码模式"的模式切换 UI（如果有）
- 只保留 TS 代码编辑器 + AST 校验结果面板 + AI 辅助生成按钮
- 历史卡的 `effect_dsl` 列值**不再展示**，如果历史卡是 DSL-only（没跑过 3.3 的 migration）就显示"待迁移"状态

### 3.6 i18n

搜 `DSL` / `dsl` / "DSL 模式" / "代码模式" 关键字，清理所有相关翻译 key。

### 3.7 执行时机

**所有 DSL 删除动作集中在 PR-2**（见 §9）：
1. 先跑 §3.3 的 migration 脚本（生产库 + 本地库）——此时 `card-codegen.ts` 还在
2. 再删代码（§3.1 / §3.2）
3. 再改 prompt / UI（§3.4 / §3.5）
4. 最后开启 CI 兜底（§3.8）

先迁数据、后删代码——确保没有历史卡因为 DSL 代码被删而变成"不可运行"。

### 3.8 CI 兜底：`check-no-dsl.ts`

PR-2 合并后在 `ci.yml` 加一条断言：`scripts/check-no-dsl.ts` 扫整个代码库，不得出现 `effect_dsl` / `effectDsl` / `dslToCardEffect` / `custom-dsl-runner` / `CardDslEffects` / `DslStep` / `DslEffect` / `DslCondition`。

允许列表（白名单）：
- `CHANGELOG.md`（历史变更记录）
- `docs/superpowers/specs/2026-04-19-architecture-three-layer-split-design.md`（本 spec 自身）
- `scripts/check-no-dsl.ts`（脚本自身字符串）

违反即构建失败。防止后续 PR 不小心把 DSL 代码带回来。

---

## 4. 卡牌文件"零顶层副作用"改造

### 4.1 今天的病根

```ts
// shared/cards/A/A107_Catcher.ts（今天）
registerCardListener(listener)   // ← 顶层副作用，一 import 就执行
```

一旦前端 import 这张卡（哪怕只为读 `name`），Vite 必须保留这一行，`card-listeners` 被打进 bundle，依赖链展开——tree-shake 失效。

### 4.2 新模式："纯数据导出 + 显式注册函数"

```ts
// shared/cards/A/A107_Catcher.ts（改造后）
import { Occupation } from '../types'
import type { CardListenerRegistration } from '../card-listeners'

export const A107_Catcher = new Occupation({
  id: 'A107_Catcher', name: 'Catcher', deck: 'A', number: 107,
  desc: [...], cost: {}, category: 'FOOD_PROVIDER',
})

export const A107_Catcher_impl = {
  listeners: [{
    id: 'A107-catcher-before-collect',
    cardIds: ['A107_Catcher'],
    phases: ['before'], actions: ['collect'],
    handler: (ctx) => { ... },
  }] satisfies CardListenerRegistration[],
  // modifiers / effects 等其它注册数据
  reaches: [] as readonly string[],     // 见 §6
}
```

配套集中注册入口：

```ts
// shared/cards/register-all.ts
import { A107_Catcher_impl } from './A/A107_Catcher'
// ... 330+ 行 import impl
export const ALL_CARD_IMPLS = {
  A107_Catcher: A107_Catcher_impl,
  // ...
}
```

### 4.3 调用时机

- **多人对局服务器**：`RoomManager.createSession()` 根据卡池 dynamic import 各卡 impl → 注册进该房间的 `CardRegistry`
- **本地沙盒**：`LocalSessionHost.start()` 做同样的事
- **多人对局前端**：**完全不 import `register-all.ts` 和任何 `_impl`**，Vite 会 tree-shake 掉全部 handler 代码

### 4.4 Occupation / MinorImprovement 构造函数必须纯

`new Occupation({...})` 不得在构造器里做注册、不得改 module-scoped Map。这是本次改造的隐含约束，构造器若今天有副作用需一并清理。

---

## 5. Per-session CardRegistry（取代全局单例）

### 5.1 问题

今天 `shared/cards/card-effects.ts` / `card-listeners.ts` 是**模块级全局 mutable 单例**。
潜在 bug：一台服务器同时跑两个用不同卡池的房间，registry 互相污染。
对 draft 模型更是硬伤：不同房间卡池不同。

### 5.2 新设计

```ts
// shared/cards/registry.ts
export class CardRegistry {
  private listeners = new Map<string, CardListenerRegistration[]>()
  private effects = new Map<string, CardEffect>()
  private modifiers = new Map<string, Modifier[]>()

  loadImpl(cardId: string, impl: CardImpl): void
  unload(cardId: string): void
  getListenersFor(cardId: string, action: string, phase: ActionHookPhase): CardListenerRegistration[]
  getEffect(cardId: string): CardEffect | undefined
  getModifiers(cardId: string, appliesTo: string): Modifier[]
  snapshot(): RegistrySnapshot
}
```

- 每个 `GameCore` 实例持有自己的 `CardRegistry`
- Hook 调度 / effect 调用 / modifier 应用全部从 `state._registry` 或 `session.registry` 读取
- `GameCore.step()`、`applyHook()` 等签名需追加 `registry` 参数（或从 context 里拿）

### 5.3 迁移策略

老的全局 `registerCardListener(...)` / `registerCardEffect(...)` 在 PR-1 里保留为 `@deprecated` 适配层，内部转发到当前房间的 `CardRegistry`，保证 PR-2 改造卡牌期间测试不崩。PR-2 完成所有卡迁移后，PR-3 删除适配层。

---

## 6. Draft 驱动的动态加载 + `reaches` 声明

### 6.1 构建期产物：`cards-manifest.json`

`scripts/build-cards-manifest.ts` 读所有 `shared/cards/<deck>/*.ts`，产出：

```json
{
  "A107_Catcher": {
    "meta": { "name": "Catcher", "deck": "A", "number": 107, "desc": [...], "cost": {}, "category": "FOOD_PROVIDER" },
    "module": "shared/cards/A/A107_Catcher",
    "reaches": []
  },
  "A125_Priest": {
    "meta": { ... },
    "module": "shared/cards/A/A125_Priest",
    "reaches": ["D:all"]
  }
}
```

字段：
- `meta`：前端渲染卡面所需的全部字段。JSON 直接提供，**不需要 import 任何 TS 卡文件**。
- `module`：给 dynamic import 用的模块路径字符串。
- `reaches`：声明此卡在 handler 里可能引用的其它卡 id 或牌堆。语法：
  - 具体 id：`"B67_WaterMage"`
  - 整副牌堆：`"D:all"`
  - id 范围：`"E:100-120"`

### 6.2 Draft 加载流程（服务端 / 沙盒共用）

`shared/session/draft.ts` 提供纯函数：

```ts
export function computePoolClosure(
  initial: Set<string>,
  manifest: CardsManifest,
): Set<string> {
  const pool = new Set(initial)
  const queue = [...initial]
  while (queue.length > 0) {
    const id = queue.shift()!
    for (const r of manifest[id]?.reaches ?? []) {
      for (const added of expandReach(r, manifest)) {
        if (!pool.has(added)) {
          pool.add(added)
          queue.push(added)
        }
      }
    }
  }
  return pool
}
```

调用时机：
1. 玩家创建房间选 `decks = [A, B]`，draft 规则（抽 N 张、玩家选 M 张等）
2. 随机抽 `pool0 ⊂ A ∪ B`
3. `pool = computePoolClosure(pool0, manifest)` 展开 reachable 闭包
4. `await Promise.all([...pool].map(id => import(manifest[id].module)))`
5. 每个模块的 `_impl` 注册进该房间的 `CardRegistry`
6. 游戏开始

### 6.3 `reaches` 声明方式（决定：作者手动）

决定：**作者在 `_impl.reaches` 手写**，不做 AST 自动推导。
- 99% 的卡 `reaches: []`，模板化填写
- 覆盖动态取 id 场景（如 `pickRandomFromDeck('A')` 返回值）
- CI `check:reaches` 脚本扫 handler 里所有形如 `/^[A-E]\d+_\w+$/` 的字符串字面量，对照 `_impl.reaches ∪ [ownId]`，漏声明 → 构建失败

### 6.4 运行时保护

`CardRegistry.getEffect(id)` / `getListenersFor(id, ...)` 找不到卡时，抛 `CardNotInPoolError { missingId, currentPool }`，**不崩游戏**——写 log + 标记游戏异常。生产环境这种情况应永远不出现（CI `check:reaches` 已拦下）。

不做"运行时硬加载"兜底（避免 sync `readFileSync + transpile` 的脏方案）。

### 6.5 多人对局前端零卡 impl

- 前端 `CardMetaService` 首次初始化时 fetch `cards-manifest.json` 一次（gzip 后 ~20KB）
- `state.pool` 从服务器下发；前端查 manifest 取 meta 渲染
- **前端 bundle 里没有任何 `shared/cards/*/X.ts` 的 TS 模块**

---

## 7. 自定义卡 Executor 抽象

### 7.1 接口

```ts
// shared/custom-code/executor.ts
export interface CustomCodeExecutor {
  runEffect(req: CustomCodeEffectInvocation): CustomCodeEffectResult
  runListener(req: CustomCodeListenerInvocation): CustomCodeListenerResult
}
```

### 7.2 实现

| 实现 | 位置 | 用途 | 安全模型 |
|---|---|---|---|
| `ServerIsolateExecutor` | `server/custom-code/isolate-executor.ts` | 多人对局服务端 | isolated-vm + Worker Thread（今天的方案） |
| `LocalBrowserExecutor` | `client/sandbox/local-executor.ts` | 本地沙盒 | 直接执行用户自己的代码（用户只能攻击自己） |

`shared/custom-code/runtime.ts` 只依赖 `CustomCodeExecutor` 接口，不关心具体实现。`GameCore` 在初始化时被注入 executor。

### 7.3 AST validator 跨端

`shared/custom-code/ast-validator.ts` 作为纯 TS，前端工坊提交前校验、后端提交接收时再校验（双重保障）。
`typescript` 包体积较大，**仅在工坊路由懒加载**，不进多人对局主包。

### 7.4 多人对局自定义卡流程（与今天一致，只是文件位置变了）

1. 玩家在工坊写 TS 代码 → AST 校验 → `server/custom-code/compiler.ts` 编译
2. 持久化 `{ compiledCode, manifest }`
3. 创建房间时选自定义卡 → 服务器加载到该房间 `CardRegistry`
4. 运行时每次 hook 触发 → `ServerIsolateExecutor` 在 isolated-vm + Worker 里跑 handler
5. 返回 ActionFlow → 引擎继续

### 7.5 未来：提交 PR 到 GitHub

工坊 UI 加"submit PR to GitHub"按钮：
- 后端提供 `POST /api/workshop/submit-pr`
- 接收卡 id、编译后代码、作者说明
- 用 GitHub App token 创建分支、commit 到 `shared/cards/<deck>/`、开 PR
- 人工 review 后合并到官方库

这部分作为**未来 PR**，本次重构不实现，但 `server/http/` 目录结构要为此预留位置。

---

## 8. 边界强制机制

### 8.1 `package.json` 的 `sideEffects` 声明

```json
"sideEffects": ["**/*.css", "client/main.tsx"]
```

告诉 Rollup/Vite 其它模块全部无副作用，tree-shake 更激进。依赖 §4 的零副作用改造完成。

### 8.2 ESLint `no-restricted-imports`

```
client/**   禁止 import 'server/**'、任何 'node:*'
shared/**   禁止 import 'node:*'、'react*'、'server/**'、'client/**'
server/**   可以 import 'shared/**' + node api；禁止 import 'client/**'
```

### 8.3 TS project references

```
tsconfig.shared.json    只含 shared/
tsconfig.server.json    含 server/, references: [shared]
tsconfig.client.json    含 client/, references: [shared]
tsconfig.node.json      脚本、vite config
```

每层独立类型检查，跨层访问必须通过 references 显式声明。

### 8.4 CI `check:reaches`

`scripts/check-reaches.ts`：
- 遍历 `shared/cards/<deck>/*.ts`
- 用 `typescript` AST 找每个 `_impl` 导出
- 扫其中所有 handler 字符串字面量，匹配 `/^[A-E]\d+_\w+$/`
- 对比 `reaches ∪ [ownId]`，有遗漏 → `process.exit(1)` + 清晰错误

### 8.5 CI `check:no-dsl`

`scripts/check-no-dsl.ts`：
- grep 整个代码库（排除 §3.8 的白名单）
- 命中关键字 `effect_dsl` / `effectDsl` / `dslToCardEffect` / `custom-dsl-runner` / `CardDslEffects` / `DslStep` / `DslEffect` / `DslCondition` 任一 → 失败

### 8.6 CI bundle 预算

`scripts/check-bundle-size.ts`：
- 跑 `pnpm run build`
- 读 `dist/assets/*.js`，找主 chunk
- 阈值：主包 > 200KB 警告，> 300KB 失败
- 输出 markdown summary 附 PR

### 8.7 CI workflow

新增 `.github/workflows/ci.yml`，在 push / PR 触发：

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm test
      - run: pnpm run build
      - run: pnpm run check:reaches
      - run: pnpm run check:no-dsl
      - run: pnpm run check:bundle-size
```

本地同名 npm script，作者自测与 CI 对齐。

---

## 9. 迁移计划：4 个 PR

### PR-1 — 基础设施铺底（diff ~500 行，风险低）

- 新增 `.github/workflows/ci.yml` + `scripts/check-reaches.ts` + `scripts/check-bundle-size.ts` + `scripts/check-no-dsl.ts`（脚本就位但**非严格模式**：reaches / no-dsl 只警告不失败，bundle size 只打印不卡）
- 新增 `scripts/build-cards-manifest.ts`，接入 `pnpm run build`；首期 `reaches` 字段为空
- 新增 `shared/cards/registry.ts`（`CardRegistry` 类）
- **搬迁 `GameSession` 到 shared**：
  - 创建 `shared/session/game-core.ts` 作为权威实现（从今天的 `server/game-session.ts` 搬来、改名、清理 Node-only import）
  - `server/game-session.ts` 暂时保留，改为薄 re-export：`export { GameCore as GameSession } from '../shared/session/game-core'`，兼容现有调用
  - PR-3 删除此兼容层，正式改成 `server/game/authoritative-session.ts` 做广播/持久化薄包装
- 新增 `shared/custom-code/` 目录骨架：
  - 搬 `ast-validator.ts` 进来（从 `server/`）
  - 新增 `executor.ts` 接口定义
  - 新增 `types.ts`（从 `shared/cards/custom-code-types.ts` 搬过来 + 删除 DSL 相关类型的 re-export）
- 老全局 `card-listeners.ts` / `card-effects.ts` 保留 + 标 `@deprecated`，内部函数转发到"当前请求关联的 `CardRegistry`"（通过 AsyncLocalStorage 或 session context）以便 PR-2 双轨过渡
- `src/` 尚未改名，卡文件尚未改
- DSL 相关代码**还保留**（PR-2 才删）
- **验证**：`pnpm test` + `pnpm run test:e2e` 全过；本地 intranet 启动正常；CI 跑起来（允许新脚本警告）

### PR-2 — 卡牌文件改造 + DSL 路径删除（diff ~3000 行，机械化，风险中）

**A. 先迁移 DSL 数据（代码还在）**：
- 写 `scripts/migrate-dsl-to-code.ts`：读所有带 `effect_dsl` 的行，用现有 `card-codegen.ts` 转成 TS 代码，跑 AST 校验 + 编译 + manifest，写回 `effect_code` / `compiled_code` / `code_manifest`
- 在生产库和本地库各跑一次
- 验证：跑完后 `SELECT COUNT(*) FROM workshop_cards WHERE effect_dsl IS NOT NULL AND effect_code IS NULL` = 0

**B. 删除 DSL 代码**（§3.1、§3.2 列表）：
- 删文件、删分支、删测试
- 删 `server/card-codegen.ts`（数据已迁，用不到了）
- 开启 `scripts/check-no-dsl.ts` 严格模式，CI 拒绝 DSL 关键字

**C. 工坊 UI 与 LLM prompt 改造**（§3.4、§3.5）：
- LLM prompt 改为只要求产 TS 代码
- UI 删除 DSL 模式切换

**D. 卡牌文件改造**：
- 写 codemod 批量改卡：
  - 删除顶层 `registerCardListener(...)` / `registerCardEffect(...)` / `registerCardModifier(...)`
  - 产出 `export const {CARD_ID}_impl = { listeners, effects, modifiers, reaches: [] }`
- 生成 `shared/cards/register-all.ts`（导出 `ALL_CARD_IMPLS` map）
- `GameCore` 改造：接受 `CardRegistry` 注入；hook 调度从 context 里取 registry
- 启用 `check:reaches`（allow list = 空，即所有卡 `reaches: []` 必须合规）
- Occupation / MinorImprovement / MajorImprovement 构造器清理副作用（如有）

**E. 验证**：session 测试全过；listener 触发数量不变；e2e 绿；`check:no-dsl` 通过；CI 全绿

### PR-3 — 目录重组（diff 主要是 move + import 路径，风险中）

- `src/` → `client/`
- `server/custom-code-executor/*` → `server/custom-code/*`（集中）
- `server/card-compiler.ts` → `server/custom-code/compiler.ts`
- `server/custom-code-runtime.ts` → `server/custom-code/runtime.ts`
- `server/room-manager.ts` → `server/game/room-manager.ts`
- **删除** `server/game-session.ts` 的兼容 re-export 层（PR-1 加的），新增 `server/game/authoritative-session.ts` 作为真正的薄包装（new `GameCore` + 广播 + 持久化）
- 批量更新 import 路径（脚本可搞）
- 更新 tsconfig.\*.json、`vite.config.ts`、`docker-compose.prod.yml`、`restart-intranet.sh`、`deploy-backend.sh`、`.github/workflows/deploy-pages.yml` 的 path filter
- 启用 ESLint `no-restricted-imports` 规则
- 启用 `package.json.sideEffects` 声明
- **验证**：测试 + CI + 本地启动 + Pages 构建产物能打出

### PR-4 — 懒加载与路由切分（diff ~500 行，风险中）

- 多人对局路由：不 import `register-all.ts`；只读 `cards-manifest.json` 的 meta
- 工坊路由：`lazy()` import AST validator、自定义卡 UI
- 沙盒路由：`lazy()` import `register-all.ts` 和 `GameCore`（pure TS，走 shared）
- 服务器 `RoomManager` 在 draft 完成时 `await import(...)` 各卡模块 → 注册进 `CardRegistry`
- `CardRegistry` 支持 dynamic unload（房间关闭时释放）
- 启用 `check:bundle-size` 严格模式（主包 300KB 失败）
- `check:reaches` 也收紧（不允许新卡 `reaches` 字段缺失）
- **验证**：主包大小 < 200KB；沙盒页正常；工坊正常；CI 全绿

### PR-5（未来）— Draft 玩法

复用 PR-2/4 的基础设施：
- 新增 `pending: 'cardDraft'` 类型
- Draft UI 组件
- 服务端 draft 流程
- 协议层扩展

### PR-6（未来）— 工坊 "submit PR to GitHub"

- 后端 GitHub API 集成
- 工坊 UI 按钮 + 元数据表单

---

## 10. 附带修复（各 PR 顺手处理）

前端现有"规则味儿 import"逐个评估：

| 文件 | import | 评估 | 处理 |
|---|---|---|---|
| `src/components/board/FarmBoard.tsx` | `collectLockedFarmTileKeys` from `card-effects` | 若是 pure 显示计算 | 搬到 `shared/cards/view-helpers/` |
| `src/app/hooks/use-round-flow.ts` | `applyMajorEffectsToAllPlayers` from `major` | 看着像规则判断 | 改为服务端下发预计算结果，前端从 state 读 |
| `src/components/board/FarmBoard.tsx` | `readCardResourceStats`、`getWorkerHeldOnCard` | 可能是渲染辅助 | 若 pure 保留；若触及规则搬后端 |
| `src/app/hooks/use-harvest-flow.ts` | `types` from `shared/cards/types` | 类型引用 | 保留（类型不进 runtime） |

逐一审查在 PR-3 / PR-4 阶段进行，不集中一次处理。

---

## 11. 决策与取舍记录

| 决策 | 选择 | 备选 | 理由 |
|---|---|---|---|
| 目标布局 | 方案 1（原地拆字段） | workspace | 单仓应用，workspace 多一层基建不值 |
| 官方卡 impl 位置 | 留在 `shared/` | 搬去 `server/` | 沙盒需要在浏览器跑官方卡；搬去 server 会打死沙盒路径 |
| `GameSession` 位置 | 搬到 `shared/session/game-core.ts` | 留 `server/` 另造 `LocalRunner` | 单一实现，两种宿主复用；`GameCore` 命名去歧义 |
| `ast-validator` 位置 | 搬到 `shared/custom-code/` | 留 `server/` | 前端工坊本地预校验 |
| 自定义卡多人能力 | 保留（ServerIsolateExecutor） | 只沙盒 | 用户明确要求，搭配未来 submit-PR 流程 |
| DSL 路径 | **完整删除**（§3） | 保留 / 软删 | 用户明确不再需要；历史数据一次性迁移到 TS 代码 |
| `reaches` 产生 | 作者手动声明 | AST 自动推导 | 动态取 id 场景推导不出来；显式更可控 |
| Draft 落地时机 | 分两次 PR | 一次性 | 池化加载本身价值大；draft 玩法面更广需单独设计 |
| Registry 架构 | Per-session 注入式 | 全局单例 | 修正现有潜在 bug；为 draft 必备 |

---

## 12. 风险与缓解

| 风险 | 缓解 |
|---|---|
| PR-2 卡牌改造范围大（330+ 文件） | Codemod 自动化；PR 前用 session 测试集对比 listener 触发数 |
| DSL 历史数据迁移失败（某张卡 DSL → TS 转不过 AST） | 迁移脚本 dry-run 先跑，列出失败清单；失败的卡逐张人工处理，不 block 重构 |
| Registry 全局→注入 破坏现有测试 | PR-1 保留全局适配层（`@deprecated`），PR-2 逐步迁，PR-3 删 |
| 官方卡构造器里可能有隐藏副作用 | PR-1 前先 grep 所有 `new Occupation(` / `new MinorImprovement(` 上下文 |
| Draft 闭包展开遗漏导致运行时崩 | CI `check:reaches` 强制；运行时 `CardNotInPoolError` 不崩游戏只 log |
| `dynamic import` 在部分 Node 版本行为差异 | 目标 Node 22+（CI 里用）；Docker prod 同版本 |
| Bundle 预算误伤正常演进 | 预算数值放 config，可调；失败时 PR 讨论调整 |
| typescript 包在前端打大包 | 工坊路由严格懒加载；多人对局入口 ESLint 禁止 import |

---

## 13. 预估收益

| 指标 | 今天 | PR-1-3 完成 | PR-4 完成 |
|---|---|---|---|
| 多人对局主包 JS（未压缩） | ~1.1MB | ~500-600KB | ~120-150KB |
| 主包 gzip | ~300KB | ~150KB | ~40-50KB |
| 沙盒初始加载 | ~1.1MB | ~700KB | ~60-100KB + 按卡懒加载 |
| 服务器每房间内存 | 全量卡驻留 | 全量驻留 | 只驻留卡池 + reaches |
| 自定义卡代码路径 | TS + DSL 两条 | TS 一条 | TS 一条 |
| 架构清晰度 | 边界模糊 | 目录分层清晰 | 机制强制不退化 |

---

## 14. 未来可能的演进（非本次 spec 范围）

- **Draft 玩法**（PR-5）：pending 类型、UI、协议、规则
- **工坊 submit PR to GitHub**（PR-6）：GitHub App 集成
- **浏览器版自定义卡 executor**：给多人对局里的自定义卡也加入"owner 浏览器执行 + 服务端校验 ActionFlow"模式；通过 `pending: 'customCodeEval'` 新 pending 类型桥接引擎同步模型
- **pnpm workspace 化**：如果将来要抽 engine / domain 作为独立包复用，再考虑工作区化
- **卡牌 RPC 层**：若 reaches 展开后一局加载的卡仍过多，考虑服务端实时"缺卡再加载"
- **`effect_dsl` 列删除**：SQLite `ALTER TABLE DROP COLUMN` 升级时机合适后执行

---

## 15. 要在开始实施前确认的事

- [x] §2 目录布局
- [x] §3 DSL 路径完整删除（§3.1 删文件、§3.2 清分支、§3.3 数据迁移、§3.7 时序、§3.8 CI 兜底）
- [x] §4 零副作用改造
- [x] §5 per-session CardRegistry
- [x] §6 draft + `reaches`（作者手动声明 + CI 校验）
- [x] §7 Executor 抽象
- [x] §8 边界强制 + CI workflow
- [x] §9 PR 拆分顺序（DSL 删除合并到 PR-2）

所有项已在 brainstorming 阶段确认。
