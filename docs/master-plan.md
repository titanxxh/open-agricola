# 总计划

> 本文只记录当前执行计划；已完成批次说明不在本文保留。

## 1. 目标

在 BGA 被选为规则来源的范围内，收敛 Open Agricola 的卡牌行为与 metadata；同时把明确的产品策略差异单独列出，避免它们混进实现待办。

当前目标状态：

- canonical 覆盖维持 `888 / 888`。
- literal metadata mismatch 维持 `0`。
- `docs/card_progress.md` 中的 10 个行为 / 注册 gap 被修掉，或明确迁入刻意差异。
- BGA-banned 但 OA 保留的卡继续作为策略差异记录，不当作 bug。

## 2. 当前工作队列

| 优先级 | 卡牌 | 原因 |
|---|---|---|
| P0 | `D13_Trowel`, `D15_ClaySupports`, `D66_PotterCeramics` | 翻修 / 烘焙支付路径和 BGA 不一致，属于核心规则流。 |
| P0 | `A148_Woolgrower`, `B86_TruffleSearcher` | 晚打出后容量计算错误，会漏算之前的收获阶段。 |
| P1 | `B157_Salter`, `C57_Crudite`, `E5_NightLoot` | 需要显式玩家选择，不能继续用 first-match 或单选 shortcut。 |
| P1 | `C8_PlantFertilizer` | D75 / E80 等后续 field 卡已激活，需要支持逻辑 field group。 |
| P2 | `C140_PackagingArtist` | 需要可复用的 replacement action-pool 扩展点。 |

## 3. 建议拆分

### Wave A：局部规则修复

范围：

- `A148_Woolgrower` 和 `B86_TruffleSearcher` 改用全局 completed feeding / harvest 计数。
- 修复 `D66_PotterCeramics`，让 bake continuation 必选。

验证：

- `A148` / `B86` 晚打出容量的 targeted session tests。
- `D66` 转换后必须 bake 的 targeted session test。
- `pnpm test:fast`
- `pnpm run lint`

### Wave B：支付与翻修 flow

范围：

- 建模 `D13_Trowel` 的 wood -> stone 翻修。
- 将 `D15_ClaySupports` 建模为 optional alternate payment / trade，而不是强制 cost delta。

验证：

- `D13` wood -> stone 翻修 targeted session tests。
- `D15` base cost + optional clay trade targeted payment tests。
- 相关现有 renovate / payment tests。
- `pnpm test:fast`
- `pnpm run lint`

### Wave C：显式选择与 Action-Pool 语义

范围：

- `B157_Salter` 从单选 flow 改为多类型计数选择。
- `C57_Crudite` harvest 行为改为 optional source choice。
- `E5_NightLoot` 增加精确 source-space 选择。
- `C8_PlantFertilizer` 支持 grain / vegetable / wood / stone 的 field group。
- 增加 `C140_PackagingArtist` 所需的 replacement action-pool 扩展点。

验证：

- 每张卡先跑一个 targeted slow / session test。
- 对涉及 multi-listener 或 multi-option pending 的路径补 regression case。
- targeted case 通过后再考虑更大的 slow 范围。
- `pnpm test:fast`
- `pnpm run lint`

## 4. 文档规则

每次改卡牌相关代码时，同步更新：

- `docs/card_progress.md`：修复后把卡从当前队列移出，或调整 accepted divergence 行。
- `docs/card_desc_audit.md`：仅当 metadata、desc、canonical 名称或 audit 数字变化时更新。
- `docs/master-plan.md`：仅当优先级、wave 拆分或剩余范围变化时更新。
- `docs/ARCHITECTURE.md`：只有通用 engine / ActionFlow / pending 机制变化时更新。

除非明确要求，不要 commit `docs/superpowers/*`。

## 5. 验证策略

优先用 targeted 验证，不先跑大范围 suite：

```bash
pnpm exec vitest run <targeted-test-file>
pnpm test:fast
pnpm run lint
```

`pnpm test:slow` 只对受影响的 session / card flow 选择性运行。全量 slow 可以放在大合并前，但不应作为单卡 regression 的第一步诊断。

metadata 或 card registry 变化后运行：

```bash
pnpm exec tsx scripts/audit-bga-metadata-diff.ts
```

## 6. 完成定义

这一轮 BGA 对齐完成的条件：

- `docs/card_progress.md` 中行为 / 注册 gap 为 0，或所有剩余项都明确迁入刻意差异。
- `scripts/audit-bga-metadata-diff.ts` 报告：
  - BGA scanned: `888`
  - TS scanned: `888`
  - literal mismatches: `0`
  - complex / schema-up mismatches: 已接受并记录
  - BGA-only / TS-only canonical ids: `0 / 0`
- 每张修复卡的 targeted tests 通过。
- PR 合并前 `pnpm test:fast` 和 `pnpm run lint` 通过。
