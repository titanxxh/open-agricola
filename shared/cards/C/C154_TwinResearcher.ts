import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { GameState } from '../../game/types'
import { payGainNode } from '../helpers/pay-gain-node'

const CARD_ID = 'C154_TwinResearcher'

/**
 * C154 Twin Researcher (Occupation, 4+ players)
 *
 * "Each time you use one of the two accumulation spaces for the same type of
 * good containing exactly the same number of goods, you can also buy 1 bonus
 * score for 1 food."
 *
 * BGA pairs (by resource type):
 *   - wood: forest/grove/copse/copse-add (triggered on each, compared to the
 *     others)
 *   - clay: clay-pit vs hollow / hollow-4
 *   - food: fishing vs traveling-players
 *   - stone: eastern-quarry vs western-quarry
 *
 * Our engine only ships the subset: forest/grove/copse (wood),
 * clay-pit/hollow-4 (clay), fishing/traveling-players (food), and
 * eastern-quarry/western-quarry (stone). We implement the checks for those
 * available pairs.
 */

type ResourceKey = 'wood' | 'clay' | 'food' | 'stone'

const PAIRS: Record<string, { resource: ResourceKey; partners: string[] }> = {
  forest: { resource: 'wood', partners: ['grove', 'copse'] },
  grove: { resource: 'wood', partners: ['forest', 'copse'] },
  copse: { resource: 'wood', partners: ['forest', 'grove'] },
  'clay-pit': { resource: 'clay', partners: ['hollow-4'] },
  'hollow-4': { resource: 'clay', partners: ['clay-pit'] },
  fishing: { resource: 'food', partners: ['traveling-players'] },
  'traveling-players': { resource: 'food', partners: ['fishing'] },
  'eastern-quarry': { resource: 'stone', partners: ['western-quarry'] },
  'western-quarry': { resource: 'stone', partners: ['eastern-quarry'] },
}

const getSpaceResourceCount = (
  state: GameState,
  spaceId: string,
  resource: ResourceKey,
): number | null => {
  const space = state.actionSpaces.find((s) => s.id === spaceId)
  if (!space) return null
  return space.resources[resource] ?? 0
}

const hasMatchingPartner = (
  state: GameState,
  resource: ResourceKey,
  partners: string[],
  ownCount: number,
): boolean => {
  for (const partnerId of partners) {
    const partnerCount = getSpaceResourceCount(state, partnerId, resource)
    if (partnerCount === null) continue
    if (partnerCount === ownCount) return true
  }
  return false
}

const listener: CardListenerRegistration = {
  id: 'C154-twin-researcher-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId) return
    const pair = PAIRS[spaceId]
    if (!pair) return
    // Compare resource count BEFORE the player collects (uses context.space
    // which is the live state, checked before place-farmer resolves).
    const ownCount = getSpaceResourceCount(context.state, spaceId, pair.resource)
    if (ownCount === null) return
    if (!hasMatchingPartner(context.state, pair.resource, pair.partners, ownCount)) return
    if ((context.player.resources.food ?? 0) < 1) return
    return payGainNode({
      cardId: CARD_ID,
      cost: { food: 1 },
      gain: { score: 1 },
    })
  },
}

registerCardListener(listener)

export const C154_TwinResearcher = new Occupation({
  id: CARD_ID,
  name: 'Twin Researcher',
  deck: 'C',
  number: 154,
  category: 'POINTS_PROVIDER',
  desc: [
    'Each time you use one of the two accumulation spaces for the same type of good containing exactly the same number of goods, you can also buy 1 bonus <SCORE> for 1 <FOOD>.',
  ],
  cost: {},
  players: '4+',
  evenMoreSet: true,
})
