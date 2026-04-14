import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'D138_PetLover'

const ANIMAL_MARKET_SPACES: Record<string, 'sheep' | 'boar' | 'cattle'> = {
  'sheep-market': 'sheep',
  'pig-market': 'boar',
  'cattle-market': 'cattle',
}

/**
 * D138 Pet Lover — Each time you use an accumulation space providing exactly 1 animal,
 * you can leave it on the space and get one from the general supply instead,
 * as well as 3 <FOOD> and 1 <GRAIN>.
 *
 * BGA: onPlayerComputePlaceFarmerFlow — wraps animal market flow in XOR:
 * normal collect OR get {animal:1, food:3, grain:1} without collecting.
 *
 * Implementation: Use a 'before' listener on place-farmer for animal markets.
 * When exactly 1 animal is on the space, offer an XOR: normal action vs Pet Lover bonus.
 * Players: 3+.
 */
const beforeListener: CardListenerRegistration = {
  id: 'D138-pet-lover-before-place-farmer',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.occupationPlayed.includes(CARD_ID)) return
    const spaceId = context.space?.id
    const animalType = spaceId ? ANIMAL_MARKET_SPACES[spaceId] : undefined
    if (!animalType) return
    // Count accumulated animals on the space
    const spaceResources = context.space?.resources ?? {}
    const totalAnimals = (spaceResources.sheep ?? 0) + (spaceResources.boar ?? 0) + (spaceResources.cattle ?? 0)
    if (totalAnimals !== 1) return
    // Offer XOR: continue normal (empty flow) OR take Pet Lover bonus (gain animal+food+grain)
    return {
      flow: {
        type: 'xor',
        optional: false,
        children: [
          {
            // Normal option: don't intercept (decline and let normal flow run)
            type: 'leaf',
            actionId: 'noop',
            sourceCard: CARD_ID,
            choiceLabelKey: 'ui.interactionPetLoverNormal',
          },
          {
            // Pet Lover option: get animal from supply + food + grain (leave space resources)
            type: 'seq',
            children: [
              gainLeaf(CARD_ID, { [animalType]: 1, food: 3, grain: 1 }),
            ],
            choiceLabelKey: 'ui.interactionPetLoverBonus',
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

registerCardListener(beforeListener)

export const D138_PetLover = new Occupation({
  id: CARD_ID,
  name: 'Pet Lover',
  deck: 'D',
  number: 138,
  category: 'GOODS_PROVIDER',
  desc: ['Each time you use an accumulation space providing exactly 1 animal, you can leave it on the space and get one from the general supply instead, as well as 3 <FOOD> and 1 <GRAIN>.'],
  cost: {},
  players: '3+',
})
