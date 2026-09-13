import { defineMinorCard } from '../card-source'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { getCardStack, pushToCardStack, popFromCardStack, isCardFlagged, setCardFlag, writeCardInfobox } from '../helpers/card-state'
import { hasInactiveWorkerInSupply } from '../../domain/player'
import { supplyWorkerTurnFlow, consumeSupplyWorkerTurn } from '../helpers/supply-worker-flow'
import type { ActionDefinition, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E022_GuestRoom'
const FOOD_ACTION = `card_${CARD_ID}_food`

const updateInfobox = (player: PlayerState) => {
  writeCardInfobox(player, CARD_ID, `${getCardStack(player, CARD_ID).length} Food`)
}

const foodAction: ActionDefinition = {
  id: FOOD_ACTION,
  nameKey: 'cards.E022_GuestRoom.storeFood',
  descriptionKey: 'cards.E022_GuestRoom.storeFood',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player, context) =>
    context?.params?.mode !== 'spend' || getCardStack(player, CARD_ID).length > 0,
  execute: ({ player, params, eventSink }) => {
    if (params?.mode === 'spend') {
      if (getCardStack(player, CARD_ID).length === 0) return { type: 'fail', errorKey: 'log.actionFail' }
      popFromCardStack(player, CARD_ID)
      updateInfobox(player)
      eventSink?.emit<'card.stackChanged'>({ type: 'card.stackChanged', cardId: CARD_ID, targetPlayerId: player.id, resources: { food: 1 }, delta: -1, reason: 'discard' })
      return { type: 'ok' }
    }
    return {
      type: 'request',
      request: {
        kind: 'resource-quantity-select',
        cardId: CARD_ID,
        availableByResource: { food: player.resources.food },
        promptKey: 'cards.E022_GuestRoom.storeFood',
        requireAtLeastOne: false,
      },
    }
  },
  resolveChoice: ({ player, eventSink }, _choice, payload) => {
    const counts = (payload as { resourceCounts?: Record<string, unknown> } | undefined)?.resourceCounts
    const count = counts?.food ?? 0
    if (!counts || typeof count !== 'number' || !Number.isInteger(count) || count < 0 || count > player.resources.food ||
      Object.entries(counts).some(([resource, amount]) => resource !== 'food' && amount !== 0)) {
      return { type: 'fail', errorKey: 'log.actionFail', recoverable: true }
    }
    player.resources.food -= count
    pushToCardStack(player, CARD_ID, Array.from({ length: count }, () => 'food'))
    updateInfobox(player)
    if (count > 0) eventSink?.emit<'card.stackChanged'>({ type: 'card.stackChanged', cardId: CARD_ID, targetPlayerId: player.id, resources: { food: count }, delta: count, reason: 'store' })
    return { type: 'ok' }
  },
}

registerAdHocAction(foodAction)

const cardImpl = {
  effect: {
    id: CARD_ID,
    projectInteractionRequest: (_state, player, request, actionId) => {
      if (actionId !== FOOD_ACTION || request.kind !== 'resource-quantity-select') return request
      return { ...request, availableByResource: { food: player.resources.food } }
    },
    onBuy: () => ({ type: 'leaf', actionId: FOOD_ACTION, sourceCard: CARD_ID }),
    onRoundStart: (_state, player) => { setCardFlag(player, CARD_ID, false) },
    extraTurnBeforeWorkers: true,
    contributeExtraTurn: (state, player) => {
      if (isCardFlagged(player, CARD_ID) || getCardStack(player, CARD_ID).length === 0 || !hasInactiveWorkerInSupply(player)) return
      return supplyWorkerTurnFlow(state, player, CARD_ID, [
        { type: 'leaf', actionId: FOOD_ACTION, sourceCard: CARD_ID, params: { mode: 'spend' } },
        consumeSupplyWorkerTurn(CARD_ID),
      ])
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E022_GuestRoom = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Guest Room',
    deck: 'E',
    number: 22,
    desc: ['Immediately place any amount of <FOOD> from your supply on this card. Once per round, you can discard 1 <FOOD> from this card to place a person from your supply in that round.'],
    cost: { wood: 4, reed: 1 },
    category: 'FARMYARD_-_PLACE_FOR_PERSON',
  },
  impl: cardImpl,
})

export const E022_GuestRoom_impl = E022_GuestRoom.impl
