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
  card_json TEXT NOT NULL,        -- CardDefinition JSON
  effect_dsl TEXT,                -- v1: 声明式 DSL JSON
  effect_code TEXT,               -- v2: TypeScript 源码
  compiled_code TEXT,             -- v2: 验证后的 JS
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
│  localStorage: llm-api-key              │
│       │                                 │
│       ▼                                 │
│  LLM Service (src/services/llmService)  │
│       │                                 │
│       │  fetch() 直连 (CORS)            │
│       ▼                                 │
│  api.openai.com / api.anthropic.com     │
│                                         │
│  ✗ 绝不经过游戏服务器                      │
└─────────────────────────────────────────┘
```

- API Key 存在 `localStorage('open-agricola-llm-key')` 和 `localStorage('open-agricola-llm-provider')`
- 支持多个 Provider：OpenAI (gpt-4o)、Anthropic (claude-sonnet)、兼容 OpenAI 的自定义端点
- UI 明确展示："代码开源可查，API Key 绝不离开浏览器"

### C2. 系统提示词设计

**结构：基础指令 + 卡牌模式 + Few-shot 示例 + 可用原语**

```markdown
# System Prompt (~2500 tokens)

你是 Open Agricola 的卡牌设计师。你根据用户描述生成符合项目规范的卡牌定义。

## 输出格式
你必须输出一个 JSON 对象，包含以下字段：

{
  "card": {
    "id": "CUSTOM_CardName",
    "name": "卡牌名称",
    "card_type": "minor | occupation",
    "cost": { "wood": 1, "clay": 2 },
    "vp": 0,
    "desc": ["获得 1 <WOOD> 和 1 <CLAY>"],
    "prerequisite": "",
    "modifiers": []
  },
  "effects": {
    "onReturnHome": {
      "optional": true,
      "condition": { "player_has_resource": { "grain": 1 } },
      "flow": [
        { "action": "pay-resources", "params": { "grain": 1 } },
        { "action": "gain", "params": { "food": 3 } }
      ]
    }
  },
  "listeners": [
    {
      "phases": ["after"],
      "actions": ["construct"],
      "scope": "player",
      "flow": [
        { "action": "gain", "params": { "wood": 1 } }
      ]
    }
  ]
}

## 可用资源
wood, clay, reed, stone, food, grain, vegetable, sheep, boar, cattle

## 可用效果触发点 (effects)
onBuy, onRoundStart, onRoundEnd, onHarvest, onReturnHome,
onBeforeFeed, onAfterFeed, onHarvestFieldPhase, onStartHarvestFeedingPhase

## 可用监听器阶段 (listener phases)
before, during, immediatelyAfter, after, computeCosts

## 可用动作 (flow actions)
- gain: 获得资源 { resource: amount }
- pay-resources: 支付资源 { resource: amount }
- bonus-vp: 获得 1 额外分数
- gain-other-players: 从其他玩家处获得 { resource: amount }
- exchange: 交换资源 { from: {...}, to: {...} }

## 修改器类型 (modifiers)
- trade: { appliesTo: ['construct'], from: { wood: 1 }, to: { clay: 2 }, max: 1 }
- bonus: { appliesTo: ['gain'], bonus: { food: 1 } }

## 条件类型 (condition)
- player_has_resource: { resource: min_amount }
- player_has_card: "card_id"
- round_gte: number
- family_size_gte: number

## 设计原则
1. ID 必须以 "CUSTOM_" 开头
2. 保持 Agricola 的平衡性（参考官方卡牌的强度）
3. 费用和收益应合理对应
4. 描述文本使用 <RESOURCE> 标记表示资源图标

## 示例 1: 简单获取类
用户: "一个花 1 木头能额外获得 2 食物的小改进"

{
  "card": {
    "id": "CUSTOM_WoodKitchen",
    "name": "木质厨房",
    "card_type": "minor",
    "cost": { "wood": 1 },
    "vp": 0,
    "desc": ["每次回家时，你可以支付 1 <GRAIN> 获得 3 <FOOD>"]
  },
  "effects": {
    "onReturnHome": {
      "optional": true,
      "condition": { "player_has_resource": { "grain": 1 } },
      "flow": [
        { "action": "pay-resources", "params": { "grain": 1 } },
        { "action": "gain", "params": { "food": 3 } }
      ]
    }
  }
}

## 示例 2: 带修改器的
用户: "建造房间时木头减 1 的职业"

{
  "card": {
    "id": "CUSTOM_Carpenter",
    "name": "木匠",
    "card_type": "occupation",
    "cost": { "food": 1 },
    "vp": 0,
    "desc": ["建造房间时少花 1 <WOOD>"],
    "modifiers": [
      { "type": "trade", "appliesTo": ["construct"],
        "from": { "wood": 1 }, "to": {}, "max": 1 }
    ]
  }
}
```

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

**V1（推荐先做）：声明式 DSL，无代码执行**

LLM 输出 JSON DSL（如上 C2 所示），服务器解析为 `ActionFlow` 节点树。不执行任意代码。DSL 运行器：

```typescript
// shared/cards/custom-dsl-runner.ts
function dslToActionFlow(dsl: DslEffect): ActionFlow {
  return {
    type: 'seq',
    optional: dsl.optional ?? false,
    children: dsl.flow.map(step => ({
      type: 'leaf',
      actionId: step.action,     // 只允许白名单中的 action
      params: step.params,
      sourceCard: cardId,
    }))
  }
}
```

**V2（后续扩展）：AST 验证 + vm 沙盒**

1. 服务器用 TypeScript Compiler API 解析源码
2. AST 遍历，拒绝：`import`（仅允许特定路径）、`eval`、`Function`、`require`、`process`、`fs`、`fetch`、`setTimeout`、`globalThis`
3. 只允许：纯函数、state/player 属性访问、算术、条件、`registerCardEffect`、`registerCardListener`
4. 通过验证后编译为 JS，存入 `compiled_code`
5. 加载时用 `vm.runInContext()` 执行，超时 100ms

---

## D. 工坊架构

### D1. 自定义卡牌注册

新增 `shared/cards/custom-registry.ts`：

```typescript
const customCards = new Map<string, CardBase>()

export function registerCustomCard(card: CardBase, dslEffects?: DslEffects) {
  customCards.set(card.id, card)
  if (dslEffects) {
    // 将 DSL 转化为标准 CardEffect 并注册
    const cardEffect = dslToCardEffect(card.id, dslEffects)
    registerCardEffect(cardEffect)
  }
}

export function getCustomCard(id: string): CardBase | undefined {
  return customCards.get(id)
}
```

现有 `catalog.ts` 的查找函数 fallback 到 custom registry：
```typescript
export function getMinorImprovementCard(id: string) {
  return officialCards.get(id) ?? getCustomCard(id)
}
```

### D2. 游戏中加载自定义卡牌

1. 创建房间时可选 "启用工坊卡牌"
2. `GameSession` 构造时从数据库加载房间关联的自定义卡牌
3. 从 `card_json` 创建 `MinorImprovement`/`Occupation` 实例
4. 从 `effect_dsl` 转化为 `CardEffect` 并注册
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
│   ├── EffectViewer     效果代码/DSL 展示（只读）
│   ├── LikeButton
│   ├── CommentSection
│   └── AddToSandbox
├── CardEditor           创建/编辑自己的卡牌
│   ├── BasicInfoForm    名称/费用/分数/描述
│   ├── EffectEditor     DSL 编辑器 或 代码编辑器
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

| 模块 | 职责 |
|---|---|
| `server/workshop-pr/propose-handler.ts` | 提交流程编排：权限检查、读取 upstream 文件、生成 PR 文件、创建 commit/branch/PR |
| `server/workshop-pr/oauth-handler.ts` | GitHub OAuth start/callback；请求 `repo` scope 以支持 private upstream |
| `server/workshop-pr/github-client.ts` | GitHub REST API 封装；授权用户等于 upstream owner 时跳过 fork，直接推 upstream 分支 |
| `server/workshop-pr/code-gen.ts` | 纯生成器：把 workshop card 转成 community card 文件、测试、注册表和文档 |
| `client/services/workshop-pr.ts` | 前端 propose/OAuth popup helper；relative auth URL 会按 `VITE_API_BASE` 解析到后端域名 |

生成的 PR 文件固定包含：

| 文件 | 说明 |
|---|---|
| `shared/cards/community/{CUSTOM_ID}.ts` | community card 定义和 `CardImpl` |
| `shared/cards/community/__tests__/{CUSTOM_ID}.test.ts` | smoke test：定义存在、`deck === 'community'`、有行为 |
| `shared/cards/register-all.ts` | 注册 `{CUSTOM_ID}_impl` |
| `shared/cards/community/auto-catalog.ts` | 注册 community deck card definition |
| `docs/community_cards.md` | community card 索引；PR 创建后会用真实 PR number 二次提交 |
| `public/card-art/community/{CUSTOM_ID}.{ext}` | 可选，美术二进制 |

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

| 威胁 | 对策 |
|------|------|
| API Key 泄露 | 仅存 localStorage，绝不发送到游戏服务器，UI 明确标示 |
| 密码泄露 | `crypto.scrypt` 哈希，不存明文 |
| Session 劫持 | HTTPS（生产）+ HttpOnly 考虑（当前 Bearer token 简单可行）|
| 暴力破解 | 登录 API 限流：5 次/分钟/IP |
| 恶意卡牌代码 | V1 纯 DSL 无执行；V2 AST 白名单 + vm 沙盒 + 超时 |
| XSS via 卡牌描述 | React 默认转义 HTML；不用 dangerouslySetInnerHTML |
| WebSocket 未认证 | 连接后 5 秒内必须发 auth 消息，否则断开 |

---

## F. 新增依赖

| 依赖 | 用途 | 备注 |
|------|------|------|
| `better-sqlite3` | SQLite 数据库 | 同步 API，适配现有代码风格 |
| `@types/better-sqlite3` | 类型定义 | dev dep |
| `nanoid` | 生成短 ID | 用于 user/card/room ID |

不需要其他依赖。`crypto.scrypt` 和 `crypto.randomUUID` 都是 Node.js 内置。

---

## G. 实施阶段

### Phase 1: 数据库 + 认证
- 添加 `better-sqlite3`，创建 `server/db.ts` (schema 初始化)
- 创建 `server/auth.ts` (register/login/session)
- 添加认证中间件到 `server/index.ts`
- 创建 `src/app/LoginPage.tsx` + `AuthContext`
- 迁移房间持久化：JSON 文件 → SQLite
- WebSocket 认证握手

### Phase 2: 大厅
- 创建 `src/app/LobbyPage.tsx`
- 添加大厅 API 路由
- 创建 `PageRouter` 替代 App.tsx 中的直接渲染
- 房间列表/创建/加入 UI

### Phase 3: 工坊（数据驱动卡牌）
- 工坊 API 路由
- `CustomCardRegistry` + DSL 运行器
- `src/app/WorkshopPage.tsx` (浏览/编辑/沙盒)
- 社交功能（点赞/评论）

### Phase 4: LLM 卡牌设计师
- `src/services/llmService.ts` (浏览器端 LLM 调用)
- 系统提示词模板
- AI 对话式设计 UI
- 卡牌美术生成

### Phase 5: 高级卡牌效果（可选）
- TypeScript AST 验证器
- `vm.runInContext()` 沙盒执行
- 完整 `registerCardEffect`/`registerCardListener` 支持

---

## H. 关键文件清单

**需修改：**
- `server/index.ts` — 添加新路由、认证中间件
- `server/room-manager.ts` — JSON 持久化 → SQLite、认证集成
- `shared/cards/card-effects.ts` — 自定义卡牌 try/catch 包裹
- `shared/cards/catalog.ts` — fallback 到 custom registry
- `src/App.tsx` — 包裹 AuthProvider + PageRouter
- `src/app/GameContainerApi.tsx` — transport 添加 auth token

**需新建：**
- `server/db.ts` — 数据库初始化与迁移
- `server/auth.ts` — 认证逻辑
- `server/workshop.ts` — 工坊 API
- `server/lobby.ts` — 大厅 API
- `shared/cards/custom-registry.ts` — 自定义卡牌注册
- `shared/cards/custom-dsl-runner.ts` — DSL → ActionFlow 转换
- `src/app/LoginPage.tsx` — 登录/注册页
- `src/app/LobbyPage.tsx` — 大厅页
- `src/app/WorkshopPage.tsx` — 工坊页
- `src/app/PageRouter.tsx` — 页面路由
- `src/contexts/AuthContext.tsx` — 认证 Context
- `src/services/llmService.ts` — 浏览器端 LLM 调用

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

> 更新于 2026-03-29

### 已完成

| 功能 | 文件 |
|------|------|
| 注册/登录/登出/会话验证 | `server/auth.ts`, `src/app/LoginPage.tsx`, `src/contexts/AuthContext.tsx` |
| SQLite 数据库 + migration (v1-v3) | `server/db.ts` |
| WebSocket 认证握手 | `server/room-manager.ts`, `shared/protocol/ws.ts` |
| WS 房间 → SQLite 写入 | `server/room-manager.ts` (ensureRoomRowSqlite, upsertRoomPlayer) |
| 服务器重启恢复房间 | `server/room-manager.ts` (restoreRoomsFromSqlite) |
| 游戏状态持久化（JSON/SQLite） | `server/room-manager.ts` (PERSIST_ROOMS 环境变量) |
| 游戏结束更新房间状态 | `server/room-manager.ts` (broadcastState → rooms.status=finished) |
| 房间 TTL 清理 | `server/room-manager.ts` (startRoomCleanup, 30min TTL) |
| 大厅页面 | `src/app/LobbyPage.tsx`, `/api/lobby/my-rooms` |
| 页面路由 (?page=) | `src/app/PageRouter.tsx` |
| URL params 实时读取 | `src/app/GameContainerApi.tsx` (移出模块级) |
| 返回大厅按钮 | `src/components/header/GameHeader.tsx` |
| Dev 模式默认关闭 | `src/app/GameContainerApi.tsx` (?devMode=1) |
| Auth 401 自动登出 | `src/contexts/AuthContext.tsx` (apiFetch) |
| 游戏中玩家名与登录用户同步 | `server/game-session.ts` (updatePlayerName), `server/room-manager.ts`, `server/game-router.ts` |
| 工坊卡牌 CRUD | `server/workshop.ts`, `src/app/WorkshopPage.tsx` |
| 工坊社交（点赞/评论） | `server/workshop.ts` |
| 工坊沙盒 | `server/workshop.ts`, WorkshopPage SandboxView |
| 自定义 DSL 效果系统 | `shared/cards/custom-dsl-runner.ts` |
| 自定义卡牌注册表 + catalog fallback | `shared/cards/custom-registry.ts`, `shared/cards/catalog.ts` |
| 自定义卡牌 try-catch 容错 | `shared/cards/card-effects.ts` (CUSTOM_ 前缀卡牌异常时跳过) |
| DSL 系统单元测试 | `shared/cards/__tests__/custom-dsl-runner.test.ts`, `custom-registry.test.ts` |
| 单人沙盒游戏（含自定义卡牌） | `/api/game/new-sandbox`, `server/game-router.ts` |
| WS 多人游戏含自定义卡牌 | `shared/protocol/ws.ts` (createRoom.customCardIds), `server/room-manager.ts` |
| LLM 卡牌设计师 | `src/app/workshop/AiCardDesigner.tsx`, `src/services/llmService.ts` |
| 多 LLM Provider 支持 | OpenAI / Anthropic / 自定义端点 |
| API Key 浏览器隔离 | localStorage 存储，绝不发往服务器 |
| 卡牌美术生成 + 上传 | DALL-E 3 + `POST /api/workshop/art` + `/card-art/` 静态服务 |
| 资源图标解析 | `src/components/common/ResourceText.tsx` |
| auth/workshop 单元测试 | `server/__tests__/auth.test.ts`, `workshop-api.test.ts` |
| TypeScript AST 验证 + VM 沙盒 | `server/ast-validator.ts`, `server/card-compiler.ts`, WorkshopPage 代码模式 |
| 卡牌版本历史 | `workshop_card_versions` 表, versions/revert API, WorkshopPage 版本面板 |
| 工坊精选页面 | `workshop_cards.featured` 列, admin 精选切换, Featured 标签页 |
| 生产部署 (Docker + GitHub Pages) | `Dockerfile`, `docker-compose.yml`, `.github/workflows/deploy-pages.yml`, `src/config.ts` |
| 管理员角色 | `server/auth.ts` isAdmin(), `ADMIN_USERS` 环境变量 |
| 管理员 API | `GET/DELETE /api/admin/cards`, `GET /api/admin/cards/:id/export`, `POST /api/admin/cards/:id/status`, `GET /api/admin/users` |
| 卡牌发布/取消发布 | `server/workshop.ts` draft→published 状态切换, 详情页发布按钮, 非作者只能看到已发布卡牌 |

### 未完成（可选）

| 功能 | 说明 |
|------|------|
| 邮箱验证 | 注册后验证邮件（需要外部邮件服务）|
