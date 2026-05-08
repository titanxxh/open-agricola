import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { workersAvailable } from '../../domain/player'
import { C125_Nightworker } from '../../cards-display/C/C125_Nightworker'
export { C125_Nightworker }

const CARD_ID = C125_Nightworker.id

/**
 * C125 Nightworker (Occupation, C, 125)
 *
 * BGA: `onPlayerStartOfWork` returns an optional `PLACE_FARMER` flow with
 * `constraints` = list of accumulation-space ids carrying a building resource
 * the player has 0 of. The placed worker counts as a normal placement (a
 * family pool worker is consumed; the action space pays out). Players without
 * any candidate space — i.e. they already have wood/clay/reed/stone or every
 * accumulation space of the missing type is empty — get no choice. BGA also
 * marks the card `banned` (cup-pool filter) and `isCorbariusOrDulcinaria` (we
 * don't model either today).
 *
 * Mirror it via `onRoundStart` (our analogue of startOfWork — fires after
 * round growth, before currentPlayerIndex is set to start player). The flow
 * is `optional` so the player can skip; place-farmer's standard worker-count
 * + occupied-space machinery handles the rest.
 */

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

export const C125_Nightworker_impl = {
  effect: {
  id: CARD_ID,
  onRoundStart: (state, player): ActionFlow | undefined => {
    if (workersAvailable(state, player) <= 0) return
    // Building resource types the player has 0 of
    const missingTypes = BUILDING_RESOURCES.filter(
      (r) => (player.resources[r] ?? 0) === 0,
    )
    if (missingTypes.length === 0) return

    // Accumulation spaces with at least 1 of a missing type, currently
    // unoccupied (BGA's PLACE_FARMER respects standard occupied rules).
    const constraints: string[] = []
    for (const space of state.actionSpaces) {
      if (space.takenBy.length > 0) continue
      for (const resource of missingTypes) {
        if ((space.gainPerRound[resource] ?? 0) <= 0) continue
        if ((space.resources[resource] ?? 0) <= 0) continue
        constraints.push(space.id)
        break
      }
    }
    if (constraints.length === 0) return

    return {
      type: 'leaf',
      actionId: 'place-farmer',
      optional: true,
      sourceCard: CARD_ID,
      actionContext: { constraints },
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
