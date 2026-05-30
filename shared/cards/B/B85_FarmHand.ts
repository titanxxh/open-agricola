import type { FarmTilePosition, GameState, PlayerState } from '../../contract/types'
import { FARM_ROWS, FARM_COLS, positionKey } from '../../domain/farm'
import {
  isCardFlagged,
  readCardExtraData,
  setCardFlag,
  writeCardExtraData,
} from '../helpers/card-state'
import type { CardImpl } from '../registry'
import { B85_FarmHand } from '../../cards-display/B/B85_FarmHand'
import { getAvailableStableSupplyCount } from '../../domain/supply-tokens'

const CARD_ID = B85_FarmHand.id

const POSITION_KEY = 'position'

/**
 * B85 Farm Hand (Occupation, 1+):
 * "Once this game, if you have 4 field tiles in a 2×2, you can build a
 *  stable in the center of the 2×2 during a __Build Stables__ action.
 *  This stable provides room for a person but not animals."
 *
 * BGA rulings:
 *   - Only during the exact Build Stables action reached from Farm
 *     Expansion (NOT Lazybones E148 / Stable Planner A089 / Stable
 *     Cleaner C94 / any other "build a stable" effect). The entry is
 *     modelled as a wrapper on the Farm Expansion `stables` leaf rather
 *     than a generic anytime listener — see `common-farm-expansion.ts`
 *     (`actionContext.farmHand`).
 *   - Can be returned by D102 SampleStableMaker / E76 LumberPile.
 *
 * The FarmHand stable position joins the regular `stables` `farm-select`
 * interaction (`farmHandPositions`); the player may submit only the
 * FarmHand position without picking any ordinary stable. Build payment,
 * the `farm.stableBuilt` event, the after-stables listener and the action
 * snapshot all run on the shared `stables` settlement path — so cost
 * modifiers (e.g. C88) apply uniformly.
 *
 * State (`cardStates.B85_FarmHand`):
 *   - `extraData.position: { row, col }` — top-left of the 2×2 field
 *     block. Present only while the FarmHand stable is built.
 *   - `flagged: boolean` — once-per-game sentinel; stays true even after
 *     D102 / E76 returns the tile.
 *
 * Housing bonus plugs into the shared `computeExtraRoomCapacity` hook
 * (same mechanism as A10 WoodenShed / A85 Homekeeper / A127 Lodger /
 * C10 BunkBeds / D85 Reader / E85 MasterTanner). The position is never
 * pushed into `stableTiles`, so animal zones / pasture capacity / loose
 * stable capacity are untouched; the card-facing stable count is derived
 * separately in `shared/domain/stables.ts`.
 */

export const readFarmHandPosition = (player: PlayerState) =>
  readCardExtraData<FarmTilePosition>(player, CARD_ID, POSITION_KEY)

const isFarmHandUsed = (player: PlayerState) => isCardFlagged(player, CARD_ID)

const playerHasCard = (player: PlayerState) =>
  player.occupationPlayed.includes(CARD_ID)

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

/**
 * FarmHand positions offered inside a Build Stables `farm-select`. Empty
 * unless the player owns an unused B85 and has at least one stable supply
 * token left after every other reservation.
 */
export const getFarmHandStablePositions = (
  state: GameState,
  player: PlayerState,
): FarmTilePosition[] => {
  if (!playerHasCard(player)) return []
  if (isFarmHandUsed(player)) return []
  if (getAvailableStableSupplyCount(state, player) <= 0) return []
  return getFarmHandCandidates(player)
}

const isFarmHandPositionLegal = (
  state: GameState,
  player: PlayerState,
  position: FarmTilePosition,
): boolean =>
  getFarmHandStablePositions(state, player).some(
    (candidate) => candidate.row === position.row && candidate.col === position.col,
  )

/**
 * Settle a chosen FarmHand stable: write the once-per-game flag and the
 * position. Supply consumption is implicit — `getAvailableStableSupplyCount`
 * already treats the stored position as one occupied token. Returns false
 * when the position is not a legal FarmHand candidate (already used,
 * supply exhausted, or not a 2×2 field centre).
 */
export const applyFarmHandStable = (
  state: GameState,
  player: PlayerState,
  position: FarmTilePosition,
): boolean => {
  if (!isFarmHandPositionLegal(state, player, position)) return false
  setCardFlag(player, CARD_ID, true)
  writeCardExtraData(player, CARD_ID, POSITION_KEY, { row: position.row, col: position.col })
  return true
}

export const B85_FarmHand_impl = {
  effect: {
    id: CARD_ID,
    /**
     * The FarmHand stable slot contributes +1 housing capacity while it is
     * standing. Drops to 0 after D102/E76 returns the tile — capacity
     * shrinks naturally, any over-sized family is unable to grow further.
     */
    computeExtraRoomCapacity: (player: PlayerState) =>
      readFarmHandPosition(player) ? 1 : 0,
    /**
     * Offer the FarmHand 2×2 centre as a special stable inside a Build Stables
     * `farm-select`. Plugs into the generic special-stable card-effect
     * aggregation so the core stables action carries no B85 knowledge.
     */
    getSpecialStablePositions: getFarmHandStablePositions,
    applySpecialStable: applyFarmHandStable,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
