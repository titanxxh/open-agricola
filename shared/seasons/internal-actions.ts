import type { ActionDefinition, ActionFlow } from '../contract/types'
import { bakeBreadAction } from '../actions/effects/bake-bread'

export const summerSourceCard = 'through-the-seasons:summer'

export const summerSellGrainAction: ActionDefinition = {
  id: 'season-summer-sell-grain',
  nameKey: 'actions.season-summer-farmers-market.option-sell-grain',
  descriptionKey: 'actions.season-summer-farmers-market.option-sell-grain',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => player.resources.grain >= 1,
  execute: ({ player }) => {
    if (player.resources.grain < 1) return { type: 'fail', errorKey: 'log.action' }
    player.resources.grain -= 1
    player.resources.food += 4
    return {
      type: 'ok',
      resourcesPaid: { grain: 1 },
      resourcesGained: { food: 4 },
    }
  },
}

const summerBakeLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'bake-bread',
  sourceCard: summerSourceCard,
  choiceLabelKey: 'actions.bake-bread.name',
})

const summerSellGrainLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: summerSellGrainAction.id,
  sourceCard: summerSourceCard,
  choiceLabelKey: 'actions.season-summer-farmers-market.option-sell-grain',
})

export const summerBreadOrSellFlow = (
  state: Parameters<ActionDefinition['canBeExecutedByPlayer']>[0],
  player: Parameters<ActionDefinition['canBeExecutedByPlayer']>[1],
): ActionFlow | undefined => {
  const children: ActionFlow[] = []
  if (bakeBreadAction.canBeExecutedByPlayer(state, player)) children.push(summerBakeLeaf())
  if (summerSellGrainAction.canBeExecutedByPlayer(state, player)) children.push(summerSellGrainLeaf())
  if (children.length === 0) return undefined
  if (children.length === 1) return children[0]
  return {
    type: 'xor',
    sourceCard: summerSourceCard,
    children,
  }
}

export const summerBreadOrSellAction: ActionDefinition = {
  id: 'season-summer-bread-or-sell',
  nameKey: 'actions.season-summer-farmers-market.option-bread-or-sell',
  descriptionKey: 'actions.season-summer-farmers-market.option-bread-or-sell',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) => summerBreadOrSellFlow(state, player) !== undefined,
  execute: ({ state, player }) => {
    const flow = summerBreadOrSellFlow(state, player)
    return flow ? { type: 'flow', flow } : { type: 'ok' }
  },
}
