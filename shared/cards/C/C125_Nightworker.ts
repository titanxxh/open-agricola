import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow, Resource } from '../../game/types'

const CARD_ID = 'C125_Nightworker'

/**
 * C125 Nightworker (Occupation, C, 125)
 * Before the start of each work phase, you can place a person on an accumulation
 * space of a building resource not in your supply.
 *
 * BGA: startOfWork — finds accumulation spaces for building resources (wood/clay/
 * reed/stone) that the player has NONE of, then optionally lets the player place
 * a farmer on one of them.
 *
 * Simplified implementation: at onRoundStart, optionally gain 1 building resource
 * from an accumulation space of a type the player has 0 of. This avoids needing
 * the unsupported "pre-work place-farmer" mechanic. The card is also banned in BGA.
 */

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

registerCardEffect({
  id: CARD_ID,
  onRoundStart: (state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return

    // Find building resource types the player has 0 of
    const missingTypes = BUILDING_RESOURCES.filter(
      (r) => (player.resources[r] ?? 0) === 0,
    )
    if (missingTypes.length === 0) return

    // Find accumulation spaces that have resources of a missing type
    const choices: ActionFlow[] = []
    for (const space of state.actionSpaces) {
      for (const resource of missingTypes) {
        if ((space.gainPerRound[resource] ?? 0) <= 0) continue
        if ((space.resources[resource] ?? 0) <= 0) continue
        choices.push({
          type: 'leaf',
          actionId: 'gain',
          params: { [resource]: space.resources[resource]! },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.interactionTakeFromSpace',
          choiceLabelParams: { resource, spaceId: space.id, spaceName: space.nameKey },
        })
      }
    }

    if (choices.length === 0) return

    return {
      type: 'xor',
      optional: true,
      children: choices,
    }
  },
})

export const C125_Nightworker = new Occupation({
  id: CARD_ID,
  name: 'Nightworker',
  deck: 'C',
  number: 125,
  category: 'BUILDING_RESOURCE_PROVIDER',
  desc: ['Before the start of each work phase, you can place a person on an accumulation space of a building resource not in your supply. (Then proceed with the start player.)'],
  cost: {},
  players: '1+',
  evenMoreSet: true,
})
