import type { ActionDefinition, ActionSpace, Resource } from '../contract/types'
import { initializeFlowDerivedCanBeExecutedByPlayer } from './flow'
import { internalActionDefinitions } from './internal-actions'
import { getAdHocAction } from './helpers/ad-hoc-action-registry'
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
import { hollow } from '../cards/action/common-hollow'
import { hollow4 } from '../cards/action/common-hollow-4'
import { houseRedevelopment } from '../cards/action/round-house-redevelopment'
import { majorImprovement } from '../cards/action/round-major-improvement'
import { meetingPlace } from '../cards/action/common-meeting-place'
import { lessons } from '../cards/action/common-lessons'
import { lessons3 } from '../cards/action/common-lessons-3'
import { lessons4 } from '../cards/action/common-lessons-4'
import { farmExpansion } from '../cards/action/common-farm-expansion'
import { grainUtilization } from '../cards/action/round-grain-utilization'
import { reedBank } from '../cards/action/common-reed-bank'
import { resourceMarket } from '../cards/action/common-resource-market'
import { resourceMarket4 } from '../cards/action/common-resource-market-4'
import { sheepMarket } from '../cards/action/round-sheep-market'
import { pigMarket } from '../cards/action/round-pig-market'
import { travelingPlayers } from '../cards/action/common-traveling-players'
import { urgentWishChildren } from '../cards/action/round-urgent-wish-children'
import { vegetableSeeds } from '../cards/action/round-vegetable-seeds'
import { westernQuarry } from '../cards/action/round-western-quarry'
import { wishChildren } from '../cards/action/round-wish-children'
import {
  animalMarket56,
  copse56,
  corral6,
  farmSupplies6,
  grove56,
  hollow56,
  houseBuilding56,
  improvement6,
  lessons56TwoFood,
  lessons56Variable,
  modestWishChildren56,
  resourceMarket56,
  resourceTrade6,
  riverbankForest56,
  sideJob6,
  travelingPlayers56,
} from '../cards/action/expansion-56'

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

const baseActionDefinitions: ActionDefinition[] = [
  forest,
  copse,
  grove,
  clayPit,
  hollow,
  hollow4,
  reedBank,
  fishing,
  travelingPlayers,
  dayLaborer,
  meetingPlace,
  lessons,
  lessons3,
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
  resourceMarket,
  resourceMarket4,
  lessons56TwoFood,
  copse56,
  lessons56Variable,
  modestWishChildren56,
  houseBuilding56,
  travelingPlayers56,
  riverbankForest56,
  grove56,
  hollow56,
  resourceMarket56,
  animalMarket56,
  farmSupplies6,
  resourceTrade6,
  corral6,
  sideJob6,
  improvement6,
]

const actionDefinitionLookup = new Map(
  [...baseActionDefinitions, ...internalActionDefinitions].map((action) => [
    action.id,
    action,
  ]),
)

baseActionDefinitions.forEach((action) => {
  initializeFlowDerivedCanBeExecutedByPlayer(
    action,
    (actionId) => actionDefinitionLookup.get(actionId),
  )
})

export const actionDefinitions: ActionDefinition[] = baseActionDefinitions

export const getActionDefinition = (
  actionId: string,
): ActionDefinition | undefined =>
  actionDefinitionLookup.get(actionId) ?? getAdHocAction(actionId)

export const createActionSpaces = (playerCount?: number): ActionSpace[] =>
  actionDefinitions
    .filter((action) =>
      !playerCount || !action.players || action.players.includes(playerCount),
    )
    .map((action) => ({
      ...action,
      ...(playerCount === 1 && action.id === forest.id
        ? { gainPerRound: { wood: 2 }, descriptionKey: 'actions.forest.soloDescription' }
        : {}),
      resources: { ...emptyResources },
      takenBy: [],
      blockedBy: [],
    }))
