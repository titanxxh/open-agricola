import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import { incCounter } from '../__stubs__/helpers'
import type { PlayerState } from '../../game/types'

const CARD_ID = 'B132_EstateMaster'

const FARM_TOTAL = 15

const isFarmSaturated = (player: PlayerState): boolean => {
  const used = new Set<string>()
  player.roomTiles.forEach((t) => used.add(`${t.row},${t.col}`))
  player.fields.forEach((f) => used.add(`${f.row},${f.col}`))
  player.stableTiles.forEach((t) => used.add(`${t.row},${t.col}`))
  player.pastures.flatMap((p) => p.tiles).forEach((t) => used.add(`${t.row},${t.col}`))
  return used.size >= FARM_TOTAL
}

registerCardListener({
  id: CARD_ID,
  cardIds: [CARD_ID],
  actions: ['reap'],
  phases: ['immediatelyAfter'],
  handler: (ctx) => {
    const player = ctx.player
    const crop = ctx.extraData?.crop
    const amount = ctx.extraData?.amount
    if (crop !== 'vegetable' || typeof amount !== 'number' || amount <= 0) return
    if (!isFarmSaturated(player)) return
    incCounter(player, CARD_ID, 'bonusVp', amount)
  },
})

registerCardEffect({
  id: CARD_ID,
  computeBonusScore: (_state, player) => {
    return player.cardStates[CARD_ID]?.counters?.bonusVp ?? 0
  },
})

export const B132_EstateMaster = new Occupation({
  id: CARD_ID,
  name: 'Estate Master',
  deck: 'B',
  number: 132,
  category: 'POINTS_PROVIDER',
  desc: ['Once you have no unused farmyard spaces left, you get 1 bonus <SCORE> for each <VEGETABLE> that you harvest.'],
  cost: {},
  players: '1+',
})
