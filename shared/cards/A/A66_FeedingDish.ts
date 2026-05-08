import type { PlayerState, Pasture } from '../../contract/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { A66_FeedingDish } from '../../cards-display/A/A66_FeedingDish'
export { A66_FeedingDish }

const CARD_ID = A66_FeedingDish.id

type AnimalKey = 'sheep' | 'boar' | 'cattle'

const SPACE_TO_ANIMAL: Record<string, AnimalKey> = {
  'sheep-market': 'sheep',
  'pig-market': 'boar',
  'cattle-market': 'cattle',
}

const countAnimalOfType = (player: PlayerState, animal: AnimalKey): number => {
  const inHouse = player.houseAnimalType === animal ? player.houseAnimalCount : 0
  const inStables = Object.values(player.stableAnimals ?? {}).filter((a) => a === animal).length
  const inPastures = (player.pastures ?? []).reduce(
    (sum: number, p: Pasture) => sum + (p.animalType === animal ? p.animalCount : 0),
    0,
  )
  return inHouse + inStables + inPastures
}

const listener: CardListenerRegistration = {
  id: 'A66-feeding-dish-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id ?? ''
    const animal = SPACE_TO_ANIMAL[spaceId]
    if (!animal) return
    if (countAnimalOfType(context.player, animal) < 1) return
    return { flow: gainLeaf(CARD_ID, { grain: 1 }), sourceCard: CARD_ID }
  },
}

export const A66_FeedingDish_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
