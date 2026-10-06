import { defineOccupationCard } from '../card-source'
import {
  readCardExtraData,
} from '../helpers/card-state'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { hasNoUnusedFarmyardSpaces } from '../../domain/farmyard-usage'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase } from '../../actions/hooks'

const CARD_ID = 'B132_EstateMaster'

const isFarmSaturated = (player: PlayerState): boolean =>
  hasNoUnusedFarmyardSpaces(player)

const isSaturatedFlagged = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, 'saturated') === true

const specialEffect = (params: Record<string, unknown>): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params,
})

/**
 * The reference pattern: lazily set a saturation flag once the farmyard fills via any
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
    // Rule: bonus VP gated on saturation flag; defensive fallback to live check
    // for paths that bypass the four flag-setting hooks.
    if (!isSaturatedFlagged(player) && !isFarmSaturated(player)) return
    return {
      flow: specialEffect({ kind: 'increment-counter', key: 'bonusVp', amount }),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [
    saturationCheckListener('construct'),
    saturationCheckListener('stables'),
    saturationCheckListener('fencing'),
    saturationCheckListener('fence'),
    saturationCheckListener('plow'),
    reapListener,
  ],
  effect: {
    id: CARD_ID,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B132_EstateMaster = defineOccupationCard({
  presentation: { counters: ['bonusVp'] },
  meta: {
    id: CARD_ID,
    name: 'Estate Master',
    deck: 'B',
    number: 132,
    category: 'POINTS_PROVIDER',
    desc: ['Once you have no unused farmyard spaces left, you get 1 bonus <SCORE> for each <VEGETABLE> that you harvest.'],
    cost: {},
    players: '3+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const B132_EstateMaster_impl = B132_EstateMaster.impl
