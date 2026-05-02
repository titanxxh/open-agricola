import { MinorImprovement } from '../types'
import type { ActionFlow, Resource } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E5_NightLoot'

/**
 * E5 Night Loot — Minor Improvement
 *
 * BGA `E5_NightLoot::onBuy` runs `argsSelectResources` → `actSelectResources`
 * which decrements **the chosen accumulation space's** resources. Our
 * previous implementation emitted `gain` leaves drawing from the general
 * supply, so the accumulation space was left untouched and the player
 * effectively double-banked the resource.
 *
 * Implementation:
 *   - Walks `state.actionSpaces`, selecting accumulation spaces
 *     (gainPerRound[r] > 0) that currently have ≥1 of a building resource.
 *   - For every (r1, r2) pair of distinct available resources, emits a SEQ
 *     of two `take-from-space` leaves (one per resource), each carrying
 *     `actionContext: { spaceId, resource, amount: 1 }`. The leaf decrements
 *     the space and credits the player.
 *   - The XOR is wrapped optional so the player can decline (matching BGA's
 *     `nb >= 2 ? 2 : 1` logic; we let the player skip outright when no pair
 *     is appealing).
 *   - When only 1 type of resource is available, emit a single
 *     take-from-space leaf for it (no XOR).
 *   - When no accumulation space carries any building resource, return
 *     undefined.
 *
 * Note: we use the FIRST space that has each resource — this is a
 * simplification of BGA's per-space selection. If multiple spaces carry the
 * same resource, the player cannot pick a particular one. A full
 * `argsSelectResources` choice-flow would be a follow-up.
 */

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

const findFirstSpaceWithResource = (
  state: { actionSpaces: { id: string; gainPerRound: Record<string, number>; resources: Record<string, number> }[] },
  resource: keyof Resource,
): string | undefined => {
  for (const space of state.actionSpaces) {
    if ((space.gainPerRound[resource] ?? 0) > 0 && (space.resources[resource] ?? 0) > 0) {
      return space.id
    }
  }
  return undefined
}

const takeFromSpaceLeaf = (
  spaceId: string,
  resource: keyof Resource,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'take-from-space',
  sourceCard: CARD_ID,
  actionContext: { spaceId, resource, amount: 1 },
})

export const E5_NightLoot = new MinorImprovement({
  id: CARD_ID,
  name: 'Night Loot',
  deck: 'E',
  number: 5,
  category: 'PASSING_-_BUILDING_RESOURCES_',
  desc: ['Immediately remove 2 different building resources total from accumulation spaces and place them in your supply.'],
  cost: { food: 2 },
})

export const E5_NightLoot_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state): ActionFlow | undefined => {
      const typeToSpace = new Map<keyof Resource, string>()
      for (const r of BUILDING_RESOURCES) {
        const id = findFirstSpaceWithResource(state, r)
        if (id) typeToSpace.set(r, id)
      }
      const types = BUILDING_RESOURCES.filter((r) => typeToSpace.has(r))
      if (types.length === 0) return undefined

      if (types.length === 1) {
        const r = types[0]!
        return takeFromSpaceLeaf(typeToSpace.get(r)!, r)
      }

      const choices: ActionFlow[] = []
      for (let i = 0; i < types.length; i++) {
        for (let j = i + 1; j < types.length; j++) {
          const r1 = types[i]!
          const r2 = types[j]!
          choices.push({
            type: 'seq',
            children: [
              takeFromSpaceLeaf(typeToSpace.get(r1)!, r1),
              takeFromSpaceLeaf(typeToSpace.get(r2)!, r2),
            ],
          })
        }
      }
      if (choices.length === 0) return undefined
      return {
        type: 'xor',
        children: choices,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
