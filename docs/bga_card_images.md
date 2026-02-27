# BGA-Agricola 卡牌图片系统分析

## 概述

Board Game Arena (BGA) 的 Agricola 实现使用了一套精心设计的图片组合系统来渲染卡牌。每张卡牌不是单一的完整图片，而是由多个图层叠加组合而成。

**参考网址**: https://boardgamearena.com/6/agricola?table=804025327

---

## 卡牌尺寸规范

| 变量 | 标准尺寸 | Mini 模式 |
|------|----------|-----------|
| `$cardW` (宽度) | 235px | 110px |
| `$cardH` (高度) | 374px | 110px |

```scss
// variables.scss
$cardW: 235px;
$cardH: 374px;

:root {
  --agricolaCardWidth: $cardW;
  --agricolaCardHeight: $cardH;
  --agricolaCardScale: 1;
}
```

---

## 图片目录结构

```
bga-agricola/img/
├── card_frames.jpg              # 卡牌边框精灵图 (1896x1006)
├── card_frame_major_minor.png   # 大改良/小改良特殊边框 (630x1006)
├── card_categories.png          # 卡牌分类图标 (8种分类)
├── majors_icons.jpg             # 大改良图标精灵图 (1000x348, 5x2布局)
├── meeples.png                  # 资源/米宝精灵图 (2048x2048)
├── action_frame.png             # 行动卡框架 (628x769)
├── action_frame_s.png           # 行动卡框架小版 (425x769)
├── action_frame_bg.jpg          # 行动卡背景
├── background.jpg               # 游戏主背景
├── deckA/                       # A牌组卡牌图片 (168张, 每张512x512)
│   ├── A001.png
│   ├── A002.png
│   └── ...
├── deckB/                       # B牌组卡牌图片 (168张)
├── deckC/                       # C牌组卡牌图片 (168张)
├── deckD/                       # D牌组卡牌图片 (168张)
└── deckE/                       # E牌组卡牌图片 (168张)
```

---

## 卡牌图层结构

每张卡牌由以下图层从下到上叠加组成：

```
┌─────────────────────────────────────┐
│ 1. card-frame (边框背景)              │
│   ┌───────────────────────────────┐ │
│   │ 2. card-icon (卡牌主图)         │ │
│   │                               │ │
│   │ 3. card-title (标题)           │ │
│   │ 4. card-numbering (编号)       │ │
│   │ 5. card-score (分数)           │ │
│   │ 6. card-cost (费用)            │ │
│   │ 7. card-prerequisite (前置条件) │ │
│   │ 8. card-deck (牌组标识)         │ │
│   │ 9. card-category (分类图标)     │ │
│   │ 10. card-players (玩家数要求)   │ │
│   └───────────────────────────────┘ │
│ 11. card-desc (效果描述区域)          │
│ 12. card-bottom-left-corner          │
│ 13. card-bottom-right-corner         │
└─────────────────────────────────────┘
```

### HTML 结构

```html
<div class="player-card occupation" data-id="A001_LandlessFarmer" data-numbering="A001">
  <div class="player-card-resizable">
    <div class="player-card-inner">
      <!-- 1. 边框 -->
      <div class="card-frame"></div>
      
      <!-- 小改良装饰 -->
      <div class="card-frame-left-leaves"></div>
      <div class="card-frame-right-leaves"></div>
      
      <!-- 2. 主图 -->
      <div class="card-icon"></div>
      
      <!-- 3. 标题 -->
      <div class="card-title">Landless Farmer</div>
      
      <!-- 4. 编号 -->
      <div class="card-numbering">A001</div>
      
      <!-- 5. 分数 -->
      <div class="card-score">1</div>
      
      <!-- 6. 费用 -->
      <div class="card-cost">
        <div class="card-cost-text">...</div>
      </div>
      
      <!-- 7. 前置条件 -->
      <div class="card-prerequisite">
        <div class="prerequisite-text">...</div>
      </div>
      
      <!-- 8-10. 其他元素 -->
      <div class="card-deck" data-deck="A"></div>
      <div class="card-category" data-category="FarmCategory"></div>
      <div class="card-players" data-n="1+"></div>
      
      <!-- 11. 效果描述 -->
      <div class="card-desc">
        <div class="card-desc-scroller">...</div>
      </div>
      
      <!-- 12-13. 角落装饰 -->
      <div class="card-bottom-left-corner"></div>
      <div class="card-bottom-right-corner"></div>
    </div>
  </div>
</div>
```

---

## 精灵图系统

### 1. 卡牌边框 (card_frames.jpg)

**尺寸**: 1896 x 1006 像素
**布局**: 水平3列，对应3种卡牌类型

| 卡牌类型 | background-position-x | 说明 |
|----------|----------------------|------|
| 大改良 (Major) | 0% | 左列，橙色边框 |
| 小改良 (Minor) | 50% | 中列，绿色边框 |
| 职业 (Occupation) | 100% | 右列，蓝色边框 |

```scss
.card-frame {
  background-image: url("img/card_frames.jpg");
  background-size: 300% $cardH;  // 3列
  border-radius: 8.3/100 * $cardW;
}

&.major .card-frame {
  background-position-x: 0%;
}

&.minor .card-frame {
  background-position-x: 50%;
}

&.occupation .card-frame {
  background-position-x: 100%;
}
```

### 2. 大改良图标 (majors_icons.jpg)

**尺寸**: 1000 x 348 像素
**布局**: 5列 x 2行 (共10个大改良)

```scss
.major .card-icon {
  background-image: url("img/majors_icons.jpg");
  background-size: 500% 200%;  // 5列 x 2行
  clip-path: polygon(0% 54.4%, 24% 11%, 74% 11%, 99% 55%, 74% 98%, 24% 98%, 0% 55%);
}

// Fireplace1 = 位置 (0, 0)
&[data-id="Major_Fireplace1"] .card-icon {
  background-position-x: 0%;
  background-position-y: 0%;
}

// StoneOven = 位置 (5/5*100%, 1/2*100%)
&[data-id="Major_StoneOven"] .card-icon {
  background-position-x: 100%;
  background-position-y: 100%;
}
```

**大改良位置映射表**:

| 大改良 | 列索引 | 行索引 | background-position |
|--------|--------|--------|---------------------|
| Fireplace1 | 0 | 0 | 0%, 0% |
| Fireplace2 | 1 | 0 | 25%, 0% |
| CookingHearth1 | 2 | 0 | 50%, 0% |
| CookingHearth2 | 3 | 0 | 75%, 0% |
| ClayOven | 4 | 0 | 100%, 0% |
| StoneOven | 0 | 1 | 0%, 100% |
| Joinery | 1 | 1 | 25%, 100% |
| Pottery | 2 | 1 | 50%, 100% |
| Basket | 3 | 1 | 75%, 100% |
| Well | 4 | 1 | 100%, 100% |

### 3. 资源/米宝精灵图 (meeples.png)

**尺寸**: 2048 x 2048 像素
**用途**: 资源图标、分数标记、玩家数标记、牌组标识、烹饪/烤面包图标等

```scss
// 分数标记
.card-score {
  background-image: url("img/meeples.png");
  background-position: 53.3644% 15.0026%;
  background-size: 1765.52%;
}

// 牌组标识
.card-deck[data-deck="A"] {
  background-position: 59.7624% 14.9793%;
  background-size: 1828.57%;
}

// 玩家数要求
.card-players[data-n="1+"] {
  background-position: 99.3846% 0.512821%;
  background-size: 2089.8%;
}

// 烹饪图标 (左下角)
.card-desc::before {
  background-position: 82.0225% 21.6886%;
  background-size: 2275.56%;
}

// 烤面包图标 (右下角)
.card-desc::after {
  background-position: 87.1297% 21.6886%;
  background-size: 2275.56%;
}
```

### 4. 卡牌分类图标 (card_categories.png)

**尺寸**: 8种分类水平排列
**用途**: 显示卡牌的功能分类

```scss
.card-category {
  background-image: url("img/card_categories.png");
  background-size: 800% 100%;  // 8列
}

// 分类位置
$cardCategories: 
  "BoosterCategory",    // 0%   - 行动增强
  "LivestockCategory",  // 14.3% - 畜牧
  "ResourceCategory",   // 28.6% - 资源
  "FarmCategory",       // 42.9% - 农场
  "CropCategory",       // 57.1% - 作物
  "FoodCategory",       // 71.4% - 食物
  "GoodsCategory",      // 85.7% - 物品
  "PointsCategory";     // 100%  - 分数
```

---

## 职业/小改良卡牌图片

### 图片规格

- **格式**: PNG (带透明度)
- **尺寸**: 512 x 512 像素
- **命名**: `{编号}.png` (如 `A001.png`, `B156.png`, `C089.png`)

### 加载机制

每张职业/小改良卡牌都有独立的图片文件，通过 CSS 按编号动态加载：

```scss
// 自动为每个编号设置对应的背景图
$deckA: 'A001', 'A002', ..., 'A168';
@each $cId in $deckA {
  &[data-numbering='#{$cId}'] .card-icon {
    background-image: url('img/deckA/#{$cId}.png');
  }
}

$deckB: 'B001', 'B002', ..., 'B168';
@each $cId in $deckB {
  &[data-numbering='#{$cId}'] .card-icon {
    background-image: url('img/deckB/#{$cId}.png');
  }
}
// ... 同理 deckC, deckD, deckE
```

### 图标定位

```scss
.minor .card-icon,
.occupation .card-icon {
  width: 77.5 / 100 * $cardW;    // ~182px
  height: 80.85 / 100 * $cardH;  // ~303px
  top: 15.75 / 100 * $cardW;     // ~37px
  left: 11.5%;                    // ~27px
}
```

---

## 行动卡框架

行动卡（游戏板上可放置工人的位置）使用单独的图片系统：

```
action_frame.png       - 标准行动框架 (628x769)
action_frame_s.png     - 紧凑版行动框架 (425x769)
action_frame_bg.jpg    - 行动卡内容背景
action_frame_arrow.png - 箭头装饰
action_frame_panel.png - 面板装饰
```

---

## 特殊卡牌处理

### 带烹饪功能的卡牌

```scss
&[data-cook="true"] .card-desc::before {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  width: 29px;
  height: 20px;
  background-image: url("img/meeples.png");
  background-position: 82.0225% 21.6886%;
}
```

### 带烤面包功能的卡牌

```scss
&[data-bread="true"] .card-desc::after {
  content: "";
  position: absolute;
  bottom: 0;
  right: 0;
  width: 28px;
  height: 20px;
  background-image: url("img/meeples.png");
  background-position: 87.1297% 21.6886%;
}
```

### 负分卡牌

```scss
&[data-id='B33_Mantlepiece'] .card-score {
  background-image: url('img/negativeVP.png');
  color: beige;
}
```

---

## 响应式缩放

BGA 使用 CSS 变量实现卡牌的动态缩放：

```javascript
// agricola.js
elt.style.setProperty('--agricolaCardWidth', (235 * scale) / 100 + 'px');
elt.style.setProperty('--agricolaCardHeight', (374 * scale) / 100 + 'px');
```

```scss
.player-card-resizable {
  transform: scale(var(--agricolaCardScale));
  transform-origin: top left;
}
```

---

## 实现建议

如果要在 Open-Agricola 中实现类似的卡牌显示系统：

### 方案 A: 纯 CSS + 精灵图
- 复用 BGA 的精灵图资源
- 使用相同的 CSS 图层叠加技术
- 优点：图片资源少，加载快
- 缺点：需要手动维护精灵图

### 方案 B: HTML/CSS 合成
- 每张卡牌由 HTML 元素动态合成
- 图片只包含：边框模板、图标、资源符号
- 优点：灵活，易于修改
- 缺点：需要更多 CSS 代码

### 方案 C: Canvas/SVG 渲染
- 使用 Canvas 或 SVG 动态绘制卡牌
- 优点：最高灵活性
- 缺点：实现复杂度高

---

## 资源清单

| 资源 | 用途 | 建议处理 |
|------|------|----------|
| card_frames.jpg | 3种卡牌边框 | 必须复用或重制 |
| majors_icons.jpg | 10个大改良图标 | 必须复用或重制 |
| meeples.png | 所有资源/标记图标 | 必须复用或重制 |
| card_categories.png | 8种分类图标 | 必须复用或重制 |
| deckA-E/*.png | 职业/小改良主图 | 可选择性使用 |

---

## 总结

BGA 的卡牌渲染系统采用**图层叠加 + 精灵图**的方案：

1. **边框层** - 从精灵图选择对应卡牌类型的边框
2. **图标层** - 大改良用精灵图，职业/小改良用独立图片
3. **信息层** - 标题、分数、费用等用 HTML 文本
4. **装饰层** - 资源图标、分类图标从精灵图裁切
5. **描述层** - 底部区域显示效果文本

这种方案平衡了图片资源大小和显示灵活性，是网页版桌游的最佳实践。
