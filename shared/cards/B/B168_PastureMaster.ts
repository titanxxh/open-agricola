import { Occupation } from '../types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { Resource } from '../../game/types'

const CARD_ID = 'B168_PastureMaster'

/**
 * B168 Pasture Master:
 * Each time you renovate, you get 2 food and 1 additional animal of the
 * respective type in each of your pastures with stable.
 *
 * BGA: isActionEvent(Renovation). onPlayerAfterRenovation → gain food + animals.
 * getAnimals iterates zones: pasture type with stables > 0 → add 1 of each animal type present.
 */
const listener: CardListenerRegistration = {
  id: 'B168-pasture-master-after-renovate',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  handler: (context: CardListenerContext): ActionHookResult | void => {

    const gain: Partial<Resource> = { food: 2 }

    // Check each pasture for stables and animals
    for (const pasture of context.player.pastures) {
      if (pasture.stables === 0) continue
      if (pasture.animalType && pasture.animalCount > 0) {
        const animalKey = pasture.animalType as keyof Resource
        gain[animalKey] = (gain[animalKey] ?? 0) + 1
      }
    }

    return { flow: gainLeaf(CARD_ID, gain), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const B168_PastureMaster = new Occupation({
  id: CARD_ID,
  name: 'Pasture Master',
  deck: 'B',
  number: 168,
  category: 'LIVESTOCK_PROVIDER',
  desc: [
    'Each time you renovate, you get 2 <FOOD> and 1 additional animal of the respective type in each of your pastures with stable.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})
