# E21_SheepRug E2E 测试计划

## 测试目标
验证 E21_SheepRug 卡牌在真实游戏流程中的完整功能，包括：
1. 前提条件检查（4 Sheep）
2. 打出成本（1 Sheep）
3. 使用 Improvement 行动打出卡牌
4. 日志记录正确

## 前置条件设置

### 步骤 1: 创建圈地（新增开发者功能）
**开发者模式需要添加的功能**：创建可容纳 4 只羊的圈地
- 在开发者面板添加"创建圈地"按钮
- 自动为玩家创建一个 2x2 的围栏区域（容纳 4 只羊）

### 步骤 2: 给玩家发放羊
**操作**：使用开发者面板给玩家 4 只羊
**预期结果**：
- 触发动物重整（Reorganize）流程
- 玩家需要将 4 只羊安置到圈地中
- 完成重整后才能继续游戏

## 测试流程

### 阶段 1: 准备阶段
1. **启用开发者模式**
   - 截图：初始状态
   
2. **创建圈地**
   - 使用开发者面板"创建圈地"功能
   - 截图：圈地创建完成
   
3. **发放 E21_SheepRug 到手牌**
   - 使用开发者面板"摸牌"功能
   - 截图：卡牌在手牌中显示

### 阶段 2: 前提条件验证
4. **先给 3 只羊（不满足前提）**
   - 使用开发者面板设置 sheep = 3
   - 触发重整，将 3 只羊安置到圈地
   - 截图：3 只羊已安置
   
5. **尝试通过 Improvement 行动打出卡牌**
   - 点击 Major Improvement 行动位
   - 选择 E21_SheepRug
   - **预期结果**：无法打出，提示需要 4 只羊
   - 截图：错误提示

### 阶段 3: 成功打出卡牌
6. **再给 1 只羊（满足前提）**
   - 使用开发者面板增加 1 只羊（现在有 4 只）
   - 触发重整，将第 4 只羊安置
   - 截图：4 只羊已安置
   
7. **通过 Improvement 行动打出卡牌**
   - 点击 Major Improvement 行动位
   - 选择 E21_SheepRug
   - 支付成本：1 Sheep
   - **预期结果**：卡牌成功打出
   - 截图：卡牌打出后

### 阶段 4: 验证
8. **验证日志**
   - 检查日志面板
   - **预期日志**：`Player A plays minor improvement: Sheep Rug Pays Sheep 1`
   - 截图：日志验证
   
9. **验证资源变化**
   - 羊数量：4 → 3（支付 1 只成本）
   - 截图：最终资源状态

## 截图列表
1. `E21_Step01_initial.png` - 初始状态
2. `E21_Step02_pasture_created.png` - 圈地创建完成
3. `E21_Step03_card_drawn.png` - 卡牌在手牌
4. `E21_Step04_sheep_3.png` - 3 只羊安置完成
5. `E21_Step05_play_fail.png` - 尝试打出失败（前提不满足）
6. `E21_Step06_sheep_4.png` - 4 只羊安置完成
7. `E21_Step07_card_played.png` - 卡牌成功打出
8. `E21_Step08_log_verified.png` - 日志验证
9. `E21_Step09_final_state.png` - 最终状态

## 开发者模式功能需求

### 新增功能：创建圈地
```typescript
// 在 DevPanel 中添加
const createDevPasture = () => {
  // 为当前玩家创建一个 2x2 的圈地
  // 包含 4 个围栏边
  // 自动计算位置（避免与现有建筑冲突）
}
```

### 功能位置
- 文件：`src/components/dev/DevPanel.tsx`
- 添加："创建圈地"按钮
- 回调：`createDevPasture`

## 测试代码实现步骤

1. 修改 `src/app/GameContainer.tsx` 添加 `createDevPasture` 函数
2. 修改 `src/components/dev/DevPanel.tsx` 添加按钮和回调
3. 编写 E2E 测试 `e2e-tests/E21_SheepRug.spec.ts`
4. 运行测试并收集截图

## 预期测试结果

- ✅ 前提条件检查正常工作（需要 4 Sheep）
- ✅ Improvement 行动可以正常打出卡牌
- ✅ 成本支付正确（1 Sheep）
- ✅ 日志记录完整准确
- ✅ 所有截图保存在 `output/` 目录
