export const roundPreparationHooks = [
  'onBeforeStartOfTurn', 'onAfterRevealAction', 'onPreparation', 'onRoundStart',
  'onEndPreparation', 'onBeforeWork', 'onWorkStart',
] as const
export type RoundPreparationHook = typeof roundPreparationHooks[number]
export type RoundPreparationContext =
  | { kind: 'before-reveal'; nextRound: number }
  | { kind: 'after-reveal'; revealedAction: { actionId: string; roundSlot: number } | null }

export type CardEffectHook = 'onBuy' | RoundPreparationHook | 'onHarvest' | 'onRoundEnd' | 'onEndTurn' | 'onReturnHome'
  | 'onBeforeReturnHome' | 'onStartReturnHome' | 'onAfterReturnHome'
  | 'onAfterRoundEnd'
  | 'onBeforeHarvest' | 'onStartHarvest'
  | 'onStartHarvestFieldPhase' | 'onHarvestFieldPhase' | 'onEndHarvestFieldPhase'
  | 'onAfterReap'
  | 'onStartHarvestFeedingPhase' | 'onHarvestFeedingPhase' | 'onEndHarvestFeedingPhase'
  | 'onEndHarvest' | 'onAfterHarvest'
  | 'onBeforeEndGame'
  | 'onBeforeStartOfTurn'
  | 'onBeforePlayerTurn'
  | 'onAllWorkersPlaced'

export type FlowCardEffectHook = Exclude<CardEffectHook, 'onBeforePlayerTurn'>

export const flowCardEffectHooks: FlowCardEffectHook[] = [
  'onBuy',
  'onBeforeWork',
  'onAfterRevealAction',
  'onPreparation',
  'onEndPreparation',
  'onWorkStart',
  'onRoundStart',
  'onHarvest',
  'onRoundEnd',
  'onEndTurn',
  'onReturnHome',
  'onBeforeReturnHome',
  'onStartReturnHome',
  'onAfterReturnHome',
  'onAfterRoundEnd',
  'onBeforeHarvest',
  'onStartHarvest',
  'onStartHarvestFieldPhase',
  'onHarvestFieldPhase',
  'onEndHarvestFieldPhase',
  'onAfterReap',
  'onStartHarvestFeedingPhase',
  'onHarvestFeedingPhase',
  'onEndHarvestFeedingPhase',
  'onEndHarvest',
  'onAfterHarvest',
  'onBeforeEndGame',
  'onBeforeStartOfTurn',
  'onAllWorkersPlaced',
]

/**
 * Stage hooks that run in a frozen-order reaction window (#2039). The preparation
 * hooks have their own window, `onEndTurn` the Turn-end window, and `onBuy` runs on play.
 */
export const reactionWindowHooks = [
  'onAllWorkersPlaced',
  'onBeforeReturnHome', 'onStartReturnHome', 'onReturnHome', 'onAfterReturnHome',
  'onRoundEnd', 'onAfterRoundEnd',
  'onBeforeHarvest', 'onStartHarvest',
  'onStartHarvestFieldPhase', 'onHarvestFieldPhase', 'onAfterReap', 'onEndHarvestFieldPhase',
  'onHarvest', 'onStartHarvestFeedingPhase', 'onHarvestFeedingPhase', 'onEndHarvestFeedingPhase',
  'onEndHarvest', 'onAfterHarvest',
  'onBeforeEndGame',
] as const satisfies readonly FlowCardEffectHook[]
export type ReactionWindowHook = typeof reactionWindowHooks[number]
