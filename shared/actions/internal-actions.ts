import type { ActionDefinition } from '../game/types'
import { futureMeeplesAction } from './effects/internal/future-meeples'
import { collectAction } from './effects/collect'
import { gainAction, bonusWoodAction, bonusFoodAction, bonusGrainAction } from './effects/gain'
import { familyGrowthAction } from './effects/family-growth'
import { minorImprovementAction, improvementAnyAction } from './effects/improvement'
import { playOccupationAction } from './effects/occupation'
import { renovateHouseAction } from './effects/renovation'
import { constructAction } from './effects/construct'
import { fenceAction } from './effects/fencing'
import { stablesAction } from './effects/stables'
import { plowAction } from './effects/plow'
import { sowAction } from './effects/sow'
import { bakeBreadAction } from './effects/bake-bread'
import { anytimeReorgAction } from './effects/reorganize'
import { anytimeExchangeAction } from './effects/exchange'
import { placeFarmerAction } from './effects/place-farmer'
import { setFirstPlayerAction } from './effects/first-player'
import { payAction } from './effects/pay'
import { applyImprovementAction } from './effects/apply-improvement'
import { applyRenovationAction } from './effects/apply-renovation'
import { applyOccupationPlayAction } from './effects/apply-occupation-play'
import { returnToSpaceAction } from './effects/internal/return-to-space'
import { bonusVpAction } from './effects/bonus-vp'
import { breedAction } from './effects/breed'
import { takeFromCardAction } from './effects/internal/take-from-card'
import { takeFromSpaceAction } from './effects/internal/take-from-space'
import { emitChoiceAction } from './effects/internal/emit-choice'
import { recallPlacedWorkerAction } from './effects/internal/recall-placed-worker'
import { reserveFenceBonusAction } from './effects/internal/reserve-fence-bonus'
import { storeOnCardAction } from './effects/internal/store-on-card'
import { moveFarmerToSpaceAction } from './effects/internal/move-farmer-to-space'
import { popCardStackAction } from './effects/internal/pop-card-stack'
import { pushCardStackAction } from './effects/internal/push-to-card-stack'
import { buildFarmhandRoomAction } from './effects/internal/build-farmhand-room'
import { selectionAction } from './effects/internal/selection'
import { spendWorkerAction } from './effects/internal/spend-worker'
import { specialEffectAction } from './effects/special-effect'

export const internalActionDefinitions: ActionDefinition[] = [
  futureMeeplesAction,
  collectAction,
  gainAction,
  bonusWoodAction,
  bonusFoodAction,
  bonusGrainAction,
  familyGrowthAction,
  minorImprovementAction,
  improvementAnyAction,
  playOccupationAction,
  renovateHouseAction,
  fenceAction,
  stablesAction,
  plowAction,
  sowAction,
  bakeBreadAction,
  anytimeReorgAction,
  anytimeExchangeAction,
  payAction,
  applyImprovementAction,
  applyRenovationAction,
  applyOccupationPlayAction,
  returnToSpaceAction,
  bonusVpAction,
  breedAction,
  takeFromCardAction,
  takeFromSpaceAction,
  emitChoiceAction,
  recallPlacedWorkerAction,
  reserveFenceBonusAction,
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
  specialEffectAction,
]
