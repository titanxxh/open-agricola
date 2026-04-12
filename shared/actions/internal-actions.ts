import type { ActionDefinition } from '../game/types'
import { futureMeeplesAction } from './effects/future-meeples'
import { collectAction } from './effects/collect'
import { gainAction, bonusWoodAction, bonusFoodAction, bonusGrainAction } from './effects/gain'
import { wishChildrenAction, growFamilyWithoutRoomAction } from './effects/wish-children'
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
import { payResourcesAction } from './effects/pay-resources'
import { returnToSpaceAction } from './effects/return-to-space'
import { bonusVpAction } from './effects/bonus-vp'
import { takeFromCardAction } from './effects/take-from-card'
import { markCardObservedAction } from './effects/mark-card-observed'
import { flagCardAction } from './effects/flag-card'
import { unflagCardAction } from './effects/unflag-card'
import { setCardInfoboxAction } from './effects/set-card-infobox'
import { clearCardInfoboxAction } from './effects/clear-card-infobox'
import { noopAction } from './effects/noop'
import { returnFirstWorkerHomeAction } from './effects/return-first-worker-home'
import { reserveFenceBonusAction } from './effects/reserve-fence-bonus'
import { payGrainAnyAction } from './effects/pay-grain-any'
import { storeOnCardAction } from './effects/store-on-card'
import { gainOtherPlayersAction } from './effects/gain-other-players'
import { scytheHarvestFieldAction } from './effects/scythe-harvest-field'

export const internalActionDefinitions: ActionDefinition[] = [
  futureMeeplesAction,
  collectAction,
  gainAction,
  bonusWoodAction,
  bonusFoodAction,
  bonusGrainAction,
  wishChildrenAction,
  minorImprovementAction,
  improvementAnyAction,
  growFamilyWithoutRoomAction,
  playOccupationAction,
  renovateHouseAction,
  fenceAction,
  stablesAction,
  plowAction,
  sowAction,
  bakeBreadAction,
  anytimeReorgAction,
  anytimeExchangeAction,
  payResourcesAction,
  returnToSpaceAction,
  bonusVpAction,
  takeFromCardAction,
  markCardObservedAction,
  flagCardAction,
  unflagCardAction,
  setCardInfoboxAction,
  clearCardInfoboxAction,
  noopAction,
  returnFirstWorkerHomeAction,
  reserveFenceBonusAction,
  payGrainAnyAction,
  storeOnCardAction,
  gainOtherPlayersAction,
  scytheHarvestFieldAction,
  constructAction,
  placeFarmerAction,
  setFirstPlayerAction,
]
