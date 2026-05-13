import {
  readCardExtraData,
} from '../helpers/card-state'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'
import { B132_EstateMaster } from '../../cards-display/B/B132_EstateMaster'

const CARD_ID = B132_EstateMaster.id

const FARM_TOTAL = 15

const isFarmSaturated = (player: PlayerState): boolean => {
  const used = new Set<string>()
  player.roomTiles.forEach((t) => used.add(`${t.row},${t.col}`))
  player.fields.forEach((f) => used.add(`${f.row},${f.col}`))
  player.stableTiles.forEach((t) => used.add(`${t.row},${t.col}`))
  player.pastures.flatMap((p) => p.tiles).forEach((t) => used.add(`${t.row},${t.col}`))
  return used.size >= FARM_TOTAL
}

const isSaturatedFlagged = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, 'saturated') === true

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

/**
 * BGA pattern: lazily set a saturation flag once the farmyard fills via any
 * Construct/Stables/Fencing/Plow event. Reap then awards bonus VP only when
 * the flag is set (or, defensively, when the live check passes if some
 * exotic SE filled the farm via another path).
 */
const saturationCheckListener = (
  actionId: string,
): CardListenerRegistration => ({
  id: `B132-saturate-after-${actionId}`,
  cardIds: [CARD_ID],
  actions: [actionId],
  phases: ['immediatelyAfter' as ActionHookPhase],
  scope: 'player',
  handler: (ctx) => {
    if (isSaturatedFlagged(ctx.player)) return
    if (isFarmSaturated(ctx.player)) {
      return {
        flow: specialEffect({ kind: 'set-extra-data', key: 'saturated', value: true }),
        sourceCard: CARD_ID,
      }
    }
  },
})

const reapListener: CardListenerRegistration = {
  id: 'B132-estate-master-reap',
  cardIds: [CARD_ID],
  actions: ['reap'],
  phases: ['immediatelyAfter' as ActionHookPhase],
  handler: (ctx) => {
    const player = ctx.player
    const crop = ctx.extraData?.crop as string | undefined
    const amount = ctx.extraData?.amount as number | undefined
    if (crop !== 'vegetable' || typeof amount !== 'number' || amount <= 0) return
    // BGA: bonus VP gated on saturation flag; defensive fallback to live check
    // for paths that bypass the four flag-setting hooks.
    if (!isSaturatedFlagged(player) && !isFarmSaturated(player)) return
    return {
      flow: specialEffect({ kind: 'increment-counter', key: 'bonusVp', amount }),
      sourceCard: CARD_ID,
    }
  },
}

export const B132_EstateMaster_impl = {
  listeners: [
    saturationCheckListener('construct'),
    saturationCheckListener('stables'),
    saturationCheckListener('fencing'),
    saturationCheckListener('plow'),
    reapListener,
  ],
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player) => {
      return player.cardStates[CARD_ID]?.counters?.bonusVp ?? 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
