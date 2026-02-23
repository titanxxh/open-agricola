# Open Agricola 架构说明

## 1. 目标与边界

- 目标：在前端实现可玩的农场主基础流程，保证行动执行、资源变更、回合推进、收获结算与日志一致。
- 扩展策略：通过 `Action Hook` 与 `Card Listener` 叠加卡牌效果，不追求逐行复制 BGA PHP 内部实现。
- 当前边界：大量卡牌已接入数据与部分规则，未来将持续补全行为实现。

## 2. 分层结构

```text
shared/ (前后端共用，零 React 依赖)
  ├─ engine/          引擎核心（节点树、推进、snapshot）
  ├─ actions/         行动定义、效果、Hook、卡牌目录
  ├─ logic/           状态初始化/克隆、回合/收获、计分
  ├─ game/            GameState/PlayerState 等核心类型
  └─ i18n/            国际化

src/ (仅前端)
  ├─ app/             GameContainer + UI 流程 hooks
  ├─ components/      React UI 组件
  ├─ hooks/           React 编排 hooks（useActionEngine 等）
  ├─ services/        后端 API 调用
  └─ types/           UI 类型定义

server/ (仅后端)
  └─ index.ts + payload/fence/plow/sow 校验
```

## 3. 核心模块

### 3.1 行动定义与行动空间

- `shared/actions/index.ts`：注册基础与轮次行动格，`createActionSpaces()` 生成运行时 `ActionSpace`。

### 3.2 引擎执行层

- `shared/engine/engine.ts`：`Engine.proceed()` 驱动节点推进，支持 `flow` 转节点树与 snapshot/restore。
- `shared/engine/tree.ts`：`nextUnresolved()`、`findNodeById()`、`insertAfter()`。
- `shared/engine/nodes.ts`：`ActionNode`、`ChoiceNode`、`SequenceNode`、`ParallelNode`、`OrNode`、`XorNode`、`OptionalNode`。

### 3.3 Hook 与 Listener

- `shared/actions/hooks.ts`：8 个相位，支持 `computeReplace` 链式替换与 `isDoable` 覆盖。
- `shared/actions/cards/card-listeners.ts`：按 actions/phases/scope 匹配分发。
- `shared/actions/hooks/card-hooks.ts`：内建卡牌 Hook 注册入口。
- `shared/actions/hook-matrix.ts`：矩阵由真实注册数据动态生成。

### 3.4 原子效果层

- `shared/actions/effects/*`：collect/gain/plow/sow/fencing/renovation/stables/reap/feed-family/breed-animals 等。

### 3.5 应用编排层

- `src/app/GameContainer.tsx`：主 UI 编排器。
- `src/app/hooks/*`：引擎推进、玩家轮转、回合结束、收获流程、动物重整等纯函数核心。

### 3.6 状态与规则

- `shared/game/types.ts`：`GameState`、`PlayerState`、`ActionSpace` 等核心类型。
- `shared/logic/state.ts`：初始化、克隆、回合快照、开局发牌。
- `shared/logic/round.ts`：收获流程计算。
- `shared/logic/scoring.ts`：计分规则。

### 3.7 后端与校验

- `server/index.ts`：本地 API（保存/加载与交互校验）。
- `server/payload-validation.ts`：统一请求体校验。
- `server/fence-validation.ts`、`plow-validation.ts`、`sow-validation.ts`：关键动作校验。

## 4. 关键运行流程

### 4.1 行动执行

1. UI 选择行动格 -> 构建或复用 Engine。
2. `Engine.proceed()` 找到下一个可执行节点，触发 Hook。
3. 遇到 choice 回到 UI；完成后写日志并进入下一节点。

### 4.2 回合与收获

1. 工人全部用完 -> 回合结束判定。
2. 归家（释放行动格、恢复工人）。
3. 收获回合执行收割/喂食/繁殖。
4. 推进下一回合。

## 5. 测试覆盖

- `shared/engine/__tests__/*`：引擎推进与链式插入。
- `shared/actions/__tests__/*`：Hook 矩阵、围栏、畜栏、动物。
- `shared/logic/__tests__/*`：计分、收获、状态克隆。
- `src/app/__tests__/*`：engine/turn/round/harvest/reorg 编排核心。
- `server/__tests__/*`：后端校验。

## 6. 已知限制

- 部分卡牌仅完成数据接入，复杂行为待补全。
- 多 Hook 叠加冲突处理需更多回归样例。
