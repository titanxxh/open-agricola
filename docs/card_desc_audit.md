# Card Audit vs BGA — 综合审查文档

> **文档角色**：卡牌对齐审计的**方法论 + 历史里程碑 + 当前残留清单**。
>
> **进度权威源**：`docs/card_progress.md`。本文件不复述其逐张卡状态，只做"全局图景 + 审计工具 + 未对齐 gap"汇总。
>
> **覆盖维度**：(1) 行为对齐 (2) 数值/元数据对齐 (3) desc 文案对齐 (4) 架构合规。

---

## 1. 当前对齐状态（截至 2026-05-13）

### 1.1 总览
- BGA 卡数 888 / OA 卡数 888（含 33 张 BGA banned，OA 不实施过滤）
- `docs/operations/bga-metadata-diff-report.md` 机械化 metadata 报告：⚠ 0 / ❌ 4 / 🔍 33 banned
- BGA 实现而 OA 完全缺：3 张（详见 §3.1）

### 1.2 Verdict 分布（按 `card_progress.md` §1 / §2）

| 维度 | 数量 | 出处 | 处理 |
|---|---|---|---|
| ✅ 完全对齐 | 587（含 48 数据 only） | — | — |
| 🟡 简化实现（owner-accepted） | 130 | §2.2 / §2.5 simplifications | 按需排期 |
| ⚠ 行为偏差 | 41 | §2.3 | 排期修，无 P0 残留 |
| ❌ 数值/元数据 | 4（schema 上抬） | §2.4 + metadata diff | BGA `isBuyable()` 方法等效行为，OA 把守卫上抬到 `prerequisite` schema 字段 + handler，**UI 清晰度故意保留** |
| 🔀 刻意偏离 BGA | 32 | §2.5 | owner 签字 |
| 🔍 BGA banned but OA active | 33 | §2.5.1 | OA 决议不实施 banned 过滤 |
| ⏳ 待实现 | 1（D159 Reed Seller） | §2.6 | 等"可阻止行动 + 拍卖式选择"基建 |
| 🔍 待 owner 确认 | 14 | §2.7 | BGA 自身有歧义或需 game-design 判断 |

### 1.3 BGA 实现但 OA 完全缺（真 missing — 3 张）

| Card | BGA 状态 | OA 状态 | 备注 |
|---|---|---|---|
| **D75 WoodField** | implemented | 无文件 | sowable field 模型（wood 作物），同 E68_CherryOrchard 套路；2026-04-17 desc audit 发现，未排期 |
| **E80 RockGarden** | implemented | 无文件 | sowable field 模型（stone 作物）；2026-04-17 desc audit 发现，未排期 |
| **E132 Shearer** | BGA `implemented=false`（legacy 名） | 用 E132_VeggieLover（canonical 新印本）已对齐 | 不需要补——BGA 同号双文件，OA 选了 canonical |

---

## 2. 历史审计里程碑

### 2.1 2026-04-17 — Desc 文案级审计（首次）

- 902 张 desc 字面对比（含 Major 10 张）
- **结果**：895 matched / 1 mismatched（E68 CherryOrchard 文案描述模型不同但实现已对齐意图）/ 6 missing
- **missing 6 张归类**：
  - **A113 HeresyTeacher** — BGA 自身 `implemented=false`，OA 2026-04-18 借 Field.stacks 多堆模型抢先实现
  - **C54 MarketStall** — BGA legacy 名，OA 用 C54_MarketBooth canonical
  - **D11 LawnFertilzer**（typo） — BGA legacy `implemented=false`，OA 用正确拼写 `D11_LawnFertilizer`
  - **D75 WoodField** / **E80 RockGarden** — 真 missing，见 §1.3
  - **E132 Shearer** — BGA legacy，OA 用 E132_VeggieLover canonical
- **接班**：2026-04-28 起，desc 对齐通过 `scripts/audit-card-architecture.ts` 的 S11 信号持续监控（当前 0 diff / 0 missing 除上述 3 张）

### 2.2 2026-04-28~29 — 全量行为对齐审计（两阶段，881 张）

**Phase A — 深度池 140 张**（2026-04-28）
- 嫌疑名单合并：68（A 池脚本）+ 5（R3 multi-step）+ 6（R4 BGA `implemented=false` 反向）+ 9（R1 7 天新写）+ 4（§2.5 必加）+ 1（§2.6 必加）+ 46（O1 行数比 1.5-2×）→ 去重 140
- 5 个 sub-agent 按 deck 切，深度 5 维度对比
- Verdict：64 ✅ / 40 🟡 / 18 ⚠ / 13 ❌ / 4 🔀 / 1 🔍

**Phase B — Wide-scan 741 张**（2026-04-29）
- 5 个 sub-agent 紧凑模式 ≤60s/张
- Verdict：475 ✅ + 48 ⚪ / 90 🟡 / 26 ⚠ / 70 ❌ / 1 🔀 / 13 🔍

**两阶段合计**：587 ✅ / 130 🟡 / 44 ⚠ / 83 ❌ / 5 🔀 / 14 🔍

**Top 5 P0 行为错（wide-scan 严重新发现）**：B116 Shoreforester / B14 Hawktower / B133 VillagePeasant / D138 PetLover / E134 Omnifarmer — 全部已修，见 §2.3 Sprint 2。

**SHA 快照**：OA `2b5ddee6` / BGA `3082e4d3`（BGA 远端 ahead 至 `c780b500` 本轮未跟随）

### 2.3 Sprint 1~7 修复时间线（2026-04-29 → 2026-05-13）

详细每条 changelog 见 `card_progress.md` §2.0。

| Sprint / 日期 | 修复主题 | 关键结果 |
|---|---|---|
| **PR-1A** | 10 张 players 字段错（'3+' 应 '4+'）：A154/A158/A160 + C151/C152/C153/C158/C163 + C134 + E154 | 卡池按人数过滤逻辑恢复 |
| **PR-1B** | 16 张 cost/vp 字段：A38/B4/B42/C3/C30/C33/C35/C39/C48/C59/D24/D29/D39/E32/E34/E95 | 主流 cost 偏差清零 |
| **PR-1C** | 5 张 D 卡 prereq handler 注册（D7/D8/D39/D53/D58）+ `meetsTextPrerequisite` 支持复合 prereq | "白买" 系统性问题清零 |
| **Sprint 2 PR-2A~2D** | 5 张 P0 行为错（B116/B14/B133/D138/E134）+ A165 PigBreeder + D60 reserved.clay + onBeforeEndGame hook + future-meeples roomType 扩展 | P0 行为错清零 |
| **Sprint 3** | E149 MidnightFencer 刻意偏离实现，迁入 §2.5 | §2.6 -1 张 |
| **Sprint 4 PR-4A** | A135 AnimalReeve / C136 RanchProvost sharedScoring | sharedScoring 系统性问题清零 |
| **Sprint 4 PR-4B** | 178 张 category 字段批量对齐 BGA | category schema 级问题清零 |
| **Sprint 4 PR-4C** | 跳过：`getExchangeResources` audit premise 错（`player.resources.{animal}` 已聚合 board+supply） | audit claim 撤回 |
| **Sprint 5 / 5b** | mech-A/B/C/D + 围栏入口 (E16 BriarHedge / C16 / C1) + 7 张 P1 行为偏差（A150 / A139 / B42 / B4 / D18 / D160 / C39） | ⚠ 残留转 Sprint 6+ |
| **Sprint 6** | 21 张 A 牌组 extraVp 批量补 + E30 ChildsToy isNewborn 非破坏性 + D12↔D148 互斥 + **14 张 stub 全部归零** | stub 队列归零 |
| **Sprint 7a~7e** | F1 onBuy 截断（8 张）+ 19 张 simplification 复核 + 38 张 prereq 双模注册 + prereq registry 内联化 | prereq 体系统一 |
| **2026-05-12 metadata-3b** | 50 张代码偏差最终对齐（8 banned-auto + 6 players + 11 cost + 6 altCosts + 9 prereq + C148 spot-check）+ 3 parser hotfix | ❌ 33 → 7 |
| **2026-05-13** | C148 extraVp 撤销 / B56 prereq 重写（Fishing-farmer 真语义） / C30+C54 删 OA-extra / D1 zigzag 几何端口 + metadata parser quote-escape fix | ❌ 7 → 4 |

### 2.4 2026-05-12+ 机械化 metadata 审计接班

- 沉淀 `scripts/audit-bga-metadata-diff.ts` → 输出 `docs/operations/bga-metadata-diff-report.md`
- 比对 6 字段：category / extraVp / players / cost / vp / prerequisite
- 每次重跑覆写报告；与 `card_progress.md` §2.4 表头同步
- 累计 parser 修复：cost 单/双引号数字 / prereq `('...')` 简写 unwrap / TS cost JSON 双引号 key / players default '1+' 归一 / cost:{} 标准化 / category quoted-string + hyphens / vp:0 ≡ undefined / altCosts diff / banned no-skip / dual-id canonical pick / PHP quote-escape walker
- `newSet` 字段刻意不与 BGA 对齐（memory `feedback_no_newset_field`）

---

## 3. 当前残留 gap

### 3.1 真 missing 卡（3 张）

见 §1.3。D75 / E80 sowable field 双卡未排期，套 E68 CherryOrchard 模板即可上手。

### 3.2 41 张 ⚠ 行为偏差

详见 `card_progress.md` §2.3。无 P0 残留，全部 P1~P2，包括：
- A10 / B104 / C51 / C125 / D21（Sprint 7c re-audit 5 张 promote）
- B27 Toolbox / D160 Midwife / C23 触发条件 / D117 WoodExpert 等历史 ⚠
- B130 / B150 / B152 `useActionSpace(other)` 语义组

### 3.3 4 张 ❌ schema 上抬（A3 / B154 / B74 / B56）

BGA 这 4 张用 `isBuyable()` 方法实现等效硬检查（PHP 源里 `$this->prerequisite` 空）；OA 把守卫上抬到 `prerequisite` schema 字段 + `prerequisiteCheck` handler，让 UI 能给玩家看到购买条件。**行为对齐，仅元数据字段呈现方式不同**——不属于 bug，OA 风格保留。

### 3.4 i18n 缺口（71 OA + 1477 BGA gap）

- 2026-05-03 i18n-1 基建：扫描 + Gemini Flash 批量翻译 + CI 守门（`pnpm run lint:i18n`）
- 已补 85 zh + 68 en 高频 key（玩家可见 i18n bug 清零）
- BGA 1732 unique `clienttranslate` 仍有 1477 gap（非阻塞，UI 设计架构非 1:1）
- 详见 `docs/i18n-bga-coverage-report.md`

### 3.5 130 张 🟡 简化（owner-accepted）

不是 bug，是签字过的简化。详见 `card_progress.md` §2.2 / §2.5。

### 3.6 未审范围

- **Major Improvements**（10 张）— Sprint 1+ 已主路径覆盖
- **Community / Workshop 卡** — 自定义卡池，无 BGA 对应
- **BGA 远端 ahead commits** — 历史快照冻结到 `3082e4d3`；下次 audit 可跟最新 BGA
- **i18n 翻译质量** — 仅"齐不齐"裁定，不评判翻译信达雅

---

## 4. 审计方法 + 复现

### 4.1 机械化 metadata 审计（推荐每次大改后重跑）

```bash
pnpm tsx scripts/audit-bga-metadata-diff.ts
# 输出: docs/operations/bga-metadata-diff-report.md
```

支持的字段：category / extraVp / players / cost / vp / prerequisite。
报告分 ⚠ literal（auto-fixable）/ ❌ complex（manual review）/ 🔍 single-sided + 🔍 banned-but-present 四类。
`--apply-safe` flag 可自动修 ⚠ literal 类。

### 4.2 架构合规扫描

```bash
pnpm tsx scripts/audit-card-architecture.ts > output/tmp/audit-summary.json
```

机械信号：
- **S1** 主路径 cardId 命中（pay.ts / improvement.ts / game-core.ts）
- **S4** 跨层 import（cards 文件 import server/* 或 client/*）— 当前 0
- **S5** 聚合字段直接 mutation — 当前 0
- **S6** 行数比 OA/BGA 异常
- **S7** 卡牌外 cardId 引用
- **S10** 高度疑似空壳（无 listener / effect / onBuy）
- **S11** desc 对齐（归一化后字面比对）
- **S12** i18n key 缺失

### 4.3 下一次全量行为审计（按 2026-04-28 两阶段方法）

**Phase A 嫌疑构造**：
- 脚本机械信号合并（S1 / S6>1.5× / S10 / S7-filtered）
- **R1** 7 天内新写（git 流量过滤）
- **R2** 跨玩家 scope（`opponent` / `any`）
- **R3** multi-step `resolveChoice`
- **R4** BGA `implemented=false` 反向（实现深度过高的卡）
- **O1** 行数比 1.5-2× 备查池
- 去重后建议 100~150 张

**Phase B Wide-scan**：紧凑模式 ≤60s/张，覆盖深度池外。

**分配**：5 个 sub-agent 按 deck 切（A/B/C/D/E 各一），单 agent ≤30~150 张视模式。

### 4.4 SHA 快照工作流

```bash
# 冻结 SHA
git -C ../bga-agricola rev-parse HEAD > output/tmp/sha-snapshot.txt
git rev-parse HEAD >> output/tmp/sha-snapshot.txt

# 审计完后报告附 SHA
# 历史冻结：OA 2b5ddee6 / BGA 3082e4d3 (2026-04-28)
```

---

## 5. 同号双文件（BGA legacy）

BGA 在同 deck 同 number 留多个 PHP 文件（旧印本与新印本/重命名）。Parser canonical 选择规则：**TS-id-match > non-banned > alphabetic**。

| Deck/Number | Canonical（OA 用） | Legacy（BGA 保留） |
|---|---|---|
| C54 | MarketBooth | MarketStall |
| D11 | LawnFertilizer | LawnFertilzer（typo） |
| E132 | VeggieLover | Shearer |

详见 `docs/operations/bga-metadata-diff-report.md` Appendix。

---

## 6. 不审 / 已废弃声明

- 不实施修复（按 spec，修复另起 brainstorming → sprint）
- 不评判 i18n 翻译质量（仅"齐不齐"）
- 不审 Major Improvements / Community / Workshop
- 原 `card_progress.md` §2.3/§2.4 历史自报"0 张偏差"已被 2026-04-28 审查推翻并修复；当前**权威以 `scripts/audit-bga-metadata-diff.ts` 报告 + `card_progress.md` 同步为准**
- 原 `output/tmp/` sub-agent 详细输出文件（b1~b10.md）位于 gitignored 目录，已丢失；本文档保留聚合发现作为可读快照
