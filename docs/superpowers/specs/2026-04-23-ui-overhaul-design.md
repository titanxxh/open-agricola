# UI 全站桌游化改造设计

> **状态**：设计完成，待实现
> **关联 review**：`docs/UI_REVIEW.md`（2026-04-22 视觉审查）
> **目标**：按 UI review 的全部问题（10+ 跨页面 + 6 页独立）一次性修复，把"SaaS 风平台壳"升级为 Level 3 桌游气氛（木桌底 + 羊皮纸卡 + 浮雕按钮）

---

## 1. 决策汇总

| 维度 | 决策 |
|---|---|
| 视觉强度 | Level 3 MEDIUM 桌游化（木桌底 + 羊皮纸卡 + 浮雕按钮） |
| CSS 组织 | 按页面拆到 `client/styles/pages/*.css` |
| 共享组件 | 全抽 4 个：SelectButton / EmptyState / Section / DangerButton |
| 游戏页右栏 | 上"全玩家计分+资源一览"，下"行动日志"；中区用 tab 切玩家农场 |
| 交付节奏 | 3 批 PR：①基础设施 ②非游戏页 ③游戏页 |
| 验证方式 | 每批前后跑截图脚本，before/after PNG 贴 PR 描述 |
| 实现策略 | Token-first，加新 token 不删旧；旧 token 在 Batch 3 完成后清理 |

---

## 2. 整体架构 & 文件地图

### 2.1 目录结构（最终态）

```
client/
├── components/common/
│   ├── SelectButton.tsx        ← 新（Batch 1）
│   ├── EmptyState.tsx          ← 新（Batch 1）
│   ├── Section.tsx             ← 新（Batch 1）
│   ├── DangerButton.tsx        ← 新（Batch 1）
│   ├── MobileTabBar.tsx        ← 新（Batch 2）
│   ├── BrandMark.tsx           （现有）
│   ├── LocaleSwitcher.tsx      （现有，内部改用 SelectButton）
│   └── ...
│
├── components/board/           ← 新目录（Batch 3）
│   ├── PlayerTabs.tsx
│   ├── PlayerFarmPanel.tsx
│   ├── ScorePanel.tsx
│   ├── ActionLog.tsx
│   ├── StageBar.tsx
│   └── CardCarousel.tsx
│
├── styles/
│   ├── tokens.css         ← 新（Batch 1，含新桌游 token）
│   ├── base.css           ← 新（Batch 1，全局 reset / @font-face / focus）
│   ├── components.css     ← 新（Batch 1，所有按钮 + 4 个新组件样式）
│   ├── pages/             ← 新目录（Batch 1 机械搬，Batch 2/3 重写）
│   │   ├── login.css
│   │   ├── lobby.css
│   │   ├── workshop.css
│   │   ├── settings.css
│   │   └── game.css
│   └── card-sprite.css    （现有，不动）
│
├── App.css                ← 缩到 ~50 行，只 @import 上述拆分文件
└── App.tsx                ← 不动
```

### 2.2 3 批 PR 概要

| Batch | 涉及文件 | 视觉效果 | 工作量 |
|---|---|---|---|
| 1 基础设施 | 新增 tokens.css + base.css + components.css + pages/*.css；4 个新组件；App.css 改成 import | **基本零视觉变化**（机械搬运）+ 旧页面已用新 SelectButton/EmptyState/DangerButton 替换原生元素 | 6-8h |
| 2 非游戏页桌游化 | pages/login.css + lobby.css + workshop.css + settings.css 各重写为 Level 3；MobileTabBar | login/lobby/workshop/settings 全部桌游化 | 6-8h |
| 3 游戏页 | pages/game.css 重写 + 6 个 board 组件 + GameContainerApi.tsx layout 调整 | 游戏页换皮 + 宽屏布局重构 | 8-10h |

---

## 3. Design Tokens

新增的 token 都加到 `client/styles/tokens.css`，**不删旧 token**（向后兼容；Batch 3 完后清理）。

```css
:root {
  /* ─── 现有保留（向下兼容） ─── */
  --color-primary: #3a5a2c;
  --color-primary-hover: #2d4a21;
  --color-accent: #d4a017;        /* 之前没用上，Batch 2/3 大量用 */
  --color-bg-warm: #fdf6e3;
  --color-bg-card: #fff;
  --color-text: #1e1e1e;
  --color-text-secondary: #5a3a20;
  --color-text-muted: #8a7a60;
  --color-border: #cdb996;
  --color-border-light: #e8d5b7;
  --color-success: #2d7a1f;
  --color-error: #c0392b;
  --color-danger: #d74a3a;
  --color-danger-border: #f5c6cb;
  --spacing-xs: 4px; --spacing-sm: 8px; --spacing-md: 16px; --spacing-lg: 24px;
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 999px;
  --agricola-font: 'Dominican', 'CalibriB', serif;
  --app-edge-padding: clamp(12px, 2vw, 24px);

  /* ─── 新增：桌游气氛 ─── */
  --bg-wood-dark:
    radial-gradient(ellipse at top, rgba(0,0,0,.15), transparent 60%),
    repeating-linear-gradient(87deg, #4a2f18 0, #3a2410 6px, #4a2f18 12px, #5a3a20 18px),
    #2b1908;

  --bg-wood-light:
    repeating-linear-gradient(90deg, #8b6f47 0, #7a5f37 8px, #8b6f47 16px),
    #6b5337;

  --bg-parchment:
    radial-gradient(ellipse at top left, #fdf6e3, #e8d8a8 60%, #c8a878 130%);

  --bg-parchment-noisy:
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><filter id='n'><feTurbulence baseFrequency='0.9'/><feColorMatrix values='0 0 0 0 0.85  0 0 0 0 0.78  0 0 0 0 0.62  0 0 0 0.18 0'/></filter><rect width='80' height='80' filter='url(%23n)' opacity='0.4'/></svg>"),
    radial-gradient(ellipse at top left, #fdf6e3, #e8d8a8 60%, #c8a878);

  --shadow-paper:
    0 0 0 1px var(--color-border) inset,
    0 0 0 4px var(--color-bg-warm) inset,
    0 6px 16px rgba(0,0,0,0.4);

  --btn-emboss-primary:
    inset 0 1px 0 rgba(255,255,255,0.25),
    inset 0 -2px 4px rgba(0,0,0,0.25),
    0 2px 0 #1f3815,
    0 4px 6px rgba(0,0,0,0.3);

  --btn-emboss-secondary:
    inset 0 1px 0 rgba(255,255,255,0.4),
    inset 0 -2px 4px rgba(74,47,24,0.25),
    0 2px 0 var(--color-border),
    0 4px 6px rgba(0,0,0,0.2);

  --color-accent-strong: #c98a0c;
  --color-accent-bg: #fff3d6;
  --color-accent-border: #d4a017;

  /* 标题字号梯度 */
  --fs-display: clamp(28px, 3vw, 40px);
  --fs-h1: clamp(22px, 2.4vw, 28px);
  --fs-h2: clamp(18px, 2vw, 22px);
  --fs-h3: 16px;
  --fs-body: 14px;
  --fs-small: 12px;

  /* 游戏页专属 */
  --action-board-scale: 1;   /* 大屏 @media 改为 1.15 */
}
```

**关键消费点**：
- `--bg-wood-dark` → 全站 body 背景（Batch 2/3 替换草地平铺）
- `--bg-parchment` + `--shadow-paper` → 所有"重点卡片"面板（login card、lobby section、workshop sandbox、game farm）
- `--btn-emboss-primary/secondary` → 所有按钮浮雕
- `--color-accent-strong` → 精选 ★、SelectButton active、登录顶部色条、SelectButton 选中、新一批 hero CTA 高光

---

## 4. 共享组件 API

四个组件放 `client/components/common/`，统一从 `index.ts` 导出。所有组件**只关注外观 + 行为**，不接管业务状态。

### 4.1 SelectButton

```ts
type Option<T extends string> = { value: T; label: string; icon?: string }

interface SelectButtonProps<T extends string> {
  value: T
  options: Option<T>[]
  onChange: (v: T) => void
  size?: 'sm' | 'md'
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}
```

- 内部：trigger button + popover + 键盘上下选 + esc 关闭 + 点击外部关闭
- 视觉：羊皮纸面板（`--bg-parchment` + `--shadow-paper`），active 项金色边
- 替换：所有 `<select>`（语言切换、AI 模型选择）

### 4.2 EmptyState

```ts
interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
  variant?: 'default' | 'compact'
}
```

- 替换：lobby 暂无房间、workshop 4 处空态、settings 暂无空态

### 4.3 Section

```ts
interface SectionProps {
  title?: string
  subtitle?: string
  icon?: ReactNode
  actions?: ReactNode
  variant?: 'default' | 'parchment' | 'sandbox'
  collapsible?: boolean
  defaultCollapsed?: boolean
  children: ReactNode
}
```

- 替换：lobby/workshop/settings 所有 section；游戏页 major-improvements 用 `collapsible`

### 4.4 DangerButton

```ts
interface DangerButtonProps {
  children: ReactNode
  confirmText?: string           // 不提供则跳过确认
  onConfirm: () => void | Promise<void>
  size?: 'sm' | 'md'
  disabled?: boolean
}
```

- 视觉：`var(--color-danger)` 浮雕；hover 颜色加深 + 颤抖动画 0.1s
- 替换：settings 登出所有设备、workshop 删除卡牌

### 4.5 单测

每个组件配 vitest 单测（`__tests__/<Component>.test.tsx`，`@testing-library/react`）：

- SelectButton：键盘导航 / 点击外部关闭 / value/onChange 受控
- EmptyState：title/description/action 渲染、icon fallback
- Section：collapsible 切换、variant 渲染
- DangerButton：confirm 流程（有/无 confirmText 两条路径）、loading 态
- MobileTabBar（Batch 2 加）：active 路由识别 / 点击切换

---

## 5. CSS 拆分细节

### 5.1 拆分策略

**Batch 1 是纯机械搬运**——逐 selector 剪贴，不改属性，不重命名。
- E2E 不挂（DOM 选择器全保留）
- diff review 友好（git mv + import 重组，没有真改动）
- 出错只可能是漏搬 / cascade 顺序错，跑 visual diff 截图 catch

### 5.2 文件归属规则

| Selector 前缀 / 性质 | 归宿 |
|---|---|
| `:root` 变量 | `tokens.css` |
| `body / html / *` reset、`@font-face`、`@keyframes`、`button:focus-visible` 全局 focus、`.app` | `base.css` |
| `.btn-*`、`.form-field`、`.form-error`、`.form-hint`、新组件 selector（`.select-button-*` 等） | `components.css` |
| `.login-*` | `pages/login.css` |
| `.lobby-*` | `pages/lobby.css` |
| `.ws-*` / `.workshop-*` / `.ai-designer-*` / `.localization-modal-*` / `.propose-modal-*` | `pages/workshop.css` |
| `.settings-*` | `pages/settings.css` |
| `.game-layout` / `.board` / `.action-board*` / `.action-card*` / `.farm-grid` / `.player-farm*` / `.major-improvements` / `.interaction-bar*` / `.anytime-bar*` / `.harvest-*` / `.draft-*` / `.gain-*` / `.round-*` | `pages/game.css` |
| `.card-sprite-*` | `styles/card-sprite.css`（保持） |

歧义兜底：归 `pages/game.css`。

### 5.3 媒体查询处理

每个 `@media` 块按 selector 前缀拆到对应文件，**不集中**。例如：

```css
@media (max-width: 1100px) {
  :root { --app-edge-padding: 6px; }      /* → tokens.css */
  .game-layout { ... }                    /* → game.css */
  .lobby-actions { ... }                  /* → lobby.css */
}
```

切成 3 块分别放进 tokens.css / game.css / lobby.css。

### 5.4 Import 顺序

```css
/* App.css —— 入口聚合，不再写实际样式 */
@import './styles/tokens.css';
@import './styles/base.css';
@import './styles/components.css';
@import './styles/pages/login.css';
@import './styles/pages/lobby.css';
@import './styles/pages/workshop.css';
@import './styles/pages/settings.css';
@import './styles/pages/game.css';
@import './styles/card-sprite.css';
```

### 5.5 Vite

Vite 默认支持 CSS `@import`，无需改 `vite.config.ts`。

---

## 6. 非游戏页改造（Batch 2）

### 6.1 登录页 `pages/login.css` + `LoginPage.tsx`

| Review 问题 | 修复 |
|---|---|
| 品牌区构图割裂 | `.login-title` 改 `text-align:center`；logo 64px；间距 12px |
| 语言切换器孤岛 + select 默认外观 | LocaleSwitcher 用 `<SelectButton size="sm">` |
| 注册入口太弱 | 顶部 segmented control（登录 / 注册），替代底部链接 |
| placeholder 当提示 | label 旁加 `.form-hint` 永久提示 |
| Level 3 桌游化 | `.login-page` 背景 `--bg-wood-dark`；`.login-card` 用 `--bg-parchment` + `--shadow-paper`；4px 顶条改 `--color-accent-strong` |

### 6.2 大厅 `pages/lobby.css` + `LobbyPage.tsx`

| Review 问题 | 修复 |
|---|---|
| 三卡片高度不平衡 | "开始游戏" 占 2 列加 emoji 大标题；"加入游戏" + "工坊" 各占 1 列下排 |
| CTA 层级混乱 | "创建多人游戏" primary 浮雕；"单人/加入/进入工坊" secondary 浮雕 |
| 当前活跃房间空状态浪费屏 | `<EmptyState>` + "复制邀请链接"action |
| 移动端品牌断行 | header 在 <640px 改 flex-wrap 两行 |
| select 默认外观 | 同 6.1 |
| Level 3 桌游化 | 背景 `--bg-wood-dark`；3 个 `<Section variant=parchment>`；按钮浮雕 |
| 段落分隔弱 | `<Section icon="...">` |

### 6.3 工坊首页 `pages/workshop.css` + `WorkshopPage.tsx`

| Review 问题 | 修复 |
|---|---|
| 段落分隔弱 | 4 个 `<Section icon>` |
| 空态无引导 | 4 处 `<EmptyState>`；"我的卡牌"加 `+ 创建第一张卡` |
| "最新/最热" 配色突兀 | segmented control，active 用 `--color-accent-strong` |
| 沙盒卡密度低 | `<Section variant=sandbox>`；徽章 chip + "进入沙盒"/"调整配置" actions |
| 顶栏对齐两套 | header 用 `--app-edge-padding` |
| Level 3 桌游化 | `.workshop-page` 背景 `--bg-wood-dark` |

### 6.4 工坊 → AI 卡牌设计师

| Review 问题 | 修复 |
|---|---|
| 两栏 AI 配置重复 | 抽顶部"AI 模型配置"折叠 `<Section>`，左右两栏只剩"用 AI 生成 X"按钮 |
| `✗ 图片 / ✗ 代码` 误导 | chip-style toggle，active 金边；图标 👁/✏ |
| 顶部工具条信息过载 | 分 3 组 `border-left` 分隔 |
| 底部 fixed bar 文字溢出 | dev hint 折叠到"开发者帮助"小气泡 |
| 输入区 placeholder 当 label | 加 visible label |
| select AI 模型 | `<SelectButton>` |

### 6.5 账户设置 `pages/settings.css` + `SettingsPage.tsx`

| Review 问题 | 修复 |
|---|---|
| 危险按钮被画成 secondary | "登出所有设备" 改 `<DangerButton confirmText="...">` |
| 三全宽按钮节奏单调 | "保存"、"修改密码" 局部宽度 200px 右对齐；"登出所有设备" 单独区 |
| input/button 间距太近 | `gap: 24px` + 按钮 `margin-top: 12px` |
| 用户名 readonly 视觉歧义 | 🔒 icon + 米色 chip 包裹 |
| select | `<SelectButton>` |
| Level 3 桌游化 | 背景 wood，3 个 `<Section>`；危险操作 Section 红描边 |

设置页本身没有"空状态"——所以 EmptyState 组件不在此页应用，仅在 lobby/workshop 用。

### 6.6 移动端（Batch 2 尾巴，所有非游戏页一并修）

| Review 问题 | 修复 |
|---|---|
| header 不 reflow | 全站 header 在 <640px 两行 flex-wrap |
| 工坊 select 占满全宽 | SelectButton size=sm |
| 工坊"搜索 + 最新/最热"挤压 | flex-wrap，搜索框单独行 |
| 移动端无全局导航 | `<MobileTabBar>`（lobby/workshop/settings 三图标）固定底部，仅 <640px 显示 |

---

## 7. 游戏页改造（Batch 3）

### 7.1 新布局：三栏 + 中区 tab

```css
.game-layout {
  display: grid;
  grid-template-columns:
    minmax(720px, 1fr)        /* 左：行动板 */
    minmax(380px, 1fr)        /* 中：玩家农场（tab 切玩家） */
    minmax(300px, 360px);     /* 右：分数 + 日志 */
  gap: 16px;
  max-width: 1800px;
  margin: 0 auto;
}

@media (max-width: 1280px) {
  .game-layout { grid-template-columns: 1.4fr 1fr; }
  .game-layout__right { grid-column: 1 / -1; }
}

@media (max-width: 900px) {
  .game-layout { grid-template-columns: 1fr; }
}
```

### 7.2 中栏：玩家 tab

```tsx
<PlayerTabs
  players={state.players}
  active={viewedPlayerId}
  onChange={setViewedPlayerId}
/>
<PlayerFarmPanel state={state} viewedPlayerId={viewedPlayerId} />
```

`PlayerTabs`：
- 当前玩家头像金边
- "你"加 ☆
- tab 上显示该玩家分数
- 移动端折叠为下拉 SelectButton

### 7.3 右栏：上 ScorePanel + 下 ActionLog

`ScorePanel`：羊皮纸卡 + 玩家行（头像 + 名字 + 总分加粗 + 分项 chip："田地3 / 动物5 / 食物4 / 家庭3 / 卡牌2"）；当前玩家行 `--color-accent-bg` 高亮。

数据源：分项分数从 `state.scores`（如已有计算结果）或调用 `shared/game/scoring.ts` 现有的算分函数实时算。游戏中只在收获/结算阶段会精确计算，平时显示"~ 估算分数"标注；实施时确认现有 scoring 模块的接口，避免重复算分逻辑。

`ActionLog`：现有"信息列表"封装 + icon 分类（🌾🐑🏠👶💰🃏） + 玩家头像缩略。

数据源：现有 `state.log`（应该有，否则现在的"信息列表"无法显示）。icon 分类规则用关键词 match：包含"收获"→🌾，"羊/猪/牛"→🐑/🐖/🐂，"建造/房间/木屋"→🏠 等；规则放在 `client/components/board/action-log-icons.ts`。

### 7.4 背景：木桌纹理

```css
body, .app, .game-layout { background: var(--bg-wood-dark); }
```

**全站统一** `--bg-wood-dark` body 背景（Batch 2 已经在非游戏页用了），登录卡片/lobby section/workshop section 都浮在木桌上的羊皮纸卡。

### 7.5 行动板放大

```css
.action-board--scaled { transform: scale(var(--action-board-scale, 1)); }
@media (min-width: 1600px) { :root { --action-board-scale: 1.15; } }
```

### 7.6 阶段卡放大

```tsx
<StageBar stages={state.stages} currentRound={state.currentRound} />
```

一行 14 格，每格 = 1 轮，当前轮金色高亮；阶段触发轮（4/7/9/11/13/14）加图标 + tooltip 写阶段含义（"4 阶段：第一次收获"等）。Agricola 是回合制无时间倒计时，仅显示"还剩 N 轮到下一次收获"文字提示。

放在中栏顶部（玩家 tab 之上），跨 farm 区宽度。

`StageBar` 的数据源：`state.stages`（如不存在则用 `state.currentRound` + 一个 const stage map 推导）。Batch 3 实施时先确认 `shared/game/types.ts` 里 `GameState` 是否有 `stages` 字段——如没有，则在 StageBar 内部用静态 `STAGE_BREAKPOINTS = [4, 7, 9, 11, 13, 14]` 计算。

### 7.7 手牌区改横向 carousel

```tsx
<CardCarousel title="职业" cards={...} emptyState="还没有打出职业卡" />
<CardCarousel title="小发展" cards={...} />
```

横滚（左右箭头 / 拖动 / 滚轮），点击卡片悬浮放大；`max-height: 200px`。

### 7.8 浮动控制条整合

左下"上一步 / 离开房间 / 开发者"移入已有 `.interaction-bar`（fixed bottom 全宽），左侧 utility，右侧保留 pending action 按钮。

### 7.9 Game 移动端

`max-width: 900px` 单列：
- StageBar 顶端
- PlayerTabs 下拉切换
- 玩家农场（占满）
- 行动板（缩放，最小 360px）
- 折叠 ScorePanel（accordion，默认收起）
- 折叠 ActionLog
- `.interaction-bar` 仍 fixed bottom

### 7.10 Game 页新组件清单

| 组件 | 路径 |
|---|---|
| PlayerTabs | `client/components/board/PlayerTabs.tsx` |
| PlayerFarmPanel | `client/components/board/PlayerFarmPanel.tsx` |
| ScorePanel | `client/components/board/ScorePanel.tsx` |
| ActionLog | `client/components/board/ActionLog.tsx` |
| StageBar | `client/components/board/StageBar.tsx` |
| CardCarousel | `client/components/board/CardCarousel.tsx` |

---

## 8. 验证 & 落地节奏

### 8.1 每批必跑

```bash
pnpm exec tsc --noEmit                    # 类型
pnpm exec eslint . --max-warnings 0       # ✗ 现有 1170 个 warning，只看 errors=0
pnpm test                                 # vitest（含新组件单测）
pnpm run build                            # vite 产物成功
node output/tmp/shoot.mjs                 # before/after 截图
```

E2E 在本地能起服务时跑（`pnpm run test:e2e`）。

### 8.2 截图基线

- Batch 0 baseline 在 `output/tmp/01..23-*.png`
- 每批输出到 `output/tmp/batch-N-after/`
- PR 描述贴 4 张对比图：login / lobby / workshop / game（仅 Batch 3）

### 8.3 落地节奏

| 时间 | 内容 |
|---|---|
| Day 1 | design doc + writing-plans 实现计划 + Batch 1 派发 |
| Day 2 | Batch 1 review + merge；启动 Batch 2 |
| Day 3 | Batch 2 review + merge；启动 Batch 3 |
| Day 4 | Batch 3 review + merge；清理旧 token（grep 找 `--color-bg-card` 等如已被 `--bg-parchment` 取代则删；保留至少一轮验证后再删，避免外部 hot-reload 引用） |

### 8.4 回滚预案

每批独立 PR，回滚 = `git revert <merge-sha>`：
- Batch 1 回滚 = 5666 行 App.css 回归，4 个新组件没人用，无副作用
- Batch 2 回滚 = 4 个非游戏页样式回退；新组件还在但只游戏页用
- Batch 3 回滚 = 游戏页布局回到旧版

---

## 9. 范围外（YAGNI）

明确**不做**的事：

- 不引入 CSS-in-JS / vanilla-extract / Tailwind（沿用 plain CSS + tokens）
- 不引入视觉回归测试工具（Percy / Chromatic）
- 不重写 BGA 卡片美术资源（沿用 `bga-img/*`）
- 不动 `card-sprite.css`
- 不改 `App.tsx` 主流程（只改 PageRouter 渲染的页面组件）
- 不改后端 / 协议层 / shared 任何代码
- 不重写 i18n 体系（沿用现有 `t()` + `platform.*` key 命名，会按需新增少量 key 如 `platform.emptyState.noRooms`、`platform.mobile.lobby` 等，但不替换体系）
- 移动端不引入新的下拉手势（PlayerTabs 移动端只用 SelectButton）

---

## 10. 附录：Token 引用对照表

帮助实施时定位各 token 该用在哪：

| Token | 用在哪 |
|---|---|
| `--bg-wood-dark` | body 背景（全站） |
| `--bg-wood-light` | 工坊沙盒卡的强调容器 |
| `--bg-parchment` | login-card / Section variant=parchment / SelectButton popover / EmptyState |
| `--bg-parchment-noisy` | workshop sandbox / 游戏页 ScorePanel |
| `--shadow-paper` | 上述羊皮纸面板的统一阴影 |
| `--btn-emboss-primary` | `.btn-primary`、SelectButton trigger active、PlayerTabs 当前玩家 |
| `--btn-emboss-secondary` | `.btn-secondary`、SelectButton trigger normal |
| `--color-accent-strong` | login 顶条 / 精选 ★ / SelectButton active 项 / StageBar 当前轮 |
| `--color-accent-bg` | ScorePanel 当前玩家行高亮 |
| `--color-accent-border` | EmptyState 推荐 action 描边 |
| `--fs-display` | 登录页 brand title、game 页 hero |
| `--fs-h1` | 各 page 顶部页面标题 |
| `--fs-h2` | Section title |
| `--fs-h3` | Section subtitle、卡片标题 |
