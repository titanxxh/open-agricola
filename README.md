# Open Agricola

基于 React + TypeScript + Vite 的 Agricola 桌游在线实现。后端权威状态 + WebSocket 实时同步，支持多人对局。

## 快速开始

```bash
npm install
```

### 启动后端 + 前端

```bash
./restart.sh
```

或分别启动：

```bash
# 后端（端口 5175）
npm run server

# 前端（端口 5173）
npm run dev
```

### 打开游戏

启动后，在浏览器中打开多个窗口进行对局：

**WS 多人模式**（推荐）：

```
玩家 1：http://<host>:5173/?player=p1&transport=ws
玩家 2：http://<host>:5173/?player=p2&transport=ws
```

P1 自动创建房间并等待，P2 自动发现房间并加入。双方就绪后游戏开始，操作实时同步。

- 在同一台机器本地调试时，`<host>` 通常就是 `localhost`。
- 在局域网 / WSL intranet 场景下，优先使用 `./restart-intranet.sh` 输出的地址。

**HTTP 单机模式**（调试用）：

```
http://<host>:5173/?player=p1
```

HTTP 模式使用单例 GameSession，适合单人调试。

### URL 参数

| 参数 | 说明 |
|---|---|
| `player=p1` / `player=p2` | 锁定玩家视角 |
| `transport=ws` | 启用 WebSocket 实时同步 |
| `room=<id>` | 加入指定房间（P2 用） |
| `devMode=1` | 启用开发者面板 |

## 项目结构

```
shared/           前后端共用
  engine/         Flow 节点树引擎
  actions/        行动定义与效果
  cards/          卡牌定义（248 张）
  game/           领域模型、状态、序列化
  logic/          状态初始化、计分、格式化
  protocol/       WS/HTTP 共享协议类型
  i18n/           多语言文案

server/           后端
  index.ts        HTTP + WS 服务入口
  game-session.ts 权威状态（唯一写入入口）
  room-manager.ts WS 房间管理与广播
  game-router.ts  HTTP REST API

src/              前端 (React)
  app/            主容器 GameContainerApi
  components/     UI 组件
  hooks/          状态管理 hooks
  services/       GameTransport (HTTP/WS)
```

## 命令

```bash
npm test            # 单元测试（vitest，295 用例）
npm run test:e2e    # E2E 测试（Playwright）
npm run lint        # ESLint
npm run build       # TypeScript + Vite 构建
```

## 架构

详见 `docs/ENGINE_ARCHITECTURE.md`。

核心设计：
- **后端权威**：`GameSession` 是唯一可写入 `GameState` 的入口
- **命令驱动**：前端发送 `ClientCommand`，后端执行后广播 `StateUpdateEnvelope`
- **全量快照同步**：每次状态变更广播完整序列化状态给所有客户端
- **Transport 抽象**：`GameTransport` 接口统一 HTTP/WS，前端代码无需感知传输层

## 开发者模式

URL 加 `?devMode=1` 或在界面中开启，可使用：
- 资源编辑、回合跳转、卡牌发放/打出
- 围栏快速创建
- 状态导出/导入
- 种子指定重开（Reset）
