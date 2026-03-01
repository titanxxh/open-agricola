# AGENTS

## 代码思路参考
遇到不确定的实现，优先参考 ../bga-agricola 项目中的实现，除非在 docs/ENGINE_ARCHITECTURE.md 中有明确说明需要不一样的实现方式。

## 变更约定
- 新增卡牌功能需要有UT和集成测试。
- 修改和前端显示有关的功能后，一定需要通过playwright截图，查看界面是否符合预期，验证的截图文件保存在output目录。
- 每次修改代码后，自动运行单元测试（npm test）。
- 每次修改代码后，自动重启前端与后端服务。
- 每次修改代码后，更新文档：docs/IMPLEMENTATION_STATUS.md docs/ENGINE_ARCHITECTURE.md docs/cards_impl.md docs/card_progress.md
- 提交代码到 Git 仓库，commit 标题需要符合规范：
  - 格式：`feat: 新增功能描述` 或 `fix: 修复问题描述` 或 `refactor: 代码重构描述`
  - 描述：简洁明了，避免使用中文
- 最后git push到remote仓库

## 卡牌实现规范

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
- 前端：npm run dev，注意需要启动4个不同的浏览器窗口表示4个玩家。
- 后端：npm run server
