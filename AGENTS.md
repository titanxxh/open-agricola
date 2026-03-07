# AGENTS

## 架构基线

- 遇到不确定的实现，优先参考 `../bga-agricola`，除非 `docs/ENGINE_ARCHITECTURE.md` 已明确给出不同设计。
- 当前项目主设计以 `docs/ENGINE_ARCHITECTURE.md` 为准：
  - WebSocket 房间对局是主链路。
  - 后端 `GameSession` 持有唯一权威 `GameState`。
  - 前端只负责渲染、输入收集和视角化展示，不负责规则裁定。
  - HTTP 主要用于调试、补拉快照、测试辅助和兼容接口。
- 与游戏规则相关的实现，优先放在后端共享领域层：`shared/` + `server/`。
- 不要把规则判断放到前端 UI 层补逻辑。

## 变更总原则

- 不要引入循环依赖。
- 卡牌相关能力尽可能在卡牌文件内部闭环，不要把单卡逻辑扩散到主路径。
- 修改后需同步更新文档，至少包括：
  - `docs/IMPLEMENTATION_STATUS.md`
  - `docs/ENGINE_ARCHITECTURE.md`
  - `docs/cards_impl.md`
  - `docs/card_progress.md`
- 如果测试策略或卡牌测试写法发生变化，同时更新：
  - `docs/CARD_TEST_TEMPLATE.md`

## 卡牌开发流程

### 1. 先出测试说明，再实现

- 新增或修改卡牌实现时，必须先提供测试说明，得到确认后再编码。
- 测试说明必须基于 `docs/CARD_TEST_TEMPLATE.md` 编写。
- 如果没有得到确认，需要继续修改测试说明，直到认可为止。

### 2. 测试说明必须包含

- 从一局新的 2 人游戏开始，如何准备初始状态。
- 需要设置哪些前置条件：
  - 当前玩家
  - 玩家资源
  - 已打出卡牌
  - 行动格占用
  - 农场版图
  - `cardStates`
- 玩家将进行哪些交互。
- 每一步调用哪个后端接口或命令。
- 每一步之后需要断言哪些字段：
  - `state`
  - `pending`
  - `log`
  - `scores`
- 哪些情况不应触发卡牌效果。

### 3. 规则测试与渲染测试分层

- 卡牌实现测试、行动逻辑测试、收获流程测试，优先在“后端交互边界”上测试。
- 测试代码应优先通过以下入口驱动：
  - `GameSession`
  - `/api/game/*`
  - WebSocket 命令
- 规则测试的主要断言对象是后端返回的：
  - `state`
  - `pending`
  - `log`
  - `scores`
- 不要把 DOM、按钮文案、页面结构作为规则正确性的主要断言依据。
- 前端渲染是否正确，单独做渲染测试或 E2E 测试。

## 卡牌实现规范

**总体规范：卡牌能力尽量在卡牌文件内部闭环，不能扩散。**

### 1. Modifier 定义位置

- 卡牌的 payment modifier（`TradeModifier`、`BonusModifier`）必须定义在卡牌自己的文件中。
- 不要把 modifier 放到集中的注册表中。

### 2. 扩展原则

无特殊原因不要改动主路径（如 `pay.ts`、`improvement.ts`、`game-session.ts` 等核心路径），优先使用已有通用扩展点。

优先使用：

- 卡牌定义中的 `modifier`
- Hook 系统
- Card Definition 的通用字段，如 `cost`、`reward`、`prerequisite`
- 卡牌自己的局部状态，如 `player.cardStates[cardId]`

禁止：

- 在核心文件中添加针对某张卡的 `if-else`
- 创建集中的卡牌效果注册表
- 在前端硬编码卡牌特定规则
- 让前端替后端做规则裁定

只有在下面情况才允许改动主路径：

- 新增可复用的通用扩展机制
- 修复核心 bug
- 性能优化
- 明确的协议层/同步层演进（如 WS、snapshot/patch、pending 模型）

### 3. Hook 与状态设计

- 卡牌特殊效果优先复用现有 Hook phase，不要轻易新增 Hook 点。
- 如果卡牌需要持续计数、标记或局部状态，优先写入 `player.cardStates[cardId]`。
- 如果卡牌会产生后续选择或延迟效果，优先走显式 `pending` / continuation 语义，不要在前端偷偷补流程。
- 新增 Hook 点时，必须同时补测试和文档。

### 4. 新增 Modifier 类型流程

如果需要新增 modifier 类型，按以下顺序修改：

1. 在 `shared/game/types.ts` 中新增类型定义。
2. 更新 `shared/cards/types.ts` 中的卡牌定义类型。
3. 更新对应 modifier 查找/应用逻辑。
4. 在卡牌文件中使用新类型。
5. 补充测试与文档。

### 5. 命名规范

- 卡牌文件：`{Deck}_{Number}_{Name}.ts`
  - 例如：`A123_FrameBuilder.ts`
- 类型导出：卡牌名作为常量名
  - 例如：`A123_FrameBuilder`

## 修改后的验证动作

- 每次修改代码后，自动运行单元测试：`npm test`
- 每次修改代码后，自动重启前后端服务。
- 推荐使用 `./restart.sh` 重启。
- 测试时默认使用 2 人游戏。

## 提交与同步约定

- 提交代码前，先 `git fetch`。
- 如果远端更新导致不能 fast-forward push，先列出 commit 差异并等待确认。
- commit 标题需要符合规范：
  - `feat: ...`
  - `fix: ...`
  - `refactor: ...`
- commit message 描述简洁明了，避免使用中文。

## 启动与环境

### 服务

- Backend（5175）：`npm run server`
- Frontend（5173）：`npm run dev`
- 同时启动：`./restart.sh`

### 常用命令

- `npm test`：vitest 单元测试（不含 e2e）
- `npm run lint`：ESLint
- `npm run build`：类型检查 + 构建
- `npx playwright install`：安装 Playwright 浏览器

### 运行说明

- 主链路是后端 HTTP + WebSocket 共同提供服务，其中多人同步以 WebSocket 为主。
- 玩家视角访问：
  - `http://localhost:5173/?player=p1`
  - `http://localhost:5173/?player=p2`

## Cursor Cloud specific instructions

### System dependencies

The `canvas` npm package requires native C libraries. These are pre-installed in the VM snapshot: `libcairo2-dev`, `libpango1.0-dev`, `libjpeg-dev`, `libgif-dev`, `librsvg2-dev`, `libpixman-1-dev`. If `npm install` fails with canvas build errors, reinstall them via `sudo apt-get install -y libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev libpixman-1-dev`.

### Gotchas

- `npm run build` 可能因测试文件中的既有 TypeScript 严格模式错误失败；这不影响 `npm run dev` / `npm run server`。
- Vite 会尝试从 `../bga-agricola/img` 提供卡图；云环境中该目录可能不存在，缺图通常只影响显示，不影响规则。
