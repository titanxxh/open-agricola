import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ActionFlow, Resource } from '../../game/types'

const CARD_ID = 'E5_NightLoot'

/**
 * E5 Night Loot (Minor Improvement, E, 5)
 * Immediately remove 2 different building resources total from accumulation
 * spaces and place them in your supply.
 *
 * BGA: onBuy uses SPECIAL_EFFECT argsSelectResources — player picks 2 different
 * building resources from accumulation spaces.
 *
 * Simplified: on buy, offer an XOR of all pairs of 2 different building resource
 * types available on accumulation spaces. Each choice gives 1 of each of 2 types.
 */

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

registerCardEffect({
  id: CARD_ID,
  onBuy: (state) => {
    // Find which building resource types are available on accumulation spaces
    const availableTypes = new Set<keyof Resource>()
    for (const space of state.actionSpaces) {
      for (const resource of BUILDING_RESOURCES) {
        if ((space.gainPerRound[resource] ?? 0) > 0 && (space.resources[resource] ?? 0) > 0) {
          availableTypes.add(resource)
        }
      }
    }

    const types = BUILDING_RESOURCES.filter((r) => availableTypes.has(r))
    if (types.length === 0) return

    if (types.length === 1) {
      // Only 1 type available, take 1 of it
      return {
        type: 'leaf',
        actionId: 'gain',
        params: { [types[0]!]: 1 },
        sourceCard: CARD_ID,
      } as ActionFlow
    }

    // Build XOR choices for all pairs of 2 different types
    const choices: ActionFlow[] = []
    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const r1 = types[i]!
        const r2 = types[j]!
        choices.push({
          type: 'leaf',
          actionId: 'gain',
          params: { [r1]: 1, [r2]: 1 },
          sourceCard: CARD_ID,
        })
      }
    }

    if (choices.length === 0) return

    return {
      type: 'xor',
      children: choices,
    }
  },
})

export const E5_NightLoot = new MinorImprovement({
  id: CARD_ID,
  name: 'Night Loot',
  deck: 'E',
  number: 5,
  category: 'RESOURCE_WOOD',
  desc: ['Immediately remove 2 different building resources total from accumulation spaces and place them in your supply.'],
  cost: { food: 2 },
  passing: true,
})
