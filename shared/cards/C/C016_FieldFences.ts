import { defineMinorCard } from '../card-source'
import { readCardExtraData } from '../helpers/card-state'
import type { CardImpl } from '../registry'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, FarmTilePosition, PlayerState } from '../../contract/types'

const CARD_ID = 'C016_FieldFences'
const FLAG_KEY = 'c16Active'

/**
 * C16 Field Fences — Minor Improvement
 *
 * BGA: `C016_FieldFences::onBuy` returns SEQ optional with a single
 * `FENCING` action carrying `fieldFences: true` (BGA `Fencing.php`
 * looks at `getCtxArgs()['fieldFences']`, then for each new fence whose
 * (x,y) coordinate is in `getAvailableFieldFences()` the wood cost is
 * reduced by 1 — so any fence built next to a field tile is free).
 *
 * Implementation strategy (no main-path edits): we drive a SEQ optional
 *   1. `special-effect` → set `cardStates.C016_FieldFences.extraData.c16Active = true`
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
      const costs = { wood: -n }
      return { costs, costAttribution: [{ sourceCard: CARD_ID, costs }] }
    }
    const costs = { wood: -newFenceEdges.filter((e) => fieldEdges.has(e)).length }
    return { costs, costAttribution: [{ sourceCard: CARD_ID, costs }] }
  },
}

const cardImpl = {
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

export const C016_FieldFences = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Field Fences',
    deck: 'C',
    number: 16,
    category: 'FARM_PLANNER',
    desc: ['You can immediately take a __Build Fences__ action, during which you do not have to pay <WOOD> for <FENCE> that you build next to <FIELD> tiles.'],
    cost: { food: 2 },
  },
  impl: cardImpl,
})

export const C016_FieldFences_impl = C016_FieldFences.impl
