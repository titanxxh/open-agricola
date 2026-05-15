# 卡牌描述审计

> 本文只记录当前 card desc、metadata 与 BGA 名称映射审计结论；已完成批次说明不在本文保留。

## 1. 当前结论

Open Agricola 对当前 BGA card metadata 的 canonical 覆盖已经完整：

| 检查项 | 结果 |
|---|---:|
| BGA canonical 卡牌数 | 888 |
| OA canonical 卡牌 bucket 数 | 888 |
| BGA-only canonical bucket | 0 |
| OA-only canonical bucket | 0 |
| literal metadata mismatch | 0 |
| complex metadata / schema-up mismatch | 4 |
| BGA-banned 但 OA 保留 | 33 |

card desc / metadata 的 literal 层面当前没有差异。剩余工作分两类：
运行时行为 / 注册差异见 `docs/card_progress.md`；策略或 schema-up 差异见下文。

## 2. Canonical 名称映射

审计脚本在比较覆盖率前会归一化已知 BGA legacy 名称。

| Canonical 卡牌 | Legacy / alternate source 名称 | 当前处理 |
|---|---|---|
| `C54_MarketBooth` | `C54_MarketStall` | 以 `MarketBooth` 为 canonical。 |
| `C71_Slurry` | `C71_SlurrySpreader` | 以 `Slurry` 为 canonical；OA 已删除 legacy wrong-name 条目。 |
| `D11_LawnFertilizer` | `D11_LawnFertilzer` | 以正确拼写 `LawnFertilizer` 为 canonical。 |
| `E132_VeggieLover` | `E132_Shearer` | 以 `VeggieLover` 为 canonical。 |

`D159_ReedSeller` 也不是缺失实现：BGA 标记 `implemented=false`，OA 当前保留 data-only 定义。

## 3. Complex Metadata 差异

BGA 将这些 buyability 规则写在自定义代码里，而不是普通 metadata prerequisite。OA 保留显式 prerequisite metadata，目的是让 UI 和测试更清晰。

| 卡牌 | OA 字段 | BGA 形态 | 当前状态 |
|---|---|---|---|
| `A3_PaperKnife` | 显式 `prerequisite` label / handler。 | 自定义 `isBuyable`，没有 plain prerequisite 字段。 | 接受为 schema-up 差异。 |
| `B154_SheepKeeper` | 显式 `prerequisite` label / handler。 | 自定义 `isBuyable`，没有 plain prerequisite 字段。 | 接受为 schema-up 差异。 |
| `B56_Brook` | 显式 `prerequisite` label / handler。 | 自定义 `isBuyable`，没有 plain prerequisite 字段。 | 接受为 schema-up 差异。 |
| `B74_ThickForest` | 显式 `prerequisite` label / handler。 | 自定义 `isBuyable`，没有 plain prerequisite 字段。 | 接受为 schema-up 差异。 |

## 4. BGA-Banned 但 OA 保留

BGA 将这些卡标为 banned / non-standard，但 OA 当前按产品策略保留。它们不应计入 metadata mismatch。

`A131_GuestRoom`, `A133_ClappingArea`, `A14_CarpentersHammer`,
`A33_RecycledBrick`, `A39_Smallholding`, `A48_StableDeliveryman`,
`A82_Wintercrafter`, `A97_BreadCarrier`, `B10_ChickenCoop`,
`B117_Mastermind`, `B132_FestivalManager`, `B151_Tradesperson`, `B15_Flail`,
`B161_Trident`, `B21_FarmSchoolGraduate`, `B22_Punner`, `C102_SackCart`,
`C125_Educator`, `C28_FishingNet`, `C31_ShepherdsPipe`,
`C3_CarpentersBench`, `C60_CatLover`, `C63_GoatCatcher`,
`C99_GardenDesigner`, `D137_Countryman`, `D19_DrinkerOfAbsinthe`,
`D21_BrushwoodRoof`, `D33_MasterBreeder`, `D4_ChickenFeeder`,
`D74_TenantFarmer`, `D92_SnackTime`, `D97_AutonomousPicker`,
`E22_FieldWatchman`.

## 5. 行为审计交接

本文件不裁定运行时等价性。当前行为 gap 以 `docs/card_progress.md` 第 2 节为准，目前队列是：

`A148_Woolgrower`, `B86_TruffleSearcher`, `B157_Salter`,
`C8_PlantFertilizer`, `C140_PackagingArtist`, `D13_Trowel`,
`D15_ClaySupports`, `D66_PotterCeramics`, `E5_NightLoot`.

## 6. 复现

运行机械 metadata 报告：

```bash
pnpm exec tsx scripts/audit-bga-metadata-diff.ts
```

当前期望摘要：

```text
Total BGA cards scanned: 888
Total TS cards scanned: 888
literal: 0
complex: 4
BGA-only canonical ids: 0
TS-only canonical ids: 0
Banned-but-present cards: 33
```
