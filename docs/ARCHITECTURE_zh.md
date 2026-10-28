# Open Agricola 架构

[English](ARCHITECTURE.md) | [中文](ARCHITECTURE_zh.md)

> 本文件是中文翻译镜像；[ARCHITECTURE.md](ARCHITECTURE.md) 是唯一权威版本。

> 当前 `main` 的架构地图。本索引只写设计不变量、总体拓扑与分层结构；[`architecture/`](architecture/) 下的每份 module 文档说明该 module 的职责、不变量和 seam，并指向承载细节的入口文件、ADR 和测试。卡牌行为以各卡的测试为准，设计决策见 [`docs/adr/`](adr/)。

## Module 地图

| Module | 文档 | 职责 |
|---|---|---|
| `shared/contract/` | [contract](architecture/contract_zh.md) | 客户端、服务端与沙盒共用的形状：`GameState`、命令、事件、交互与预览 |
| `shared/engine/` | [engine](architecture/engine_zh.md) | 节点树引擎、节点 metadata、`EngineStack` |
| `shared/session/` | [session](architecture/session_zh.md) | `GameCore` 入口、`SessionResponse`、轮转、Turn Scope、恢复 |
| `shared/actions/` | [actions](architecture/actions_zh.md) | 行动定义、effect 与内部行动、农场类提交、anytime 窗口 |
| `shared/actions/payment/` | [payment](architecture/payment_zh.md) | `ComplexCost`、固定管线、候选闭包、收据 |
| `shared/actions/` hook | [hooks](architecture/hooks_zh.md) | Hook 注册表、行动执行顺序、Stage Dispatch、listener 纯度 |
| `shared/cards/` | [cards](architecture/cards_zh.md) | Card Source、生成目录、`cardStates`、Card Field、能力 metadata |
| `shared/domain/` | [domain](architecture/domain_zh.md) | `PlayerBoard`、农场、动物、计分、大改良供应 |
| `shared/draft/`、`shared/custom-code/`、游戏变体、`i18n`、`utils` | [shared-other](architecture/shared-other_zh.md) | 同时选牌、游戏变体、工坊准入、本地化、工具函数 |
| `server/` | [server](architecture/server_zh.md) | 连接、Room、Durable Room Commit、Replay、Bug Report、工坊后端、持久化、运维 |
| `operations/` | [服务端部署边界](architecture/server_zh.md#部署回滚与可观测性) | 独立监控部署和受限账户聚合 |
| `client/` | [client](architecture/client_zh.md) | Bundle、传输与同步状态、视图、Replay Viewer、Bug Report |
| 测试与门禁 | [testing](architecture/testing_zh.md) | 测试分层与架构门禁 |

每份 module 文档旁都有中文镜像（`<module>_zh.md`）；英文版是唯一权威版本。

---

## 设计目标与不变量

主链路 = **WebSocket 房间对局 + 后端权威 + 前端被动渲染**；HTTP 用于启动、调试、运维、测试，以及版本化的 Game Context、Replay 和 Bug Report 产品接口。

不变量（违反即架构 bug）：

- **后端唯一 owner**：`GameSession`（`server/game/authoritative-session.ts`）是唯一服务端游戏命令入口并持有 `GameState`；具体修改由它驱动的 `GameCore` 和 action leaf 执行。
- **命令驱动**：前端只发"我要做什么"，后端校验、执行、落状态、产生日志后广播。
- **弱客户端**：前端只渲染、收集输入、管理本地 UI 临时态，不裁定规则，也不做乐观提交：等 `stateUpdate` 到达再改游戏 UI。
- **全量快照**：同房间所有客户端收到同一份 `stateUpdate`，前端不做局部 patch。
- **WS 游戏主链路**：`/ws` 收 `ClientCommand`，发 `StateUpdateEnvelope`。
- **InteractionState 是前端唯一交互真相**：`stateId ∈ {idle, wait, gameover}`；`wait` 下用 `request.kind` 分流。
- **单一领域实现**：行动 / 引擎 / 卡牌 / 回合 / 收获 / 计分统一放 `shared/`，前后端共用同一套领域模型。
- **三层物理边界**：`shared/` ⇄ `server/` ⇄ `client/` 由 ESLint `architecture/imports` 强制（CI error）；不引入循环依赖。
- **client bundle 边界**：`client-app` 不引 `shared/{engine,session,actions,cards,custom-code,draft}`；sandbox 和 Worker 仅按 `scripts/architecture-policy.mjs` 中的精确入口及文件授权。
- **节点树是唯一状态机**："等什么"由 `engine.peekPendingEnvelope()` / pending host 派生。
- **flow 只经引擎 seam 进入**：`EngineStack.push` / `pop` 创建与离开嵌套 frame，`Engine.injectBeforeFlows()` 把 hook 与 anytime flow 插入当前 frame。不直接改 `pending`。
- **ActionFlow 对齐参考实现小代数**：卡牌 DSL 只暴露 `leaf / seq / parallel / xor / or` + metadata；runtime-only node 不进入卡牌 flow。
- **listener 契约**：注册必须显式声明封闭契约内的目标和阶段，可执行的内部动作不自动获得订阅资格；注册后的筛选条件为脱离输入的不可变快照。listener / preview / doable 路径只 build flow 或返回结构化结果；状态修改必须落在 action leaf 执行阶段。
- **卡牌就地闭环**：卡牌在 `shared/cards/{Deck}/{Card}.ts` 内部完成；`shared/actions/effects/pay.ts` / `shared/actions/effects/improvement.ts` / `shared/session/session-core.ts` / `server/game/authoritative-session.ts` 等核心文件不为单卡修改。新增 Hook 点必须同时补测试和文档。
- **cardStates 局部状态**：持续计数 / 标记写 `player.cardStates[cardId]`；后续选择走显式 `pending` / continuation。
- **Supply token 也是支付资源**：fence / stable 这类玩家 supply 上限不能写死为 15 / 4；读取必须走 supply-token helper 或 payment resource pipeline。
- **Durable Room Commit**：成功且改变公开 Frame 或 Private Session Cursor 的命令，以及任何带 `durableTransition` 标记的响应，先原子写 Room snapshot + Replay Step，随后才按座位视角发送。
- **Replay 全局 Step**：多人同时提交仍占用连续 `stepNo`；自动结算属于最后触发输入，结果不得依赖到达顺序。
- **失败不扩散**：命令错误只回发起者；durable rejection 仍向其他座位发送已提交版本的无错快照。持久化失败冻结同一 Frame 并阻断 Room，不覆盖或继续推进。
- **Room 上限**：单实例最多准入 30 个有 OPEN 玩家连接或有效 30 秒准入预留的普通 Room。离线存档与缓存 Room 不占在线配额。独立的 15 个 Worker 槽仍计入保留的 executor；新准入和 `newGame` 一换一替换同时遵守这两类限制。
- **历史 Viewer 不可变**：Room 锁定 schema/build，完成回放由 credentialless 只读 Viewer 读取，不执行历史规则代码。
- **测试默认 2 人游戏**：规则正确性站后端边界，不通过 DOM 反推规则。

---

## 总体拓扑

```text
浏览器窗口 p1 / p2 / p3 / p4
        │
        │ WebSocket /ws            ← 主链路
        ▼
server/connection/ws-server.ts
  ├─ 连接生命周期 / auth
  ├─ 命令路由
  └─ 广播 StateUpdateEnvelope
        │
        ▼
server/game/{room.ts, room-registry.ts, lobby.ts}
        │
        ▼
server/game/authoritative-session.ts (GameSession extends GameCore)
  ├─ 唯一服务端游戏命令入口和 GameState owner
  ├─ 继承 GameCore（GameCore 持有 EngineStack）
  ├─ undo 历史 / 行动起点快照
  └─ 计算 InteractionState、scores
        │
        ├─→ shared/session/ (GameCore, phases/)
        ├─→ shared/engine/  (Engine, EngineStack, nodes/)
        ├─→ shared/actions/ (effects/, payment/, hooks)
        ├─→ shared/cards/   (deck A..E、M、major、community)
        └─→ shared/domain/  (PlayerBoard, farmyard, scoring, ...)
        │
        ▼
server/game/persistence/
  ├─ postgres-adapter.ts (DATABASE_URL)
  └─ memory-adapter.ts   (测试)
```

HTTP 入口 `server/game-router.ts`（`/api/*`）保留：健康检查 / 房间列表 / 快照补拉 / 测试夹具 / dev 调试 / sandbox 创建。

---

## 三层结构与目录骨架

```
shared/        零 React，前后端 + sandbox 共用
├── contract/      协议层（GameState、InteractionState、ClientCommand、StateUpdateEnvelope）
├── engine/        节点树引擎 + EngineStack
├── session/       GameCore + phases/（setup, round, harvest, draft）
├── actions/       行动定义、effects/、payment/、Hook 系统
├── cards/         Card Source（按 deck A–E、M、major、community 分目录，单卡 meta + impl）
├── domain/        领域聚合层（PlayerBoard、farmyard、pasture、scoring、...）
├── draft/         simultaneous 卡牌选择
├── custom-code/   自定义卡牌 AST 校验
├── i18n/          多语 key
└── utils/         通用工具

server/        Node 进程（HTTP + WS + persistence + custom-code 隔离）
├── index.ts             装配 HTTP + WS + DB + 静态资源
├── connection/          WS 连接层（ws-server, room-router, broadcaster）
├── game/                Room、GameSession、Lobby、RoomRegistry
│   └── persistence/     sqlite / json / memory adapter
├── game-router.ts       HTTP /api/* 路由
├── auth.ts              站点登录与 OAuth（GitHub、Google）
├── workshop.ts          Workshop / Sandbox 后端
├── workshop-pr/         Workshop PR 集成
├── custom-code/         自定义代码隔离执行（engine、runtime、executor-worker）
├── payload-validation.ts  纯校验（不写状态）
└── db.ts                PostgreSQL 连接

client/        浏览器 React UI
├── app/                 顶层路由 + 页面（GameContainerApi、LobbyPage、...）
├── components/          board/、interaction/、common/、header/
├── contexts/            AuthContext、LocaleContext
├── hooks/               useGameSync、useFarmSelection 等
├── services/            gameTransport、card-meta、rehydrate、llm/generation
├── sandbox/             懒加载的工坊沙盒 UI
└── types/、utils/、styles/、assets/、config.ts、main.tsx

e2e-tests/     Playwright 浏览器测试
```

ESLint 三层强制（`eslint.config.js`）：
- `client/{app,components,services,hooks,contexts,utils}/**` 禁 import `shared/session`、`shared/engine`、card source、card generated catalog 和 per-card impl modules；UI metadata 必须走 `public/cards-manifest.json` + `client/services/card-meta`
- 特权入口和 Worker 文件精确列于 `scripts/architecture-policy.mjs`；普通页面和回放不保留规则运行时例外
- 统一解析后的 import 规则覆盖静态导入、重导出、字面量动态导入与 require，避免 flat config 覆盖
- violation = CI error

---
