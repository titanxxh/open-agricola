import type { PromptKey } from '../../../contract/prompt-keys'
import type { ActionDefinition, ActionFlow, ActionMutationContext, GameState, PlayerState, Resource } from '../../../contract/types'
import { readCardExtraData, writeCardExtraData, writeCardInfobox } from '../../../cards/helpers/card-state'
import { gainAction } from '../gain'

export type ResourceSalePlan = { resource: keyof Resource; amount: number; supplyFood: number; buyerFood: number; offerPrompt: PromptKey; buyerPrompt: PromptKey }
export const readResourceSale = (player: PlayerState, cardId: string): { asked: string[]; willing: string[] } | undefined => {
  const raw = readCardExtraData<unknown>(player, cardId, 'sale')
  if (!raw || typeof raw !== 'object' || !('asked' in raw) || !('willing' in raw) || !Array.isArray(raw.asked) || !Array.isArray(raw.willing)) return
  if (!raw.asked.every((id): id is string => typeof id === 'string') || !raw.willing.every((id): id is string => typeof id === 'string')) return
  return { asked: raw.asked, willing: raw.willing }
}

export const createResourceSaleActions = (cardId: string, plan: ResourceSalePlan): readonly ActionDefinition[] => {
  const START = `card_${cardId}_start`
  const RESPOND = `card_${cardId}_respond`
  const SETTLE = `card_${cardId}_settle`
  type Sale = { asked: string[]; willing: string[] }
  const saleOf = (player: PlayerState) => readResourceSale(player, cardId)
  const sellerOf = (state: GameState, params?: Record<string, unknown>) =>
    state.players.find((player) => player.id === params?.sellerId)

  const publishProgress = (context: ActionMutationContext, seller: PlayerState, sale: Sale) => {
    writeCardExtraData(seller, cardId, 'sale', sale)
    const text = context.state.players.filter((player) => sale.asked.includes(player.id))
      .map((player) => `${player.name}: ${sale.willing.includes(player.id) ? `${plan.buyerFood} <FOOD>` : '—'}`).join('; ')
    writeCardInfobox(seller, cardId, text)
    if (text) context.eventSink?.emit<'card.infoboxChanged'>({
      type: 'card.infoboxChanged', sourceCardId: cardId, cardId: cardId, targetPlayerId: seller.id, text,
    })
  }

  const nextFlow = (state: GameState, seller: PlayerState, sale: Sale): ActionFlow => {
    const index = state.players.indexOf(seller)
    for (let offset = 1; offset < state.players.length; offset++) {
      const buyer = state.players[(index + offset) % state.players.length]!
      if (!sale.asked.includes(buyer.id)) return {
        type: 'leaf', actionId: RESPOND, sourceCard: cardId,
        targetPlayerId: buyer.id, params: { sellerId: seller.id },
      }
    }
    return { type: 'leaf', actionId: SETTLE, sourceCard: cardId, targetPlayerId: seller.id, params: { sellerId: seller.id } }
  }

  const settle = (context: ActionMutationContext, seller: PlayerState, buyer?: PlayerState) => {
    if ((seller.resources[plan.resource] ?? 0) < plan.amount || (buyer && buyer.resources.food < plan.buyerFood)) {
      return { type: 'fail' as const, errorKey: 'log.exchangeFail', recoverable: true }
    }
    writeCardExtraData(seller, cardId, 'sale', undefined)
    writeCardInfobox(seller, cardId, '')
    if (buyer) {
      gainAction.execute({ ...context, player: seller, sourceCard: cardId, params: { food: plan.buyerFood, payerId: buyer.id, recipientPlayerId: seller.id } })
      gainAction.execute({ ...context, player: buyer, sourceCard: cardId, params: { [plan.resource]: plan.amount, payerId: seller.id, recipientPlayerId: buyer.id } })
    } else {
      seller.resources[plan.resource] = (seller.resources[plan.resource] ?? 0) - plan.amount
      gainAction.execute({ ...context, player: seller, sourceCard: cardId, params: { food: plan.supplyFood } })
      context.eventSink?.emit<'resource.moved'>({
        type: 'resource.moved', sourceCardId: cardId, resources: { [plan.resource]: plan.amount },
        from: { kind: 'player', playerId: seller.id }, to: { kind: 'supply' }, reason: 'cardEffect',
      })
    }
    return { type: 'ok' as const }
  }

  const start: ActionDefinition = {
    previewEffect: () => ({ kind: 'resourceSale', resourcesSold: { [plan.resource]: plan.amount }, supplyReward: { food: plan.supplyFood }, buyerPays: { food: plan.buyerFood } }),
    id: START, nameKey: `cards.${cardId}.name`, descriptionKey: `cards.${cardId}.name`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: (_state, player) => player.occupationPlayed.includes(cardId) && (player.resources[plan.resource] ?? 0) >= plan.amount && !saleOf(player),
    execute: (context) => {
      const sale: Sale = { asked: [], willing: [] }
      publishProgress(context, context.player, sale)
      return { type: 'flow', flow: nextFlow(context.state, context.player, sale) }
    },
  }

  const respond: ActionDefinition = {
    previewEffect: () => ({ kind: 'resourceSale', resourcesSold: { [plan.resource]: plan.amount }, supplyReward: { food: plan.supplyFood }, buyerPays: { food: plan.buyerFood } }),
    id: RESPOND, nameKey: `cards.${cardId}.offer`, descriptionKey: `cards.${cardId}.offer`,
    roundAvailable: 1, gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({
      type: 'request',
      request: { kind: 'choice', options: [
        { value: 'buy', labelKey: `cards.${cardId}.buy`, sourceCard: cardId, effectPreview: { kind: 'resourceSale', stage: 'buyer-offer', resourcesSold: { [plan.resource]: plan.amount }, supplyReward: { food: plan.supplyFood }, buyerPays: { food: plan.buyerFood } } },
        { value: 'decline', labelKey: `cards.${cardId}.decline`, sourceCard: cardId },
      ] },
      promptKey: plan.offerPrompt,
    }),
    resolveChoice: (context, choice) => {
      const seller = sellerOf(context.state, context.params)
      const sale = seller && saleOf(seller)
      if (!seller || !sale || seller.id === context.player.id || sale.asked.includes(context.player.id) ||
        (choice !== 'buy' && choice !== 'decline') || (choice === 'buy' && context.player.resources.food < plan.buyerFood)) {
        return { type: 'fail', errorKey: 'log.exchangeFail', recoverable: true }
      }
      const next = { asked: [...sale.asked, context.player.id], willing: choice === 'buy' ? [...sale.willing, context.player.id] : sale.willing }
      publishProgress(context, seller, next)
      return { type: 'flow', flow: nextFlow(context.state, seller, next) }
    },
  }

  const settleAction: ActionDefinition = {
    id: SETTLE, nameKey: `cards.${cardId}.chooseBuyer`, descriptionKey: `cards.${cardId}.chooseBuyer`,
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
          value: id, labelKey: context.state.players.find((player) => player.id === id)!.name, sourceCard: cardId,
        })) },
        promptKey: plan.buyerPrompt,
      }
    },
    resolveChoice: (context, choice) => {
      const sale = saleOf(context.player)
      const buyer = context.state.players.find((player) => player.id === choice)
      if (!sale?.willing.includes(choice) || !buyer) return { type: 'fail', errorKey: 'log.exchangeFail', recoverable: true }
      return settle(context, context.player, buyer)
    },
  }


  return [start, respond, settleAction]
}
