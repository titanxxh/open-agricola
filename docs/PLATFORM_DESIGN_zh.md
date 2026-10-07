# Open Agricola 平台扩展 — 设计与演进

[English](PLATFORM_DESIGN.md) | [中文](PLATFORM_DESIGN_zh.md)

> 本文是 [`PLATFORM_DESIGN.md`](PLATFORM_DESIGN.md) 的中文镜像；英文版是规范文档。

## Context

本项目已从纯游戏引擎扩展为包含账号、游戏大厅、数据库持久化和卡牌工坊（含 LLM 辅助设计）的完整平台，同时保持后端权威架构。

> A–G 记录最初的设计取舍与后续演进，SQL 和路由片段只作设计说明；当前实现状态与文件入口见 §J，运行时契约以代码为准。

---

## A. 架构选型

### A1. 数据库：异步 PostgreSQL，资源使用私有 S3

`server/database/schema.sql` 和编号 migration 是运行时 schema 的唯一实现。`server/db.ts` 使用异步 `pg` 连接池，事务在所有 await 之间保留同一连接，嵌套事务使用串行 savepoint。启动时通过共享 advisory lock 应用 migration。

账号、OAuth、Workshop、Bug Report、Room、Game Context、Replay、结果、目录、命令回执、失效屏障和任务 claim 共用 PostgreSQL。需要大小写无关唯一性的字段使用 `citext`；恢复校验依赖的原始编码保持 TEXT，Replay 压缩数据保持 BYTEA，不以 JSONB 重编码。

卡图、内容寻址的 Replay 资源和不可变 Viewer 放入私有 S3。PostgreSQL 保存暂存、引用和 GC claim；删除 ledger 独立保存在 S3，并在恢复前与最新独立副本合并。普通应用容器没有资源真源目录。

本机通过 Docker Compose 启动 PostgreSQL 18 和 RustFS，无需申请外部服务。SQLite 仅由 `scripts/import-sqlite.ts` 作为只读、一次性迁移输入。它保留录制局和无关数据，仅丢弃已证实未录制的活动局；导入或目标版本校验失败会阻止应用启动。迁移与备份步骤见 [部署文档](HOW_TO_DEPLOY.md)。

### A2. 认证：服务端 Session Token

**不用 JWT，使用服务端 Session：**

- 支持密码注册（邮箱验证）与 GitHub / Google OAuth
- 登录创建不透明 session token（`crypto.randomUUID()`），存入 `sessions` 表，7 天过期
- 浏览器通过 HttpOnly session cookie 访问 HTTP 与 WebSocket
- WebSocket 协议仍支持 `{ type: 'auth', token: '...' }` 显式认证
- 单服务器不需要 JWT 的无状态优势；服务端 session 支持即时吊销

### A3. 前端路由：URL 参数 + PageRouter 组件

**不引入 react-router** — 保持现有 URL 参数风格：

添加 `?page=` 参数：

- `?page=login` → 登录/注册页
- `?page=lobby` → 大厅（登录后默认）
- `?page=workshop` → 工坊模式
- `?page=game&room=xxx` → 游戏（现有 GameContainerApi）
- `?transport=ws&hotseat=1&...` → 本地热座：一个座位全归同一台设备的权威房间，因此和普通房间一样持久化与恢复，但不出现在大厅列表，且只有创建者能重新进入
- 无 `?page=` 且未登录 → 重定向到 login

```
App.tsx
  → AuthProvider (React Context)
    → PageRouter (读取 ?page= 参数)
       → LoginPage | LobbyPage | WorkshopPage | GameContainerApi
```

### A4. 状态管理：保持 Hooks，加 AuthContext

不引入 Redux/Zustand：

- `AuthContext` 提供用户状态、登录/登出、密码注册/验证邮件和 OAuth 入口
- 工坊页面用 `useState` + fetch，和游戏现有风格一致
- HTTP fetch 使用 `credentials: 'include'`，浏览器 WebSocket 自动携带 session cookie

---

## B. 部署模式设计

### B1. 一个公开入口，默认一个应用实例

`server/ingress.ts` 保留同一 backend origin 和 OAuth callback，将 `/nodes/<instanceId>/ws` 转发给 Room 的当前 owner；HTTP 工坊沙盒使用节点亲和 cookie。`scripts/local-backend.ts` 默认启动一个应用进程，可显式配置 `APP_INSTANCES=2` 在同一台机器验证路由。共享目录、lease、owner epoch、写入/发布屏障和命令回执由 PostgreSQL 保存；GameSession 仍是规则状态唯一写入者。

### B2. 开发环境

统一入口 `./restart-local.sh` 准备或复用本机 PostgreSQL、私有 S3、schema 和不可变 Viewer。worktree 的默认依赖数据归属于主仓；应用重启保留数据。`./restart-local.sh --instances 2` 启动本机双实例。`pnpm run verify` 同样使用统一入口，另建测试 schema、S3 prefix、端口和日志。

所有正式 Room 都录制，包括普通、Workshop、热座与开发 Room。开发入口 slot 在重开后指向新的永久 Room ID，启动器输出当前链接；旧 Game Context 不复用。独立 HTTP/browser Workshop Sandbox 仍保留。

### B3. 单机部署与后续切换

生产镜像包含原生 PostgreSQL 备份工具和一个不可变 Viewer；启动时把 Viewer 发布到 S3。Caddy 继续提供原有 HTTPS origin，私有应用进程和依赖端口不向公网暴露。PostgreSQL 与 S3 使用独立持久卷，默认无云服务前提。

后续可配置外部 `DATABASE_URL` 和完整 `S3_*` 参数。需要在维护窗口搬迁数据、保留加密密钥、合并当前删除 ledger，并通过目标版本恢复检查后启用。只改环境变量不会迁移数据。正常单机/双实例功能检查不构成故障恢复、30 秒恢复或容量认证。

---

## C. 提示词工程 (Prompt Engineering) 设计

### C1. 架构：浏览器直连 LLM

```
┌─────────────────────────────────────────┐
│  Browser                                │
│                                         │
│  localStorage: LLM config + API key     │
│       │                                 │
│       ▼                                 │
│  LLM Service (client/services/llm)      │
│       │                                 │
│       │  fetch() 直连 (CORS)            │
│       ▼                                 │
│  Gemini / OpenRouter / DeepSeek /       │
│  AiHubMix                               │
│                                         │
│  ✗ 绝不经过游戏服务器                      │
└─────────────────────────────────────────┘
```

- API Key 与模型配置存在浏览器 `localStorage`：能力/聊天配置用 `open-agricola-llm-config`，图片配置用 `open-agricola-llm-config-art`。
- Provider 注册源：`client/services/llm/registry.ts`，模型能力以 provider 文件中的 `capabilities` 为准。
- 聊天默认走 OpenAI-compatible `POST {baseUrl}/chat/completions` SSE；Gemini 图片、OpenRouter 图片、AiHubMix 图片各有 provider-specific `generateImage` 实现。
- UI 明确展示："代码开源可查，API Key 绝不离开浏览器"

#### C1.1 当前支持的 LLM 模型


| Provider   | 模型 ID                                 | UI 名称                                       | 默认  | 聊天  | 图片生成 | 说明                                                             |
| ---------- | ------------------------------------- | ------------------------------------------- | --- | --- | ---- | -------------------------------------------------------------- |
| Gemini     | `gemini-3.1-pro-preview`              | Gemini 3.1 Pro Preview (65k)                | 是   | 是   | 是    | 聊天走 Gemini OpenAI-compatible shim；图片走 Gemini `generateContent` |
| Gemini     | `gemini-3.1-flash-image-preview`      | Gemini 3.1 Flash Image (图片生成)               | 否   | 否   | 是    | 仅图片生成                                                          |
| Gemini     | `gemini-2.5-flash-image`              | Gemini 2.5 Flash Image (图片生成)               | 否   | 否   | 是    | 仅图片生成                                                          |
| OpenRouter | `qwen/qwen3.6-plus:free`              | Qwen 3.6 Plus (免费)                          | 是   | 是   | 否    | OpenRouter 聊天模型                                                |
| OpenRouter | `google/gemini-2.5-flash-preview`     | Gemini 2.5 Flash                            | 否   | 是   | 否    | OpenRouter 聊天模型                                                |
| OpenRouter | `google/gemini-2.5-pro-preview`       | Gemini 2.5 Pro                              | 否   | 是   | 否    | OpenRouter 聊天模型                                                |
| OpenRouter | `openai/gpt-5-image-mini`             | GPT-5 Image Mini (图片生成)                     | 否   | 否   | 是    | OpenRouter 图片模型                                                |
| OpenRouter | `google/gemini-2.5-flash-image`       | Gemini 2.5 Flash Image / Nano Banana (图片生成) | 否   | 否   | 是    | OpenRouter 图片模型                                                |
| OpenRouter | `bytedance-seed/seedream-4.5`         | Seedream 4.5 (图片生成)                         | 否   | 否   | 是    | OpenRouter 图片模型                                                |
| OpenRouter | `deepseek/deepseek-v4-flash`          | DeepSeek V4 Flash                           | 否   | 是   | 否    | OpenRouter 转发 DeepSeek 聊天模型                                    |
| OpenRouter | `deepseek/deepseek-v4-pro`            | DeepSeek V4 Pro                             | 否   | 是   | 否    | OpenRouter 转发 DeepSeek 聊天模型                                    |
| DeepSeek   | `deepseek-v4-flash`                   | DeepSeek V4 Flash                           | 是   | 是   | 否    | 官方 DeepSeek API                                                |
| DeepSeek   | `deepseek-v4-pro`                     | DeepSeek V4 Pro (推理)                        | 否   | 是   | 否    | 官方 DeepSeek API；推理内容不渲染，只展示最终内容                                |
| AiHubMix   | `gemini-3.1-flash-image-preview-free` | Gemini 3.1 Flash Image (免费)                 | 否   | 否   | 是    | AiHubMix 免费图片模型                                                |
| AiHubMix   | `coding-glm-5.1-free`                 | Coding GLM 5.1 (免费)                         | 是   | 是   | 否    | AiHubMix 免费聊天模型                                                |
| AiHubMix   | `k2.6-code-preview-free`              | K2.6 Code Preview (免费)                      | 否   | 是   | 否    | AiHubMix 免费聊天模型                                                |


OpenRouter 不在 provider 级别声明 `chat` / `image` 兜底能力；每个模型必须显式声明自己的能力，避免图片面板展示聊天模型或聊天面板展示图片模型。

### C2. 系统提示词设计

**源文件**：`client/services/llmPrompts.ts`（`CARD_DESIGNER_SYSTEM_PROMPT`）。以下是其结构摘要；以源文件为准。effect / 进阶 hook 表、listener phase 表、listener scope 表、actionId 表**运行时从真相源渲染**（`shared/cards/card-effects.ts` 的 `cardEffectHooks` + `shared/custom-code/sandbox-hook-meta.ts` / `sandbox-listener-phases.ts` / `sandbox-listener-scopes.ts` / `sandbox-action-ids.ts`），因此这四张表不会与引擎漂移，无需手工镜像。

**结构：角色定义 + 输出格式 + 关键规则 + CARD_IMPL 结构详解 + effect hook 表 + listener 机制 + ActionFlow 类型 + 可用 helper + 可读 state/player 字段 + 沙盒限制 + 设计平衡参考 + 游戏规则速览 + few-shot 示例**

---

#### 输出格式

LLM 每次回复**必须**包含一个 `` ```typescript `` 代码块，使用 `CARD_DEF` + `CARD_IMPL` 双常量结构（不使用 import / export）。`CARD_DEF` 只接受对象格式，不兼容 `new MinorImprovement(...)` / `new Occupation(...)`：

```typescript
const CARD_ID = 'CUSTOM_英文驼峰名'

const CARD_DEF = {
  cardType: 'minor',            // 或 'occupation'
  meta: {
    id: CARD_ID,
    name: 'Card Name',          // 英文，与内置卡风格一致
    deck: 'CUSTOM',
    number: 0,
    desc: ['Effect description; <WOOD> <FOOD> tags unchanged.'],
    cost: { wood: 1 },
    vp: 0,
    implemented: true,
    locales: {
      zh: { name: '卡牌中文名', desc: ['中文描述'] },
    },
  },
}

const CARD_IMPL = {
  effect: {
    id: CARD_ID,
    onRoundStart: (state, player) => gainLeaf(CARD_ID, { food: 1 }),
  },
  listeners: [
    {
      cardIds: [CARD_ID],
      actions: ['plow'],
      phases: ['after'],
      handler: (context) => ({ flow: gainLeaf(CARD_ID, { clay: 1 }), sourceCard: CARD_ID }),
    },
  ],
}
```

#### 关键规则（prompt 硬性约束）

- `CARD_ID` 必须以 `"CUSTOM_"` 开头，英文驼峰
- `deck` 固定 `'CUSTOM'`，`number` 固定 `0`，`implemented` 固定 `true`
- 禁止 `import` / `export` / `require` / `registerCardEffect` / `registerCardListener`
- 禁止 `class`、generator、`with`、`eval`、`Function`、`fetch` 等
- `name` / `desc` / `prerequisite` 顶层字段必须英文；`locales.zh` 必须填全
- 即使只做小修改，也要重新输出完整代码

#### effect hook（`CARD_IMPL.effect`）

常用触发点：`onBuy`、`onRoundStart`、`onRoundEnd`、`onAllWorkersPlaced`、`onReturnHome`、`onHarvestFieldPhase`、`onBeforeEndGame`、`computeBonusScore` 等（完整列表见源文件）。

签名：`(state, player) => ActionFlow | void`（`onBuy` 额外接收 `paymentInfo`）。

#### listener 机制（`CARD_IMPL.listeners`）

监听行动触发：可用 `phases` 包括 `before`、`during`、`immediatelyAfter`、`after`、`computeCosts`、`computeArgs`、`computeReplace`、`isDoable`、`anytime`、`computeChoiceCandidates`。

可用 `scope`：`player`、`opponent`、`any`；权威白名单见 `shared/custom-code/sandbox-listener-scopes.ts`。

可监听的 `actions` 权威白名单见 `shared/custom-code/sandbox-listener-actions.ts`；prompt、AST validator 与 server/browser manifest 共用该列表。主要或次要改良购买统一使用 `improvement`。

#### 可用 actionId（ActionFlow leaf）

`gain`、`pay`、`bonus-vp`、`bake-bread`、`store-on-card`、`take-from-card`、`push-to-card-stack`、`special-effect`、`future-meeples`（共 9 个；权威白名单见 `shared/custom-code/sandbox-action-ids.ts` 的 `SANDBOX_ALLOWED_ACTION_IDS`）。旧 id（`pay-resources` / `gain-other-players` / `write-card-extra-data` / `hold-worker-on-card` 等）已从引擎删除。

#### 沙盒注入 helper

`gainLeaf(cardId, {food:2})`、`payLeaf({cardId, cost:{wood:1}})`、`spaceHasPlayer(space, playerId)`、`positionKey({row,col})`、`getCardStack(player, cardId)`、`readCardExtraData(player, cardId)`。

#### 设计平衡参考

1 food ≈ 最弱收益；`onRoundStart` 每轮触发应偏弱；`bonus-vp` 很强需成本或严格条件；`onBuy` 只触发一次可稍强。

#### few-shot 示例来源

系统提示词末尾附加 `docs/community-card-examples.md`（原始 Markdown 通过 Vite `?raw` 导入），作为 few-shot 示例库随提示词一起发送给 LLM。

### C3. 多轮对话设计

- 对话历史和未发送输入只存在当前浏览器会话，并随本地恢复副本写入 localStorage
- 每轮追加用户反馈 + LLM 响应
- LLM 看到完整对话历史，支持迭代：
  - "把费用降低一点"
  - "加一个收获时的效果"
  - "参考官方的 Ale Benches 风格"
- 前端从每条响应中提取最后一个完整源码块作为能力候选，不直接覆盖当前已采用源码
- 服务端只保存能力最近一次完成请求/结果；完整对话、未发送输入和 API Key 不上传

### C4. 卡牌美术生成

界面只收集 `Image subject` 文本；固定模板在发送图片请求时按卡牌类型拼接，不展示、不上传也不持久化完整 prompt。模板只要求约 `0.95:1` 的近方形竖向满幅构图，不声明像素尺寸，也不要求模型绘制边框、金边或文字。

模型原图由浏览器统一 cover 裁切到卡牌图框比例，再套职业卡圆形或次要发展卡六角形遮罩并绘制金边；最终画布分别为职业卡 `512×537`、次要发展卡 `512×534`。因此模型是否遵循输出尺寸不影响卡面文件尺寸。

生成结果先成为图片候选，不直接覆盖当前卡面。当前浏览器会话最多保留三个候选；采用后才原子更新 Design Draft、创建去重 Draft Version，并通过 `/api/workshop/art` 把图片上传到私有对象存储。服务端只保存用户输入的 subject 及已采用候选 provenance。

托管图片使用 `/card-art/{filename}` 标识。历史绝对 HTTP(S) URL 及 `/agricola-api` 等 API 路径前缀在投稿、Replay 归档和持久引用中解析为相同的本地对象键，不访问 URL 中的主机。读取仍须通过本地目录、内容哈希和删除屏障检查。草稿、保存的候选和固定版本的图片引用在 API 域名变更后仍然有效。迁移只为尚存且 ready 的对象补齐引用，不改写版本快照。已清理图片必须恢复与原记录完全一致的字节及引用；已下架删除的图片继续受屏障保护。

工坊缩略图、已采用图片、候选预览及自定义卡面在渲染时按当前 API base 解析托管图片，保留存储的 URL 和快照哈希。生成记录仅从图片的 `resultUrl`、`referenceImages` 字段提取资源引用；主题、提示词和能力文本即使含有图片网址也仍是普通文字。

### C5. LLM 生成代码的安全验证

LLM 输出 **TypeScript 源码**（包含 `CARD_DEF` 定义、`CARD_IMPL.effect` hook 回调、`CARD_IMPL.listeners` 监听器）。后端三步走：验证 → 编译 → 沙盒执行。

**1. AST 验证** — `shared/custom-code/ast-validator.ts`

用 TypeScript Compiler API 解析源码，AST 遍历拒绝以下构造：

- **语句级**：`import` 声明、`export` 声明、动态 `import()`、`require()` 调用、class 声明 / 表达式、`with` 语句、generator 函数
- **标识符黑名单**（裸引用）：`eval`、`Function`、`process`、`require`、`globalThis`、`global`、`window`、`document`、`__dirname`、`__filename`、`fetch`、`XMLHttpRequest`、`WebSocket`、`setTimeout`、`setInterval`、`setImmediate`、`clearTimeout`、`clearInterval`、`Deno`、`Bun`、`Proxy`、`Reflect`
- **属性访问黑名单**（`obj.X` 或 `obj['X']`）：`constructor`、`__proto__`、`__defineGetter__`、`__defineSetter__`、`__lookupGetter__`、`__lookupSetter__`
- **CARD_IMPL 白名单验证**：`CARD_IMPL.effect` 的 key 只允许 `cardEffectHooks` 中的 hook 名；`CARD_IMPL.listeners[].phases` 只允许 `actionHookPhases` 中的 phase 名

**注**：AST 验证是用户友好的错误提示层；真正的安全边界是 isolated-vm（独立 V8 堆）。

**2. 编译** — `shared/custom-code/compiler.ts`

AST 验证通过后，`ts.transpileModule()` 将 TypeScript 编译为 CommonJS JS。数据库 `card_json` 列存所有自定义代码相关数据（CARD_DEF 元数据 + TypeScript 源码 + 编译后 JS + manifest）。早期 v1-v3 schema 有独立的 `effect_dsl` / `effect_code` / `compiled_code` 列（V1 DSL 设计遗留），migration v7 已全部 DROP，统一聚合到 `card_json`。

**3. 沙盒执行** — `server/custom-code/{engine, executor-worker, isolate-runner, runtime}.ts`

- **isolated-vm** (`isolated-vm` npm 包)：独立 V8 堆（非 `node:vm`），无原型链逃逸；内存上限 8 MB；单次执行 CPU 超时 **100 ms**
- **Worker Thread**（`executor-worker.ts`）：isolated-vm 执行在独立 Worker Thread，若 V8/native 崩溃只杀 worker，主进程自动重生 worker 继续服务
- 主线程通过 `SharedArrayBuffer + Atomics.wait` 同步等待（整体超时 5000 ms）
- 异常：try/catch 包裹，记录警告、返回 `null`、游戏继续
- 注入给沙盒的辅助 API（`injected-helpers.ts`）：`gainLeaf`、`payLeaf`、`spaceHasPlayer`、`positionKey`、`getCardStack`、`readCardExtraData`（纯只读 / 构建叶节点，无写状态能力）

**历史备注**：项目早期设计曾考虑过 V1 声明式 JSON DSL（无代码执行），最终未采用——直接走 LLM → TypeScript → AST 白名单 + isolated-vm 沙盒路径。

---

## D. 工坊架构

### D1. 自定义卡牌注册

`shared/cards/custom-registry.ts` 把 `CustomCardData` 注册进当前
`SessionCardContext`；仅测试和显式全局路径使用按 minor / occupation
分开的 fallback map。`shared/cards/catalog.ts` 的
`getMinorImprovementCard()` / `getOccupationCard()` 会按卡牌类型回退到该
registry。

### D2. 游戏中加载自定义卡牌

1. 大厅仅在启用 community deck 时通过 `GET /api/workshop/cards?scope=room` 分页列出可进入真实房间的已审核上线卡，创建房间时把勾选结果传入 WS `createRoom.customCardIds`；服务端也只在 `enableCommunityDeck === true` 时接受这些 id，HTTP `/api/game/new-sandbox` 仍用于作者沙盒
2. `server/connection/room-router.ts` 或 `server/game-router.ts` 从数据库构造 `CustomCardData[]`
3. `GameSession` 构造时把卡牌定义和运行时实现注册到本局 `SessionCardContext`
4. `server/custom-code/runtime.ts` 的 `registerExecutorBackedCustomCard()` 从编译产物 + manifest 注入 effect hook 和 listener，通过 `invokeCustomCodeEffectSync` / `invokeCustomCodeListenerSync` 委托给 Worker Thread + isolated-vm 执行
5. 将自定义卡牌 ID 加入发牌池

### D3. 沙盒隔离与容错

- 所有自定义卡牌效果/监听器调用包裹在 try/catch 中
- 异常时：记录错误、跳过该效果、游戏继续；当前沙盒会话累计去重后的运行错误，工坊确认门禁提交前重新读取并拒绝带错版本
- isolated-vm 单次执行 CPU 超时 100 ms
- 状态快照可回滚（利用现有 undo 基础设施）

### D4. 工坊 UI 页面结构

```
WorkshopPage
├── CardBrowser          卡牌浏览（网格，搜索/排序/筛选）
│   ├── CardPreviewTile  缩略图 + 名称 + 作者 + 点赞数
│   └── Pagination
├── CardDetail           卡牌详情
│   ├── CardArt          美术预览
│   ├── CardStats        费用/分数/描述
│   ├── EffectViewer     TypeScript 代码展示（只读）
│   ├── LikeButton
│   ├── CommentSection
│   └── AddToSandbox
├── CardEditor / AiCardDesigner
│   ├── PreviewPanel     始终锚定当前已采用草稿
│   ├── StageRail        基础信息/卡面图/能力/本地化/验证与交付
│   ├── CandidateReview  图片与能力候选比较、验证、采用和丢弃
│   ├── SaveState        检查点、离线恢复和整份 revision 冲突选择
│   └── VersionHistory   不可变版本恢复和一次本地撤销
└── SandboxView          我的沙盒
    ├── SelectedCards     已选的自定义卡牌列表
    └── TestGameButton   "开始沙盒测试" → 创建含自定义卡牌的可配置人数测试游戏
```

### D5. Workshop → GitHub PR 流程

`submit-review` 是进入 `in_review` 的唯一入口。公开源码仓库由一个 Workshop GitHub App 负责投稿、只读审核和签名 webhook；登录 OAuth 与 issues-only Bug Report App 仍独立。

1. 检查已登录作者、非上线可编辑草稿、静态校验、精确版本沙盒确认、中文本地化和卡牌 ID 预留。
2. `POST /api/workshop/cards/:id/submit-review` 在远端写入前将 Workshop Card、Draft Version、revision、App installation、仓库和 `workshop/<card database ID>/<proposal ID>` 分支持久化到 PostgreSQL。卡牌源码及 PR 正文保留设计者署名，GitHub 作者为 App。未采用候选、生成溯源和凭据不公开。
3. 按最新 main 生成卡牌、图片及共享索引。GraphQL `updateRefs(beforeOid, afterOid, force:true)` 原子检查预期 head，禁止无条件强推。只允许生成文件及独立的 `server/shared/**/__tests__/*.test.ts` 修改；工作流及其他改动交由维护者处理。
4. 只复用原来 open、非 draft、目标为 main 的 PR。每个旧生成文件都与持久化基线比较，人工修改、删除或重命名均暂停；独立测试按最新 main 保留，冲突则暂停。draft 或改 base 暂停；关闭后必须明确 `action:restart`，合并后走内置接管。不自动关闭、重开 PR 或改写旧 fork。PR 正文保留首次投稿的设计者署名，并链接到生成卡牌头部的当前说明及署名；这些字段随分支原子更新，App 不重写共同编辑的 PR 正文，因此不会覆盖维护者同时新增的备注或复选框修改。GitHub 不支持 PR 正文的条件更新（[API 说明](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#use-conditional-requests)）。
5. `SubmissionStore` 保存检查点，同卡只有一个 pending 操作；租约过期可恢复，本地写入带 fencing。后台每 15 秒最多协调五条到期记录，每条最多四次自动尝试，从 30 秒开始指数退避，并遵守 GitHub 限流等待提示。新操作每作者十分钟一次、全站每分钟二十次；恢复不重复计入新投稿额度。 远程预检和手动恢复共用独立尝试额度（每作者每分钟五次、全站每分钟一百次），在事务外扣除，失败不回滚。未改动的已完成投稿直接返回本地结果。远程预检不持有数据库事务，最终创建操作时重新核对冻结版本的 revision 及预检时看到的投稿记录；若期间已有恢复操作改变记录，则返回其权威结果。投稿处于 pending 或仍持有执行租约时（包括远程结果未确认），作者、管理员和账号删除均返回冲突，须先恢复投稿；数据库触发器同时保护级联删除，包括创建响应丢失后尚未识别出的 PR。投稿完成时原子清除租约。pending 和 blocked 投稿保留冻结的 Draft Version 及其卡图引用，不受普通历史仅保留五个版本的限制。被个人限流拒绝的远程尝试不扣全站额度。
6. 分支响应丢失时核对计划 commit 和原预期 head。PR 按全部状态分页查找，核对仓库、分支、marker 和 commit；POST 前保存创建意图，结果未知时即使查空也不再次盲目创建。这是可恢复交付，不承诺外部 exactly-once。`GET .../submit-review` 返回权威状态，POST `action:recover` 只恢复原操作；未知或歧义状态保留编号供维护者核实。
7. 实际 head 和提交版本事务绑定；投稿途中编辑保留新草稿并返回 `draft_changed`，不会把新草稿冒充旧投稿或批准。新绑定清空旧批准。绑定后审核读取失败保留 PR，并清空同步时间供刷新重试。
8. 签名和去重后的 webhook、上架时即时查询均要求有 push 权限的真实 reviewer 对精确 head 批准，不再合成 OWNER 批准。审核列表不完整时拒绝通过。GraphQL 读取不被当成事务快照；本地 binding 与生命周期条件保护协调。head 改变、draft、改 base、关闭、撤销和 changes-requested 使批准失效。作者仍可在批准后、合并前上架，发布包含卡牌的版本后完成内置接管。

旧投稿迁移必须明确发起。由旧固定版本重建源码和图片，源码比较只忽略溯源头注释；缺基线或有人工修改时交维护者处理。保留独立测试、草稿、版本和旧 PR 链接。启用切换前运行只读盘点并处理合成批准，见[运维说明](operations/github-oauth-app-setup.md)。

| 模块 | 职责 |
|---|---|
| `server/workshop-pr/propose-handler.ts` | 作者与交接门检查、固定操作分配及状态 API |
| `server/workshop-pr/submission-store.ts` | 持久化身份、检查点、租约、限流 |
| `server/workshop-pr/submission-service.ts` | 条件交付、安全更新、有界对账 |
| `server/workshop-pr/github-app.ts` | 单 App，仓库范围的写 token 与独立只读 token |
| `server/workshop-pr/github-client.ts` | GitHub 传输、预期 head 写入及测试补丁保留 |
| `server/workshop-pr/code-gen.ts` | 卡牌源码、注册表、图片及索引生成 |
| `server/workshop-review/` | 精确 head 审核与签名 webhook 协调 |
| `client/services/workshop-pr.ts` | 投稿、状态和明确恢复，无 OAuth 弹窗 |

生成的 PR 文件固定包含：


| 文件                                                     | 说明                                          |
| ------------------------------------------------------ | ------------------------------------------- |
| `shared/cards/community/{CUSTOM_ID}.ts`                | Card Source：UI metadata + `CardImpl`          |
| `shared/cards/register-all.ts`                         | 注册 `{CUSTOM_ID}.impl`                       |
| `shared/cards/catalog.generated.ts`                    | 卡牌定义 catalog                               |
| `docs/community_cards.md`                              | community card 索引；PR 创建后会用真实 PR number 二次提交 |
| `public/card-art/community/{CUSTOM_ID}.{ext}`          | 可选，美术二进制                                    |

生成器不创建定义/导出形状 smoke test。简单即时资源效果使用直接行为测试；支付、选择 / pending、延迟、跨玩家和多步 flow 必须由作者、reviewer 或 LLM 编写专属 `GameSession` 场景。


生成器会做必要规范化，避免用户在沙盒中能跑但 PR CI 不通过：

- `deck: 'CUSTOM'` 会转换为 `deck: 'community'`。
- `CARD_IMPL` 会补上 `CardImpl` 上下文类型，避免 listener phase/action 字面量退化成 `string[]`。
- 缺失 `id` 的 listener 会补稳定 id：`{cardId}-listener-{n}`。
- `prerequisite: { occupation: N }` 会转为仓库支持的 `prerequisite: 'N Occupations'` + `occupationPrerequisites: { min: N }`。
- `CARD_IMPL` 引用到的顶层辅助常量、函数和类型按原顺序保留；引用不到的辅助和顶层表达式语句丢弃。
- 未标注类型的参数一律输出为 `any`，顶层辅助函数返回值也标为 `any`，文件加 `no-explicit-any` 的 lint 豁免，因为沙盒代码是运行时校验的无类型 JavaScript。
- 同步更新 `register-all.ts`；基础牌、major、community metadata 由 `pnpm run generate:register-all` 生成到 `catalog.generated.ts` / `major/generated.ts`。

### D6. 卡牌详情、版本历史和编辑回填

卡牌详情页使用 URL 参数表达当前卡牌：`?page=workshop&card=<workshop-card-id>`。点击卡牌进入详情时使用 `pushState`，返回列表或切换首页时用 `replaceState`，并监听 `popstate` 支持浏览器前进/后退。

编辑器直链使用 `?page=workshop&view=editor&card=<workshop-card-id>`。它直接加载作者私有的 `GET /api/workshop/cards/:id/workspace`，不能通过仅含已发布投影的公共详情接口回填草稿。

版本历史读取 `GET /api/workshop/cards/:id/versions`，玩家只看到最近 5 个版本；创建新版本时会清理超出上限且未被审核、发布或沙盒确认固定的旧版本。恢复必须调用带 `baseRevision` 的 `POST /api/workshop/cards/:id/restore`，把不可变版本复制到当前 Design Draft 并推进 revision；不改写历史、不额外创建版本。浏览器保留恢复前草稿，提供一次本地撤销。

### D7. Design Draft 持久化与命令

`server/workshop-drafts.ts` 是 Workshop Card 聚合的写入边界，集中维护 revision、版本去重、公开投影、精确版本沙盒确认和 PR 交接门槛。HTTP handler 只负责认证、解析和响应映射。

| 命令 | 语义 |
| --- | --- |
| `POST /api/workshop/cards` | 只创建名称与唯一合法 `CUSTOM_` ID 完整的新卡；不更新或发布已有卡 |
| `PUT /api/workshop/cards/:id/draft` | 带 `baseRevision` 保存完整检查点；过期返回 `409` 和服务器完整草稿 |
| `POST /api/workshop/cards/:id/adopt` | 原子采用 typed candidate、创建内容去重版本并清空该类候选 |
| `POST /api/workshop/cards/:id/restore` | 复制旧版本到当前草稿并推进 revision，不创建版本 |
| `POST /api/workshop/cards/:id/publish` | 仅 review approved 的卡置 live（PRD #634；publish 时刻重验原子快照，provider 不一致 → 拒绝并转 stale） |
| `POST /api/workshop/cards/:id/unpublish` | live → offline；不作废过审资格，未改动可直接再发布（#638） |
| `POST /api/admin/cards/:id/takedown` | 管理员 kill switch（#641）：强制 stale·offline + 终止所有嵌入此卡的进行中对局（无计分/无 completed replay） |
| webhook `pull_request` closed+merged | 毕业（#642）：仅 base=`main` 的 merge 触发；卡转 merged 终态，空窗期供快照，发版后 built_in 切内置定义。改离 `main` 后 merge 视同未 merge 关闭（stale·offline，状态记 `closed`）。merge 事件先于审批到达时持久化 merge 事实，待审批 webhook 或 `refresh-pr-status` 读到 approved MERGED 快照（head 在 merge 后冻结、SHA 绑定仍可验）时补毕业并即时对账 built_in |
| `POST /api/workshop/cards/:id/pin-version` | 固化当前草稿为不可变版本（沙盒确认流的版本来源；不动 review 轴） |
| `POST /api/github/webhook` | GitHub App HMAC 验签；处理 review submitted/dismissed、PR synchronize/edited/converted-to-draft/closed，delivery 幂等 |
| `POST /api/workshop/cards/:id/sandbox-pass` | 只记录当前精确发布版本且无运行错误的作者确认 |

能力首次生成和重发都会附带当前卡牌上下文；`CARD_ID`、卡牌类型和名称必须保持一致，采用时由 Workshop Card 聚合再次校验，效果描述、费用、VP 与本地化等其余定义字段仍可随候选更新。

每次能力源码验证都会把 isolated-vm 提取的 `CARD_DEF` 快照写入服务端 manifest；发布静态门禁会双向比较该快照与当前 `card_json` 的可交付字段，PR handoff 还必须存在已验证源码，避免沙盒运行、已发布定义与最终提交源码不一致。

普通编辑只在切换阶段、站内离开或显式保存时创建检查点，不创建 Draft Version。刷新或崩溃恢复依赖同步写入的 localStorage 副本；同 revision 恢复为未同步状态，服务器 revision 已前进则要求用户选择整份服务器稿或整份本机稿。

Workshop 草稿错误包含机器可读的 `code`。保存已上线卡牌返回 `409` 和 `code: 'live_edit_blocked'`；编辑器提示作者先下架，并在下架过程中保留本机修改。仅当返回的服务器 revision 与请求的 `baseRevision` 不同时，`409` 才进入整份草稿冲突选择；同 revision 的拒绝直接显示实际原因。

Draft Version 只序列化最终卡牌内容和各分区已采用候选的 provenance；图片 provenance 同层保留用户输入的 subject，确保恢复版本后仍可重新生成。临时 `_draft` 表单字段、未采用候选、完整生成结果副本和工作对话不进入版本。

---

## E. 安全设计


| 威胁            | 对策                                           |
| ------------- | -------------------------------------------- |
| API Key 泄露    | 仅存 localStorage，绝不发送到游戏服务器，UI 明确标示           |
| 密码泄露          | `crypto.scrypt` 哈希，不存明文                      |
| Session 劫持    | HTTPS（生产）+ HttpOnly / Secure / SameSite session cookie |
| 暴力破解          | 登录 API 限流：5 次/分钟/IP                          |
| 恶意卡牌代码        | AST 白名单（拒绝 import/export/eval/process/fetch/setTimeout/Proxy/Reflect/class 等 20+ 标识符）+ isolated-vm（独立 V8 堆，非 node:vm）+ Worker Thread + 执行超时 100 ms / 内存上限 8 MB + 状态快照可回滚 |
| XSS via 卡牌描述  | React 默认转义 HTML；不用 dangerouslySetInnerHTML   |
| WebSocket 未认证 | 优先校验 session cookie；未认证连接需在 5 秒内发 auth 消息，否则断开 |


---

## F. 新增依赖


| 依赖                      | 用途         | 备注                   |
| ----------------------- | ---------- | -------------------- |
| `better-sqlite3`        | SQLite 数据库 | 同步 API，适配现有代码风格      |
| `@types/better-sqlite3` | 类型定义       | dev dep              |
| `nanoid`                | 生成短 ID     | 用于 user/card/room ID |


不需要其他依赖。`crypto.scrypt` 和 `crypto.randomUUID` 都是 Node.js 内置。

---

## G. 实施阶段

### Phase 1: 数据库 + 认证

- 添加 `better-sqlite3`，创建 `server/db.ts` (schema 初始化)
- 创建 `server/auth.ts` (register/login/session)
- 添加认证中间件到 `server/index.ts`
- 创建 `client/app/LoginPage.tsx` + `AuthContext`
- 迁移房间持久化：JSON 文件 → SQLite
- WebSocket 认证握手

### Phase 2: 大厅

- 创建 `client/app/LobbyPage.tsx`
- 添加大厅 API 路由
- 创建 `PageRouter` 替代 App.tsx 中的直接渲染
- 房间列表/创建/加入 UI

### Phase 3: 工坊（数据驱动卡牌）

- 工坊 API 路由
- `shared/cards/custom-registry.ts` + `server/custom-code/` AST 验证 + isolated-vm 沙盒执行
- `client/app/WorkshopPage.tsx` (浏览/编辑/沙盒)
- 社交功能（点赞/评论）

### Phase 4: LLM 卡牌设计师

- `client/services/llm/` 多 provider 聚合（Gemini / OpenRouter / DeepSeek / AiHubMix）
- 系统提示词模板
- AI 对话式设计 UI
- 卡牌美术生成

### Phase 5: 高级卡牌效果（已合并到 Phase 3）

- TypeScript AST 验证（`shared/custom-code/ast-validator.ts`）
- isolated-vm 沙盒执行 + Worker Thread crash isolation
- `CARD_IMPL.effect` hook + `CARD_IMPL.listeners` 全支持

---

## H. 关键文件清单

- HTTP / 认证 / 数据库：`server/index.ts`、`server/auth.ts`、`server/db.ts`
- WebSocket：`server/connection/{ws-server,room-router,broadcaster}.ts`
- 房间 / 持久化：`server/game/{room,room-registry,room-committer,room-persistence-checkpoint}.ts`、`server/game/persistence/`
- 协议：`shared/contract/protocol/ws.ts`
- 工坊 / 沙盒：`server/workshop.ts`、`server/game-router.ts`、`shared/cards/{custom-registry,catalog}.ts`、`shared/custom-code/`、`server/custom-code/`
- 前端平台：`client/app/{LoginPage,LobbyPage,WorkshopPage,PageRouter}.tsx`、`client/contexts/AuthContext.tsx`
- 浏览器 LLM：`client/services/llm/`

---

## I. 验证方式

- **认证**：注册并验证邮箱或 OAuth 登录 → 检查 HttpOnly session cookie → 刷新页面保持登录
- **大厅**：创建房间 → 另一浏览器加入 → 游戏开始
- **持久化**：游戏中途刷新 → 状态恢复 → 重启服务器 → 状态恢复
- **工坊**：创建自定义卡牌 → 发布 → 另一用户浏览/点赞/评论 → 加入沙盒
- **LLM 设计**：输入 API key → 描述卡牌 → 预览 → 迭代修改 → 保存
- **沙盒测试**：选中自定义卡牌 → 创建测试游戏 → 卡牌在游戏中正常触发
- **安全**：确认 API key 不出现在任何网络请求中（DevTools Network 检查）

---

## J. 实现状态（main）

> 更新于 2026-07-29

### 已完成


| 功能                             | 文件                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 注册/登录/登出/会话验证、邮箱验证与 OAuth       | `server/auth.ts`, `server/auth-cookies.ts`, `server/oauth/`, `client/app/LoginPage.tsx`, `client/contexts/AuthContext.tsx`            |
| SQLite 数据库 + migration          | `server/db.ts`                                                                                                               |
| WebSocket 认证握手                 | `server/connection/ws-server.ts`, `server/connection/room-router.ts`, `shared/contract/protocol/ws.ts`                         |
| WS 房间 → SQLite 写入              | `server/game/room-persistence-checkpoint.ts`, `server/game/room-committer.ts`, `server/game/persistence/postgres-adapter.ts`      |
| 服务器重启恢复房间                      | `server/connection/ws-server.ts`, `server/game/persistence/postgres-adapter.ts`                                                  |
| 游戏状态持久化（JSON/SQLite）           | `server/game/persistence/` (`PERSIST_ROOMS` 环境变量)                                                                            |
| 完赛结果归档 + 删除完整状态                 | `server/game/room-persistence-checkpoint.ts`, `server/game/persistence/postgres-adapter.ts`                                     |
| 房间 TTL 丢弃                      | `server/connection/ws-server.ts`, `server/game/persistence/postgres-adapter.ts`                                                 |
| 大厅页面                           | `client/app/LobbyPage.tsx`, `/api/lobby/my-rooms`                                                                               |
| 页面路由 (?page=)                  | `client/app/PageRouter.tsx`                                                                                                     |
| URL params 实时读取                | `client/app/GameContainerApi.tsx` (移出模块级)                                                                                       |
| 返回大厅按钮                         | `client/components/header/GameHeader.tsx`                                                                                       |
| Dev 模式默认关闭                     | `client/app/GameContainerApi.tsx` (?devMode=1)                                                                                  |
| Auth 401 自动登出                  | `client/contexts/AuthContext.tsx` (apiFetch)                                                                                    |
| 游戏中玩家名与登录用户同步                  | `shared/session/session-core.ts` (`updatePlayerName`), `server/connection/room-router.ts`, `server/game-router.ts`             |
| 工坊卡牌 CRUD                      | `server/workshop.ts`, `client/app/WorkshopPage.tsx`                                                                             |
| 工坊社交（点赞/评论）                    | `server/workshop.ts`                                                                                                         |
| 工坊沙盒                           | `server/workshop.ts`, WorkshopPage SandboxView                                                                               |
| 自定义卡牌注册表 + catalog fallback    | `shared/cards/custom-registry.ts`, `shared/cards/catalog.ts`                                                                 |
| 自定义卡牌 try-catch 容错             | `shared/cards/card-effects.ts` (CUSTOM_ 前缀卡牌异常时跳过)                                                                           |
| 可配置人数沙盒游戏（含自定义卡牌）              | `/api/game/new-sandbox`, `server/game-router.ts`                                                                             |
| WS 多人游戏含自定义卡牌                  | `shared/contract/protocol/ws.ts` (`createRoom.customCardIds`), `server/connection/room-router.ts`                              |
| LLM 卡牌设计师                      | `client/app/workshop/AiCardDesigner.tsx`, `client/services/llm/`（多 provider 聚合层）                                            |
| 多 LLM Provider 支持              | Gemini / OpenRouter / DeepSeek / AiHubMix；完整模型表见 §C1.1                                                                       |
| API Key 浏览器隔离                  | localStorage 存储，绝不发往服务器                                                                                                      |
| 卡牌美术生成 + 上传                    | Gemini / OpenRouter / AiHubMix 图片模型 + `POST /api/workshop/art` + `/card-art/` 静态服务                                           |
| 资源图标解析                         | `client/components/common/ResourceText.tsx`                                                                                     |
| auth/workshop 单元测试             | `server/__tests__/auth.test.ts`, `workshop-api.test.ts`                                                                      |
| TypeScript AST 验证 + isolated-vm 沙盒 | `shared/custom-code/ast-validator.ts`, `server/custom-code/{compiler, engine, client, executor-worker, isolate-runner, runtime, injected-helpers}.ts` |
| 卡牌版本历史                         | `workshop_card_versions` 表, versions/restore API, WorkshopPage 版本面板                                                          |
| 工坊精选页面                         | `workshop_cards.featured` 列, admin 精选切换, Featured 标签页                                                                        |
| 生产部署 (Docker + GitHub Pages)   | `Dockerfile`, `docker-compose.prod.yml`, `deploy-backend.sh`, `.github/workflows/deploy-pages.yml`, `client/config.ts` |
| 管理员角色                          | `server/auth.ts` isAdmin(), `ADMIN_USERS` 环境变量                                                                               |
| 管理员 API                        | `GET/DELETE /api/admin/cards`, `GET /api/admin/cards/:id/export`, `GET /api/admin/users`（自证发布的 status 切换端点已随 PRD #634 移除） |
| 卡牌发布/取消发布                      | PR-gated（PRD #634）：GitHub App GraphQL 定论 pin 被审版本 → 作者 publish 再校验后置 live；非作者只能看到 live 卡                                                             |

## 管理员运行看板

管理员从设置进入 `?page=operations`。总览每 15 秒刷新，展示应用就绪、去重在线用户、活动普通多人房间、5 分钟命令 p95 和系统错误率、组件状态、采集时间及异常原因。Grafana 通过一次性认证交接打开，提供当前/24 小时/7 天趋势、WS 回合筛选和大小分布。页面只读，不发送站外通知，也不授予活动对局隐藏状态访问权限。

普通进行中/等待房间总数排除开发和 hotseat 房间，后两类独立显示。独立 HTTP/浏览器 sandbox 不计入 Room。在线用户为有存活 WS 的认证用户，跨实例去重；实例采集覆盖不全或过期为未知，不记为零；仅有 HTTP session 不构成在线 presence。匿名开发 socket 计入连接，不计入认证用户。完成局使用权威 game results，不能用命令尝试数替代。Room presence 校验当前 ownership epoch 和有效租约。未知/过期来源和不足的分位数样本保留为空，不当作健康的零值。运行默认值和阈值见 [HOW_TO_DEPLOY](HOW_TO_DEPLOY.md#operations-monitoring)，行为以源码为准。
