# Card Description Audit vs BGA

对比 `shared/cards/**/*.ts` 中 `desc` / `description` 字段与 `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/` 中 `$this->desc` 的差异。

> **范围**：本文件**只**做 desc / description 文本级别的对齐审计。
> 行为/实现差异（刻意简化、刻意不同、BGA 行为复核 TODO）统一在 `docs/card_progress.md` 追踪。

> **比对方法**：脚本（`/tmp/audit_descs.py`）按文件名抓 BGA `Major_*.php` / `[A-E]\d+_*.php`，按文件名抓我们的 TS（major 文件按 `id: 'Major_xxx'` 抓，其它按文件名 `[A-E]\d+_*.ts`），逐字符串比较。归一化规则：
> - JS 转义（`\u00a0`、`\xNN`、`\\`）解码到字面字符
> - 弯引号 `‘ ’ “ ”` → 直引号 `' '`
> - NBSP（`\u00a0`）→ 普通空格
> - 连续空白合并、首尾去空白
>
> 其它（标点、`<TOKEN>`、`__斜体__`、Unicode `→` 等）一律严格相等。

## Totals

| Deck | BGA cards | Matched | Mismatched | Missing in ours | Extra in ours |
|---|---|---|---|---|---|
| A | 180 | 179 | 0 | 1 | 0 |
| B | 180 | 180 | 0 | 0 | 0 |
| C | 182 | 181 | 0 | 1 | 0 |
| D | 181 | 179 | 0 | 2 | 0 |
| E | 169 | 166 | 1 | 2 | 0 |
| Major | 10 | 10 | 0 | 0 | 0 |
| **Total** | **902** | **895** | **1** | **6** | **0** |

> 之前一版（164 mismatch + 7 missing）的所有图标 token、`<PIG>` / `<ARROW>` / `__…__` / "(including you)" / "from the general supply" / Major 重写、A60 等问题已经全部对齐。
>
> 本轮新增对齐：`A159_JoinerOfSea` → `A159_JoineroftheSea`（文件名 / `CARD_ID` / 常量 / listener id / 测试全部改名）。

## Real desc mismatches

### E68_CherryOrchard — 文案描述模型不同（实现已对齐意图）

| | 文案 |
|---|---|
| Ours | `This card is a field that can only grow <WOOD>. During each harvest, you receive 1 <WOOD> from this card. When you harvest the last <WOOD>, you also receive 1 <VEGETABLE>.` |
| BGA  | `This card is a field on which you can only sow and harvest wood as you would grain. Each time you harvest the last <WOOD> from this card, you also get 1 <VEGETABLE>.` |

实现已经按"虚拟 sowable field"实现（`onComputeSowableFields` + `onSowExtraField` 用 `wood` 作物，参见 `shared/cards/E/E68_CherryOrchard.ts`），与 BGA 的 "sow & harvest wood as you would grain" 模型一致。差异只是描述措辞——可以直接把 desc 改成 BGA 原文。

## Naming-only divergences (内容一致，仅 ID/文件名不同)

| Ours | BGA | 状态 |
|---|---|---|
| ~~`A159_JoinerOfSea`~~ → `A159_JoineroftheSea` | `A159_JoineroftheSea` | ✅ 已对齐（已改名） |
| `C54_MarketBooth` | `C54_MarketStall` + `C54_MarketBooth` | BGA 同时保留两个文件：`C54_MarketBooth.php`（新印本）与 `C54_MarketStall.php`（legacy，文件头注释 `// LEGACY - REPRINTINGS OF THIS CARD RENAME IT MARKET BOOTH`）。我们只持有 `MarketBooth`，与 BGA 新印本一致。 |
| `D11_LawnFertilizer` | `D11_LawnFertilizer` + `D11_LawnFertilzer`（typo） | ✅ 我们用的是正确拼写 `D11_LawnFertilizer`，与 BGA 新印本逐字相同；BGA 那个拼错的 legacy 文件 (`LawnFertilzer`) 在 BGA 里已 `implemented = false`，我们不需要做任何事。 |

## Truly missing in ours (BGA-only, 非 legacy)

| Card | Deck | BGA 状态 | 描述 |
|---|---|---|---|
| A113_HeresyTeacher | A | `implemented = false` | "Each time you use a 'Lessons' action space, you get 1 vegetable in each of your fields with at least 3 grain and no vegetable. Place the vegetable below the grain." |
| C54_MarketStall | C | implemented (legacy 名) | 见 "Naming-only divergences"——我们用的是 `C54_MarketBooth`，desc 一致。 |
| D75_WoodField | D | implemented | "You can plant `<WOOD>` on this card as though it were 2 fields, but it is considered 1 field. Sow and harvest `<WOOD>` on this card as you would `<GRAIN>`." |
| E80_RockGarden | E | implemented | "You can only plant `<STONE>` on this card. Plant as though it were 3 fields, but it is considered 1 field. Sow and harvest `<STONE>` on this card as you would vegetables." |
| E132_Shearer | E | `implemented = false` | "In the field phase of each harvest, if you have at least 1/4/7 sheep, you get 1/2/3 food. (Keep the sheep.) During scoring, you get 1 bonus point for every 3 sheep." |

> A113 和 E132 在 BGA 自己也是 `implemented = false`；D75 / E80 是 sowable field 类，与 E68_CherryOrchard 同款套路（用 `onComputeSowableFields` + `onSowExtraField`）可以套着实现。

## Major cards — 已全部对齐 ✅

10 张 Major 全部逐行对齐（fireplace1/2 与 cookingHearth1/2 通过 spread 复用同一份 `description`，与 BGA 两个 PHP 文件复制粘贴的文本完全相等）。之前 audit 提到的 "ours uses prose with `→` + explicit `(max N)`" 已经全部改成 `<ARROW>` / `<ARROW-1X>` / `<ARROW-2X>` 的 token 形式。

---

## 行为差异 / 实现复核 → 见 `card_progress.md`

以下内容已迁出本文件，请到 `docs/card_progress.md` 查看：

- **§5 刻意不同（与 BGA 实现意图分歧）** — A25 Bassinet、B30 WoodPalisades、B38 FutureBuildingSite、B132 EstateMaster、D161 CabbageBuyer、E132 VeggieLover 各自的偏离原因和回归代价。
- **§6 BGA desc 已对齐，但实现需逐项复核（23 张）** — A48 ShavingHorse、A101 CookeryOutfitter、A134 FullFarmer、A142 Cordmaker、A153 PigOwner、B39 Loom、D38 MilkingStool、B143 ClayWarden、B153 Housemaster、B159 LieutenantGeneral、C129 WetNurse、C137 Baker、D29 MuckRake、D31 Storeroom、D33 SummerHouse、D34 LuxuriousHostel、D35 FodderChamber、D60 LargePottery、D150 GodlySpouse、D154 ChimneySweep、E101 Blighter、E144 WaresSalesman、E154 Margrave、E156 ClaypitOwner。
- **§4 刻意简化** — 同上。
