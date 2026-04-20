import { PlayerActionCard } from '../../../../../shared/cards/types'
import { registerPlayerActionSpace } from '../../../../../shared/cards/player-action-space'

const CARD_ID = 'E999_FakeActionCard'

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'all',
  createDefinition: (ownerId) => ({
    id: CARD_ID,
    nameKey: 'cards.E999_FakeActionCard.name',
    descriptionKey: 'cards.E999_FakeActionCard.desc',
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
  }),
})

export const E999_FakeActionCard = new PlayerActionCard({
  id: CARD_ID,
  name: 'Fake Action Card',
  deck: 'E',
  number: 999,
  desc: ['A fake PlayerActionCard used only in unit-test fixtures.'],
  cost: { wood: 1 },
  prerequisite: '1 Occupation',
})
