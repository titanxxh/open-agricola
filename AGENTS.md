# AGENTS

## 代码思路参考
遇到不确定的实现，优先参考 ../bga-agricola 项目中的实现，除非在 docs/ENGINE_ARCHITECTURE.md 中有明确说明需要不一样的实现方式。

## 变更约定
- 新增卡牌实现时，需要先提供一个实现后，预期的测试说明，给我确认后再进行实现。如果没有得到确认需要修改直到认可。
  - 需要包含测试步骤，从启动一局新游戏开始，先设定前置条件，比如使用开发者工具做哪些准备。
  - 需要定义玩家进行交互的过程，会调用后端什么接口，一共有几个步骤。
  - 需要断点每次交互后游戏state有哪些变化。
  - 需要断点会输出哪些日志。
- 不要引入循环依赖
- 新增卡牌功能需要有e2e测试，按照之前提供的预期测试说明来写。
  - 一定需要通过playwright截图，headless模式，查看界面是否符合预期，浏览器窗口宽度至少为1920，验证的每一步的截图文件保存在output目录。
  - 每一次调用后端后，state发生的改变需要记录在不同的文件中，方便后续人工debug。
  - 验证时需要将本次产生的截图文件发我，我会人工检查是否符合预期。
  - 我确认后，可以产生临时文件。
- 每次修改代码后，自动运行单元测试（npm test）。
- 每次修改代码后，自动重启前端与后端服务。
- 每次修改代码后，更新文档：docs/IMPLEMENTATION_STATUS.md docs/ENGINE_ARCHITECTURE.md docs/cards_impl.md docs/card_progress.md
- 提交代码到 Git 仓库，commit 标题需要符合规范：
  - 格式：`feat: 新增功能描述` 或 `fix: 修复问题描述` 或 `refactor: 代码重构描述`
  - 描述：简洁明了，避免使用中文
- 首先git fetch更新远端代码，如果远端代码更新，导致不能fast-forward push，列出commit差异，并向我确认。否则可以push到远端。

## 卡牌实现规范

**总体规范：卡牌相关的能力尽可能在卡牌文件内部闭环，不能扩散。**

### 1. Modifier 定义位置
卡牌的 payment modifier（TradeModifier、BonusModifier）必须定义在卡牌自己的文件中，不可放在集中的注册表中。

### 2. 扩展原则
无特殊原因不要改动主路径（如 pay.ts、improvement.ts 等核心文件），而是通过以下通用方式扩展：

**优先使用通用扩展点：**
- 卡牌定义中的 `modifier` 字段 - 用于支付相关的效果
- Hook 系统 - 用于行动触发的事件
- Card Definition 的其他字段 - cost、reward、prerequisite 等

**禁止的扩展方式：**
- 在核心文件中添加 if-else 判断特定卡牌 ID
- 创建集中的卡牌效果注册表
- 硬编码卡牌特定逻辑

**需要改动主路径的唯一情况：**
- 新增通用扩展机制（如新的 modifier 类型）
- 修复核心 bug
- 性能优化

### 3. 新增 Modifier 类型流程
如果需要新增 modifier 类型（如新的效果类型），流程如下：
1. 在 `shared/game/types.ts` 中新增类型定义
2. 更新 `shared/cards/types.ts` 的 CardDefinition
3. 更新 `shared/cards/card-modifiers.ts` 的查找函数
4. 在对应的卡牌文件中使用新类型

### 4. 命名规范
- 卡牌文件：`{Deck}_{Number}_{Name}.ts`（如 A123_FrameBuilder.ts）
- 类型导出：卡牌名作为常量名（如 A123_FrameBuilder）

## 启动命令
可以用restart.sh重启。注意测试时只需要需要启动2个玩家的游戏。
