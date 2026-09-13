import { defineOccupationCard } from '../card-source'
import type { ActionDefinition, ActionFlow, ActionMutationContext, GameState, PlayerState } from '../../contract/types'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../helpers/card-state'
import { gainAction } from '../../actions/effects/gain'

const CARD_ID = 'D159_ReedSeller'
const START = `card_${CARD_ID}_start`
const RESPOND = `card_${CARD_ID}_respond`
const SETTLE = `card_${CARD_ID}_settle`

type Sale = { asked: string[]; willing: string[] }
const saleOf = (player: PlayerState) => readCardExtraData<Sale>(player, CARD_ID, 'sale')
const sellerOf = (state: GameState, params?: Record<string, unknown>) =>
  state.players.find((player) => player.id === params?.sellerId)

const publishProgress = (context: ActionMutationContext, seller: PlayerState, sale: Sale) => {
  writeCardExtraData(seller, CARD_ID, 'sale', sale)
  const text = context.state.players.filter((player) => sale.asked.includes(player.id))
    .map((player) => `${player.name}: ${sale.willing.includes(player.id) ? '2 <FOOD>' : '—'}`).join('; ')
  writeCardInfobox(seller, CARD_ID, text)
  if (text) context.eventSink?.emit<'card.infoboxChanged'>({
    type: 'card.infoboxChanged', sourceCardId: CARD_ID, cardId: CARD_ID, targetPlayerId: seller.id, text,
  })
}

const nextFlow = (state: GameState, seller: PlayerState, sale: Sale): ActionFlow => {
  const index = state.players.indexOf(seller)
  for (let offset = 1; offset < state.players.length; offset++) {
    const buyer = state.players[(index + offset) % state.players.length]!
    if (!sale.asked.includes(buyer.id)) return {
      type: 'leaf', actionId: RESPOND, sourceCard: CARD_ID,
      targetPlayerId: buyer.id, params: { sellerId: seller.id },
    }
  }
  return { type: 'leaf', actionId: SETTLE, sourceCard: CARD_ID, targetPlayerId: seller.id, params: { sellerId: seller.id } }
}

const settle = (context: ActionMutationContext, seller: PlayerState, buyer?: PlayerState) => {
  if (seller.resources.reed < 1 || (buyer && buyer.resources.food < 2)) {
    return { type: 'fail' as const, errorKey: 'log.exchangeFail', recoverable: true }
  }
  writeCardExtraData(seller, CARD_ID, 'sale', undefined)
  writeCardInfobox(seller, CARD_ID, '')
  if (buyer) {
    gainAction.execute({ ...context, player: seller, sourceCard: CARD_ID, params: { food: 2, payerId: buyer.id, recipientPlayerId: seller.id } })
    gainAction.execute({ ...context, player: buyer, sourceCard: CARD_ID, params: { reed: 1, payerId: seller.id, recipientPlayerId: buyer.id } })
  } else {
    seller.resources.reed -= 1
    gainAction.execute({ ...context, player: seller, sourceCard: CARD_ID, params: { food: 3 } })
    context.eventSink?.emit<'resource.moved'>({
      type: 'resource.moved', sourceCardId: CARD_ID, resources: { reed: 1 },
      from: { kind: 'player', playerId: seller.id }, to: { kind: 'supply' }, reason: 'cardEffect',
    })
  }
  return { type: 'ok' as const }
}

const start: ActionDefinition = {
  id: START, nameKey: `cards.${CARD_ID}.anytime`, descriptionKey: `cards.${CARD_ID}.anytime`,
  roundAvailable: 1, gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => player.occupationPlayed.includes(CARD_ID) && player.resources.reed >= 1 && !saleOf(player),
  execute: (context) => {
    const sale: Sale = { asked: [], willing: [] }
    publishProgress(context, context.player, sale)
    return { type: 'flow', flow: nextFlow(context.state, context.player, sale) }
  },
}

const respond: ActionDefinition = {
  id: RESPOND, nameKey: `cards.${CARD_ID}.offer`, descriptionKey: `cards.${CARD_ID}.offer`,
  roundAvailable: 1, gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({
    type: 'request',
    request: { kind: 'choice', options: [
      { value: 'buy', labelKey: `cards.${CARD_ID}.buy`, sourceCard: CARD_ID },
      { value: 'decline', labelKey: `cards.${CARD_ID}.decline`, sourceCard: CARD_ID },
    ] },
    promptKey: 'ui.cards.D159_ReedSeller.offer',
  }),
  resolveChoice: (context, choice) => {
    const seller = sellerOf(context.state, context.params)
    const sale = seller && saleOf(seller)
    if (!seller || !sale || seller.id === context.player.id || sale.asked.includes(context.player.id) ||
      (choice !== 'buy' && choice !== 'decline') || (choice === 'buy' && context.player.resources.food < 2)) {
      return { type: 'fail', errorKey: 'log.exchangeFail', recoverable: true }
    }
    const next = { asked: [...sale.asked, context.player.id], willing: choice === 'buy' ? [...sale.willing, context.player.id] : sale.willing }
    publishProgress(context, seller, next)
    return { type: 'flow', flow: nextFlow(context.state, seller, next) }
  },
}

const settleAction: ActionDefinition = {
  id: SETTLE, nameKey: `cards.${CARD_ID}.chooseBuyer`, descriptionKey: `cards.${CARD_ID}.chooseBuyer`,
  roundAvailable: 1, gainPerRound: {}, skipChoiceWrap: true,
  canBeExecutedByPlayer: () => true,
  execute: (context) => {
    const seller = context.player
    const sale = saleOf(seller)
    if (!sale) return { type: 'fail', errorKey: 'log.exchangeFail' }
    if (sale.willing.length <= 1) return settle(context, seller, context.state.players.find((player) => player.id === sale.willing[0]))
    return {
      type: 'request',
      request: { kind: 'choice', options: sale.willing.map((id) => ({
        value: id, labelKey: context.state.players.find((player) => player.id === id)!.name, sourceCard: CARD_ID,
      })) },
      promptKey: 'ui.cards.D159_ReedSeller.chooseBuyer',
    }
  },
  resolveChoice: (context, choice) => {
    const sale = saleOf(context.player)
    const buyer = context.state.players.find((player) => player.id === choice)
    if (!sale?.willing.includes(choice) || !buyer) return { type: 'fail', errorKey: 'log.exchangeFail', recoverable: true }
    return settle(context, context.player, buyer)
  },
}

registerAdHocAction(start)
registerAdHocAction(respond)
registerAdHocAction(settleAction)

export const D159_ReedSeller = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Reed Seller',
    deck: 'D',
    number: 159,
    category: 'FOOD_PROVIDER',
    desc: ['At any time, you can turn 1 <REED> into 3 <FOOD>. Any other player can prevent this by buying the <REED> for 2 <FOOD> from you. If multiple players are interested, choose one.'],
    cost: {},
    players: '4+',
  },
  impl: {
    effect: {
      id: CARD_ID,
      computeResourceCommitments: (_state, owner) => {
        const sale = saleOf(owner)
        return sale ? [
          { playerId: owner.id, resources: { reed: 1 } },
          ...sale.willing.map((playerId) => ({ playerId, resources: { food: 2 } })),
        ] : []
      },
    },
    listeners: [{
      id: 'D159-reed-seller-anytime', cardIds: [CARD_ID], phases: ['anytime'],
      handler: ({ player }) => player.resources.reed >= 1 && !saleOf(player)
        ? { flow: { type: 'leaf', actionId: START, sourceCard: CARD_ID }, sourceCard: CARD_ID }
        : undefined,
    }],
  },
})
