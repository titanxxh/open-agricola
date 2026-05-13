import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { D36_BreedRegistry } from '../../cards-display/D/D36_BreedRegistry'

const CARD_ID = D36_BreedRegistry.id

const afterCollectListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-collect',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const gained = context.result?.type === 'ok'
      ? (context.result.resourcesGained?.sheep ?? 0)
      : 0
    if (gained <= 0) return
    const current = readCardExtraData<number>(context.player, CARD_ID, 'sheepGained') ?? 0
    const next = current + gained
    return {
      flow: {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'sheepGained', value: next },
          },
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-infobox', text: `${next} / 2` },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const beforeExchangeListener: CardListenerRegistration = {
  id: 'D36-breed-registry-before-exchange',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: {
          kind: 'set-extra-data',
          key: 'sheepBeforeExchange',
          value: context.player.resources.sheep,
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

const afterExchangeListener: CardListenerRegistration = {
  id: 'D36-breed-registry-after-exchange',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['exchange'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const sheepBefore = readCardExtraData<number>(context.player, CARD_ID, 'sheepBeforeExchange') ?? 0
    if (context.player.resources.sheep < sheepBefore) {
      return {
        flow: {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: { kind: 'set-extra-data', key: 'sheepConverted', value: true },
        },
        sourceCard: CARD_ID,
      }
    }
  },
}

export const D36_BreedRegistry_impl = {
  listeners: [afterCollectListener, beforeExchangeListener, afterExchangeListener],
  effect: {
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    const gained = readCardExtraData<number>(player, CARD_ID, 'sheepGained') ?? 0
    const converted = readCardExtraData<boolean>(player, CARD_ID, 'sheepConverted') ?? false
    if (converted) return 0
    return gained <= 2 ? 3 : 0
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
