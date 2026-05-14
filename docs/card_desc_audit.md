# Card Audit vs BGA — 综合审查文档

> **文档角色**：卡牌对齐审计的**方法论 + 历史里程碑 + 当前残留清单**。
>
> **进度权威源**：`docs/card_progress.md`。本文件不复述其逐张卡状态，只做"全局图景 + 审计工具 + 未对齐 gap"汇总。
>
> **覆盖维度**：(1) 行为对齐 (2) 数值/元数据对齐 (3) desc 文案对齐 (4) 架构合规。

---

## 1. 当前对齐状态（截至 2026-05-14）

### 1.1 总览
- BGA canonical 卡数 888 / OA canonical TS bucket 888（含 33 张 BGA banned，OA 不实施过滤）
- OA physical card files 是 889 display / 889 impl；多出来的 1 张是 `C71_SlurrySpreader` legacy wrong-name duplicate，已登记到 `card_progress.md` §2.3
- `docs/operations/bga-metadata-diff-report.md` 机械化 metadata 报告（2026-05-14 重跑，BGA `f6647b9f`）：⚠ 0 / ❌ 4 / 🔍 single-sided 0 / 🔍 33 banned
- BGA active implemented 而 OA 完全缺：0 张（详见 §3.1）

### 1.2 Verdict 分布（按 `card_progress.md` §1 / §2）

| 维度 | 数量 | 出处 | 处理 |
|---|---|---|---|
| ✅ 完全对齐 | 587+（旧审计已确认 587；后续修复持续迁入，未重跑全量行为审计） | — | — |
| 🟡 简化实现（历史候选） | 历史 130 候选；当前单独 🟡 队列为 0，15 张 Sprint 7c keep + 3 张 source-documented simplification 迁入 §2.5 | §2.2 / §2.5 simplifications | 不再按 130 作为当前 backlog |
| ⚠ 行为/注册偏差 | 11（2026-05-14 全量重审新增） | §2.3 | 已逐卡登记；修复前补对应 session/unit 测试 |
| ❌ 数值/元数据 | 4（schema 上抬） | §2.4 + metadata diff | BGA `isBuyable()` 方法等效行为，OA 把守卫上抬到 `prerequisite` schema 字段 + handler，**UI 清晰度故意保留** |
| 🔀 刻意偏离 BGA | 不再使用历史 `31` 聚合数 | §2.5 | 以 §2.5 主表、keep simplification 表、banned 表逐项为准 |
| 🔍 BGA banned but OA active | 33 | §2.5.1 | OA 决议不实施 banned 过滤 |
| ⏳ 待实现 / 待评估 | 0（D159 是 BGA `implemented=false` data-only，不算 BGA 对齐 gap） | §2.6 | 如要超越 BGA 实现 D159，单独立项 |
| 🔍 待 owner 确认 | 0（旧 14 已收口 / 重分类） | §2.7 | 当前没有可执行 owner 决策队列 |

### 1.3 BGA 实现但 OA 完全缺（真 missing — 0 张 active；1 张 BGA legacy 不需要补）

| Card | BGA 状态 | OA 状态 | 备注 |
|---|---|---|---|
| **E132 Shearer** | BGA `implemented=false`（legacy 名） | 用 E132_VeggieLover（canonical 新印本）已对齐 | 不需要补——BGA 同号双文件，OA 选了 canonical |

> **2026-05-13 更新**：D75 WoodField / E80 RockGarden 从 Sprint 7d `implemented:false` stub 升级为完整 multi-slot sowable-field 实现（详见 `card_progress.md` §2.0 同日条目），从此表移除。

---

## 2. 历史审计里程碑

### 2.1 2026-04-17 — Desc 文案级审计（首次）

- 902 张 desc 字面对比（含 Major 10 张）
- **结果**：895 matched / 1 mismatched（E68 CherryOrchard 文案描述模型不同但实现已对齐意图）/ 6 missing
- **missing 6 张归类**：
  - **A113 HeresyTeacher** — BGA 自身 `implemented=false`，OA 2026-04-18 借 Field.stacks 多堆模型抢先实现
  - **C54 MarketStall** — BGA legacy 名，OA 用 C54_MarketBooth canonical
  - **D11 LawnFertilzer**（typo） — BGA legacy `implemented=false`，OA 用正确拼写 `D11_LawnFertilizer`
  - **D75 WoodField** / **E80 RockGarden** — 当时真 missing，2026-05-13 已完整实现并从 missing 表移除
  - **E132 Shearer** — BGA legacy，OA 用 E132_VeggieLover canonical
- **接班**：历史 S11 脚本已删除；当前以 `scripts/audit-bga-metadata-diff.ts` 的 single-sided 报告 + 定向源码复核接班（2026-05-14：BGA-only 0 / TS-only 0）

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

### 3.1 真 missing 卡（0 张 active）

D75 WoodField / E80 RockGarden 已 2026-05-13 完整实现（multi-slot sowable field）。E132_Shearer 是 BGA `implemented=false` legacy 名，OA 用 E132_VeggieLover canonical 已对齐，不需要补。

2026-05-14 机械重跑确认：BGA-only 0、TS-only 0。D159 Reed Seller 在 BGA 源码中显式 `$this->implemented = false`，OA 也仅保留 data-only card definition；这不是"BGA 有实现但 OA 缺实现"。

### 3.2 ⚠ 行为/注册偏差（当前 11 张）

详见 `card_progress.md` §2.3 当前队列表。旧 `41 张` 数字是 stale aggregate：Sprint 7a 已收口 Sprint 7 audit 的 P0/P1 主体，Sprint 7d 修 A10 / C51 / C125 / D21 / B104，Sprint 7e 修 prereq 双模 38 张并确认 5 张 BGA 也 label-only，2026-05-14 `178b2146` 又补了 B104 forced reorg 后 harvest breed resume。但本轮重新按最新代码/BGA 源码并行审计后，发现当前仍有 11 张未修行为/注册 gap：

| 卡牌 | 原始描述 | 当前问题 | BGA 差距 | 处理 / 证据 |
|---|---|---|---|---|
| A148 Woolgrower | 容纳羊，容量等于 completed feeding phases | 用本卡 counter，只从打出后开始计数 | BGA 用全局 completed feeding phases，晚打也应有容量 | `card_progress.md` §2.3 |
| B86 TruffleSearcher | 容纳野猪，容量等于 completed feeding phases | 同 A148 | BGA 同样用全局 completed feeding phases | `card_progress.md` §2.3 |
| B157 Salter | 腌制动物换未来食物 | 只允许一次三选一且每次 1 只动物 | BGA 一次可选多种/多只动物并按类型排未来食物 | `card_progress.md` §2.3 |
| C8 PlantFertilizer | 给“恰好 1 作物”的逻辑田补作物 | 只支持 grain/vegetable 物理 field | BGA groupFields 且支持 WOOD/STONE；D75/E80 已上线 | `card_progress.md` §2.3 |
| C57 Crudite | 丢田里蔬菜换 4 food | harvest phase 强制移除第一个符合条件蔬菜 | BGA optional 且多田可选 source | `card_progress.md` §2.3 |
| C71 Slurry / SlurrySpreader | breeding 后可 Sow | OA 注册两张同号同效果 C71 | BGA `SlurrySpreader` 是 `implemented=false` wrong-name legacy | `card_progress.md` §2.3 |
| C140 PackagingArtist | Minor Improvement action 可改 Bake Bread | 未把 Major Improvement action 加入可替换 action pool | BGA `onPlayerComputeArgsPlaceFarmer` 加 visible Major Improvement action | `card_progress.md` §2.3 |
| D13 Trowel | 任意时机翻修到 stone | 木屋仍走 wood->clay | BGA `toStone=true` 支持 wood->stone | `card_progress.md` §2.3 |
| D15 ClaySupports | clay room 可用替代费用 | 强制替代费用，不能选择原 base cost | BGA 追加 alternative trade，保留 base cost | `card_progress.md` §2.3 |
| D66 PotterCeramics | bake 前 clay->grain | 换粮后仍可 skip bake | BGA 使用换粮后强制 bake | `card_progress.md` §2.3 |
| E5 NightLoot | 从累积格拿不同 building resources | 每种资源自动取第一个匹配 space | BGA 玩家选择具体 space/resource | `card_progress.md` §2.3 |

### 3.3 4 张 ❌ schema 上抬（A3 / B154 / B74 / B56）

BGA 这 4 张用 `isBuyable()` 方法实现等效硬检查（PHP 源里 `$this->prerequisite` 空）；OA 把守卫上抬到 `prerequisite` schema 字段 + `prerequisiteCheck` handler，让 UI 能给玩家看到购买条件。**行为对齐，仅元数据字段呈现方式不同**——不属于 bug，OA 风格保留。

### 3.4 i18n 缺口（71 OA + 1477 BGA gap）

- 2026-05-03 i18n-1 基建：扫描 + Gemini Flash 批量翻译 + CI 守门（`pnpm run lint:i18n`）
- 已补 85 zh + 68 en 高频 key（玩家可见 i18n bug 清零）
- BGA 1732 unique `clienttranslate` 仍有 1477 gap（非阻塞，UI 设计架构非 1:1）
- 详见 `docs/i18n-bga-coverage-report.md`

### 3.5 🟡 简化候选（历史 130；当前单独队列 0）

`130 张` 是 2026-04-28/29 行为审计产出的历史候选总数，不是当前仍然存在的 130 张 owner-accepted backlog。2026-05-02 Sprint 7 复核后，候选被拆分为：29 张已对齐、27 张进入 §2.5 进一步分类、61 张真偏差进入后续修复、14 张名单 typo / ID collision 清理。Sprint 7c 又把 27 张 source-verified 为 6 张 aligned、16 张 keep、5 张 promote-to-fix。2026-05-14 重审后 C8 因 D75/E80 已上线迁回 §2.3；当前仍明确保留的 simplification 见 `card_progress.md` §2.5 的 keep 表和 source-documented simplification 表。

### 3.6 Owner-confirm 队列（当前 0 张）

旧 `14 张待 owner 确认` 是 2026-04-28/29 人工审计的聚合数字，不是当前可执行卡牌清单；原 sub-agent 逐卡输出在 gitignored `output/tmp/` 下，已不能作为当前权威来源。按最新代码与文档复核后，当前没有"先决策、不能直接开发"的 owner-confirm 队列。

| 历史来源 | 最新处理 |
|---|---|
| A14/A33/A100 等 BGA banned / draft-policy 分歧 | 归入 §2.5.1：OA 明确不实施 banned 过滤，33 张统一登记 |
| A22 Telegram extraPlacement 时序差异 | 已归入 §2.5 deliberate divergence |
| E58/E139/E153/E155/C62 等 stub / missing 批次 | Sprint 6a/6c/6d/6e 已实现，stub 队列归零 |
| A135/C136 sharedScoring 机制 | Sprint 4 PR-4A 已收口 |
| Sprint 7 stale-list / ID-collision 类条目 | Sprint 7a/7d/7e 与 2026-05-14 follow-up 已重分类或清理；新发现必须逐卡重审后登记 |

### 3.7 未审范围

- **Major Improvements**（10 张）— Sprint 1+ 已主路径覆盖
- **Community / Workshop 卡** — 自定义卡池，无 BGA 对应
- **历史行为审计快照** — 2026-04-28 人工行为审计冻结在 OA `2b5ddee6` / BGA `3082e4d3`；2026-05-14 metadata 机械审计已跟当前 BGA `f6647b9f` 重跑
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

历史审计使用过的 `scripts/audit-card-architecture.ts` 已不在当前代码库；不要再按旧命令复现。当前可复现的机械入口是 metadata diff，架构/行为复核改用定向 `rg` 信号 + 源码对照：

```bash
pnpm exec tsx scripts/audit-bga-metadata-diff.ts
rg -n "TODO|stub|implemented=false|isImplemented=false|owner 确认|待 owner|待实现|待评估" shared/cards shared/cards-display docs -g '!docs/superpowers/**'
```

人工复核仍按旧 S 信号的意图执行：主路径 cardId 命中、跨层 import、聚合字段 mutation、OA/BGA 行数异常、卡牌外 cardId 引用、空壳卡、desc 对齐和 i18n 缺口。

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
| C71 | Slurry | SlurrySpreader（BGA `implemented=false` wrong-name；OA 当前误注册为第二张实现，见 `card_progress.md` §2.3） |
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
