import { Occupation } from '../types'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData, getCardStack } from '../helpers/card-state'
import { payLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E85_MasterTanner'

// ── Part 1: Exchange monitoring (before/after) ──

const beforeExchangeListener: CardListenerRegistration = {
  id: 'E85-master-tanner-before-exchange',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context): ActionHookResult | void => {
    writeCardExtraData(context.player, CARD_ID, 'boarBefore', context.player.resources.boar)
    writeCardExtraData(context.player, CARD_ID, 'cattleBefore', context.player.resources.cattle)
  },
}

const afterExchangeListener: CardListenerRegistration = {
  id: 'E85-master-tanner-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context): ActionHookResult | void => {
    const boarBefore = readCardExtraData<number>(context.player, CARD_ID, 'boarBefore') ?? 0
    const cattleBefore = readCardExtraData<number>(context.player, CARD_ID, 'cattleBefore') ?? 0
    const boarLost = Math.max(0, boarBefore - context.player.resources.boar)
    const cattleLost = Math.max(0, cattleBefore - context.player.resources.cattle)
    const animalsCooked = boarLost + cattleLost
    if (animalsCooked <= 0) return

    // Auto-place food on card: pay 1 food + push 'food' to stack, per animal cooked.
    // Only place as many as the player can afford (they should have food from cooking).
    const toPlace = Math.min(animalsCooked, context.player.resources.food)
    if (toPlace <= 0) return

    const children: ActionFlow[] = []
    for (let i = 0; i < toPlace; i++) {
      children.push(payLeaf({ cardId: CARD_ID, cost: { food: 1 } }))
      children.push({ type: 'leaf', actionId: 'push-to-card-stack', sourceCard: CARD_ID, params: { item: 'food' } })
    }

    return {
      flow: { type: 'seq', children },
      sourceCard: CARD_ID,
    }
  },
}

export const E85_MasterTanner = new Occupation({
  id: CARD_ID,
  name: 'Master Tanner',
  deck: 'E',
  number: 85,
  desc: ['For each <PIG> or <CATTLE> you turn into <FOOD>, you can place 1 of that <FOOD> on this card. While its <FOOD> equals your number of rooms, this card provides room for 1 person.'],
  cost: {},
  players: '1+',
})

export const E85_MasterTanner_impl = {
  listeners: [beforeExchangeListener, afterExchangeListener],
  effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: (player) => {
    const foodOnCard = getCardStack(player, CARD_ID).length
    return foodOnCard > 0 && foodOnCard === player.rooms ? 1 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
