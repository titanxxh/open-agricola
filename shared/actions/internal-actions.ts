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
import { cardChoiceAction } from './effects/card-choice'
import { placeFarmerAction } from './effects/place-farmer'

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
  constructAction,
  cardChoiceAction,
  placeFarmerAction,
]
