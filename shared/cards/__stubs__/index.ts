import { CardRegistry } from '../registry'
import { requireActiveCardRegistry, setActiveCardRegistry } from '../active-registry'

import { listener as immediatelyAfterGainFlow } from './Stub_ImmediatelyAfter_GainFlow'
import { listener as computeCostsBuildDiscount } from './Stub_ComputeCosts_BuildDiscount'
import { listener as afterGainFlow } from './Stub_After_GainFlow'
import { listener as computeArgsExtraOption } from './Stub_ComputeArgs_ExtraOption'
import { listener as isDoableOverride } from './Stub_IsDoable_Override'
import { effect as onReturnHomeAccumulate } from './Stub_OnReturnHome_Accumulate'
import { effect as onRoundEndEffect } from './Stub_OnRoundEnd'
import { listener as scopeOpponent } from './Stub_Scope_Opponent'
import { listener as afterActionOptionalConstruct } from './Stub_AfterAction_OptionalConstruct'
import { afterListener as payGainVpAfter } from './Stub_PayGainVp'
import { computeCostsListener as cardStorageFence } from './Stub_CardStorage_ConsumeFence'
import { listener as computeReplaceDecline } from './Stub_ComputeReplace_Decline'
import { effect as beforeReturnHomeEffect } from './Stub_BeforeReturnHome'
import { effect as startReturnHomeEffect } from './Stub_StartReturnHome'
import { effect as afterRoundEndEffect } from './Stub_AfterRoundEnd'
import { effect as startHarvestEffect } from './Stub_StartHarvest'
import { effect as harvestFieldPhaseEffect } from './Stub_HarvestFieldPhase'
import { effect as harvestFeedingPhaseEffect } from './Stub_HarvestFeedingPhase'
import { effect as endHarvestEffect } from './Stub_EndHarvest'

const allListeners = [
  immediatelyAfterGainFlow,
  computeCostsBuildDiscount,
  afterGainFlow,
  computeArgsExtraOption,
  isDoableOverride,
  scopeOpponent,
  afterActionOptionalConstruct,
  payGainVpAfter,
  cardStorageFence,
  computeReplaceDecline,
]

const allEffects = [
  onReturnHomeAccumulate,
  onRoundEndEffect,
  beforeReturnHomeEffect,
  startReturnHomeEffect,
  afterRoundEndEffect,
  startHarvestEffect,
  harvestFieldPhaseEffect,
  harvestFeedingPhaseEffect,
  endHarvestEffect,
]

export const registerStubCards = () => {
  const registry = requireActiveCardRegistry('registerStubCards')
  allListeners.forEach((l) => registry.registerListener(l))
  allEffects.forEach((e) => registry.setEffect(e))
}

export const clearStubCards = () => {
  setActiveCardRegistry(new CardRegistry())
}
