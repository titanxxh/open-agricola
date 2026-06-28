import { defineMinorCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData } from '../helpers/card-state'
import { positionKey } from '../../domain/farm'
import type { PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'A073_AgriculturalFertilizers'
const countUsedSpaces = (player: PlayerState): number => {
  const occupied = new Set<string>()
  player.roomTiles.forEach((t) => occupied.add(positionKey(t)))
  player.fields.forEach((f) => occupied.add(positionKey({ row: f.row, col: f.col })))
  player.stableTiles.forEach((t) => occupied.add(positionKey(t)))
  player.pastures.flatMap((p) => p.tiles).forEach((t) => occupied.add(positionKey(t)))
  return occupied.size
}

const beforeListener: CardListenerRegistration = {
  id: 'A73-agri-fert-before',
  cardIds: [CARD_ID],
  actions: ['construct', 'fence', 'stables'],
  phases: ['before' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    return {
      flow: {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: {
          kind: 'set-extra-data',
          key: 'spacesBefore',
          value: countUsedSpaces(context.player),
        },
      },
      sourceCard: CARD_ID,
    }
  },
}

const afterListener: CardListenerRegistration = {
  id: 'A73-agri-fert-after',
  cardIds: [CARD_ID],
  actions: ['construct', 'fence', 'stables'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const before = readCardExtraData<number>(context.player, CARD_ID, 'spacesBefore') ?? 0
    const after = countUsedSpaces(context.player)
    if (after - before < 2) return
    return {
      flow: { type: 'leaf', actionId: 'sow', optional: true, sourceCard: CARD_ID },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [beforeListener, afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A073_AgriculturalFertilizers = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Agricultural Fertilizers',
    deck: 'A',
    number: 73,
    category: 'CROP_PROVIDER',
    desc: [
        'Each time after you turn at least 2 unused spaces into used spaces in one action, you get an additional __Sow__ action.',
      ],
    cost: {},
    prerequisite: '1 Pasture',
  },
  impl: cardImpl,
})

export const A073_AgriculturalFertilizers_impl = A073_AgriculturalFertilizers.impl
