# AGENTS

本仓库的通用协作说明。Claude Code / Cursor / Codex 等 agent 读 `CLAUDE.md`（软链到本文件）。

## 项目概述

Open Agricola——React + TypeScript + Vite 前端 + Node.js WebSocket/HTTP 后端的 Agricola 桌游在线实现。后端权威状态 + 实时多人同步，附带 LLM 辅助卡牌工坊和用户认证。

## 架构基线

- 遇到不确定的实现，优先参考 `output/bga-agricola`，除非 `docs/ENGINE_ARCHITECTURE.md` 已明确给出不同设计。
- 主设计以 `docs/ENGINE_ARCHITECTURE.md` 为准：
  - WebSocket 房间对局是主链路
  - 后端 `GameSession` 持有唯一权威 `GameState`
  - 前端只负责渲染、输入收集和视角化展示，不负责规则裁定
  - HTTP 主要用于调试、补拉快照、测试辅助和兼容接口
- 与游戏规则相关的实现优先放在 `shared/` + `server/`，不要在前端 UI 补规则逻辑。

## 三层设计

```
shared/    纯领域逻辑（无 React、无 Node API），前后端共用
server/    后端：HTTP + WebSocket 服务，权威状态
src/       前端：React UI、transport 抽象、hooks
```

## 架构详解

### 后端权威模式

`GameSession`（`server/game-session.ts`）是 `GameState` 的**唯一写入者**。所有状态变更流经它：

1. 客户端通过 WS（或调试用 HTTP）发送 `ClientCommand`
2. `RoomManager` 把命令路由到房间的 `GameSession`
3. `GameSession` 执行命令，返回 `SessionResponse`（`ok`、`state`、`pending`、`scores` 等）
4. `RoomManager` 把状态序列化为 `StateUpdateEnvelope`，广播完整快照给所有客户端
5. 前端接收快照，水合状态，重渲染

不做乐观更新——前端总是等服务端确认。

### Flow Engine（`shared/engine/`）

行动以节点树（类行为树）执行。关键节点：

- `SequenceNode`、`ParallelNode`、`OrNode`、`XorNode`——控制流
- `ChoiceNode`——等待玩家输入
- `ActionNode`——执行叶子行动
- `ActivateCardNode`——触发卡牌监听器
- `PlayerSwitchNode`——在玩家间转移控制权

`Engine.step()` 返回 `EngineStepResult`：`done | blocked | choice | ok | playerSwitch`。引擎驱动所有行动执行，包括多步流程、卡牌触发、待决选择。

### Hook 系统（`shared/actions/hooks.ts`）

卡牌效果通过 hook 扩展游戏，不修改核心路径。Hook phase：

- `before`、`during`、`immediatelyAfter`、`after`——执行生命周期
- `computeCosts`、`computeArgs`、`computeReplace`——行动定制
- `isDoable`——可用性覆盖
- `canUseOccupied`——允许使用已占用的行动格

### Transport 抽象（`src/services/`）

`GameTransport` 接口统一 HTTP 和 WebSocket。两种实现：

- `HttpGameTransport`——单人调试（所有方法都是 HTTP POST）
- `WsGameTransport`——多人实时（WebSocket，HTTP 仅用于校验回退）

前端代码用 `GameTransport`，不感知底层传输。

### Pending 状态

互斥 pending 模型驱动 UI 交互：

- `none`——等玩家行动
- `choice`——玩家需从选项中选
- `animalReorg`——需要放置动物
- `harvestFeed`——需要收获喂食

### 关键类型

- `shared/game/types.ts`——`GameState`、`PlayerState`、`Resource`、`ActionSpace`、`PendingAction`、`ActionFlow`
- `shared/protocol/game.ts`——`GameSyncPayload`、`StateUpdateEnvelope`
- `shared/protocol/ws.ts`——`ClientCommand`、`ServerEvent`
- `shared/game/serialization.ts`——`serializeState()` / `rehydrateState()`

### Action 系统（`shared/actions/`）

行动从 `shared/actions/effects/*.ts`（每个效果一个文件）自动发现。每个 effect 文件导出含 `id`、`nameKey`、`flow`（节点树）和回合可用性的行动定义。Anytime 行动（如烤面包、交换）同样自动发现并合并到 action registry。行动工厂在 `shared/actions/factories/`（如 `createGainAction()`）生成通用行动模式。

### 房间系统

`RoomManager`（`server/room-manager.ts`）维护 `Map<roomId, Room>`。每个房间有独立的 `GameSession`。持久化开发房间（ID `dev`，可通过 `PERSISTENT_ROOM_ID` 配置）通过 `output/` 下的 JSON 状态文件在后端重启后存活。

### 自定义卡牌与工坊

- `shared/cards/custom-registry.ts`——运行时自定义卡牌注册
- `shared/cards/custom-dsl-runner.ts`——DSL → ActionFlow（仅白名单行动）
- 工坊 UI 在 `src/app/WorkshopPage.tsx`，含 LLM 辅助卡牌设计（`src/app/workshop/AiCardDesigner.tsx`）
- 卡牌美术上传到 `/api/workshop/art`，从 `/card-art/` 提供
- LLM API key **仅**存在浏览器 `localStorage`——服务端不见

### 认证与持久化

- 用户认证通过 `/api/auth/*` 端点（注册、登录、登出、会话校验）
- `AuthContext.tsx` 提供认证状态和 `apiFetch()` 辅助
- 房间持久化：`PERSIST_ROOMS=sqlite` 用 SQLite（`DB_PATH=./data/open-agricola.db`），默认用 JSON 文件
- `ALLOW_ANONYMOUS_WS=true` 跳过 WS 认证（dev 默认开启）

### TypeScript 与构建

三个 tsconfig 项目：`tsconfig.app.json`（前端 + shared）、`tsconfig.server.json`、`tsconfig.node.json`。无路径别名——所有 import 用相对路径。Vite 通过插件从 `BGA_IMAGE_DIR`（默认 `../bga-agricola/img`）读取 BGA 卡牌图；缺失的图只影响显示，不影响规则。

## 命令

```bash
# 安装依赖（canvas 需要系统库：libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev）
# 本项目用 pnpm（版本在 package.json 的 packageManager 字段锁定）
pnpm install

# 同时启动前后端
./restart-intranet.sh

# 或分开启动
pnpm run server  # 后端 5175
pnpm run dev     # 前端 5173

# 测试
pnpm test                                         # vitest 单元测试（排除 e2e 和 scripts/）
pnpm run test:e2e                                 # Playwright E2E（需要后端 + 前端在跑）
pnpm exec vitest run tests/path/to/file.spec.ts   # 单文件

# Lint 与构建
pnpm run lint   # ESLint（~340 个 pre-existing any 类型警告，不阻塞）
pnpm run build  # tsc + vite build（/bga-img/* 警告是 cosmetic）
```

## 测试结构

三层：

- **Unit 测试**（`shared/**/__tests__/*.test.ts`）——纯领域逻辑。直接造 mock `PlayerState` / `GameState`，调函数，断言结果。
- **Session 测试**（`server/__tests__/*.test.ts`）——直接实例化 `GameSession`，调 `takeAction()` / `confirmAnimalReorg()` 等，断言 `resp.state`、`resp.pending`、`resp.ok`。
- **E2E 测试**（`e2e-tests/*.spec.ts`）——Playwright 浏览器测试，跑起来的后端 + 前端。120s 超时，无头，1920×1080。

规则正确性测试应该用 session 测试（tier 2）。断言 `state`、`pending`、`log`、`scores`——**不要**断言 DOM 元素。

## 变更总原则

- 不要引入循环依赖。
- 卡牌相关能力尽可能在卡牌文件内部闭环，不要把单卡逻辑扩散到主路径。
- 修改后需同步更新文档，至少包括：
  - `docs/IMPLEMENTATION_STATUS.md`
  - `docs/ENGINE_ARCHITECTURE.md`
  - `docs/cards_impl.md`
  - `docs/card_progress.md`
- 如果测试策略或卡牌测试写法发生变化，同时更新 `docs/CARD_TEST_TEMPLATE.md`。
- **后端权威**：规则在 `shared/` + `server/`。不要把规则逻辑放到前端 UI。
- **不要为单卡改动主路径**（`pay.ts`、`improvement.ts`、`game-session.ts`）。用现有扩展点（hooks、modifiers、卡牌定义字段）。
- 测试时**默认 2 人游戏**。

## 卡牌开发流程

### 1. 先出测试说明，再实现

- 新增或修改卡牌实现时，必须先提供测试说明，得到确认后再编码。
- 测试说明基于 `docs/CARD_TEST_TEMPLATE.md` 编写。
- 如果没有得到确认，继续修改测试说明，直到认可为止。

### 2. 测试说明必须包含

- 从一局新的 2 人游戏开始，如何准备初始状态。
- 需要设置哪些前置条件：当前玩家、玩家资源、已打出卡牌、行动格占用、农场版图、`cardStates`。
- 玩家将进行哪些交互。
- 每一步调用哪个后端接口或命令。
- 每一步之后需要断言哪些字段：`state`、`pending`、`log`、`scores`。
- 哪些情况不应触发卡牌效果。

### 3. 规则测试与渲染测试分层

- 卡牌实现测试、行动逻辑测试、收获流程测试，优先在"后端交互边界"上测试。
- 测试代码优先通过以下入口驱动：`GameSession`、`/api/game/*`、WebSocket 命令。
- 规则测试的主要断言对象是后端返回的 `state`、`pending`、`log`、`scores`。
- 不要把 DOM、按钮文案、页面结构作为规则正确性的主要断言依据。
- 前端渲染正确性单独做渲染测试或 E2E 测试。

## 卡牌实现规范

**总体规范：卡牌能力尽量在卡牌文件内部闭环，不能扩散。卡牌文件行数尽量贴近 BGA，甚至更少。**

扩展原则：无特殊原因不要改动主路径（如 `pay.ts`、`improvement.ts`、`game-session.ts` 等核心路径），优先使用已有通用扩展点。

优先使用：

- Hook 系统
- Card Definition 的通用字段（如 `cost`、`reward`、`prerequisite`）
- 卡牌自己的局部状态（如 `player.cardStates[cardId]`）

禁止：

- 在核心文件中添加针对某张卡的 `if-else`
- 创建集中的卡牌效果注册表
- 在前端硬编码卡牌特定规则
- 让前端替后端做规则裁定

只有在下面情况才允许改动主路径：

- 新增可复用的通用扩展机制
- 修复核心 bug
- 性能优化
- 明确的协议层 / 同步层演进（如 WS、snapshot/patch、pending 模型）

### Hook 与状态设计

- 卡牌特殊效果优先复用现有 Hook phase，不要轻易新增 Hook 点。
- 如果卡牌需要持续计数、标记或局部状态，优先写入 `player.cardStates[cardId]`。
- 如果卡牌会产生后续选择或延迟效果，优先走显式 `pending` / continuation 语义，不要在前端偷偷补流程。
- 新增 Hook 点时，必须同时补测试和文档。

### 命名规范

- 卡牌文件：`{Deck}_{Number}_{Name}.ts`，例如 `A123_FrameBuilder.ts`
- 类型导出：卡牌名作为常量名，例如 `A123_FrameBuilder`

## 修改后的验证动作

- 每次修改代码后，自动运行单元测试：`pnpm test`
- 每次修改代码后，自动重启前后端服务。
- 推荐使用 `./restart-intranet.sh` 重启。

## 提交与同步约定

- 提交代码前先 `git fetch`。
- 如果远端更新导致不能 fast-forward push，先列出 commit 差异并等待确认。
- commit 标题规范：
  - `feat: ...`
  - `fix: ...`
  - `refactor: ...`
- commit message 描述简洁明了，**英文**。

## Push 后 CI 验证

**硬性要求**：每次 `git push` 之后必须等到相关 GitHub Actions run 结束；**只要有 run 仍在进行或失败，当前任务都不算完成**。失败时立刻定位并修复，再继续其他工作。

Actions 页面：<https://github.com/titanxxh/open-agricola/actions>。

仓库是私有的，匿名 `curl` / WebFetch 会返回 404。要在命令行验证，先拿到 `GH_TOKEN`：

- **已放在 `.env`**：本仓库根目录的 `.env` 有一行 `GH_TOKEN=...`。参考 `scripts/sync-bga-cdn-github-var.ts` 里的 `loadGhTokenFromDotenv()`：读 `.env`，把 `GH_TOKEN` / `GITHUB_TOKEN` 注入 `process.env`。shell 里可直接 `export $(grep '^GH_TOKEN=' .env | xargs)`。
- **不要**把 `GH_TOKEN` 写到提交里或发到日志。`.env` 已在 `.gitignore`。

取到 token 之后常用命令（任选其一）：

```bash
# 最近 3 个 workflow run 的状态
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3' \
  | jq '.workflow_runs[] | {name, head_sha, status, conclusion, html_url}'

# 查看某个 run 的失败 job 日志
curl -sL -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs/<RUN_ID>/logs" \
  -o /tmp/run.zip && unzip -p /tmp/run.zip
```

如果已装官方 `gh` CLI（注意本仓库的 Cursor Cloud VM 里装的 `/usr/local/bin/gh` **不是** GitHub CLI，是另一个同名工具，调用会失败）：

```bash
gh run list --limit 5
gh run view <RUN_ID> --log-failed
```

## 部署

### 前端：GitHub Pages（自动）

- Workflow：`.github/workflows/deploy-pages.yml`，触发分支 `main` / `ui`。
- 触发路径：`src/**`、`shared/**`、`public/**`、`index.html`、`vite.config.ts`、`package.json`、workflow 本身。只改文档不会触发。
- 必要时用 workflow_dispatch 手动重跑：
  ```bash
  curl -X POST -H "Authorization: Bearer $GH_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    https://api.github.com/repos/titanxxh/open-agricola/actions/workflows/deploy-pages.yml/dispatches \
    -d '{"ref":"main"}'
  ```
- 部署地址：<https://titanxxh.github.io/open-agricola/>。
- 构建时 `VITE_API_BASE` / `VITE_WS_BASE` / `BGA_CDN_BASE_URL` 从 GitHub repo variable 注入（见 workflow yml）。

### 后端：自建 Docker 主机（手动）

- 脚本：`./deploy-backend.sh <ssh-host> [branch] [remote-dir]`
  - 默认 `root@<host>`、分支 `main`、远端目录 `/root/open-agricola`。
  - 动作：SSH 进远端 → `git fetch + reset --hard origin/<branch>` → `docker compose -f docker-compose.prod.yml up -d --build` → 等 healthcheck。
- 后端生产域名从 **GitHub repo variable** 取，不要硬编码：
  ```bash
  # 一次性查所有 variable
  curl -s -H "Authorization: Bearer $GH_TOKEN" \
    https://api.github.com/repos/titanxxh/open-agricola/actions/variables \
    | jq '.variables[] | {name, value}'
  # 或单独查
  curl -s -H "Authorization: Bearer $GH_TOKEN" \
    https://api.github.com/repos/titanxxh/open-agricola/actions/variables/VITE_API_BASE
  ```
  关键 variable：`VITE_API_BASE`（HTTPS 后端 base，如 `https://open-agricola.duckdns.org`）、`VITE_WS_BASE`（`wss://.../ws`）、`BGA_CDN_BASE_URL`。
- 本地仓库 `.env.example` / `.env` 里也有 `VITE_API_BASE` 的默认值，可作为应急参考，但**以 GitHub variable 为准**（CI 构建实际用的就是它）。
- 后端部署完成后：
  - 访问 `https://<VITE_API_BASE host>/api/health` 确认 200；
  - 确认 `CORS_ORIGIN` 覆盖了 Pages 域名（当前 `.env.example` 已含 `https://titanxxh.github.io`）。

## 启动与环境

### 服务

- 后端（5175）：`pnpm run server`
- 前端（5173）：`pnpm run dev`
- 同时启动：`./restart-intranet.sh`

### 常用命令

- `pnpm test`：vitest 单元测试（不含 e2e）
- `pnpm run lint`：ESLint
- `pnpm run build`：类型检查 + 构建
- `pnpm exec playwright install`：安装 Playwright 浏览器

### 运行说明

- 主链路是后端 HTTP + WebSocket 共同提供服务，多人同步以 WebSocket 为主。
- 玩家视角访问：
  - `http://<host>:5173/?player=p1`
  - `http://<host>:5173/?player=p2`
- 同机本地调试可将 `<host>` 视为 `localhost`。
- 局域网 / intranet 调试优先使用 `./restart-intranet.sh` 输出的地址。

## URL 参数（手动测试用）

```
?player=p1              玩家 1 视角
?player=p2              玩家 2 视角
?transport=ws           启用 WebSocket 多人
?room=<id>              加入指定房间
?devMode=1              开启 dev 面板（资源编辑、回合跳转、卡牌工具）
?customCards=id1,id2    创建 WS 房间时加载 workshop 卡 ID
?page=login             强制登录页（认证后默认跳 lobby）
?page=workshop          打开工坊
```