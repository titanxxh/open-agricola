# 实现情况总结

## 1. 当前实现情况

### 1.1 功能模块清单与实现细节

- 行动卡系统
  - 基础行动卡与轮次行动卡已实现，统一通过 flow 编排原子行动
  - 累积资源与直接获取资源分别通过 collect / gain 原子行动处理
  - 入口：[actions/index.ts](../src/actions/index.ts)
- 原子效果（effects）
  - 收获流程：收割、喂食、繁殖
  - 建造、犁地、播种、围栏、成长、改良等基础效果
  - 入口：[actions/effects](../src/actions/effects)
- Hook 监听架构
  - 注册/过滤/排序机制、isDoable 与 computeReplace 接入
  - 入口：[actions/hooks.ts](../src/actions/hooks.ts)
- Engine 树 TypeScript 骨架
  - 节点、树、注册表、调度器、日志与引擎执行器
  - 入口：[engine](../src/engine)
- 小发展（minor improvement）
  - 编号卡牌数据按字母目录拆分（A/B/C/D/E），每张卡独立文件
  - 入口：[minor-improvements.ts](../src/game/minor-improvements.ts), [cards/catalog.ts](../src/actions/cards/catalog.ts)
- 职业（occupation）
  - 编号卡牌数据按字母目录拆分（A/B/C/D/E），每张卡独立文件
  - 入口：[occupations.ts](../src/game/occupations.ts), [cards/catalog.ts](../src/actions/cards/catalog.ts)
- 大改良（major improvement）
  - 烤面包改良描述与交换限制对齐
  - 烤炉购买时可触发一次烤面包行动
  - 井与未来回合资源堆叠 flow
  - 入口：[major](../src/actions/cards/major)
- 卡牌基础模型
  - Occupation / MinorImprovement / PlayerActionCard 基类与基础字段
  - 入口：[cards/types.ts](../src/actions/cards/types.ts)
- 卡牌实现清单
  - Hook 覆盖矩阵与特判卡牌索引（实现状态维护）
  - 入口：[cards_impl.md](./cards_impl.md)
- 计分与计分板
  - 计分规则实现（田地/圈地/作物/牲畜/空地/房间/家庭成员/乞讨/改良与加分）
  - 计分板支持实时查看与游戏结束自动弹出（单表格：行=计分项，列=玩家）
  - 入口：[scoring.ts](../src/logic/scoring.ts), [ScoringPad.tsx](../src/components/board/ScoringPad.tsx)
- 动物圈养与畜栏容量
  - 围栏容量限制与自动裁剪
  - 入口：[animals.ts](../src/actions/effects/animals.ts)
- 围栏圈地规则
  - 前端围栏选择交互与失败原因提示
  - 后端闭合区域判定、连通性与占用校验
  - 入口：[fence-validation.ts](../server/fence-validation.ts), [fencing.ts](../src/actions/cards/fencing.ts)
- 畜栏放置与牧场格子规则
  - 畜栏占格、围栏内畜栏计入牧场容量
  - 入口：[stables.ts](../src/actions/effects/stables.ts), [fence-validation.ts](../server/fence-validation.ts)
- Hook 点与卡牌示例
  - Before/During/ImmediatelyAfter/After/ComputeCosts/ComputeArgs/ComputeReplace/IsDoable
  - 入口：[card-hooks.ts](../src/actions/hooks/card-hooks.ts)
- 卡牌效果扩展机制
  - CardEffects 与 CardListeners 允许卡牌注册监听并返回 flow
  - 入口：[card-effects.ts](../src/actions/cards/card-effects.ts), [card-listeners.ts](../src/actions/cards/card-listeners.ts)
- Engine 连锁触发
  - Hook follow-up actions 插入 EngineTree
  - 入口：[engine.ts](../src/engine/engine.ts), [tree.ts](../src/engine/tree.ts)
- Hook 覆盖矩阵
  - Hook 阶段矩阵按真实注册的 hooks/listeners 生成与测试覆盖
  - 入口：[hook-matrix.ts](../src/actions/hook-matrix.ts)
- Engine 核心修复
  - 修复 `insertAfter` 在 Or/Xor/Optional 父节点下的树结构保持
  - 修复 `computeReplace` 的链式替换上下文传递
  - 入口：[tree.ts](../src/engine/tree.ts), [hooks.ts](../src/actions/hooks.ts)
- 前后端载荷校验
  - 新增统一 payload 校验模块，规范错误结构（code/message）
  - 入口：[payload-validation.ts](../server/payload-validation.ts), [index.ts](../server/index.ts)
- App 流程拆分（第一步）
  - 抽离引擎推进核心逻辑 `runEngineStepsCore`
  - 入口：[use-engine-flow.ts](../src/app/hooks/use-engine-flow.ts), [GameContainer.tsx](../src/app/GameContainer.tsx)
- App 流程拆分（第二步）
  - 抽离回合推进与收获主流程：`use-round-flow.ts` / `use-harvest-flow.ts`
  - 入口：[use-round-flow.ts](../src/app/hooks/use-round-flow.ts), [use-harvest-flow.ts](../src/app/hooks/use-harvest-flow.ts)
- App 流程拆分（第三步）
  - 抽离动物重整写回、分支决策 plan、重整后 choice 构造：`use-animal-reorg-flow.ts`
  - 入口：[use-animal-reorg-flow.ts](../src/app/hooks/use-animal-reorg-flow.ts), [GameContainer.tsx](../src/app/GameContainer.tsx)
- Meeting Place 行动
  - 起始玩家逻辑
  - flow 可选小发展（wrapOptional + minor-improvement）
  - 入口：[common-meeting-place.ts](../src/actions/cards/action/common-meeting-place.ts)
- UI 交互与布局
  - 行动区、农场区、手牌区、日志区与控制区布局
  - 手牌与已打出卡牌显示优先使用 i18n，fallback 到卡牌定义
  - 改良行动可直接点击 Major Improvements 或手牌小发展选择
  - 行动格资源堆叠区支持多资源与未来资源展示
  - 行动格资源文本已移除，仅显示堆叠区
  - 未来回合行动牌保持隐藏，仅显示堆叠
  - 行动格提示文案已精简（移除 Base Actions/Opens in Round）
  - 资源显示统一为可识别的结构化样式（便于替换图标）
  - 开发者模式下手牌与未来回合行动牌信息可见
  - 开发者模式提供重开随机种子输入
  - 入口：[App.tsx](../src/App.tsx), [App.css](../src/App.css)
- 国际化
  - 卡牌名称与描述中文翻译（保持 __Action__ 与 <RESOURCE> 标记）
  - 入口：[zh.ts](../src/i18n/zh.ts)
- 起始手牌发放
  - 游戏开始时按种子随机发放 7 张小发展与职业（各玩家不重复）
  - 入口：[state.ts](../src/logic/state.ts)
- 动物重整与待安置
  - 房屋与散落畜栏容量展示
  - 开发者模式添加动物后自动进入重整
  - 切换玩家/回合结束前检查待安置动物并强制重整
  - 入口：[GameContainer.tsx](../src/app/GameContainer.tsx)
- 本地后端与持久化
  - 通过 server/index.ts 提供保存/加载
  - 入口：[server/index.ts](../server/index.ts)
  - 后端改为 TypeScript，并使用 tsx 启动

### 1.2 技术架构图

#### 行动与 Hook 架构

```
UI (App.tsx)
  └─ ActionDefinition.execute/resolveChoice
      └─ HookDispatcher (before/during/after/computeArgs/isDoable)
          └─ Action Effects (gain/plow/sow/...)
```

#### Engine 树骨架

```
Engine
├─ EngineTree
│  ├─ Node (Action/Choice/Sequence/Parallel)
│  └─ Cursor/Resolver
├─ ActionRegistry
├─ HookDispatcher
└─ LogStore
```

#### 状态与持久化

```
GameState
  ├─ players[]
  ├─ actionSpaces[]
  ├─ log[]
  └─ roundActionOrder

Persist (server/index.ts) ←→ App.tsx normalizeState/persistGame
```

### 1.3 核心代码片段说明

- 行动执行接入 Engine.proceed 与 flow 构建
  - [useActionEngine.ts](../src/hooks/useActionEngine.ts)
- Hook 分发与可执行性覆盖
  - [hooks.ts](../src/actions/hooks.ts#L1-L100)
- 小发展打出逻辑
  - [minor-improvement.ts](../src/actions/effects/minor-improvement.ts#L1-L28)
- Meeting Place 二段式交互
  - [meeting-place.ts](../src/actions/cards/meeting-place.ts#L1-L70)

### 1.4 已通过的测试与验证

- `npm run build`
  - TypeScript 构建与 Vite 构建通过
  - 最近验证时间：本轮改动完成后
- `npm test`
  - 引擎链路、Hook 矩阵真实性、评分、收获、状态克隆、API 契约与 payload 校验测试通过
  - 新增回合流程 hooks 测试通过（`use-round-flow.test.ts`）
  - 新增动物重整流程 hooks 测试通过（`use-animal-reorg-flow.test.ts`）

## 2. 缺失部分总结

### 2.1 未完成的功能点与优先级

- 高优先级
  - 小发展与职业卡的持续扩充与复杂效果
- 中优先级
  - Engine 树与 App.tsx 的更细粒度状态机整合（多行动并行/可选分支）
  - 改良/职业/小发展的更多费用替换与条件替换示例
- 低优先级
  - UI 可视化布局优化与动效深化
  - 回放/撤销策略的跨回合一致性与更多边界处理

### 2.2 已知技术难点与待解决问题

- 行动链路多阶段 Hook 的一致性与顺序保证
- 多卡牌叠加时的费用替换与冲突处理
- Engine 树与现有 UI 流程的稳定融合

### 2.3 未覆盖的测试场景与边界条件

- 卡牌触发链路的多卡并行与串联顺序
- 资源不足/负数与规则兜底
- 多人局中行动切换与并发状态一致性
- 收获阶段的连锁触发与改良效果叠加
- 计分细节与卡牌额外计分规则的扩展覆盖

## 3. 文档维护机制

### 3.1 更新流程

- 每次代码提交时同步更新本文件
- 每次重大功能迭代更新“当前实现情况”和“缺失部分”

### 3.2 版本控制追踪

- 以 `docs/IMPLEMENTATION_STATUS.md` 作为实现状态单一来源
- 保持变更记录与提交信息关联

### 3.3 CI/CD 完整性检查

- 在 CI 中加入文档完整性校验（例如检查关键小节是否为空）
- 与构建步骤一起执行，失败则阻止合入

## 4. 当前边界说明

- 已实现基础可玩流程，并实现了大量 A/B/C/D/E 目录卡牌数据与部分规则特判
- Engine 仍为前端实现，目标是保证核心流程与 Hook 扩展能力，不完全复制 BGA PHP 的内部实现细节
- 卡牌与规则仍在持续补全，当前以“可扩展 + 可回归验证”为主
