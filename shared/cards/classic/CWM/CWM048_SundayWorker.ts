import { isActionDoableInFlowContext } from '../../../actions/flow'
import { getActionDefinition } from '../../../actions/index'
import type { ActionSpace, GameState, Resource } from '../../../contract/types'
import { createEventQuery } from '../../../events/query'
import { defineOccupationCard } from '../../card-source'
import { readCardExtraData } from '../../helpers/card-state'
import { isJumpChainContains, jumpLeaf } from '../../helpers/jump-leaf'
import { payGainFlow } from '../../helpers/pay-gain-node'
import { evaluateWithReservedResources } from '../../helpers/reserved-resources'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM048_SundayWorker'

const collectedFromSpace = (
  actionEvents: Parameters<typeof createEventQuery>[0],
  spaceId: string,
  playerId: string,
): Partial<Resource> => {
  const resources: Partial<Resource> = {}
  for (const event of createEventQuery(actionEvents).filter('resource.moved')) {
    if (
      event.reason !== 'collect'
      || event.from.kind !== 'actionSpace'
      || event.from.spaceId !== spaceId
      || event.to.kind !== 'player'
      || event.to.playerId !== playerId
    ) continue
    for (const [key, amount] of Object.entries(event.resources)) {
      if (typeof amount === 'number' && amount > 0) {
        const resourceKey = key as keyof Resource
        resources[resourceKey] = (resources[resourceKey] ?? 0) + amount
      }
    }
  }
  return resources
}

const withRestockedSpace = (
  state: GameState,
  spaceId: string,
  restocked: Partial<Resource>,
): { state: GameState; space: ActionSpace } | undefined => {
  const current = state.actionSpaces.find((entry) => entry.id === spaceId)
  if (!current) return undefined
  if (Object.keys(restocked).length === 0) return { state, space: current }
  const nextResources = { ...current.resources }
  for (const [key, amount] of Object.entries(restocked)) {
    if (typeof amount === 'number' && amount > 0) {
      const resourceKey = key as keyof Resource
      nextResources[resourceKey] = (nextResources[resourceKey] ?? 0) + amount
    }
  }
  const nextSpace: ActionSpace = { ...current, resources: nextResources }
  return {
    state: {
      ...state,
      actionSpaces: state.actionSpaces.map((entry) => (entry.id === spaceId ? nextSpace : entry)),
    },
    space: nextSpace,
  }
}

const cardImpl = {
  listeners: [
    {
      id: `${CARD_ID}-repeat`,
      cardIds: [CARD_ID],
      actionSpaces: 'all',
      phases: ['after'],
      handler: (context) => {
        if (context.state.round !== 7 && context.state.round !== 14) return
        if (readCardExtraData<number>(context.player, CARD_ID, 'usedRound') === context.state.round) return
        if (!context.actionSpaceUse?.personUse) return
        if (isJumpChainContains(context, CARD_ID)) return
        const spaceId = context.space?.id
        if (!spaceId) return

        const collected = collectedFromSpace(context.actionEvents ?? [], spaceId, context.player.id)
        const canRepeat = evaluateWithReservedResources(
          context.state,
          context.player,
          { food: 1 },
          (reservedState, reservedPlayer) => {
            const prepared = withRestockedSpace(reservedState, spaceId, collected)
            if (!prepared) return false
            const action = getActionDefinition(spaceId) ?? prepared.space
            return isActionDoableInFlowContext({
              actionHooks: context.actionHooks,
              actionSpaceUse: { newPlacement: false },
              actionId: spaceId,
              action,
              state: prepared.state,
              player: reservedPlayer,
              space: prepared.space,
              sourceCard: CARD_ID,
              actionContext: { viaCardJump: true, sourceCard: CARD_ID, targetSpaceId: spaceId },
              resolveAction: getActionDefinition,
            })
          },
        )
        if (!canRepeat) return

        return {
          sourceCard: CARD_ID,
          flow: payGainFlow({
            cardId: CARD_ID,
            cost: { food: 1 },
            followUp: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-extra-data', key: 'usedRound', value: context.state.round },
              },
              ...Object.entries(collected).flatMap(([resource, amount]) =>
                typeof amount === 'number' && amount > 0
                  ? [{
                      type: 'leaf' as const,
                      actionId: 'special-effect',
                      sourceCard: CARD_ID,
                      params: {
                        kind: 'add-resource-to-space',
                        spaceId,
                        resource: resource as keyof Resource,
                        amount,
                      },
                    }]
                  : [],
              ),
              jumpLeaf({ sourceCard: CARD_ID, targetSpaceId: spaceId }),
            ],
          }),
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM048_SundayWorker = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Sunday Worker',
    deck: 'CWM',
    number: 48,
    players: '3+',
    cost: {},
    vp: 0,
    desc: [
      "Once during rounds 7 and 14, you may pay 1 <FOOD> to take one of your peoples' actions twice. If you use an accumulation space with that action, you get double the amount of goods and/or <FOOD>.",
    ],
    artUrl: 'assets/classic/CWM/CWM048.png',
    implemented: true,
  },
  impl: cardImpl,
})

export const CWM048_SundayWorker_impl = CWM048_SundayWorker.impl
