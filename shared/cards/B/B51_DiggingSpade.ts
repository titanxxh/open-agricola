import { MinorImprovement } from '../types'
import type { PlayerState, Pasture } from '../../contract/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import { registerPrerequisite } from '../helpers/prerequisite-registry'
import type { CardImpl } from '../registry'

const CARD_ID = 'B51_DiggingSpade'

/**
 * B51 Digging Spade — Each time you use a clay accumulation space,
 * you also get a number of FOOD equal to the number of PIG (boar) in your farmyard.
 *
 * BGA (B51_DiggingSpade.php): isBeforeCollectEvent($event, CLAY) → onPlayerPlaceFarmer
 * returns gainNode([FOOD => pigs]). Play-in-round-7-or-later is enforced via isBuyable
 * which we mirror via the prerequisite registration below. (A52_ThrowingAxe shares the
 * same label and registers an identical handler.)
 */

// BGA isBuyable: turn < 7 → false.
registerPrerequisite('Play in Round 7 or Later', (_player, state) => {
  if (!state) return true
  return state.round >= 7
})
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
    const gainPerRound = context.space?.gainPerRound ?? {}
    if ((gainPerRound.clay ?? 0) <= 0) return
    const pigs = countBoarInFarmyard(context.player)
    if (pigs <= 0) return
    return { flow: gainLeaf(CARD_ID, { food: pigs }), sourceCard: CARD_ID }
  },
}

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

export const B51_DiggingSpade_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
