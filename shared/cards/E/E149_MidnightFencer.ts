import { readCardExtraData } from '../helpers/card-state'
import { canStartFencing } from '../../actions/effects/fencing'
import type { ActionFlow, PlayerState } from '../../contract/types'
import { getOwnOrdinaryFenceReserveCount } from '../../domain/supply-tokens'
import type { CardImpl } from '../registry'
import { E149_MidnightFencer } from '../../cards-display/E/E149_MidnightFencer'

const CARD_ID = E149_MidnightFencer.id

const KEY_OFFERED = 'offered'

const readOffered = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, KEY_OFFERED) ?? false

const donorCapsFor = (state: { players: PlayerState[] }, player: PlayerState): Record<string, number> => {
  const caps: Record<string, number> = {}
  for (const opponent of state.players) {
    if (opponent.id === player.id) continue
    caps[opponent.id] = Math.min(2, getOwnOrdinaryFenceReserveCount(opponent))
  }
  return caps
}

const totalCap = (donorCaps: Record<string, number>): number =>
  Object.values(donorCaps).reduce((sum, cap) => sum + cap, 0)

const actionContextFor = (donorCaps: Record<string, number>, max: number) => ({
  trueAction: false,
  fencePolicy: {
    allowedSegmentTypes: ['fence'],
    sourcePolicy: { kind: 'borrowed', donorCaps },
    segmentBounds: { fence: { min: 1, max }, total: { min: 1, max } },
    costPolicy: { fence: { wood: 0 } },
    cancelPolicy: 'forbidCancel',
  },
})

const buildFenceOffer = (donorCaps: Record<string, number>, max: number): ActionFlow => {
  return {
    type: 'seq',
    sourceCard: CARD_ID,
    children: [
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: KEY_OFFERED, value: true },
      },
      {
        type: 'leaf',
        actionId: 'fence',
        sourceCard: CARD_ID,
        optional: true,
        actionContext: actionContextFor(donorCaps, max),
      },
    ],
  }
}

export const E149_MidnightFencer_impl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (state, player) => {
      if (state.round !== 14) return
      if (readOffered(player)) return
      const donorCaps = donorCapsFor(state, player)
      const max = totalCap(donorCaps)
      if (max <= 0) return
      if (!canStartFencing(state, player, undefined, actionContextFor(donorCaps, max))) return
      return buildFenceOffer(donorCaps, max)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
