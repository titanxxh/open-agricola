import type { ActionDefinition, ActionFlow, ActionSpace, Resource } from '../contract/types'
import { bakeBreadAction } from '../actions/effects/bake-bread'
import { isActionDoableInFlowContext, type FlowActionResolver } from '../actions/flow'

export const summerSourceCard = 'through-the-seasons:summer'

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

const breadOrSellHostSpace = (
  candidate: ActionDefinition | ActionSpace | undefined,
  summerBreadOrSellAction: ActionDefinition,
): ActionSpace => {
  if (candidate && 'resources' in candidate && 'takenBy' in candidate) return candidate
  return {
    id: summerBreadOrSellAction.id,
    nameKey: summerBreadOrSellAction.nameKey,
    descriptionKey: summerBreadOrSellAction.descriptionKey,
    roundAvailable: summerBreadOrSellAction.roundAvailable,
    gainPerRound: summerBreadOrSellAction.gainPerRound,
    canBeExecutedByPlayer: summerBreadOrSellAction.canBeExecutedByPlayer,
    execute: summerBreadOrSellAction.execute,
    resources: { ...emptyResources },
    takenBy: [],
    blockedBy: [],
  }
}

export const summerSellGrainAction: ActionDefinition = {
  id: 'season-summer-sell-grain',
  nameKey: 'actions.season-summer-farmers-market.option-sell-grain',
  descriptionKey: 'actions.season-summer-farmers-market.option-sell-grain',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => player.resources.grain >= 1,
  execute: ({ player }) => {
    if (player.resources.grain < 1) return { type: 'fail', errorKey: 'log.action' }
    return {
      type: 'flow',
      flow: {
        type: 'seq',
        sourceCard: summerSourceCard,
        children: [
          {
            type: 'leaf',
            actionId: 'pay',
            sourceCard: summerSourceCard,
            params: {
              cost: { grain: 1 },
              sourceActionId: summerSellGrainAction.id,
            },
          },
          {
            type: 'leaf',
            actionId: 'gain',
            sourceCard: summerSourceCard,
            params: { food: 4 },
          },
        ],
      },
    }
  },
}

const summerBakeLeaf = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'bake-bread',
  sourceCard: summerSourceCard,
  actionContext: { requiresExplicitChoice: true },
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
  space: ActionSpace,
  resolveAction: FlowActionResolver,
): ActionFlow | undefined => {
  const children: ActionFlow[] = []
  if (
    isActionDoableInFlowContext({
      actionId: bakeBreadAction.id,
      action: bakeBreadAction,
      state,
      player,
      space,
      sourceCard: summerSourceCard,
      resolveAction,
    })
  ) {
    children.push(summerBakeLeaf())
  }
  if (summerSellGrainAction.canBeExecutedByPlayer(state, player)) children.push(summerSellGrainLeaf())
  if (children.length === 0) return undefined
  if (children.length === 1) return children[0]
  return {
    type: 'xor',
    sourceCard: summerSourceCard,
    children,
  }
}

export const createSummerBreadOrSellAction = (resolveAction: FlowActionResolver): ActionDefinition => {
  const action: ActionDefinition = {
    id: 'season-summer-bread-or-sell',
    nameKey: 'actions.season-summer-farmers-market.option-bread-or-sell',
    descriptionKey: 'actions.season-summer-farmers-market.option-bread-or-sell',
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: function (this: ActionDefinition | ActionSpace, state, player) {
      return summerBreadOrSellFlow(state, player, breadOrSellHostSpace(this, action), resolveAction) !== undefined
    },
    execute: ({ state, player, space }) => {
      const flow = summerBreadOrSellFlow(state, player, space, resolveAction)
      return flow ? { type: 'flow', flow } : { type: 'ok' }
    },
  }
  return action
}
