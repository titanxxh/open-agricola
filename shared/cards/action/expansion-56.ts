import { deriveCanBeExecutedByFlow } from '../../actions/flow'
import { createAccumulatingAction } from '../../actions/factories/accumulate'
import { createGainAction } from '../../actions/factories/gain'
import { collectAccumulatedResources } from '../../actions/effects/collect'
import { gainResources } from '../../actions/effects/gain'
import {
  isMajorImprovementPlayable,
  isMinorImprovementPlayable,
} from '../../actions/effects/improvement'
import type { ActionDefinition, GameState, PlayerState } from '../../contract/types'
import { hasPlayableOccupationChoice } from '../../actions/effects/occupation'
import { getAvailableMajorImprovementIds } from '../major/supply'

const canPlayOccupationWithFood = (spaceId: string, food: number) =>
  (state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0], player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1]) =>
    player.resources.food >= food && hasPlayableOccupationChoice(state, player, spaceId)

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
  canBeExecutedByPlayer: (state, player) =>
    player.resources.food >= (player.occupationPlayed.length < 2 ? 1 : 2) &&
    hasPlayableOccupationChoice(state, player, 'lessons-56-variable'),
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

const corralAnimal = (player: PlayerState): 'sheep' | 'boar' | 'cattle' | null => {
  if (player.resources.sheep <= 0) return 'sheep'
  if (player.resources.boar <= 0) return 'boar'
  if (player.resources.cattle <= 0) return 'cattle'
  return null
}

const canPlayImprovement56 = (state: GameState, player: PlayerState) => {
  const types = improvement56Types(state)
  const canMinor = types.includes('minor') &&
    player.minorHand.some((id) => isMinorImprovementPlayable(state, player, id, 'improvement', undefined, types))
  const canMajor = types.includes('major') &&
    getAvailableMajorImprovementIds(state).some((id) => isMajorImprovementPlayable(state, player, id))
  return canMinor || canMajor
}

export const corral6: ActionDefinition = {
  id: 'corral-6',
  nameKey: 'actions.corral-6.name',
  descriptionKey: 'actions.corral-6.description',
  roundAvailable: 1,
  players: [6],
  gainPerRound: {},
  strictCanExecute: true,
  canBeExecutedByPlayer: (_state, player) => corralAnimal(player) !== null,
  execute: ({ player }) => {
    const animal = corralAnimal(player)
    if (!animal) return { type: 'fail', errorKey: 'log.action' }
    return {
      type: 'flow',
      flow: { type: 'leaf', actionId: 'gain', params: { [animal]: 1 } },
    }
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
  execute: ({ state, player }) => {
    if (!canPlayImprovement56(state, player)) return { type: 'fail', errorKey: 'log.action' }
    return {
      type: 'flow',
      flow: {
      type: 'seq',
      children: [
        {
          type: 'leaf',
          actionId: 'improvement',
          actionContext: { types: improvement56Types(state) },
        },
      ],
    },
    }
  },
}

const improvement56Types = (state: GameState): Array<'major' | 'minor'> =>
  state.round >= 5 ? ['major', 'minor'] : ['minor']
