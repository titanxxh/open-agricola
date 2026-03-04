# E21_SheepRug 效果测试 Spec

## 测试目标
验证 E21_SheepRug 卡牌效果：**可以使用被其他玩家占据的 Wish for Children 行动格**

## 测试场景
2人游戏，完整流程验证 SheepsRug 效果

## 前置条件设置（开发者工具）

### 初始状态
- 启动2人游戏（玩家A为p1，玩家B为p2）
- 当前回合：Round 1

### Step 1: 玩家A建造房间
- 开发者工具给玩家A（p1）：
  - Wood: 5
  - Reed: 2
- 玩家A使用 Build Room 行动建造1个房间
- **截图**: `E21_Effect_S01_A_room_built.png`

### Step 2: 进入Round 2
- 玩家A和玩家B各执行任意1个行动（如取1个食物）
- 回合结束，进入Round 2
- **截图**: `E21_Effect_S02_round2.png`

### Step 3: 快进到Round 7
- 使用开发者工具设置 Round = 7
- **截图**: `E21_Effect_S03_round7.png`
- 验证 Wish for Children 行动格已解锁

### Step 4: 玩家A使用Wish for Children生子
- 玩家A放置农民到 Wish for Children 格子
- 确认生子成功（familySize增加）
- **截图**: `E21_Effect_S04_A_had_baby.png`
- 此时 Wish for Children 被玩家A占据（有返回的农民标记）

### Step 5: 玩家B建造房间
- 开发者工具给玩家B（p2）：
  - Wood: 5
  - Reed: 2
- 玩家B使用 Build Room 行动建造1个房间
- **截图**: `E21_Effect_S05_B_room_built.png`

### Step 6: 玩家A再行动一次
- 玩家A执行任意行动（如取1个食物）
- 确保轮到玩家B时，Wish for Children仍被占据
- **截图**: `E21_Effect_S06_A_moved.png`

## 验证阶段

### Step 7: 验证无卡时玩家B无法使用（关键验证点）
- 切换到玩家B视角
- **检查**: 点击 Wish for Children 格子
- **期望**: 
  - 格子显示不可用（灰色/不可点击）
  - 或有提示"已被占据"
- **截图**: `E21_Effect_S07_B_cannot_use.png`
- **State验证**: 
  ```typescript
  // Wish for Children被占据
  const space = state.actionSpaces.find(s => s.id === 'wish-children');
  space.workers.some(w => w.playerId === 'p1') // true
  // 玩家B无SheepRug
  !state.players[1].minorPlayed.includes('E21_SheepRug') // true
  ```

### Step 8: 开发者工具让玩家B打出E21_SheepRug
- 开发者工具给玩家B（p2）：
  - Sheep: 4（满足前置条件）
- 使用开发者工具"Play Card"功能，直接让E21_SheepRug进入已打出区域
- **截图**: `E21_Effect_S08_B_card_played.png`
- **State验证**:
  ```typescript
  state.players[1].minorPlayed.includes('E21_SheepRug') // true
  state.players[1].resources.sheep === 3 // 支付了1只
  ```

### Step 9: 验证有卡时玩家B可以使用（关键验证点）
- 切换到玩家B视角
- **检查**: 点击 Wish for Children 格子
- **期望**: 
  - 格子可用（高亮/可点击）
  - 可以放置农民
- **截图**: `E21_Effect_S09_B_can_use.png`
- **日志验证**:
  ```
  [Card Listener] E21-sheep-rug-compute-args triggered for space: wish-children
  [Card Listener] Player can use occupied wish-children space
  ```

### Step 10: 玩家B使用Wish for Children生子
- 玩家B放置农民到 Wish for Children 格子
- 确认生子成功（familySize增加）
- **截图**: `E21_Effect_S10_B_had_baby.png`
- **State验证**:
  ```typescript
  state.players[1].familySize === before + 1 // 增加了1
  ```

## 截图文件列表
1. `E21_Effect_S01_A_room_built.png` - 玩家A建造房间
2. `E21_Effect_S02_round2.png` - 进入Round 2
3. `E21_Effect_S03_round7.png` - 快进到Round 7
4. `E21_Effect_S04_A_had_baby.png` - 玩家A生子
5. `E21_Effect_S05_B_room_built.png` - 玩家B建造房间
6. `E21_Effect_S06_A_moved.png` - 玩家A再次行动
7. `E21_Effect_S07_B_cannot_use.png` - ✅ 无卡时B无法使用Wish for Children
8. `E21_Effect_S08_B_card_played.png` - 开发者工具给B打出SheepRug
9. `E21_Effect_S09_B_can_use.png` - ✅ 有卡时B可以使用Wish for Children
10. `E21_Effect_S10_B_had_baby.png` - 玩家B生子成功

## 验证通过标准
- [ ] Step 7: 无E21_SheepRug时，玩家B无法使用被占据的Wish for Children格子
- [ ] Step 9: 有E21_SheepRug时，玩家B可以使用被占据的Wish for Children格子
- [ ] Step 10: 玩家B成功生子，familySize增加

## 需要新增/确认的功能
1. 开发者工具需要支持"Play Card"功能（直接将卡牌放入已打出区域）
2. 确认Wish for Children格子的占据状态如何显示（需要 farmers 数组有数据）
3. 确认无卡时格子是否禁用/灰显
