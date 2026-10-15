import type { ActionHookRegistry } from '../actions/hooks'
import type { ActionDefinition, ActionFlow, ActionFlowPlanningContext, ActionSpace, Resource } from '../contract/types'
import { breedLeaf, canBreedAnimals } from '../actions/effects/breed'
import { familyGrowthAction } from '../actions/effects/family-growth'
import { plowAction } from '../actions/effects/plow'
import { reapAction } from '../actions/effects/reap'
import { sowAction } from '../actions/effects/sow'
import { isActionDoableInFlowContext } from '../actions/flow'
import { getActionDefinition } from '../actions/index'
import { summerBreadOrSellFlow, summerSourceCard } from './internal-actions'
import { PaymentSolver } from '../actions/payment'
import { isThroughTheSeasonsSeason, romanticEveningCost } from './rules'
import { seasonIds, type SeasonId } from './types'

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

import { seasonActionIdBySeason } from '../projections/season-actions'
export { seasonActionIdBySeason, seasonActionIds } from '../projections/season-actions'

const seasonActionNameBySeason: Record<SeasonId, string> = {
  winter: 'actions.season-winter-romantic-evening.name',
  spring: 'actions.season-spring-animal-and-fruit.name',
  summer: 'actions.season-summer-farmers-market.name',
  autumn: 'actions.season-autumn-thanksgiving.name',
}

const seasonActionDescriptionBySeason: Record<SeasonId, string> = {
  winter: 'actions.season-winter-romantic-evening.description',
  spring: 'actions.season-spring-animal-and-fruit.description',
  summer: 'actions.season-summer-farmers-market.description',
  autumn: 'actions.season-autumn-thanksgiving.description',
}

const canUseSeasonAction = (season: SeasonId): ActionDefinition['canBeExecutedByPlayer'] =>
  (state) =>
    state.enableThroughTheSeasons === true &&
    state.throughTheSeasons?.currentSeason === season

const seasonHostSpace = (
  season: SeasonId,
  candidate: ActionDefinition | ActionSpace | undefined,
): ActionSpace => {
  if (candidate && 'resources' in candidate && 'takenBy' in candidate) return candidate
  return {
    id: seasonActionIdBySeason[season],
    nameKey: seasonActionNameBySeason[season],
    descriptionKey: seasonActionDescriptionBySeason[season],
    roundAvailable: 1,
    gainPerRound: {},
    players: [2, 3, 4, 5, 6],
    canBeExecutedByPlayer: canUseSeasonAction(season),
    execute: () => ({ type: 'fail', errorKey: 'log.action' }),
    resources: { ...emptyResources },
    takenBy: [],
    blockedBy: [],
  }
}

const canUseFlowChildAction = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
  space: ActionSpace,
  action: ActionDefinition,
  sourceCard: string,
  actionHooks: ActionHookRegistry | undefined,
) =>
  isActionDoableInFlowContext({
    actionHooks,
    actionId: action.id,
    action,
    state,
    player,
    space,
    sourceCard,
    resolveAction: getActionDefinition,
  })

const springSourceCard = 'through-the-seasons:spring'

const springBreedLeaf = (choiceLabelKey?: string): ActionFlow => ({
  ...breedLeaf(springSourceCard),
  choiceLabelKey,
})

const springSowLeaf = (choiceLabelKey?: string): ActionFlow => ({
  type: 'leaf',
  actionId: 'sow',
  sourceCard: springSourceCard,
  choiceLabelKey,
})

const springAnimalAndFruitFlow = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
  space: ActionSpace,
  previewMode?: ActionFlowPlanningContext['previewMode'],
  actionHooks?: ActionHookRegistry,
): ActionFlow | undefined => {
  const canBreed = previewMode === 'base' || canBreedAnimals(state, player, { sourceCard: springSourceCard })
  const canSow = previewMode === 'base' || canUseFlowChildAction(state, player, space, sowAction, springSourceCard, actionHooks)
  const children: ActionFlow[] = []
  if (canBreed) children.push(springBreedLeaf('actions.breed.name'))
  if (canSow) {
    children.push(springSowLeaf('actions.sow.name'))
  }
  if (canBreed && canSow) {
    children.push({
      type: 'seq',
      sourceCard: springSourceCard,
      choiceLabelKey: 'actions.season-spring-animal-and-fruit.option-breed-sow',
      children: [
        springBreedLeaf(),
        springSowLeaf(),
      ],
    }, {
      type: 'seq',
      sourceCard: springSourceCard,
      choiceLabelKey: 'actions.season-spring-animal-and-fruit.option-sow-breed',
      children: [
        springSowLeaf(),
        springBreedLeaf(),
      ],
    })
  }
  if (children.length === 0) return undefined
  return {
    type: 'xor',
    children,
  }
}

const canUseSpringAnimalAndFruit: ActionDefinition['canBeExecutedByPlayer'] =
  function (this: ActionDefinition | ActionSpace, state, player, context) {
    const space = seasonHostSpace('spring', this)
    return (
    isThroughTheSeasonsSeason(state, 'spring') &&
    springAnimalAndFruitFlow(state, player, space, undefined, context?.actionHooks) !== undefined
    )
  }

const springFlowFactory = ({ state, player, space, previewMode, actionHooks }: ActionFlowPlanningContext): ActionFlow | undefined =>
  springAnimalAndFruitFlow(state, player, space, previewMode, actionHooks)

const summerPlowLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'plow',
  sourceCard: summerSourceCard,
  choiceLabelKey: 'actions.plow.name',
})

const summerFarmersMarketFlow = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
  space: ActionSpace,
  previewMode?: ActionFlowPlanningContext['previewMode'],
  actionHooks?: ActionHookRegistry,
): ActionFlow | undefined => {
  const children: ActionFlow[] = []
  if (previewMode === 'base' || canUseFlowChildAction(state, player, space, plowAction, summerSourceCard, actionHooks)) {
    children.push(summerPlowLeaf())
  }
  const breadOrSell = summerBreadOrSellFlow(state, player, space, getActionDefinition, previewMode, actionHooks)
  if (breadOrSell?.type === 'xor') {
    children.push({
      type: 'leaf',
      actionId: 'season-summer-bread-or-sell',
      sourceCard: summerSourceCard,
      choiceLabelKey: 'actions.season-summer-farmers-market.option-bread-or-sell',
    })
  } else if (breadOrSell) {
    children.push(breadOrSell)
  }
  if (children.length === 0) return undefined
  return {
    type: 'or',
    children,
  }
}

const canUseSummerFarmersMarket: ActionDefinition['canBeExecutedByPlayer'] =
  function (this: ActionDefinition | ActionSpace, state, player, context) {
    const space = seasonHostSpace('summer', this)
    return (
    isThroughTheSeasonsSeason(state, 'summer') &&
    summerFarmersMarketFlow(state, player, space, undefined, context?.actionHooks) !== undefined
    )
  }

const summerFlowFactory = ({ state, player, space, previewMode, actionHooks }: ActionFlowPlanningContext): ActionFlow | undefined =>
  summerFarmersMarketFlow(state, player, space, previewMode, actionHooks)

const autumnPrivateFieldLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'reap',
  actionContext: { trigger: { phase: 'private-field-phase' } },
})

const autumnVegetableLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'gain',
  params: { vegetable: 1 },
  choiceLabelKey: 'actions.season-autumn-thanksgiving.option-vegetable',
})

const autumnThanksgivingFlow = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
  previewMode?: ActionFlowPlanningContext['previewMode'],
): ActionFlow => {
  const children: ActionFlow[] = []
  if (previewMode === 'base' || reapAction.canBeExecutedByPlayer(state, player, {
    actionContext: { trigger: { phase: 'private-field-phase' } },
  })) {
    children.push(autumnPrivateFieldLeaf())
  }
  children.push(autumnVegetableLeaf())
  return {
    type: 'or',
    children,
  }
}

const autumnFlowFactory = ({ state, player, previewMode }: ActionFlowPlanningContext): ActionFlow =>
  autumnThanksgivingFlow(state, player, previewMode)

const winterSourceCard = 'through-the-seasons:winter'

const canGrowWithoutRoom = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
  space: ActionSpace,
  actionHooks: ActionHookRegistry | undefined,
) =>
  isActionDoableInFlowContext({
    actionHooks,
    actionId: familyGrowthAction.id,
    action: familyGrowthAction,
    state,
    player,
    space,
    sourceCard: winterSourceCard,
    actionContext: { skipRoomCheck: true },
    resolveAction: getActionDefinition,
  })

const canUseRomanticEvening: ActionDefinition['canBeExecutedByPlayer'] =
  function (this: ActionDefinition | ActionSpace, state, player, context) {
    const space = seasonHostSpace('winter', this)
    return (
    isThroughTheSeasonsSeason(state, 'winter') &&
    canGrowWithoutRoom(state, player, space, context?.actionHooks) &&
    PaymentSolver.canAffordTypedFlatCost(player, romanticEveningCost(state), undefined, state)
    )
  }

const winterFlowFactory = (context: ActionFlowPlanningContext): ActionFlow | undefined => {
  if (context.previewMode !== 'base' && !canGrowWithoutRoom(context.state, context.player, context.space, context.actionHooks)) {
    return undefined
  }
  return {
    type: 'seq',
    sourceCard: winterSourceCard,
    children: [
      {
        type: 'leaf',
        actionId: 'pay',
        sourceCard: winterSourceCard,
        params: romanticEveningCost(context.state),
      },
      {
        type: 'leaf',
        actionId: 'family-growth',
        sourceCard: winterSourceCard,
        actionContext: { skipRoomCheck: true },
      },
    ],
  }
}

const createSeasonActionDefinition = (season: SeasonId): ActionDefinition => {
  const flowFactory = season === 'winter' ? winterFlowFactory
    : season === 'spring' ? springFlowFactory
      : season === 'summer' ? summerFlowFactory : autumnFlowFactory
  return {
    id: seasonActionIdBySeason[season],
    nameKey: seasonActionNameBySeason[season],
    descriptionKey: seasonActionDescriptionBySeason[season],
    roundAvailable: 1,
    gainPerRound: {},
    players: [2, 3, 4, 5, 6],
    strictCanExecute: true,
    canBeExecutedByPlayer: season === 'winter' ? canUseRomanticEvening
      : season === 'spring' ? canUseSpringAnimalAndFruit
        : season === 'summer' ? canUseSummerFarmersMarket : canUseSeasonAction(season),
    flowFactory,
    execute: context => {
      const flow = flowFactory(context)
      return flow ? { type: 'flow', flow } : { type: 'fail', errorKey: season === 'winter' ? 'log.familyFull' : 'log.action' }
    },
  }
}

export const seasonActionDefinitions: ActionDefinition[] =
  seasonIds.map(createSeasonActionDefinition)

export const createSeasonActionSpaces = (playerCount?: number): ActionSpace[] =>
  seasonActionDefinitions
    .filter((action) =>
      !playerCount || !action.players || action.players.includes(playerCount),
    )
    .map((action) => ({
      ...action,
      resources: { ...emptyResources },
      takenBy: [],
      blockedBy: [],
    }))
