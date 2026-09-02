import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData } from '../helpers/card-state'
import type { PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { getFarmyardFields } from '../helpers/card-field'

const CARD_ID = 'C048_Farmstead'
const countUsedTiles = (player: PlayerState): number => {
  const used = new Set<string>()
  for (const tile of player.roomTiles) used.add(`${tile.row},${tile.col}`)
  for (const field of getFarmyardFields(player)) used.add(`${field.row},${field.col}`)
  for (const tile of player.stableTiles) used.add(`${tile.row},${tile.col}`)
  for (const pasture of player.pastures) {
    for (const tile of pasture.tiles ?? []) used.add(`${tile.row},${tile.col}`)
  }
  return used.size
}

const beforeListener: CardListenerRegistration = {
  id: 'C48-farmstead-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: {
          kind: 'set-extra-data',
          key: 'usedTilesBefore',
          value: countUsedTiles(context.player),
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'C48-farmstead-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const before = readCardExtraData<number>(context.player, CARD_ID, 'usedTilesBefore') ?? 0
    const after = countUsedTiles(context.player)
    if (after > before) {
      return {
        flow: {
          type: 'seq',
          children: [
            {
              type: 'leaf',
              actionId: 'special-effect',
              sourceCard: CARD_ID,
              params: { kind: 'set-extra-data', key: 'usedTilesBefore', value: undefined },
            },
            gainLeaf(CARD_ID, { food: 1 }),
          ],
        },
        sourceCard: CARD_ID,
      }
    }
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'usedTilesBefore', value: undefined },
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [beforeListener, afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C048_Farmstead = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Farmstead',
    deck: 'C',
    number: 48,
    category: 'FOOD_PROVIDER',
    desc: [
        'After each turn in which you make at least one unused farmyard space used, you get 1 <FOOD>.',
      ],
    cost: {},
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
  },
  impl: cardImpl,
})

export const C048_Farmstead_impl = C048_Farmstead.impl
