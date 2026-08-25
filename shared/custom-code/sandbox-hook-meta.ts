/**
 * Prompt 描述元数据（单一真相源）：CardEffect hook 的中文说明。
 *
 * 名字白名单由 `cardEffectHooks`（shared/cards/card-effects.ts）拥有；本文件
 * 只补「给 LLM 看的描述」。`CARD_DESIGNER_SYSTEM_PROMPT` 运行时 import 此 map
 * 渲染 effect / 进阶 hook 表，因此描述与名字不会漂移。
 *
 * `Record<CardEffectField, HookMeta>` 提供编译期穷尽性：往 `CardEffectField`
 * 联合新增一个 hook 而不在这里补描述，tsc 直接报错。
 *
 * `CardEffectField` 还包含未进沙盒白名单的官方卡 hook；渲染只遍历
 * `cardEffectHooks`，这些描述保留用于满足 Record 穷尽性。
 */
import type { CardEffectField } from '../cards/card-effects'

export type HookMeta =
  | { table: 'effect'; timing: string; freq: string }
  | { table: 'advanced'; signature: string; usage: string }

export const cardEffectHookMeta: Record<CardEffectField, HookMeta> = {
  // --- effect 阶段 hook：签名 (state, player) => ActionFlow | void（onBuy 额外接收 paymentInfo）---
  onBuy: { table: 'effect', timing: '打出此卡时', freq: '一次' },
  onBeforeWork: { table: 'effect', timing: '工作阶段开始前', freq: '每轮' },
  onRoundStart: { table: 'effect', timing: '新一轮格子翻开后', freq: '每轮' },
  onHarvest: { table: 'effect', timing: '收获各阶段', freq: '约每4-5轮' },
  onRoundEnd: { table: 'effect', timing: '该轮结束', freq: '每轮' },
  onEndTurn: { table: 'effect', timing: '每名玩家行动结束后', freq: '每行动' },
  onReturnHome: { table: 'effect', timing: '工人回家阶段', freq: '每轮' },
  onBeforeReturnHome: { table: 'effect', timing: '工人回家阶段', freq: '每轮' },
  onStartReturnHome: { table: 'effect', timing: '工人回家阶段', freq: '每轮' },
  onAfterRoundEnd: { table: 'effect', timing: '该轮结束', freq: '每轮' },
  onBeforeHarvest: { table: 'effect', timing: '收获开始', freq: '约每4-5轮' },
  onStartHarvest: { table: 'effect', timing: '收获开始', freq: '约每4-5轮' },
  onStartHarvestFieldPhase: { table: 'effect', timing: '收割田地阶段', freq: '约每4-5轮' },
  onHarvestFieldPhase: { table: 'effect', timing: '收割田地阶段', freq: '约每4-5轮' },
  onEndHarvestFieldPhase: { table: 'effect', timing: '收割田地阶段', freq: '约每4-5轮' },
  onAfterReap: { table: 'effect', timing: '田地收割完成后', freq: '约每4-5轮' },
  onStartHarvestFeedingPhase: { table: 'effect', timing: '喂食阶段', freq: '约每4-5轮' },
  onHarvestFeedingPhase: { table: 'effect', timing: '喂食阶段', freq: '约每4-5轮' },
  onEndHarvestFeedingPhase: { table: 'effect', timing: '喂食阶段', freq: '约每4-5轮' },
  onEndHarvest: { table: 'effect', timing: '收获各阶段', freq: '约每4-5轮' },
  onAfterHarvest: { table: 'effect', timing: '收获各阶段', freq: '约每4-5轮' },
  onBeforeEndGame: { table: 'effect', timing: '终局结算前', freq: '全局一次' },
  onBeforeStartOfTurn: { table: 'effect', timing: '每轮发新行动前', freq: '每轮' },
  onBeforePlayerTurn: {
    table: 'effect',
    timing: '玩家个人回合开始前（non-flow skip-control，只可返回 {skipTurn:true} 跳过本人回合，不返回 ActionFlow）',
    freq: '每行动',
  },
  onAllWorkersPlaced: { table: 'effect', timing: '所有工人放置完成', freq: '每轮' },
  contributeExtraTurn: {
    table: 'effect',
    timing: '轮转额外行动（无普通工人但仍持后代时返回 XOR[用, 放弃]）',
    freq: '每轮转',
  },

  // --- 进阶 hook：签名与普通 hook 不同 ---
  resolveChoice: { table: 'advanced', signature: '(state, player, choice) => ActionFlow', usage: '处理玩家选择；沙盒不传 ctx' },
  computeBonusScore: {
    table: 'advanced',
    signature: '(state, player, ctx) => number',
    usage: '终局加分（返回 VP 数，不是 {score,label}）',
  },
  computeSharedPostScore: {
    table: 'advanced',
    signature: '(state, owner, summaries) => Array<{playerId, score}>',
    usage: '跨玩家加分',
  },
  computeCostedBonus: {
    table: 'advanced',
    signature: '(state, player, ctx) => BonusScoreLevel[]',
    usage: '终局花资源换 VP（声明 levels；solver 枚举最优组合）',
  },
  computeExtraRoomCapacity: { table: 'advanced', signature: '(player) => number', usage: '额外容纳空间' },
  computeHarvestBreedOrderPriority: {
    table: 'advanced',
    signature: '(state, player) => number | void',
    usage: 'Harvest breeding phase 顺序调整，数字越大越晚',
  },
  onComputeAnimalZones: {
    table: 'advanced',
    signature: '(player, zones, state) => AnimalZone[]',
    usage: '动物分区扩展；只返回新增 zones，不要拼接传入的 zones；原地修改无效',
  },
  onComputeSowableFields: { table: 'advanced', signature: '(player) => ExtraSowableField[]', usage: '返回额外可播种田' },
  onSowExtraField: { table: 'advanced', signature: '返回额外可播种田', usage: '播种扩展' },
  computeLockedFarmTiles: { table: 'advanced', signature: '(player) => FarmTilePosition[]', usage: '返回锁定位置' },
  getInvalidAnimals: {
    table: 'advanced',
    signature: '(player, zone, meeples) => Meeple[]',
    usage: '卡牌专属动物分区禁入校验；沙盒不传 state',
  },
  getSpecialStablePositions: {
    table: 'advanced',
    signature: '(state, player) => FarmTilePosition[]',
    usage: 'Build Stables 特殊 stable（如 B85 的 2×2 中心）',
  },
  applySpecialStable: {
    table: 'advanced',
    signature: '(state, player[, position]) => FarmTilePosition[] / boolean',
    usage: 'Build Stables 特殊 stable（如 B85 的 2×2 中心）',
  },
  getBuiltSpecialStables: {
    table: 'advanced',
    signature: '(player) => FarmTilePosition[]',
    usage: '当前矗立的特殊 stable（驱动 snapshot specialStables 展示派生）',
  },

  // 联合成员但不在 cardEffectHooks 数组，不会被渲染进 prompt（仅为 Record 穷尽性）
  onComputeSharedAnimalZones: {
    table: 'advanced',
    signature: '修改共享 zones 数组',
    usage: '共享动物分区扩展（跨玩家）',
  },
}
