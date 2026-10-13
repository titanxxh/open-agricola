export const roundPreparationHooks = [
  'onBeforeStartOfTurn', 'onAfterRevealAction', 'onPreparation', 'onRoundStart',
  'onEndPreparation', 'onBeforeWork', 'onWorkStart',
] as const
export type RoundPreparationHook = typeof roundPreparationHooks[number]
export type RoundPreparationContext =
  | { kind: 'before-reveal'; nextRound: number }
  | { kind: 'after-reveal'; revealedAction: { actionId: string; roundSlot: number } | null }

export type CardEffectHook = 'onBuy' | RoundPreparationHook | 'onHarvest' | 'onRoundEnd' | 'onEndTurn' | 'onReturnHome'
  | 'onBeforeReturnHome' | 'onStartReturnHome'
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
