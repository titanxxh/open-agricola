import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import { createAccumulatingAction } from '../../actions/factories/accumulate'
import { createGainAction } from '../../actions/factories/gain'
import { collectAccumulatedResources, hasCollectableResources } from '../../actions/effects/collect'
import { gainResources } from '../../actions/effects/gain'
import type { ActionDefinition } from '../../contract/types'
import { hasPlayableOccupationChoice } from '../../actions/effects/occupation'
import { isMajorImprovementPlayable, isMinorImprovementPlayable } from '../../actions/effects/improvement'
import { getAvailableMajorImprovementIds } from '../major/supply'
import { createRoundImprovementFlow, describeRoundImprovementPlan, improvementTypesForRound, type RoundImprovementPlan } from '../../actions/plans/round-improvement'
import { createFirstMissingResourceFlow, describeFirstMissingResourcePlan, firstMissingResource, type FirstMissingResourcePlan } from '../../actions/plans/first-missing-resource'

const canPlayOccupationWithFood = (spaceId: string, food: number): ActionDefinition['canBeExecutedByPlayer'] =>
  (state, player, context) =>
    player.resources.food >= food && hasPlayableOccupationChoice(state, player, spaceId, undefined, context?.actionHooks)

export const lessons56TwoFood: ActionDefinition = {
  id: 'lessons-56-2f',
  nameKey: 'actions.lessons-56-2f.name',
  descriptionKey: 'actions.lessons-56-2f.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [5, 6],
  linkedGroupId: 'lessons-copse-56',
  canBeExecutedByPlayer: canPlayOccupationWithFood('lessons-56-2f', 2),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'occupation' }],
  },
}

export const copse56: ActionDefinition = {
  ...createAccumulatingAction({
    id: 'copse-56',
    nameKey: 'actions.copse-56.name',
    descriptionKey: 'actions.copse-56.description',
    roundAvailable: 1,
    gainPerRound: { wood: 1 },
    players: [5, 6],
  }),
  linkedGroupId: 'lessons-copse-56',
}

export const lessons56Variable: ActionDefinition = {
  id: 'lessons-56-variable',
  nameKey: 'actions.lessons-56-variable.name',
  descriptionKey: 'actions.lessons-56-variable.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [5, 6],
  linkedGroupId: 'lessons-modest-children-56',
  canBeExecutedByPlayer: (state, player, context) =>
    player.resources.food >= (player.occupationPlayed.length < 2 ? 1 : 2) &&
    hasPlayableOccupationChoice(state, player, 'lessons-56-variable', undefined, context?.actionHooks),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'occupation' }],
  },
}

export const modestWishChildren56: ActionDefinition = {
  id: 'modest-wish-children-56',
  nameKey: 'actions.modest-wish-children-56.name',
  descriptionKey: 'actions.modest-wish-children-56.description',
  roundAvailable: 5,
  gainPerRound: {},
  players: [5, 6],
  linkedGroupId: 'lessons-modest-children-56',
  strictCanExecute: true,
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'family-growth' }],
  },
}

export const houseBuilding56: ActionDefinition = {
  id: 'house-building-56',
  nameKey: 'actions.house-building-56.name',
  descriptionKey: 'actions.house-building-56.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [5, 6],
  linkedGroupId: 'house-traveling-56',
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [{ type: 'leaf', actionId: 'construct' }],
  },
}

export const travelingPlayers56: ActionDefinition = {
  ...createAccumulatingAction({
    id: 'traveling-players-56',
    nameKey: 'actions.traveling-players-56.name',
    descriptionKey: 'actions.traveling-players-56.description',
    roundAvailable: 1,
    gainPerRound: { food: 1 },
    players: [5, 6],
  }),
  linkedGroupId: 'house-traveling-56',
}

export const riverbankForest56: ActionDefinition = {
  id: 'riverbank-forest-56',
  nameKey: 'actions.riverbank-forest-56.name',
  descriptionKey: 'actions.riverbank-forest-56.description',
  roundAvailable: 1,
  gainPerRound: { wood: 1 },
  players: [5, 6],
  canBeExecutedByPlayer: () => true,
  originalActionCondition: context => hasCollectableResources({ ...context, actionContext: undefined }),
  execute: ({ player, space }) => {
    collectAccumulatedResources(player, space)
    gainResources(player, { reed: 1 })
    return { type: 'ok' }
  },
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'collect' },
      { type: 'leaf', actionId: 'gain', params: { reed: 1 } },
    ],
  },
}

export const grove56 = createAccumulatingAction({
  id: 'grove-56',
  nameKey: 'actions.grove-56.name',
  descriptionKey: 'actions.grove-56.description',
  roundAvailable: 1,
  gainPerRound: { wood: 2 },
  players: [5, 6],
})

export const hollow56 = createAccumulatingAction({
  id: 'hollow-56',
  nameKey: 'actions.hollow-56.name',
  descriptionKey: 'actions.hollow-56.description',
  roundAvailable: 1,
  gainPerRound: { clay: 3 },
  players: [5, 6],
})

export const resourceMarket56 = createGainAction({
  id: 'resource-market-56',
  nameKey: 'actions.resource-market-56.name',
  descriptionKey: 'actions.resource-market-56.description',
  roundAvailable: 1,
  gain: { reed: 1, wood: 1, stone: 1 },
  players: [5, 6],
})

export const animalMarket56: ActionDefinition = {
  id: 'animal-market-56',
  nameKey: 'actions.animal-market-56.name',
  descriptionKey: 'actions.animal-market-56.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [5, 6],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'xor',
    promptKey: 'ui.interactionFlowSelect',
    children: [
      {
        type: 'leaf',
        actionId: 'gain',
        params: { sheep: 1, food: 1 },
        optionId: 'animal-market-56:sheep',
        choiceLabelKey: 'actions.animal-market-56.option-sheep',
      },
      {
        type: 'leaf',
        actionId: 'gain',
        params: { boar: 1 },
        optionId: 'animal-market-56:boar',
        choiceLabelKey: 'actions.animal-market-56.option-boar',
      },
      {
        type: 'seq',
        optionId: 'animal-market-56:cattle',
        choiceLabelKey: 'actions.animal-market-56.option-cattle',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 1 } },
          { type: 'leaf', actionId: 'gain', params: { cattle: 1 } },
        ],
      },
    ],
  },
}

export const farmSupplies6: ActionDefinition = {
  id: 'farm-supplies-6',
  nameKey: 'actions.farm-supplies-6.name',
  descriptionKey: 'actions.farm-supplies-6.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [6],
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'or',
    promptKey: 'ui.interactionFlowSelect',
    children: [
      {
        type: 'seq',
        choiceLabelKey: 'actions.farm-supplies-6.option-field',
        children: [
          { type: 'leaf', actionId: 'plow', actionContext: { exactCost: { food: 1 } } },
        ],
      },
      {
        type: 'seq',
        choiceLabelKey: 'actions.farm-supplies-6.option-grain',
        children: [
          { type: 'leaf', actionId: 'pay', params: { food: 1 } },
          { type: 'leaf', actionId: 'gain', params: { grain: 1 } },
        ],
      },
    ],
  },
}

export const resourceTrade6: ActionDefinition = {
  id: 'resource-trade-6',
  nameKey: 'actions.resource-trade-6.name',
  descriptionKey: 'actions.resource-trade-6.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [6],
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'gain', params: { food: 1 } },
      {
        type: 'xor',
        promptKey: 'ui.interactionFlowSelect',
        children: [
          { type: 'leaf', actionId: 'gain', params: { reed: 1 }, choiceLabelKey: 'actions.resource-trade-6.option-reed' },
          { type: 'leaf', actionId: 'gain', params: { stone: 1 }, choiceLabelKey: 'actions.resource-trade-6.option-stone' },
        ],
      },
      {
        type: 'xor',
        promptKey: 'ui.interactionFlowSelect',
        children: [
          { type: 'leaf', actionId: 'gain', params: { wood: 1 }, choiceLabelKey: 'actions.resource-trade-6.option-wood' },
          { type: 'leaf', actionId: 'gain', params: { clay: 1 }, choiceLabelKey: 'actions.resource-trade-6.option-clay' },
        ],
      },
    ],
  },
}

const CORRAL_PLAN = { resources: ['sheep', 'boar', 'cattle'], amount: 1 } as const satisfies FirstMissingResourcePlan
const IMPROVEMENT_ROUNDS = [
  { from: 1, to: 4, types: ['minor'] },
  { from: 5, types: ['major', 'minor'] },
] as const satisfies RoundImprovementPlan

const canPlayImprovement56: ActionDefinition['canBeExecutedByPlayer'] = (state, player, context) => {
  const actionHooks = context?.actionHooks
  const types = improvementTypesForRound(state.round, IMPROVEMENT_ROUNDS)
  return types.includes('minor') && player.minorHand.some(id => isMinorImprovementPlayable(state, player, id, 'improvement', undefined, types, undefined, actionHooks))
    || types.includes('major') && getAvailableMajorImprovementIds(state).some(id => isMajorImprovementPlayable(state, player, id, undefined, undefined, actionHooks))
}

export const corral6: ActionDefinition = {
  id: 'corral-6',
  nameKey: 'actions.corral-6.name',
  descriptionKey: 'actions.corral-6.description',
  roundAvailable: 1,
  players: [6],
  gainPerRound: {},
  strictCanExecute: true,
  canBeExecutedByPlayer: (_state, player) => firstMissingResource(player, CORRAL_PLAN) !== undefined,
  flowFactory: context => createFirstMissingResourceFlow(context, CORRAL_PLAN),
  previewEffect: ({ previewMode }) => previewMode === 'base' ? describeFirstMissingResourcePlan(CORRAL_PLAN) : undefined,
  execute: context => {
    const flow = createFirstMissingResourceFlow(context, CORRAL_PLAN)
    return flow ? { type: 'flow', flow } : { type: 'fail', errorKey: 'log.action' }
  },
}

export const sideJob6: ActionDefinition = {
  id: 'side-job-6',
  nameKey: 'actions.side-job-6.name',
  descriptionKey: 'actions.side-job-6.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [6],
  canBeExecutedByPlayer: deriveCanBeExecutedByFlow(),
  execute: () => ({ type: 'ok' }),
  flow: {
    type: 'or',
    promptKey: 'ui.interactionFlowSelect',
    children: [
      {
        type: 'seq',
        choiceLabelKey: 'actions.side-job-6.option-stable',
        children: [
          {
            type: 'leaf',
            actionId: 'stables',
            actionContext: { max: 1, exactCost: { wood: 1, max: 1 } },
          },
        ],
      },
      { type: 'leaf', actionId: 'bake-bread', choiceLabelKey: 'actions.side-job-6.option-bake' },
    ],
  },
}

export const improvement6: ActionDefinition = {
  id: 'improvement-6',
  nameKey: 'actions.improvement-6.name',
  descriptionKey: 'actions.improvement-6.description',
  roundAvailable: 1,
  gainPerRound: {},
  players: [6],
  strictCanExecute: true,
  canBeExecutedByPlayer: canPlayImprovement56,
  flowFactory: context => createRoundImprovementFlow(context, IMPROVEMENT_ROUNDS),
  previewEffect: ({ previewMode }) => previewMode === 'base' ? describeRoundImprovementPlan(IMPROVEMENT_ROUNDS) : undefined,
  execute: context => {
    const flow = createRoundImprovementFlow(context, IMPROVEMENT_ROUNDS)
    return flow ? { type: 'flow', flow } : { type: 'fail', errorKey: 'log.action' }
  },
}
