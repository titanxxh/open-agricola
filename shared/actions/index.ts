import type { ActionDefinition, ActionSpace, Resource } from '../game/types'
import { cattleMarket } from '../cards/action/round-cattle-market'
import { clayPit } from '../cards/action/common-clay-pit'
import { copse } from '../cards/action/common-copse'
import { cultivation } from '../cards/action/round-cultivation'
import { dayLaborer } from '../cards/action/common-day-laborer'
import { easternQuarry } from '../cards/action/round-eastern-quarry'
import { farmRedevelopment } from '../cards/action/round-farm-redevelopment'
import { farmland } from '../cards/action/common-farmland'
import { fencing } from '../cards/action/round-fencing'
import { fishing } from '../cards/action/common-fishing'
import { forest } from '../cards/action/common-forest'
import { grainSeeds } from '../cards/action/common-grain-seeds'
import { grove } from '../cards/action/common-grove'
import { hollow4 } from '../cards/action/common-hollow-4'
import { houseRedevelopment } from '../cards/action/round-house-redevelopment'
import { majorImprovement } from '../cards/action/round-major-improvement'
import { meetingPlace } from '../cards/action/common-meeting-place'
import { lessons } from '../cards/action/common-lessons'
import { lessons4 } from '../cards/action/common-lessons-4'
import { farmExpansion } from '../cards/action/common-farm-expansion'
import { grainUtilization } from '../cards/action/round-grain-utilization'
import { reedBank } from '../cards/action/common-reed-bank'
import { resourceMarket4 } from '../cards/action/common-resource-market-4'
import { sheepMarket } from '../cards/action/round-sheep-market'
import { pigMarket } from '../cards/action/round-pig-market'
import { travelingPlayers } from '../cards/action/common-traveling-players'
import { urgentWishChildren } from '../cards/action/round-urgent-wish-children'
import { vegetableSeeds } from '../cards/action/round-vegetable-seeds'
import { westernQuarry } from '../cards/action/round-western-quarry'
import { wishChildren } from '../cards/action/round-wish-children'

const emptyResources: Resource = {
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
}

export const actionDefinitions: ActionDefinition[] = [
  forest,
  copse,
  grove,
  clayPit,
  hollow4,
  reedBank,
  fishing,
  travelingPlayers,
  dayLaborer,
  meetingPlace,
  lessons,
  lessons4,
  westernQuarry,
  easternQuarry,
  majorImprovement,
  fencing,
  farmland,
  grainUtilization,
  cultivation,
  grainSeeds,
  wishChildren,
  urgentWishChildren,
  houseRedevelopment,
  farmRedevelopment,
  farmExpansion,
  sheepMarket,
  pigMarket,
  cattleMarket,
  vegetableSeeds,
  resourceMarket4,
]

export const createActionSpaces = (): ActionSpace[] =>
  actionDefinitions.map((action) => ({
    ...action,
    resources: { ...emptyResources },
    takenBy: null,
  }))
