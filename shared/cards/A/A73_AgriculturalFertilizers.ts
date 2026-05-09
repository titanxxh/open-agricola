import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { positionKey } from '../../domain/farm'
import type { PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { A73_AgriculturalFertilizers } from '../../cards-display/A/A73_AgriculturalFertilizers'

const CARD_ID = A73_AgriculturalFertilizers.id

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
    writeCardExtraData(context.player, CARD_ID, 'spacesBefore', countUsedSpaces(context.player))
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

export const A73_AgriculturalFertilizers_impl = {
  listeners: [beforeListener, afterListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
