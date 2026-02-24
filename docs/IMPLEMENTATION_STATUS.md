# 实现情况总结

## 1. 架构

前后端职责已分离：后端持有唯一权威 `GameState`，前端仅做渲染与输入收集。

| 目录 | 职责 |
|---|---|
| `shared/` | 引擎、行动、效果、Hook、卡牌、状态、计分、i18n（前后端共用） |
| `server/` | GameSession（权威状态）、HTTP API、WebSocket 房间管理、校验 |
| `src/` | React UI、API 调用 hook、渲染组件 |

## 2. 当前能力

### 2.1 核心流程
- 1~14 回合主流程、行动轮转、回合结束、游戏结束。
- 收获三阶段：收割、喂食、繁殖。
- 动物重整与待安置处理。

### 2.2 引擎与 Hook
- Flow 节点树：leaf/seq/parallel/or/xor/optional。
- 8 个 Hook 相位：before/during/immediatelyAfter/after/computeCosts/computeArgs/computeReplace/isDoable。
- Hook 覆盖矩阵由真实注册数据动态生成。

### 2.3 卡牌
- 248 个卡牌定义文件（A/B/C/D/E）。
- 大改良核心卡已接入主要效果。
- 详见 `docs/cards_impl.md`。

### 2.4 后端 API
- `GameSession`：持有 GameState + Engine，暴露命令式方法。
- HTTP 端点：`/api/game/*`（takeAction/resolveChoice/validate/confirmReorg/confirmFeed/confirmNextPlayer/performRoundEnd）。
- 统合了原本分散的 `/api/plow/validate` 等校验接口到 `/api/game/validate`；校验通过时直接写回 GameSession 状态（开垦/围栏/房间/马厩/播种等会立即生效）。
- WebSocket：`ws://localhost:5175/ws`（createRoom/joinRoom + 实时状态广播）。
- 房间管理：每房间独立 GameSession，支持多客户端。

### 2.5 前端
- `GameContainerApi`（默认）：API 驱动，不运行本地引擎。
- `GameContainer`（`?mode=local`）：本地引擎模式，保留作为 fallback。
- 两种模式共用同一套 UI 组件。

## 3. 测试与质量

- 单测框架：vitest。
- 20 个测试文件，67 个用例全部通过。
- `npm run build` 全量通过。

## 4. 已知边界

- 部分卡牌仅完成数据接入，复杂行为待补全。
- WebSocket 多人流程尚未端到端测试。
- 撤销功能在 API 模式下暂未实现。
- `GameContainerApi` 的动物重整 UI 交互（adjustReorgAnimal）待完善。

## 5. 下一步方向

- 完善 WebSocket 多人端到端流程（创建房间 → 加入 → 对局 → 结算）。
- 为 GameSession 增加撤销/回退 API。
- 持续补全高频卡牌行为。
- 逐步废弃本地引擎模式，最终只保留 API 驱动。
