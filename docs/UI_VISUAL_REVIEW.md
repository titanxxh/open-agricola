# UI 视觉评审 / 画风调整建议

> 评审日期：2026-04-25
> 截图分辨率：桌面 1440×900、移动 390×844
> 截图文件：`output/tmp/ui-review/desktop-*.png`、`output/tmp/ui-review/mobile-*.png`
> 设计 token 入口：`client/styles/tokens.css`、`client/styles/base.css`、`client/styles/components.css`
> 范围：Login / Lobby / Workshop / Settings / Game (桌面 + 移动) 页面

---

## 0. 总体画风诊断

### 当前画风资产

- 全局背景：`body` 用 `--bg-monthly`（季节插画 cover + fixed），底色 `#c5a576`（木色）
- 主字体：自定义 `Dominican / CalibriB`（仅 brand / 标题用），其余 `Inter / 苹方 / 雅黑`
- 主色：`--color-primary #3a5a2c`（橄榄绿）+ `--color-accent #d4a017`（赭金）+ 羊皮纸 / 木色 `--bg-parchment / --bg-wood-*`
- 形态：圆角 `8/12/16`，阴影做"羊皮纸纸感" `--shadow-paper`，按钮做凸起 `--btn-emboss-*`

整体方向是清晰的—**中世纪农业插画 + 羊皮纸 + 木牌 emboss**。问题主要出在**执行不彻底 + 各页面贯彻程度不一致**：

| 页面 | 画风一致性 | 主要病灶 |
|---|---|---|
| Login | ★★★★☆ | 整体最完整；卡片底色与插画微脱节 |
| Lobby | ★★☆☆☆ | 三栏卡片仍是普通白卡 + 阴影；活跃房间列表渲染全部条目（**严重 bug：1504 行**） |
| Workshop | ★★☆☆☆ | 通体金黄过于饱和；空状态太多，节奏单调；Section 之间无层次 |
| Settings | ★★★☆☆ | 视觉与 Lobby 同病；表单白底浮在羊皮纸上有割裂感 |
| Game | ★★★☆☆ | 信息密度高、对比克制做得还行，但 Header / 控制条 / 评分条之间风格不统一，存在多种圆角和按钮形态 |
| Mobile | ★★☆☆☆ | 桌面布局简单堆叠，Tab 栏与内容区缺呼吸 |

### 一句话方向建议

**别把它做成"游戏 + 普通 SaaS 卡片"的混合体**——要么把"羊皮纸 + 木质感"贯彻到所有 Section，要么干脆让插画背景退到 Login 一处仪式感场景，其余页改成中性深绿/米色稳重背景。当前两条路都没走完。

推荐采用 A 方案（贯彻 BGA 桌游氛围）。

---

## 1. Login（登录页）

> 截图：`desktop-01-login.png`、`mobile-01-login.png`

### 现状好的点

- 季节插画 + 居中羊皮纸大卡片，仪式感最强的页面
- 顶部金色细条 (`border-top: 4px solid --color-accent-strong`) 是不错的小细节
- Brand mark 居中、Title 用 Dominican 字体——这块是这个页面最完整的地方

### 视觉问题

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| 1.1 | 卡片本体 | 卡片用 `--bg-parchment` 渐变，但与背景插画的卡通油画风对比生硬，边缘像是"贴片" | 给卡片加一层 paper texture（已有 `--bg-parchment-noisy` 没用上）或外层加"木框 / 卷轴边缘"装饰；可参考 BGA 实物配件的卷边纸 |
| 1.2 | 模式 Tab `.login-mode-tabs` | 灰底 pill + 活动态绿色，调子太"web 应用化"，与上半部 Dominican 大字反差太大 | 换成"羊皮纸标签贴纸"风格（两个标签形似书签 / 缝合贴），或干脆做木牌切换（圆角矩形 + 凸起 emboss）|
| 1.3 | 输入框 | 普通 `1px solid --color-border` 白色 input | 换成米色填充 + 内嵌阴影（凹槽感），与卡片同语言；focus 用金色或深绿描边 |
| 1.4 | 主按钮"登录" | 已有 emboss，但字号偏小、`--fs-h3 = 16px` 时分量不够 | 字号 +2px、letter-spacing +0.5px；hover 加微微抬起动画 (`translateY(-1px)`) |
| 1.5 | 副标题 `一起来种地` | 14px 灰色，气场被压住 | 换成 `font-family: var(--agricola-font)` 斜体 + 加分隔线装饰（如 `· 一起来种地 ·`） |
| 1.6 | 语言选择 | 默认 `<select>` 浏览器原生样式 | 用已有的 `SelectButton` 组件统一替换 |
| 1.7 | 移动端 | 卡片 padding 24/20 偏紧；插画顶部裁切露出风车 1/4 比较奇怪 | 移动端把 `background-position: bottom center` 让前景村庄/羊群落到下方更自然 |
| 1.8 | 暗色支持 | 整套配色无暗色模式 | （次优先）至少加 `prefers-color-scheme: dark` 时不要让羊皮纸亮瞎 |

---

## 2. Lobby（大厅）

> 截图：`desktop-02-lobby.png`、`desktop-02-lobby-full.png`、`mobile-02-lobby.png`

### **❗严重 bug：活跃房间列表无截断 → 页面高度 93,000px**

- DOM 实测 `body.scrollHeight = 93,646px`，凶手是 `.room-list`（1504 个 `<li>`）
- 后端 `/api/rooms` 返回所有房间，前端 `LobbyPage.tsx:274` `rooms.map` 直接平铺
- 影响：滚动条无意义、季节背景被拉伸、Cmd+End 跳到尽头才发现问题
- **修复建议（与画风无关但建议同批解决）**：
  - 后端 `/api/rooms` 加 `?limit=20&status=waiting`、加 `?mine=1` 过滤
  - 前端默认只显示 `playerCount < maxPlayers && status='waiting'` 且最多 20 行；超出时分页或加搜索框
  - 列表容器加 `max-height: 480px; overflow-y: auto;` 保底

### 视觉问题

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| 2.1 | 三栏卡片 (开始 / 加入 / 工坊) | 用 `Section.variant="default"`——纯白底 + 阴影，与插画和登录页的羊皮纸不统一 | 改成 `variant="parchment"`，三张卡像三块木牌挂在背景上 |
| 2.2 | 三栏宽度 `2fr 1fr 1fr` | 加入 / 工坊很空；工坊只放一个按钮居中显得无所事事 | 重排为 `1.4fr 1fr 1fr`，工坊卡补"我已发布的卡牌数 / 沙盒中的卡牌数"小数据气泡 |
| 2.3 | 房间列表 li 视觉 | 米色块 + 1px border-bottom，灰扁平；按钮在最右 | 改成"信封 / 小卡片"风：圆角 12 + 阴影 + 玩家头像/座位图标；status 用色块徽章（绿 = waiting、橙 = playing、灰 = finished） |
| 2.4 | Header 品牌 | brand-image 42px 比标题 24px 还重，比例失衡；右侧 username + 登出 + 语言挤一团 | 标题字号→28，图标→36；右侧 username 做成胶囊（带 avatar 圆点 + dropdown 包含设置/登出/语言） |
| 2.5 | EmptyState 文案 | 暂无活跃房间 / 复制邀请链接——文案干巴 | 加一行插画（小拖拉机/麦穗 SVG）、文案改"今天还没人开局，要不要主动喊一波？" |
| 2.6 | 整体高度 | 即便修了 1504bug，下面也是大片米黄空 | 加底部装饰带（草丛 SVG、围栏剪影），或在右下角放卡牌堆叠的"小贴纸" |

---

## 3. Workshop（卡牌工坊）

> 截图：`desktop-03-workshop.png`、`desktop-03-workshop-full.png`、`mobile-03-workshop.png`

### 视觉问题

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| 3.1 | 通体金黄 | 沙盒 / 我的卡牌 / 精选 / 浏览全部用同一种 `bg-parchment` 渐变 + 同色金边，叠在一起像柠檬蛋糕；缺主次 | 沙盒（最重要）保留高饱和；其它三块降到米白 `--color-bg-warm`；只用一处金色作为强调 |
| 3.2 | 4 个 Section 等高等款 | 4 个空状态接连出现："还没加入测试卡牌 / 你还没有创建卡牌 / 暂无精选卡牌 / 暂无其他玩家发布的卡牌"——重复感极强 | (a) 沙盒 hero 卡片专属布局（左插画 + 右 CTA）；(b) "我的 / 精选 / 浏览"合并成 Tab，单一卡片切换内容 |
| 3.3 | 顶部导航 | `.ws-nav` 是白底 + 1px border 一根线，与下方暖色羊皮纸严重断层 | 把 nav 也用 `--bg-parchment` 或半透明木色，或者直接复用 GameHeader 的样式语言 |
| 3.4 | "返回大厅"链接 | 灰色文字超链接，无图标 | 换成左箭头 + "返回大厅"文字按钮，用 `btn-secondary` 视觉 |
| 3.5 | 段落标题 ★精选 | emoji 星 + 宋体粗，两种字风混在一起 | 用 `var(--agricola-font)` 统一；emoji 替换为 SVG 图章（与 Section icon prop 风格统一）|
| 3.6 | 排序 Tab `.ws-sort-tabs` | 金色 active + 灰色 inactive，但 active 颜色过饱和 (`#c98a0c`)，文字下划线缺失，hover 反馈弱 | 借鉴 Login 的 mode tabs；active 加底部 2px 实线作为指示，hover 加暗化 |
| 3.7 | "搜索卡牌" 输入框 | 1px border 白色 input、放大镜按钮居然在右外侧 | 输入框做成羊皮纸内嵌（背景 `#fff7e6` + 内描边）；放大镜图标放在左侧 input 内 |
| 3.8 | 移动端 | 三个空状态像滚动浪费；Tab 栏 `.mobile-tab-bar` 的工坊按钮高亮不清晰 | (a) 移动端把"沙盒"做成顶部 Hero 卡片，其它 Section 折叠；(b) 移动 Tab 栏 active 加底色块，不只换字色 |

---

## 4. Settings（账户设置）

> 截图：`desktop-04-settings.png`

### 视觉问题

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| 4.1 | 顶部 header `< 返回大厅 . 账户设置` | 黑色文字 + 普通链接，与下方羊皮纸三段卡反差大 | 同 Lobby header：用 brand-mark + tableau header；标题用 Dominican |
| 4.2 | 三个 Section 大同小异 | "基本信息 / 修改密码 / 危险操作"全用 default 卡片；危险操作仅靠 `border: 2px solid #f5c6cb` 区分，红色不够明显 | 危险操作改用 `--color-danger` 大红边 + 红色图章式标题；基本信息用 parchment、修改密码用 default 形成层次 |
| 4.3 | "保存"按钮 | 按钮宽 200px、靠右，但表单字段分散无视觉收尾 | 把表单底部加一条 gold separator 线；按钮放在 separator 下方居中或全宽 |
| 4.4 | 只读账户名展示 | "review_019792"——纯文本无装饰 | 用 `.settings-readonly-chip`（已存在）展示，或加 avatar circle |
| 4.5 | 修改密码字段 | "至少 4 个字符"提示太宽松；视觉无密码强度指示 | 加密码强度条（0-4 段彩色 bar）|
| 4.6 | 危险操作 | 文案+按钮组合较弱；用户可能漏过 | 加图标 ⚠️、加二次确认（已有 `DangerButton` 组件）、加描述强调"此操作不可恢复" |

---

## 5. Game（对局界面）

> 截图：`desktop-05-game.png`、`desktop-05-game-full.png`、`desktop-06-game-dev.png`

### 总体观感

- 信息密度高、色块对比克制（绿主调 + 米色 + 偶尔金/红），实战可读性 OK
- 但**视觉语言碎片化**：
  - GameHeader 用胶囊 + 半透明白；
  - ScorePanel 用 parchment 卡；
  - 行动区是绿色实心块；
  - 玩家农场是浅绿草地纹理；
  - 行动记录是半透明白底；
  - 互动条是磨砂玻璃 (`backdrop-filter: blur(12px)`)
  - 加上自定义底图大量用 BGA 原始图——融合度勉强

### 视觉问题

| # | 位置 | 问题 | 建议 |
|---|---|---|---|
| 5.1 | 顶部 GameHeader | 控件挤一行：返回 / 房间 / 阶段 / 玩家 / 回合 / 设置；高度紧凑但拥挤 | 拆成两段：左 brand+room+phase，右 player ribbon；中间空隙放进度环（轮次） |
| 5.2 | 阶段条 StageBar | 扁平彩色 chip 排列，不像 BGA 那样是季节圆环或舞台幕布 | 改成时间轴样式（圆点 + 连线 + 当前阶段强调），或采用季节图标（春夏秋冬轮播）|
| 5.3 | 评分计分板 ScorePanel | 玩家1/玩家2 行 + `-14/-14`，看着像负分但其实是预估总分；负号引发误读 | 改成"≈ 14"或加图标说明；当前/预估两个数字分两行（大数字 + 小描述） |
| 5.4 | 玩家农场背景 | 草地绿渐变 + 木栅栏切片图，与底图季节插画饱和度都很高，叠加眼花 | 农场内部背景做"哑光木板纹"，让格子凸出；外部不要再叠纹理 |
| 5.5 | 互动条 InteractionBar | `backdrop-filter: blur(12px)` 在低端机会卡且与羊皮纸语言不符 | 改用半透明深绿木板（`rgba(58, 90, 44, 0.92)` + 浅金描边），按钮改成金色 emboss 与"完成回合"按钮拉开层次 |
| 5.6 | InteractionBar 按钮 | 都是绿色 pill `border-radius: 999px`，size 一致；主操作 vs 取消区分弱 | 主操作（确认/支付）用大金色按钮；取消/跳过用米色低对比 |
| 5.7 | 行动记录 ActionLog | 字号 12-13px、行高紧；玩家颜色仅靠左侧色点 | 行间距+2px、左侧色条改成 4px 实色 bar；当前回合粗体；旧记录降饱和 |
| 5.8 | 卡牌区 (手牌/已打出) | 手牌缩略图与"已打出"两栏并列但视觉权重相同 | 手牌做"扇形悬停"动画（hover 时单卡上浮 + 放大），让玩家一眼知道哪张是可点击的 |
| 5.9 | DevPanel | 灰色边框 + 普通文本 list；不属于产品 UI，但调试时也很丑 | DevPanel 加 `--color-accent` 标识 dev-only，避免误以为是正式 UI |
| 5.10 | 资源数字 ResourceText | 字体没强调，数字与图标对齐略偏 | 数字用 tabular-nums (`font-feature-settings: 'tnum'`)、图标固定 16px 居中 |

---

## 6. 移动端通用问题

> 截图：`mobile-01-login.png`、`mobile-02-lobby.png`、`mobile-03-workshop.png`

| # | 问题 | 建议 |
|---|---|---|
| 6.1 | 顶部 brand + 语言 + user 三件套挤在一行，元素视觉等权 | 上方仅 brand + 折叠菜单 (≡)；其它放进抽屉 |
| 6.2 | `.mobile-tab-bar` 仅图标 + 11px 文字，active 仅靠字色；触感差 | active 加 `background: rgba(212,160,23,0.18)` + 圆角矩形；图标尺寸 24px |
| 6.3 | 桌面 `2fr 1fr 1fr` grid 在小屏直接堆叠，开始 / 加入 / 工坊 高度都不一样 | 移动端改成单列等高，每张卡放一组 hero CTA |
| 6.4 | Lobby 房间列表移动端按钮被压到次行 | 移动端 li 改成两行：第一行房间 ID + status 徽章；第二行人数 + 按钮 |
| 6.5 | 滚动到底部时背景仍然 fixed，`background-attachment: fixed` 在 iOS Safari 跳变 | 移动端用 `background-attachment: scroll`（@media query 切换）|

---

## 7. 跨页面共性问题（按优先级）

### P0（先动）

1. **Lobby 渲染 1504 个房间→页面 93k px 高**：限制条数 / 加分页 / 加 `max-height + overflow-y`
2. **Section 视觉系统未统一**：定一个组件级规则——"一级页面卡片用 parchment，二级用 default，hero 用 sandbox"。当前 Lobby/Workshop 把强弱关系做反了
3. **按钮三件套**（btn-primary / btn-secondary / btn-small / btn-danger / 直接绿色 pill）多处自由发挥，缺统一形态——尤其是 InteractionBar 内有自己一套绿色 pill，与 `btn-primary` 不一致

### P1（一并优化）

4. **字体使用规则**：Dominican 仅 brand + h1，h2/h3 仍用 sans-serif；当前 Section.title 用 sans-serif 与 brand-title 风格冲突。建议：所有 h2 也升级到 Dominican
5. **绿/金平衡**：当前金色集中在 workshop（过饱和），其它页面几乎用不到。让金色变"奖励/操作 CTA"专用色（如登录按钮、主操作按钮、活动 tab），而不是大块面铺底
6. **空状态视觉化**：现有 `EmptyState` 只放 emoji + 文字。给每个常见空态画一个 60×60 SVG（小拖拉机、卡牌堆、麦穗、围栏），整体气质会立刻提升一档

### P2（锦上添花）

7. **页面切换动效**：当前只有 `fadeSlideIn 0.4s ease-out`，所有页面相同。可以做"翻页 / 揭开羊皮纸"过渡（CSS + clip-path）
8. **季节背景的内容利用**：背景图根据月份切换是好点子，可在 Lobby 顶部加"当前月份 · 收获季"小标签呼应它
9. **声音 / 触觉**：按钮 click 加非常轻的木头 / 翻牌音（可选关闭）
10. **Logo 利用率**：brand-mark 48×48 在所有页面只出现 1 次，非常浪费；可以做成水印 / 加载动画 / 失败页插图

---

## 8. 推荐落地顺序

1. **P0-1 修 lobby 1504 房间 bug**（独立 PR，1 天）
2. **P0-2 重构 Section 强弱体系**：tokens 加 `--section-style-hero / -primary / -secondary`，把所有页面的 Section 重新分类（半天）
3. **页面级**：先把 Lobby 三栏改造成"羊皮纸三块木牌"，再回看 Workshop（半天）
4. **细节**：按钮 / Tab / EmptyState 统一替换（1 天）
5. **Game 视觉**：InteractionBar 改深绿木板、ScorePanel 数字层级修正、ActionLog 行高呼吸（半天）
6. **移动端补**：MobileTabBar active 态、顶部抽屉、卡片堆叠优化（半天）

---

## 附：截图清单

```
output/tmp/ui-review/
├── desktop-01-login.png
├── desktop-02-lobby.png
├── desktop-02-lobby-full.png      ← 93k px 高，bug 证据
├── desktop-03-workshop.png
├── desktop-03-workshop-full.png
├── desktop-04-settings.png
├── desktop-05-game.png
├── desktop-05-game-full.png
├── desktop-06-game-dev.png
├── mobile-01-login.png
├── mobile-02-lobby.png
├── mobile-03-workshop.png
└── mobile-04-game.png
```
