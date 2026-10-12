export type CardEffectHook = 'onBuy' | 'onBeforeWork' | 'onRoundStart' | 'onHarvest' | 'onRoundEnd' | 'onEndTurn' | 'onReturnHome'
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
