import { defineOccupationCard } from '../card-source'
import type { CardDefinition } from '../../contract/cards'
import type { PaymentResourceMap, PlayerState } from '../../contract/types'
import { getMinorImprovement } from '../registry-display'
import { majorCardDefinitionsList } from '../major/generated'
import type { CardImpl } from '../registry'

const CARD_ID = 'A169_OffSiter'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const
const majorCards: ReadonlyMap<string, CardDefinition> = new Map(
  majorCardDefinitionsList.map((card) => [card.id, card as CardDefinition]),
)

const printedBuildingResourceCost = (card: CardDefinition): number => {
  const cost = card.cost as PaymentResourceMap | undefined
  if (!cost || 'fee' in cost) return 0
  return BUILDING_RESOURCES.reduce((sum, resource) => sum + (cost[resource] ?? 0), 0)
}

const countedMajorCards = (player: PlayerState): CardDefinition[] => [
  ...player.improvements.map((id) => majorCards.get(id)).filter((card): card is CardDefinition => !!card),
  ...player.minorPlayed
    .map((id) => getMinorImprovement(id))
    .filter((card): card is CardDefinition => !!card?.alsoCountsAs?.includes('major')),
]

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeExtraRoomCapacity: (player: PlayerState) =>
      countedMajorCards(player).reduce((sum, card) => sum + printedBuildingResourceCost(card), 0) >= 9 ? 1 : 0,
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A169_OffSiter = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Off-Siter',
    deck: 'A',
    number: 169,
    category: 'FARM_PLANNER',
    desc: ['Once the total printed building cost of all the major improvements you have is at least 9 building resources, this card provides room for 1 person for the rest of the game.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A169_OffSiter_impl = A169_OffSiter.impl
