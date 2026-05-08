import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { FARM_ROWS, FARM_COLS, positionKey } from '../../game/farm'
import { payLeaf } from '../helpers/pay-gain-node'
import {
  isCardFlagged,
  readCardExtraData,
  writeCardExtraData,
} from '../helpers/card-state'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'B85_FarmHand'
const POSITION_KEY = 'position'
const SELECT_EFFECT = 'farmhand-stable-select'

/**
 * B85 Farm Hand (Occupation, 1+):
 * "Once this game, if you have 4 field tiles in a 2×2, you can build a
 *  stable in the center of the 2×2 during a __Build Stables__ action.
 *  This stable provides room for a person but not animals."
 *
 * BGA rulings:
 *   - Only during an exact Build Stables action (NOT Lazybones E148 /
 *     Stable Planner A089 / any other "build a stable" effect).
 *   - Can be returned by D102 SampleStableMaker / E76 LumberPile.
 *
 * State (`cardStates.B85_FarmHand`):
 *   - `extraData.position: { row, col }` — top-left of the 2×2 field
 *     block. Present only while the FarmHand stable is built.
 *   - `flags.used: boolean` — once-per-game sentinel; stays true even
 *     after D102 / E76 returns the tile.
 *
 * Housing bonus plugs into the shared `computeExtraRoomCapacity` hook
 * (same mechanism as A10 WoodenShed / A85 Homekeeper / A127 Lodger /
 * C10 BunkBeds / D85 Reader / E85 MasterTanner). No change to
 * `player.rooms` — renovation cost, scoring, and stone-house bonus
 * stay untouched; animal logic is unaffected because the position is
 * never pushed into `stableTiles`.
 *
 * The "occupant moves to other rooms on return" BGA ruling is modelled
 * implicitly: `familySize` is unchanged, capacity drops by 1, so the
 * next family-growth attempt blocks naturally — no explicit relocation
 * UI. Documented in `card_progress.md` §2.5.
 *
 * BGA additionally serialises cost-modifier cards via
 * `orderComputeCardCosts`. We do not implement listener ordering (see
 * memory note); our bonus expander unions all orderings, which is a
 * strict superset of any single ordering.
 */

const readFarmHandPosition = (player: PlayerState) =>
  readCardExtraData<FarmTilePosition>(player, CARD_ID, POSITION_KEY)

// Once-per-game sentinel: `flagged` stays true even after D102/E76 returns
// the tile, matching BGA's "Once this game".
const isFarmHandUsed = (player: PlayerState) => isCardFlagged(player, CARD_ID)

export const getFarmHandCandidates = (player: PlayerState): FarmTilePosition[] => {
  const fieldKeys = new Set(
    player.fields.map((f) => positionKey({ row: f.row, col: f.col })),
  )
  const candidates: FarmTilePosition[] = []
  for (let r = 0; r < FARM_ROWS - 1; r++) {
    for (let c = 0; c < FARM_COLS - 1; c++) {
      if (
        fieldKeys.has(positionKey({ row: r, col: c })) &&
        fieldKeys.has(positionKey({ row: r, col: c + 1 })) &&
        fieldKeys.has(positionKey({ row: r + 1, col: c })) &&
        fieldKeys.has(positionKey({ row: r + 1, col: c + 1 }))
      ) {
        candidates.push({ row: r, col: c })
      }
    }
  }
  return candidates
}

registerSelectionEffect(SELECT_EFFECT, ({ player, positions }) => {
  if (positions.length === 0) return
  const [rowStr, colStr] = positions[0]!.split('-')
  const row = Number(rowStr)
  const col = Number(colStr)
  if (!Number.isFinite(row) || !Number.isFinite(col)) return
  writeCardExtraData(player, CARD_ID, POSITION_KEY, { row, col })
})

const anytimeListener: CardListenerRegistration = {
  id: 'B85-farm-hand-anytime',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // Once-per-game gate: `flags.used` survives a D102/E76 return.
    if (isFarmHandUsed(context.player)) return
    // BGA ruling: only the exact Build Stables action qualifies.
    if (context.space?.id !== 'stables') return
    // Pay 1 wood (matches BGA's `canAffordStablePlan(…, 1)` with the
    // standard 1-wood-per-stable cost).
    if ((context.player.resources.wood ?? 0) < 1) return
    const candidates = getFarmHandCandidates(context.player)
    if (candidates.length === 0) return

    return {
      flow: {
        type: 'seq',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
          {
            type: 'leaf',
            actionId: 'selection',
            sourceCard: CARD_ID,
            actionContext: {
              selectionKind: 'farm-position',
              selectionEffect: SELECT_EFFECT,
              maxSelections: 1,
              minSelections: 1,
              selectableTiles: candidates,
            },
          },
          { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: true } },
        ],
      },
      sourceCard: CARD_ID,
      labelKey: 'cards.B85_FarmHand.anytime',
    }
  },
}

export const B85_FarmHand = new Occupation({
  id: CARD_ID,
  name: 'Farm Hand',
  deck: 'B',
  number: 85,
  category: 'FARM_PLANNER',
  desc: [
    'Once this game, if you have 4 field tiles in a 2x2, you can build a stable in the center of the 2x2 during a __Build Stables__ action. This stable provides room for a person but not animals.',
  ],
  players: '1+',
  newSet: true,
  implemented: true,
})

export const B85_FarmHand_impl = {
  listeners: [anytimeListener],
  effect: {
    id: CARD_ID,
    /**
     * The FarmHand stable slot contributes +1 housing capacity while it is
     * standing. Drops to 0 after D102/E76 returns the tile — capacity
     * shrinks naturally, any over-sized family is unable to grow further.
     */
    computeExtraRoomCapacity: (player: PlayerState) =>
      readFarmHandPosition(player) ? 1 : 0,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
