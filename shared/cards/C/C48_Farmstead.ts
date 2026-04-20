import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { writeCardExtraData, readCardExtraData } from '../helpers/card-state'
import type { PlayerState } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C48_Farmstead'

const countUsedTiles = (player: PlayerState): number => {
  const used = new Set<string>()
  for (const tile of player.roomTiles) used.add(`${tile.row},${tile.col}`)
  for (const field of player.fields) used.add(`${field.row},${field.col}`)
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
    writeCardExtraData(context.player, CARD_ID, 'usedTilesBefore', countUsedTiles(context.player))
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
    writeCardExtraData(context.player, CARD_ID, 'usedTilesBefore', undefined)
    if (after > before) {
      return { flow: gainLeaf(CARD_ID, { food: 1 }), sourceCard: CARD_ID }
    }
  },
}

export const C48_Farmstead = new MinorImprovement({
  id: CARD_ID,
  name: 'Farmstead',
  deck: 'C',
  number: 48,
  category: 'FOOD_PROVIDER',
  desc: [
    'After each turn in which you make at least one unused farmyard space used, you get 1 <FOOD>.',
  ],
  cost: { wood: 1, clay: 1 },
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
})

export const C48_Farmstead_impl = {
  listeners: [beforeListener, afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
