import { readCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, FarmTilePosition, PlayerState } from '../../contract/types'
import { C16_FieldFences } from '../../cards-display/C/C16_FieldFences'
export { C16_FieldFences }

const CARD_ID = C16_FieldFences.id

const FLAG_KEY = 'c16Active'

/**
 * C16 Field Fences — Minor Improvement
 *
 * BGA: `C16_FieldFences::onBuy` returns SEQ optional with a single
 * `FENCING` action carrying `fieldFences: true` (BGA `Fencing.php`
 * looks at `getCtxArgs()['fieldFences']`, then for each new fence whose
 * (x,y) coordinate is in `getAvailableFieldFences()` the wood cost is
 * reduced by 1 — so any fence built next to a field tile is free).
 *
 * Implementation strategy (no main-path edits): we drive a SEQ optional
 *   1. `special-effect` → set `cardStates.C16_FieldFences.extraData.c16Active = true`
 *   2. `fencing` leaf
 *   3. `special-effect` → unset the flag
 * Discount is delivered through a `computeCosts` listener on `fence`,
 * gated by the flag. This mirrors how E16 BriarHedge handles "free border
 * edges" but only while the card-induced fencing flow is active.
 */
const fieldEdgeIds = (fields: FarmTilePosition[]): Set<string> => {
  const edges = new Set<string>()
  for (const tile of fields) {
    edges.add(`H-${tile.row}-${tile.col}`)
    edges.add(`H-${tile.row + 1}-${tile.col}`)
    edges.add(`V-${tile.row}-${tile.col}`)
    edges.add(`V-${tile.row}-${tile.col + 1}`)
  }
  return edges
}

const isC16Active = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, FLAG_KEY) === true

const setFlagFlow = (value: boolean): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key: FLAG_KEY, value },
})

const C16FenceListener: CardListenerRegistration = {
  id: 'C16-fence-discount',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['fence'],
  handler: (ctx: CardListenerContext): ActionHookResult | void => {
    if (!isC16Active(ctx.player)) return
    const fieldEdges = fieldEdgeIds(ctx.player.fields.map((f) => ({ row: f.row, col: f.col })))
    const params = ctx.params as { newFenceEdges?: string[] } | undefined
    const newFenceEdges = params?.newFenceEdges
    if (newFenceEdges === undefined) {
      const built = new Set((ctx.player.fenceSegments ?? []).map((s) => s.edge))
      let n = 0
      for (const edge of fieldEdges) if (!built.has(edge)) n += 1
      return { costs: { wood: -n } }
    }
    return { costs: { wood: -newFenceEdges.filter((e) => fieldEdges.has(e)).length } }
  },
}

export const C16_FieldFences_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'seq' as const,
      optional: true,
      children: [
        setFlagFlow(true),
        { type: 'leaf' as const, actionId: 'fence', sourceCard: CARD_ID },
        setFlagFlow(false),
      ],
    }),
  },
  listeners: [C16FenceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
