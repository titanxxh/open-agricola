import type { CardListenerRegistration } from '../card-listeners'

export const STUB_BONUS_CHOICES_CARD = 'Stub_BonusChoices'

// Hook that returns a bonus.choices on improvement-any for a synthetic card id
// 'Major_TestChoices'. Construct scenarios in tests that fabricate this cardId.
export const stubBonusChoicesListener: CardListenerRegistration = {
  id: 'stub-bonus-choices',
  cardIds: [STUB_BONUS_CHOICES_CARD],
  phases: ['computeCosts'],
  actions: ['improvement-any'],
  handler: (context) => {
    if (context.cardId !== 'Major_TestChoices') return
    return {
      bonuses: [{
        choices: [
          { discount: { wood: -1, clay: 2 }, sources: [STUB_BONUS_CHOICES_CARD] },
          { discount: { wood: -1, stone: 2 }, sources: [STUB_BONUS_CHOICES_CARD] },
        ],
        optional: true,
        sources: [STUB_BONUS_CHOICES_CARD],
      }],
    }
  },
}
