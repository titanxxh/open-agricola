import { MinorImprovement } from '../types'
import type { PlayerState, Pasture } from '../../game/types'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'B51_DiggingSpade'

/**
 * B51 Digging Spade — Each time you use a clay accumulation space,
 * you also get a number of FOOD equal to the number of PIG (boar) in your farmyard.
 *
 * BGA (B51_DiggingSpade.php): isBeforeCollectEvent($event, CLAY) → onPlayerPlaceFarmer
 * returns gainNode([FOOD => pigs]). Play-in-round-7-or-later is enforced via isBuyable,
 * not the trigger; we do not replicate the prerequisite here (other cards rely on the
 * card-acquisition pipeline for such constraints).
 */
const countBoarInFarmyard = (player: PlayerState): number => {
  const inHouse = player.houseAnimalType === 'boar' ? player.houseAnimalCount : 0
  const inStables = Object.values(player.stableAnimals ?? {}).filter(
    (a) => a === 'boar',
  ).length
  const inPastures = (player.pastures ?? []).reduce(
    (sum: number, p: Pasture) =>
      sum + (p.animalType === 'boar' ? p.animalCount : 0),
    0,
  )
  return inHouse + inStables + inPastures
}

const listener: CardListenerRegistration = {
  id: 'B51-digging-spade-before-collect-clay',
  cardIds: [CARD_ID],
  phases: ['before' as ActionHookPhase],
  actions: ['collect'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.clay ?? 0) <= 0) return
    const pigs = countBoarInFarmyard(context.player)
    if (pigs <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: pigs }), sourceCard: CARD_ID }
  },
}

registerCardListener(listener)

export const B51_DiggingSpade = new MinorImprovement({
  id: CARD_ID,
  name: 'Digging Spade',
  deck: 'B',
  number: 51,
  category: 'FOOD_PROVIDER',
  desc: [
    'Each time you use a clay accumulation space, you also get a number of <FOOD> equal to the number of <PIG> in your farmyard.',
  ],
  cost: { wood: 1 },
  prerequisite: 'Play in Round 7 or Later',
  newSet: true,
})
