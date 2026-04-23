# 卡牌描述占位符渲染成图标 设计

> 状态：approved（2026-04-23 brainstorming）
> Worktree：`.worktree/desc-icons` 分支 `design/card-desc-icons`

## 1. 背景与目标

卡牌描述（i18n 里的 `description` 字段）使用 `<WOOD>` `<STABLE>` 这种占位符表示资源/动物图标。
当前主卡牌渲染（`PlayerCard.tsx`）通过 `dangerouslySetInnerHTML` + 转义处理 desc，把
`<` `>` 转成 `&lt;` `&gt;`，导致占位符**字面化显示**为 `<WOOD>` 文字而不是图标。

实际上项目里已经有一个 `ResourceText` 组件（工坊页在用）能正确渲染占位符——只是没接到主卡牌
渲染路径上，且映射表缺 `PIG` / `STABLE` / `BEGGING`，也不支持 `\n` 换行。

**目标**：

1. 把 `ResourceText` 接到所有读取 desc 的地方（PlayerCard 主卡 + log tooltip）
2. 补齐缺失的占位符映射
3. 顺手把 SCORE 从 `★` 文字升级成 sprite 图标（坐标已存在，叫 `.res-icon-bonusVp`）
4. 移除 `dangerouslySetInnerHTML`（顺带消掉一个 XSS 风险点）

**非目标**：

- 不改 i18n 文案（`<WOOD>` 占位符语法保持不变）
- 不新建新组件——所有改动归到 `ResourceText` + 调用方
- 不改 ScoringPad / ActionLog 等其它读 desc 的间接路径——它们都是 PlayerCard 的子级，自动受益

## 2. 占位符现状

13 种占位符，调研结果（中英文出现次数基本对称）：

| 占位符 | 含义 | 当前在 ResourceText？ | 需补 |
|---|---|---|---|
| `<FOOD>` | 食物 | ✅ | — |
| `<WOOD>` | 木材 | ✅ | — |
| `<GRAIN>` | 谷物 | ✅ | — |
| `<STONE>` | 石头 | ✅ | — |
| `<CLAY>` | 黏土 | ✅ | — |
| `<REED>` | 芦苇 | ✅ | — |
| `<VEGETABLE>` | 蔬菜 | ✅ | — |
| `<SHEEP>` | 羊 | ✅ | — |
| `<CATTLE>` | 牛 | ✅ | — |
| `<BOAR>` | 野猪（同 PIG） | ✅ | — |
| `<PIG>` | 猪 | ❌ | 映射到 `boar` |
| `<STABLE>` | 畜栏 | ❌ | 映射到 `barn` |
| `<BEGGING>` | 乞讨令牌 | ❌ | 映射到 `begging` |
| `<SCORE>` | 胜利分 (VP) | ⚠️ 当前渲染为 `★` 文字 | 改走 sprite (`bonusVp` 同坐标) |

## 3. 架构

```
┌────────────────────────────────────────────┐
│  ResourceText（单一渲染器）                │
│                                            │
│  RESOURCE_TAGS = { ... + PIG, STABLE,      │
│                    BEGGING, SCORE→score }  │
│  自动支持 \n → <br/>                       │
└──┬─────────────────────────────────────────┘
   │
   ├── PlayerCard.tsx L318-320       (替换 dangerouslySetInnerHTML)
   ├── log-rendering.tsx L162        (tooltip desc 改 ResourceText)
   └── WorkshopPage / AiCardDesigner (已在用，不动)
```

## 4. ResourceText 改动 (`client/components/common/ResourceText.tsx`)

### 4.1 RESOURCE_TAGS 扩展

```ts
const RESOURCE_TAGS: Record<string, string> = {
  WOOD: 'wood',
  CLAY: 'clay',
  REED: 'reed',
  STONE: 'stone',
  FOOD: 'food',
  GRAIN: 'grain',
  VEGETABLE: 'vegetable',
  SHEEP: 'sheep',
  BOAR: 'boar',          // 已有
  PIG: 'boar',           // 新增 — desc 里用 PIG，CSS 类是 boar
  CATTLE: 'cattle',
  STABLE: 'barn',        // 新增 — 复用 .res-icon-barn (stables.png 灰色列)
  BEGGING: 'begging',    // 新增 — CSS 已有 .res-icon-begging
  SCORE: 'score',        // 已有，但 SCORE 不再走 ★ 特殊分支
}
```

### 4.2 多行支持（默认）

```tsx
import { Fragment } from 'react'

export function ResourceText({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n')
  return (
    <span className={className}>
      {lines.map((line, lineIdx) => (
        <Fragment key={lineIdx}>
          {lineIdx > 0 && <br />}
          {parseDescription(line).map((p, i) =>
            p.type === 'text'
              ? <span key={i}>{p.text}</span>
              : <span key={i} className={`res-icon res-icon-${p.resource}`} title={p.resource} />
          )}
        </Fragment>
      ))}
    </span>
  )
}
```

注意：相比当前实现，**删掉了 SCORE 的 `★` 特殊分支**——SCORE 走通用路径渲染 `.res-icon-score`。

### 4.3 SCORE sprite 别名 (`client/styles/pages/game.css`)

把 `.res-icon-bonusVp` 一行改成两个选择器：

```css
.res-icon-bonusVp,
.res-icon-score { width: 0.8em; height: 0.8em; background-position: 45.5793% 21.7988%; background-size: 2560%; }
```

坐标 1:1 对应 BGA 的 `.meeple-score`（`agricola.css:4221-4227`），证实就是同一个 sprite。

顺手删 `.res-inline-score`（game.css:2862）—— grep 确认全项目只有 ResourceText 老代码引用，无其它 consumer。

## 5. 消费点改造

### 5.1 PlayerCard.tsx L318-320

**当前**（坏的，转义把占位符字面化）：
```tsx
<div className="card-desc">
  <div className="card-desc-scroller">
    <div dangerouslySetInnerHTML={{ __html:
      cardData.description
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\n/g, '<br />')
    }} />
  </div>
</div>
```

**改成**：
```tsx
<div className="card-desc">
  <div className="card-desc-scroller">
    <ResourceText text={cardData.description} />
  </div>
</div>
```

新增 import：`import { ResourceText } from './ResourceText'`

### 5.2 log-rendering.tsx L162

**当前**：
```tsx
<span className="log-card-tooltip-desc">{resolveCardDesc(locale, cardRef)}</span>
```

**改成**：
```tsx
<ResourceText className="log-card-tooltip-desc" text={resolveCardDesc(locale, cardRef)} />
```

新增 import：`import { ResourceText } from '../common/ResourceText'`

注意：`ResourceText` 渲染根元素是 `<span>`——和原 `<span>` 一样，CSS 选择器 `.log-card-tooltip-desc` 不变，无视觉 regression。

## 6. 测试

### 6.1 新建 `client/components/common/__tests__/ResourceText.test.tsx`

```tsx
// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ResourceText } from '../ResourceText'

describe('ResourceText', () => {
  it('renders <PIG> as res-icon-boar (PIG → boar mapping)', () => {
    const { container } = render(<ResourceText text="get 2 <PIG>" />)
    expect(container.querySelector('.res-icon-boar')).toBeTruthy()
  })

  it('renders <STABLE> as res-icon-barn', () => {
    const { container } = render(<ResourceText text="<STABLE>" />)
    expect(container.querySelector('.res-icon-barn')).toBeTruthy()
  })

  it('renders <BEGGING> as res-icon-begging', () => {
    const { container } = render(<ResourceText text="take 1 <BEGGING>" />)
    expect(container.querySelector('.res-icon-begging')).toBeTruthy()
  })

  it('renders <SCORE> as res-icon-score sprite (not ★)', () => {
    const { container } = render(<ResourceText text="gain 3 <SCORE>" />)
    expect(container.querySelector('.res-icon-score')).toBeTruthy()
    expect(container.textContent).not.toContain('★')
  })

  it('splits on \\n with <br/>', () => {
    const { container } = render(<ResourceText text={'line1\nline2'} />)
    expect(container.querySelectorAll('br')).toHaveLength(1)
  })

  it('keeps unknown <FOO> placeholders as literal text', () => {
    const { container } = render(<ResourceText text="<FOO>" />)
    expect(container.textContent).toBe('<FOO>')
  })
})
```

### 6.2 PlayerCard.test.tsx 新增 case

```tsx
it('renders desc placeholders as inline icons', () => {
  // E76_LumberPile desc 里有 <WOOD> 和 <STABLE>
  const { container } = render(
    <PlayerCard locale="zh" cardId="E76_LumberPile" cardType="minor" />,
  )
  expect(container.querySelector('.res-icon-wood')).toBeTruthy()
  expect(container.querySelector('.res-icon-barn')).toBeTruthy()
  expect(container.textContent).not.toContain('<WOOD>')
})
```

### 6.3 不补 tooltip 渲染测试

`LogPanel.test.tsx` 用 `renderToStaticMarkup` 静态渲染，不会触发 hover；要测 tooltip 得 jsdom + `userEvent.hover`，工作量大。tooltip 内部用同一个 `ResourceText` 组件，`ResourceText.test.tsx` 已覆盖核心逻辑——**手动浏览器验证**即可（启动 dev server，hover 一张卡看 tooltip 里 `<WOOD>` 是否显示成图标）。

## 7. 风险 & 边界

1. **删 `dangerouslySetInnerHTML` 的安全性**：grep 确认 i18n 里完全没有 HTML 标签
   （`<b>` `<i>` `<a>` `<br>` 等全没有），只有大写占位符。删除 100% 安全。

2. **`\n` 边界**：连续 `\n\n` 产生空 `<span>`，视觉等同单行间距，可接受。
   末尾 `\n` 会渲染尾部 `<br/>`（多一行空白），改动一行 `.filter(Boolean)` 就能去掉，
   但当前无明显症状——先不管。

3. **性能**：ResourceText 每次渲染重新跑正则切片。desc 通常 <200 字符，不需要 memo。

4. **WorkshopPage 已在用 ResourceText**——本次 RESOURCE_TAGS 扩展会让工坊里之前缺
   失的 PIG/STABLE/BEGGING 自动修复，**只改善不 regress**。

5. **`.res-icon-score` 命名**：之前没有这个类，新增的别名让命名语义明确（旧名 `bonusVp`
   是覆用——它本质就是 score icon）。两个选择器同坐标，CSS 不冲突。

## 8. 实施顺序

1. 改 `ResourceText.tsx`：扩 RESOURCE_TAGS + 多行 + 删 SCORE 特殊分支
2. 改 `game.css`：`.res-icon-bonusVp` 加 `, .res-icon-score` 别名；删 `.res-inline-score`
3. 写 `ResourceText.test.tsx`，跑通
4. 改 `PlayerCard.tsx` L318-320：删 `dangerouslySetInnerHTML`，换 `<ResourceText>`
5. 改 `log-rendering.tsx` L162：tooltip desc 包成 `<ResourceText>`
6. PlayerCard.test.tsx 加 desc-placeholder case，跑通
7. `pnpm test:fast` 全绿
8. 启 dev server 手动验证：（a）卡牌正面 desc 里 `<WOOD>` 显示成木头图标；
   （b）action log 里 hover 一张 minor improvement 卡，tooltip 里 desc 也有图标；
   （c）SCORE 显示成胜利分 sprite 而不是 ★
9. 提交（每个文件单独 commit 或合并 commit，由实施者按惯例）
