import type { ActionDefinition } from '../contract/types'
import { futureMeeplesAction } from './effects/internal/future-meeples'
import { collectAction } from './effects/collect'
import { gainAction, bonusWoodAction, bonusFoodAction, bonusGrainAction } from './effects/gain'
import { receiveAction } from './effects/receive'
import { familyGrowthAction } from './effects/family-growth'
import { improvementAction } from './effects/improvement'
import { playOccupationAction } from './effects/occupation'
import { renovateHouseAction } from './effects/renovation'
import { constructAction } from './effects/construct'
import { fenceAction } from './effects/fencing'
import { stablesAction } from './effects/stables'
import { plowAction } from './effects/plow'
import { sowAction } from './effects/sow'
import { bakeBreadAction } from './effects/bake-bread'
import { reorganizeAction } from './effects/reorganize'
import { anytimeExchangeAction } from './effects/exchange'
import { placeFarmerAction } from './effects/place-farmer'
import { setFirstPlayerAction } from './effects/first-player'
import { payAction } from './effects/pay'
import { returnToSpaceAction } from './effects/internal/return-to-space'
import { bonusVpAction } from './effects/bonus-vp'
import { breedAction } from './effects/breed'
import { takeFromCardAction } from './effects/internal/take-from-card'
import { emitChoiceAction } from './effects/internal/emit-choice'
import { recallPlacedWorkerAction } from './effects/internal/recall-placed-worker'
import { reserveFenceBonusAction } from './effects/internal/reserve-fence-bonus'
import { occupationGateAction } from './effects/internal/occupation-gate'
import { storeOnCardAction } from './effects/internal/store-on-card'
import { moveFarmerToSpaceAction } from './effects/internal/move-farmer-to-space'
import { popCardStackAction } from './effects/internal/pop-card-stack'
import { pushCardStackAction } from './effects/internal/push-to-card-stack'
import { buildFarmhandRoomAction } from './effects/internal/build-farmhand-room'
import { selectionAction } from './effects/internal/selection'
import { spendWorkerAction } from './effects/internal/spend-worker'
import { activateCardEffectAction } from './effects/internal/activate-card-effect'
import { activateExtraTurnAction } from './effects/internal/activate-extra-turn'
import { drawOrdinaryCardsAction } from './effects/internal/draw-ordinary-cards'
import { placeFarmerOnSpaceAction } from './effects/internal/place-farmer-on-space'
import { turnScopeAction } from './effects/internal/turn-scope'
import { scheduledOfferAction } from './effects/internal/scheduled-offers'
import { scheduleOffersAction } from './effects/internal/schedule-offers'
import { passMinorCardToLeftAction } from './effects/internal/pass-minor-card-to-left'
import { specialEffectAction } from './effects/special-effect'
import { reapAction } from './effects/reap'
import { completeParentFatherAction } from '../parents/father-completion'
import { createSummerBreadOrSellAction, summerSellGrainAction } from '../seasons/internal-actions'
import { moorWoodToFuelAction } from '../moor/wood-to-fuel'
import { moorSpecialActionAfterListenersAction, moorSpecialActionApplyAction, moorSpecialActionChoiceAction } from '../moor/special-action-flow'

import type { FlowActionResolver } from './flow'

export const createInternalActionDefinitions = (resolveAction: FlowActionResolver): ActionDefinition[] => [
  futureMeeplesAction,
  collectAction,
  gainAction,
  receiveAction,
  bonusWoodAction,
  bonusFoodAction,
  bonusGrainAction,
  familyGrowthAction,
  improvementAction,
  playOccupationAction,
  renovateHouseAction,
  fenceAction,
  stablesAction,
  plowAction,
  sowAction,
  bakeBreadAction,
  reorganizeAction,
  anytimeExchangeAction,
  payAction,
  returnToSpaceAction,
  bonusVpAction,
  breedAction,
  takeFromCardAction,
  emitChoiceAction,
  recallPlacedWorkerAction,
  reserveFenceBonusAction,
  occupationGateAction,
  storeOnCardAction,
  moveFarmerToSpaceAction,
  constructAction,
  placeFarmerAction,
  spendWorkerAction,
  setFirstPlayerAction,
  popCardStackAction,
  pushCardStackAction,
  buildFarmhandRoomAction,
  selectionAction,
  activateCardEffectAction,
  activateExtraTurnAction,
  drawOrdinaryCardsAction,
  placeFarmerOnSpaceAction,
  turnScopeAction,
  scheduledOfferAction,
  scheduleOffersAction,
  passMinorCardToLeftAction,
  specialEffectAction,
  reapAction,
  completeParentFatherAction,
  summerSellGrainAction,
  createSummerBreadOrSellAction(resolveAction),
  moorWoodToFuelAction,
  moorSpecialActionAfterListenersAction,
  moorSpecialActionApplyAction,
  moorSpecialActionChoiceAction,
]
