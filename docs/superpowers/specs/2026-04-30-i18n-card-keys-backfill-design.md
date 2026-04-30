# i18n 卡内 Key 缺失补齐 Design

**Date**: 2026-04-30
**Status**: brainstormed, awaiting user review
**Owner**: 工程债收尾（C-1 子项）

---

## 1. Goal

补齐 73 张卡引用但 `shared/i18n/{en,zh}.ts` 缺定义的 74 个 unique i18n key。这些 key 全部 zh + en 双缺，是 game-runtime bug：UI 触发到这些卡的交互时会显示 raw key 而不是文本。

C-2（437 BGA `clienttranslate` 字符串）不在本 spec 范围——大部分是 BGA PHP 端 system log，与我们 TS 实现的 frontend i18n 系统不映射，ROI 极低；接受为 deferred。

**成功标准**：
- 跑 `pnpm tsx scripts/audit-card-architecture.ts`：S12 信号从 73 → 0
- `pnpm test:fast` 全绿
- `pnpm run lint` errors=0
- 73 张卡的交互在 UI 触发时显示中英文文本（不是 raw key）

---

## 2. 数据源

权威清单：`/data00/home/xuxinhao.titan/raw/open-agricola/output/tmp/audit-card-arch-2026-04-28.jsonl`

提取命令：
```bash
jq -c 'select(.signals.S12_i18nGapKeys | length > 0) | {cardId, gaps: [.signals.S12_i18nGapKeys[] | .key]}' output/tmp/audit-card-arch-2026-04-28.jsonl
```

74 个 unique key 已用 `jq | sort -u` 验证，全部 `missingZh: true && missingEn: true`。

**示例**：
| Key | 用它的卡 | 出现位置 |
|---|---|---|
| `ui.interactionAleBenches` | A29 | promptKey |
| `ui.interactionResourceExchange` | A61 / A62 / A118 / B101 / B114 / B135 等 | promptKey（通用） |
| `ui.interactionE149Prompt` / `ui.interactionE149Skip` | E149 MidnightFencer | promptKey + labelKey |
| `ui.interactionReclamationPlowAmbiguous` 等 5 keys | A17 | 多 labelKey |

---

## 3. Architecture

### 3.1 i18n 文件结构

`shared/i18n/{en,zh}.ts` 是嵌套对象 export，约 1041-1082 行。已有 `ui.interactionXxx` 都是 flat 命名（即 `ui` 这一层下直接挂同名 key），不是再嵌套一层。

新写入示例（en.ts）：
```typescript
export const en = {
  ui: {
    // ... 已有 keys ...
    interactionAleBenches: 'Skip / Use Ale Benches: bake bread now',
    interactionResourceExchange: 'Choose resource exchange',
    interactionE149Prompt: 'Take how many midnight fences from each opponent? (0 to 2)',
    interactionE149Skip: 'Skip',
    // ...
  },
  // ...
}
```

zh.ts 同样格式，写中文翻译。

### 3.2 翻译策略

每个 key 三步：
1. **找 context**：grep `<key>` in `shared/cards/`（labelKey / promptKey / button text）
2. **看卡 desc**：参考 `desc` 字段判断行为
3. **参考 BGA 原文**：BGA `clienttranslate(...)` 中类似行为的字符串作为英文范本（grep `bga-agricola/modules/Cards/`）

**多卡共用 key 处理**：例如 `ui.interactionResourceExchange` 被 6+ 卡引用，翻译需 generic（"Choose resource exchange"），不绑特定卡。

**英文风格**：简洁、command-style、对齐已有 `ui.interactionXxx` 风格（例：`ui.interactionPriestKeep` = `'Keep this card'`）。

**中文风格**：对齐 zh.ts 已有的 game-tone（例：`ui.interactionPriestKeep` = `'保留此卡'`）。

### 3.3 写入位置

按字母顺序插入 `ui.interactionXxx` 区域，保持现有缩进（2 空格）+ 引号风格（看 en.ts 实际用单引号或双引号）。`prompt.*` key 进 `prompt` 子对象（如有），否则按现有同类位置。

---

## 4. Components

**修改的文件**：
- `shared/i18n/en.ts` — 加 74 个英文条目
- `shared/i18n/zh.ts` — 加 74 个中文条目
- `docs/card_progress.md` — §2.0 changelog 一行

**不动的文件**：
- 卡牌实现文件（key 已经在用，本任务只补字符串）
- audit 脚本

---

## 5. Testing

- `pnpm tsx scripts/audit-card-architecture.ts` 跑完 S12 = 0
- `pnpm exec tsc --noEmit -p tsconfig.app.json` 通过（i18n 文件 TS literal）
- `pnpm test:fast` 全绿（i18n 是 string-only 改动，不应破坏既有测试）
- 抽查 5-10 个 key 的中英文翻译质量（context-fit 检查）

---

## 6. Out of Scope

- **C-2 BGA clienttranslate 437 strings**：deferred 到 follow-up，master plan §0 残留登记
- 翻译质量审：本 spec 接受 LLM-style 直译，后续如有 game tone 偏差按 follow-up 调整
- 新增 key：本 spec 只补已经在卡里被引用的 key；如发现卡里 key 引用错（typo），单独 issue

---

## 7. 工时估算

- 数据提取（jq）：~5min
- 74 keys × 双语翻译 + 写入：~1.5-2h（实际由 LLM batch 完成 + 用户/reviewer 抽查）
- 验证（audit / test / lint）：~10min
- docs 同步 + commit：~10min
- **总计**：~2-3h

---

## 8. 文档同步

完成后：
- `docs/card_progress.md §2.0` 加 changelog：
  ```markdown
  - **2026-04-30 — i18n 卡内 key 缺失补齐**：73 张卡引用 74 个 i18n key 在 zh.ts/en.ts 双缺，全部补齐双语翻译。S12 audit 信号 73 → 0。BGA `clienttranslate` 437 strings（系统日志 / PHP 端文案，与我们 TS frontend i18n 不映射）保持 deferred。
  ```
- `docs/master-plan.md §0` 把 `i18n 缺口 71+437 未补` 改为 `i18n 缺口 437 BGA strings 未补（卡内 key 已修）`
