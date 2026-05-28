# Open Agricola 平台扩展 — 设计文档

## Context

当前 Open Agricola 是一个纯游戏引擎：无用户系统、无数据库、无大厅、无自定义卡牌。目标是将其扩展为一个完整平台，支持注册登录、游戏大厅、数据库持久化、卡牌工坊（含 LLM 辅助设计），同时保持现有的后端权威架构和代码风格。

---

## A. 架构选型

### A1. 数据库：SQLite (better-sqlite3)

**为什么选 SQLite 而非 Postgres/MongoDB：**

- 单服务器 indie 项目，SQLite 零运维（无守护进程、无连接池、无 Docker 服务）
- 当前代码已用同步 `readFileSync`/`writeFileSync` 持久化，`better-sqlite3` 同步 API 天然适配
- 游戏状态是复杂嵌套 JSON — SQLite 的 `json_extract` 支持 JSON 列存储+查询
- 社交功能（点赞/评论）是关系型数据，SQLite 在这个规模完全胜任
- 备份 = 复制单个 `.db` 文件

**数据库文件位置：** `./data/open-agricola.db`

**Schema 设计：**

```sql
-- 用户
CREATE TABLE users (
  id TEXT PRIMARY KEY,            -- nanoid
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,    -- crypto.scrypt
  created_at INTEGER NOT NULL,
  last_login_at INTEGER
);

-- 会话
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,         -- crypto.randomUUID
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- 游戏房间（替代当前 JSON 文件持久化）
CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  created_by TEXT REFERENCES users(id),
  state_json TEXT,                -- SerializedGameState JSON
  max_players INTEGER DEFAULT 2,
  status TEXT DEFAULT 'waiting',  -- waiting | playing | finished
  version INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 房间玩家
CREATE TABLE room_players (
  room_id TEXT NOT NULL REFERENCES rooms(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  player_index INTEGER NOT NULL,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (room_id, user_id)
);

-- 工坊卡牌
CREATE TABLE workshop_cards (
  id TEXT PRIMARY KEY,            -- nanoid
  author_id TEXT NOT NULL REFERENCES users(id),
  card_id TEXT NOT NULL,          -- e.g. "CUSTOM_FireDragon"
  card_type TEXT NOT NULL,        -- 'minor' | 'occupation'
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  card_json TEXT NOT NULL,        -- CardDefinition JSON（含 CARD_DEF + CARD_IMPL TypeScript 源码）
  -- effect_dsl / effect_code / compiled_code 历史字段，migration v7 已 DROP
  art_url TEXT,
  art_prompt TEXT,
  status TEXT DEFAULT 'draft',    -- draft | published | flagged
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 点赞
CREATE TABLE card_likes (
  user_id TEXT NOT NULL REFERENCES users(id),
  card_id TEXT NOT NULL REFERENCES workshop_cards(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

-- 评论
CREATE TABLE card_comments (
  id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL REFERENCES workshop_cards(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- 沙盒（用户收藏的自定义卡牌）
CREATE TABLE sandbox_cards (
  user_id TEXT NOT NULL REFERENCES users(id),
  workshop_card_id TEXT NOT NULL REFERENCES workshop_cards(id),
  added_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, workshop_card_id)
);
```

### A2. 认证：服务端 Session Token

**不用 JWT，不用 OAuth — 保持简单：**

- 注册：username + password，`crypto.scrypt` 哈希（Node.js 内置，不加依赖）
- 登录：返回不透明 session token（`crypto.randomUUID()`），存入 `sessions` 表，7 天过期
- Token 通过 `Authorization: Bearer <token>` 发送
- WebSocket 连接后首条消息必须是 `{ type: 'auth', token: '...' }`
- 单服务器不需要 JWT 的无状态优势；服务端 session 支持即时吊销

### A3. 前端路由：URL 参数 + PageRouter 组件

**不引入 react-router** — 保持现有 URL 参数风格：

添加 `?page=` 参数：

- `?page=login` → 登录/注册页
- `?page=lobby` → 大厅（登录后默认）
- `?page=workshop` → 工坊模式
- `?page=game&room=xxx` → 游戏（现有 GameContainerApi）
- 无 `?page=` 且未登录 → 重定向到 login

```
App.tsx
  → AuthProvider (React Context)
    → PageRouter (读取 ?page= 参数)
       → LoginPage | LobbyPage | WorkshopPage | GameContainerApi
```

### A4. 状态管理：保持 Hooks，加 AuthContext

不引入 Redux/Zustand：

- 新增 `AuthContext`：提供 `{ user, token, login, logout, register }`
- 工坊页面用 `useState` + fetch，和游戏现有风格一致
- `GameTransport` 构造器加可选 `token` 参数

---

## B. 部署模式设计

### B1. 单进程服务器扩展

保持 `server/index.ts` 的 raw Node.js HTTP 服务器，扩展路由：

```
/api/auth/register       POST   注册
/api/auth/login          POST   登录
/api/auth/logout         POST   登出
/api/auth/me             GET    获取当前用户

/api/lobby/rooms         GET    房间列表
/api/lobby/create        POST   创建房间

/api/workshop/cards      GET    卡牌列表（分页/搜索/排序）
/api/workshop/cards/:id  GET    卡牌详情
/api/workshop/cards      POST   创建/更新卡牌
/api/workshop/cards/:id/like     POST  点赞/取消
/api/workshop/cards/:id/comments GET   评论列表
/api/workshop/cards/:id/comments POST  添加评论
/api/workshop/sandbox    GET/POST/DELETE  沙盒管理

/api/game/*              (现有路由)
/ws                      (现有 WebSocket，加认证握手)
```

### B2. 开发环境

- `restart-intranet.sh` 无需修改 — 数据库初始化在服务器启动时自动完成（`CREATE TABLE IF NOT EXISTS`）
- SQLite 文件位于 `./data/open-agricola.db`，加入 `.gitignore`
- 迁移策略：服务器启动时检查 schema 版本，自动执行 pending migrations

### B3. 生产部署

单机部署即可：

- Node.js 进程 (backend + WebSocket) + Vite build 的静态文件
- SQLite 文件持久化到磁盘
- 可选 Nginx 反代前端静态文件 + WebSocket 代理
- 如果未来需要扩展，SQLite → PostgreSQL 迁移路径清晰（SQL 语法兼容度高）

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

**源文件**：`client/services/llmPrompts.ts`（`CARD_DESIGNER_SYSTEM_PROMPT`）。以下是其结构摘要；以源文件为准。

**结构：角色定义 + 输出格式 + 关键规则 + CARD_IMPL 结构详解 + effect hook 表 + listener 机制 + ActionFlow 类型 + 可用 helper + 可读 state/player 字段 + 沙盒限制 + 设计平衡参考 + 游戏规则速览 + few-shot 示例**

---

#### 输出格式

LLM 每次回复**必须**包含一个 `` ```typescript `` 代码块，使用 `CARD_DEF` + `CARD_IMPL` 双常量结构（不使用 import / export）：

```typescript
const CARD_ID = 'CUSTOM_英文驼峰名'

const CARD_DEF = new MinorImprovement({   // 或 new Occupation({...})
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
})

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

可监听的 `actions`：`collect`、`gain`、`receive`、`plow`、`sow`、`construct`、`renovate-house`、`fence`、`stables`、`improvement-any`、`minor-improvement`、`occupation`、`place-farmer`、`wish-children`、`family-growth`、`bake-bread`。

#### 可用 actionId（ActionFlow leaf）

`gain`、`pay-resources`、`bonus-vp`、`gain-other-players`、`bake-bread`、`store-on-card`、`take-from-card`、`push-card-stack`、`write-card-extra-data`、`hold-worker-on-card`、`release-worker-from-card`。

#### 沙盒注入 helper

`gainLeaf(cardId, {food:2})`、`payLeaf({cardId, cost:{wood:1}})`、`spaceHasPlayer(space, playerId)`、`positionKey({x,y})`、`getCardStack(player, cardId)`、`readCardExtraData(player, cardId)`。

#### 设计平衡参考

1 food ≈ 最弱收益；`onRoundStart` 每轮触发应偏弱；`bonus-vp` 很强需成本或严格条件；`onBuy` 只触发一次可稍强。

#### few-shot 示例来源

系统提示词末尾附加 `docs/community-card-examples.md`（原始 Markdown 通过 Vite `?raw` 导入），作为 few-shot 示例库随提示词一起发送给 LLM。

### C3. 多轮对话设计

- 对话历史存在 React state 中
- 每轮追加用户反馈 + LLM 响应
- LLM 看到完整对话历史，支持迭代：
  - "把费用降低一点"
  - "加一个收获时的效果"
  - "参考官方的 Ale Benches 风格"
- 前端从每条响应中提取最后一个 JSON 代码块作为当前版本

### C4. 卡牌美术生成

图片生成使用单独的 prompt，调用 DALL-E / Stable Diffusion API：

```
Generate a card illustration for a medieval farming board game.
Style: Watercolor, warm earth tones, medieval European pastoral setting.
Card name: "{name}"
Card description: "{desc}"
Single centered illustration, no text, no borders, square format.
```

美术 URL 存储为 base64 data URL 或上传到服务器 `/data/card-art/` 目录。

### C5. LLM 生成代码的安全验证

LLM 输出 **TypeScript 源码**（包含 `CARD_DEF` 定义、`CARD_IMPL.effect` hook 回调、`CARD_IMPL.listeners` 监听器）。后端三步走：验证 → 编译 → 沙盒执行。

**1. AST 验证** — `shared/custom-code/ast-validator.ts`

用 TypeScript Compiler API 解析源码，AST 遍历拒绝以下构造：

- **语句级**：`import` 声明、`export` 声明、动态 `import()`、`require()` 调用、class 声明 / 表达式、`with` 语句、generator 函数
- **标识符黑名单**（裸引用）：`eval`、`Function`、`process`、`require`、`globalThis`、`global`、`window`、`document`、`__dirname`、`__filename`、`fetch`、`XMLHttpRequest`、`WebSocket`、`setTimeout`、`setInterval`、`setImmediate`、`clearTimeout`、`clearInterval`、`Deno`、`Bun`、`Proxy`、`Reflect`
- **属性访问黑名单**（`obj.X` 或 `obj['X']`）：`constructor`、`__proto__`、`__defineGetter__`、`__defineSetter__`、`__lookupGetter__`、`__lookupSetter__`
- **CARD_IMPL 白名单验证**：`CARD_IMPL.effect` 的 key 只允许 `cardEffectHooks` 中的 hook 名；`CARD_IMPL.listeners[].phases` 只允许 `actionHookPhases` 中的 phase 名

**注**：AST 验证是用户友好的错误提示层；真正的安全边界是 isolated-vm（独立 V8 堆）。

**2. 编译** — `server/custom-code/compiler.ts`

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

`shared/cards/custom-registry.ts`：

```typescript
const customCards = new Map<string, CardBase>()

export function registerCustomCard(card: CardBase) {
  customCards.set(card.id, card)
  // effect 和 listener 通过 server/custom-code/runtime.ts 在加载时动态注入，不在此处注册
}

export function getCustomCard(id: string): CardBase | undefined {
  return customCards.get(id)
}
```

`shared/cards/catalog.ts` 的查找函数 fallback 到 custom registry：

```typescript
export function getMinorImprovementCard(id: string) {
  return officialCards.get(id) ?? getCustomCard(id)
}
```

### D2. 游戏中加载自定义卡牌

1. 创建房间时可选 "启用工坊卡牌"（WS `createRoom.customCardIds` / HTTP `/api/game/new-sandbox`）
2. `GameSession` 构造时从数据库加载房间关联的自定义卡牌
3. 从 `card_json` 反序列化为 `MinorImprovement`/`Occupation` 实例，调用 `registerCustomCard()`
4. `server/custom-code/runtime.ts` 的 `registerExecutorBackedCustomCard()` 从 `card_json` 中的编译产物 + manifest 注入 effect hook 和 listener，通过 `invokeCustomCodeEffectSync` / `invokeCustomCodeListenerSync` 委托给 Worker Thread + isolated-vm 执行
5. 将自定义卡牌 ID 加入发牌池

### D3. 沙盒隔离与容错

- 所有自定义卡牌效果/监听器调用包裹在 try/catch 中
- 异常时：记录错误、跳过该效果、游戏继续
- `vm.runInContext()` 设 `timeout: 100ms` 防止死循环
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
├── CardEditor           创建/编辑自己的卡牌
│   ├── BasicInfoForm    名称/费用/分数/描述
│   ├── EffectEditor     TypeScript 代码编辑器
│   ├── AiCardDesigner   LLM 对话式设计
│   └── PreviewPanel     实时预览卡牌外观
└── SandboxView          我的沙盒
    ├── SelectedCards     已选的自定义卡牌列表
    └── TestGameButton   "开始沙盒测试" → 创建含自定义卡牌的单人游戏
```

### D5. Workshop → GitHub PR 流程

卡牌工坊支持把用户发布的设计提交为主仓库的 community card PR。入口在卡牌详情页：

1. 用户必须登录，且是该工坊卡牌作者或管理员。
2. 卡牌必须先发布；草稿状态只显示提示，不允许发起 PR。
3. 前端调用 `POST /api/workshop/cards/:id/github/propose`。
4. 如果服务端没有当前会话对应的 GitHub token，会返回 OAuth start URL；前端用 popup 打开，并等待 callback 页面通过 `postMessage({ type: 'workshop-pr-oauth', ... }, '*')` 通知授权完成。
5. 授权完成后前端重试 propose 请求，服务端创建/更新分支并打开或更新 PR。

服务端核心模块：


| 模块                                      | 职责                                                                         |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `server/workshop-pr/propose-handler.ts` | 提交流程编排：权限检查、读取 upstream 文件、生成 PR 文件、创建 commit/branch/PR                    |
| `server/workshop-pr/oauth-handler.ts`   | GitHub OAuth start/callback；请求 `repo` scope 以支持 private upstream           |
| `server/workshop-pr/github-client.ts`   | GitHub REST API 封装；授权用户等于 upstream owner 时跳过 fork，直接推 upstream 分支          |
| `server/workshop-pr/code-gen.ts`        | 纯生成器：把 workshop card 转成 community card 文件、测试、注册表和文档                        |
| `client/services/workshop-pr.ts`        | 前端 propose/OAuth popup helper；relative auth URL 会按 `VITE_API_BASE` 解析到后端域名 |


生成的 PR 文件固定包含：


| 文件                                                     | 说明                                          |
| ------------------------------------------------------ | ------------------------------------------- |
| `shared/cards/community/{CUSTOM_ID}.ts`                | community card 定义和 `CardImpl`               |
| `shared/cards/community/__tests__/{CUSTOM_ID}.test.ts` | smoke test：定义存在、`deck === 'community'`、有行为  |
| `shared/cards/register-all.ts`                         | 注册 `{CUSTOM_ID}_impl`                       |
| `shared/cards/community/auto-catalog.ts`               | 注册 community deck card definition           |
| `docs/community_cards.md`                              | community card 索引；PR 创建后会用真实 PR number 二次提交 |
| `public/card-art/community/{CUSTOM_ID}.{ext}`          | 可选，美术二进制                                    |


生成器会做必要规范化，避免用户在沙盒中能跑但 PR CI 不通过：

- `deck: 'CUSTOM'` 会转换为 `deck: 'community'`。
- `CARD_IMPL` 会补上 `CardImpl` 上下文类型，避免 listener phase/action 字面量退化成 `string[]`。
- 缺失 `id` 的 listener 会补稳定 id：`{cardId}-listener-{n}`。
- `prerequisite: { occupation: N }` 会转为仓库支持的 `prerequisite: 'N Occupations'` + `occupationPrerequisites: { min: N }`。
- 同步更新 `auto-catalog.ts`，保证 `pnpm run check:community-deck` 不报 out-of-sync。

### D6. 卡牌详情、版本历史和编辑回填

卡牌详情页使用 URL 参数表达当前卡牌：`?page=workshop&card=<workshop-card-id>`。点击卡牌进入详情时使用 `pushState`，返回列表或切换首页时用 `replaceState`，并监听 `popstate` 支持浏览器前进/后退。

版本历史面板读取 `GET /api/workshop/cards/:id/versions`。该路由必须精确匹配，不能被 `GET /api/workshop/cards` 的列表路由吞掉。前端面板需要有 loading/error/empty 状态，避免接口失败时整页空白。

详情页点击"编辑"会切到 `CardEditor`，并把选中的 `WorkshopCard` 作为 `initialCard` 传给 `AiCardDesigner`。AI 设计器用该初始卡填充当前设计，用户可以从已有卡牌继续修改。

---

## E. 安全设计


| 威胁            | 对策                                           |
| ------------- | -------------------------------------------- |
| API Key 泄露    | 仅存 localStorage，绝不发送到游戏服务器，UI 明确标示           |
| 密码泄露          | `crypto.scrypt` 哈希，不存明文                      |
| Session 劫持    | HTTPS（生产）+ HttpOnly 考虑（当前 Bearer token 简单可行） |
| 暴力破解          | 登录 API 限流：5 次/分钟/IP                          |
| 恶意卡牌代码        | AST 白名单（拒绝 import/export/eval/process/fetch/setTimeout/Proxy/Reflect/class 等 20+ 标识符）+ isolated-vm（独立 V8 堆，非 node:vm）+ Worker Thread + 执行超时 100 ms / 内存上限 8 MB + 状态快照可回滚 |
| XSS via 卡牌描述  | React 默认转义 HTML；不用 dangerouslySetInnerHTML   |
| WebSocket 未认证 | 连接后 5 秒内必须发 auth 消息，否则断开                     |


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

**需修改：**

- `server/index.ts` — 添加新路由、认证中间件
- `server/room-manager.ts` — JSON 持久化 → SQLite、认证集成
- `shared/cards/card-effects.ts` — 自定义卡牌 try/catch 包裹
- `shared/cards/catalog.ts` — fallback 到 custom registry
- `client/App.tsx` — 包裹 AuthProvider + PageRouter
- `client/app/GameContainerApi.tsx` — transport 添加 auth token

**需新建：**

- `server/db.ts` — 数据库初始化与迁移
- `server/auth.ts` — 认证逻辑
- `server/workshop.ts` — 工坊 API
- `server/lobby.ts` — 大厅 API
- `shared/cards/custom-registry.ts` — 自定义卡牌注册
- `shared/custom-code/ast-validator.ts` — TypeScript AST 白名单验证
- `shared/custom-code/types.ts` — custom card source / compiled 类型契约（`CustomCodeManifest`、`CustomCodeValidateResult` 等）
- `server/custom-code/compiler.ts` — TS 源码 → CommonJS JS 编译（`ts.transpileModule`）
- `server/custom-code/engine.ts` — 验证 + 编译 + manifest 提取；isolated-vm 执行（主线程路径）
- `server/custom-code/client.ts` — Worker Thread 客户端；`SharedArrayBuffer + Atomics` 同步调用
- `server/custom-code/executor-worker.ts` — Worker Thread 入口；处理 `invokeEffect` / `invokeListener` 消息
- `server/custom-code/isolate-runner.ts` — isolated-vm 执行核心（Worker Thread 内，无项目模块依赖）
- `server/custom-code/runtime.ts` — `registerExecutorBackedCustomCard()`：挂载 effect hook + listener 到 CardRegistry
- `server/custom-code/injected-helpers.ts` — 注入沙盒的辅助 API（`gainLeaf`、`payLeaf` 等）
- `client/app/LoginPage.tsx` — 登录/注册页
- `client/app/LobbyPage.tsx` — 大厅页
- `client/app/WorkshopPage.tsx` — 工坊页
- `client/app/PageRouter.tsx` — 页面路由
- `client/contexts/AuthContext.tsx` — 认证 Context
- `client/services/llmService.ts` — 浏览器端 LLM 调用

---

## I. 验证方式

- **认证**：手动注册 → 登录 → 检查 session token → 刷新页面保持登录
- **大厅**：创建房间 → 另一浏览器加入 → 游戏开始
- **持久化**：游戏中途刷新 → 状态恢复 → 重启服务器 → 状态恢复
- **工坊**：创建自定义卡牌 → 发布 → 另一用户浏览/点赞/评论 → 加入沙盒
- **LLM 设计**：输入 API key → 描述卡牌 → 预览 → 迭代修改 → 保存
- **沙盒测试**：选中自定义卡牌 → 创建测试游戏 → 卡牌在游戏中正常触发
- **安全**：确认 API key 不出现在任何网络请求中（DevTools Network 检查）

---

## J. 实现状态（platform 分支）

> 更新于 2026-05-09

### 已完成


| 功能                             | 文件                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| 注册/登录/登出/会话验证                  | `server/auth.ts`, `client/app/LoginPage.tsx`, `client/contexts/AuthContext.tsx`                                                    |
| SQLite 数据库 + migration (v1-v3) | `server/db.ts`                                                                                                               |
| WebSocket 认证握手                 | `server/room-manager.ts`, `shared/protocol/ws.ts`                                                                            |
| WS 房间 → SQLite 写入              | `server/room-manager.ts` (ensureRoomRowSqlite, upsertRoomPlayer)                                                             |
| 服务器重启恢复房间                      | `server/room-manager.ts` (restoreRoomsFromSqlite)                                                                            |
| 游戏状态持久化（JSON/SQLite）           | `server/room-manager.ts` (PERSIST_ROOMS 环境变量)                                                                                |
| 游戏结束更新房间状态                     | `server/room-manager.ts` (broadcastState → rooms.status=finished)                                                            |
| 房间 TTL 清理                      | `server/room-manager.ts` (startRoomCleanup, 30min TTL)                                                                       |
| 大厅页面                           | `client/app/LobbyPage.tsx`, `/api/lobby/my-rooms`                                                                               |
| 页面路由 (?page=)                  | `client/app/PageRouter.tsx`                                                                                                     |
| URL params 实时读取                | `client/app/GameContainerApi.tsx` (移出模块级)                                                                                       |
| 返回大厅按钮                         | `client/components/header/GameHeader.tsx`                                                                                       |
| Dev 模式默认关闭                     | `client/app/GameContainerApi.tsx` (?devMode=1)                                                                                  |
| Auth 401 自动登出                  | `client/contexts/AuthContext.tsx` (apiFetch)                                                                                    |
| 游戏中玩家名与登录用户同步                  | `server/game-session.ts` (updatePlayerName), `server/room-manager.ts`, `server/game-router.ts`                               |
| 工坊卡牌 CRUD                      | `server/workshop.ts`, `client/app/WorkshopPage.tsx`                                                                             |
| 工坊社交（点赞/评论）                    | `server/workshop.ts`                                                                                                         |
| 工坊沙盒                           | `server/workshop.ts`, WorkshopPage SandboxView                                                                               |
| 自定义卡牌注册表 + catalog fallback    | `shared/cards/custom-registry.ts`, `shared/cards/catalog.ts`                                                                 |
| 自定义卡牌 try-catch 容错             | `shared/cards/card-effects.ts` (CUSTOM_ 前缀卡牌异常时跳过)                                                                           |
| 单人沙盒游戏（含自定义卡牌）                 | `/api/game/new-sandbox`, `server/game-router.ts`                                                                             |
| WS 多人游戏含自定义卡牌                  | `shared/protocol/ws.ts` (createRoom.customCardIds), `server/room-manager.ts`                                                 |
| LLM 卡牌设计师                      | `client/app/workshop/AiCardDesigner.tsx`, `client/services/llm/`（多 provider 聚合层）                                            |
| 多 LLM Provider 支持              | Gemini / OpenRouter / DeepSeek / AiHubMix；完整模型表见 §C1.1                                                                       |
| API Key 浏览器隔离                  | localStorage 存储，绝不发往服务器                                                                                                      |
| 卡牌美术生成 + 上传                    | Gemini / OpenRouter / AiHubMix 图片模型 + `POST /api/workshop/art` + `/card-art/` 静态服务                                           |
| 资源图标解析                         | `client/components/common/ResourceText.tsx`                                                                                     |
| auth/workshop 单元测试             | `server/__tests__/auth.test.ts`, `workshop-api.test.ts`                                                                      |
| TypeScript AST 验证 + isolated-vm 沙盒 | `shared/custom-code/ast-validator.ts`, `server/custom-code/{compiler, engine, client, executor-worker, isolate-runner, runtime, injected-helpers}.ts` |
| 卡牌版本历史                         | `workshop_card_versions` 表, versions/revert API, WorkshopPage 版本面板                                                           |
| 工坊精选页面                         | `workshop_cards.featured` 列, admin 精选切换, Featured 标签页                                                                        |
| 生产部署 (Docker + GitHub Pages)   | `Dockerfile`, `docker-compose.yml`, `.github/workflows/deploy-pages.yml`, `client/config.ts`                                    |
| 管理员角色                          | `server/auth.ts` isAdmin(), `ADMIN_USERS` 环境变量                                                                               |
| 管理员 API                        | `GET/DELETE /api/admin/cards`, `GET /api/admin/cards/:id/export`, `POST /api/admin/cards/:id/status`, `GET /api/admin/users` |
| 卡牌发布/取消发布                      | `server/workshop.ts` draft→published 状态切换, 详情页发布按钮, 非作者只能看到已发布卡牌                                                             |


### 未完成（可选）


| 功能   | 说明                |
| ---- | ----------------- |
| 邮箱验证 | 注册后验证邮件（需要外部邮件服务） |

