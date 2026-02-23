# 实现情况总结

## 1. 项目结构

纯游戏逻辑已移至 `shared/` 目录（零 React 依赖），前端 `src/` 仅保留 UI 组件与编排层，后端 `server/` 保留持久化与校验。

| 目录 | 职责 | 行数 |
|---|---|---|
| `shared/engine/` | 引擎核心 | ~1,100 |
| `shared/actions/` | 行动定义、效果、Hook、卡牌 | ~5,200 |
| `shared/logic/` | 状态、回合、计分 | ~1,035 |
| `shared/game/` | 类型与常量 | ~240 |
| `shared/i18n/` | 国际化 | ~1,500 |
| `src/` | React UI + 编排层 | ~6,500 |
| `server/` | 持久化 + 校验 | ~1,170 |

## 2. 已实现能力

### 2.1 核心流程

- 1~14 回合主流程、行动轮转、行动格开放、回合结束、游戏结束判定。
- 收获三阶段：收割、喂食、繁殖，含待补喂食与动物重整分支。
- 基础回退快照（history + engine snapshot）与日志。

### 2.2 行动系统与引擎

- 行动定义：基础行动格 + 轮次行动格，统一通过 flow 编排原子行动。
- 引擎：支持 flow 节点树（leaf/seq/parallel/or/xor/optional）与 choice 分支。
- Hook：8 个相位已接入，含 isDoable 覆盖与 computeReplace 链式改写。

### 2.3 卡牌

- 248 个卡牌定义文件（A/B/C/D/E），均已接入主数据模型。
- 大改良核心卡（Fireplace/Cooking Hearth/Well/Joinery/Pottery/Basketmaker）已接入主要效果。
- Hook 覆盖矩阵与实现状态清单维护在 `docs/cards_impl.md`。

### 2.4 后端

- 本地服务端支持保存/加载与围栏/犁地/播种校验。
- payload 校验集中到独立模块。

### 2.5 UI

- React + Vite 前端，中文国际化，开发者调试模式。

## 3. 最近结构性改造

### 3.1 shared/ 分离

- 将 `engine/`、`actions/`、`logic/`、`game/`、`i18n/` 从 `src/` 移至 `shared/`。
- 前后端均可 import，为后续后端引擎执行奠定基础。
- TypeScript 编译配置已更新，测试与构建通过。

### 3.2 GameContainer 拆分

- 引擎推进、回合结束、收获流程、动物重整等核心逻辑已抽离为纯函数。
- GameContainer 仅负责 UI 编排与副作用落地。

### 3.3 引擎与 Hook 稳定性

- 修复 `EngineTree.insertAfter` 在 Optional/Or/Xor 父节点下的替换行为。
- `computeReplace` 改为链式执行。
- Hook 覆盖矩阵改为真实注册数据驱动。

## 4. 测试与质量

- 单测框架：vitest。
- 20 个测试文件，67 个用例全部通过。
- 覆盖：引擎推进、Hook 矩阵、应用流程 hook、规则逻辑、后端校验。

## 5. 已知边界与缺口

- 部分卡牌处于"数据接入已完成、复杂行为未完全实现"的状态。
- 多卡叠加冲突处理需要更多回归样例。
- GameContainer 仍有 UI 编排复杂度，可进一步下沉。

## 6. 下一阶段方向

- 后端 GameSession：将引擎执行搬入后端，前端仅做渲染与输入收集。
- 多人支持：WebSocket 实时同步与房间管理。
- 卡牌行为补全：优先影响行动可执行性的高频卡牌。
