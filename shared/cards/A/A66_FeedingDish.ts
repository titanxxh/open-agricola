import { defineMinorCard } from '../card-source'
import type { PlayerState, Pasture } from '../../contract/types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'

const CARD_ID = 'A66_FeedingDish'
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

const cardImpl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A66_FeedingDish = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Feeding Dish',
    deck: 'A',
    number: 66,
    category: 'CROP_PROVIDER',
    desc: ['Each time you use an animal accumulation space while already having an animal of that type, you get 1 <GRAIN>.'],
    cost: { wood: 1 },
  },
  impl: cardImpl,
})

export const A66_FeedingDish_impl = A66_FeedingDish.impl
