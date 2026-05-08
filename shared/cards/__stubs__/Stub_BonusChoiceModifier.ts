import type { BonusModifier } from '../../contract/types'

const STUB_BONUS_CHOICE_MODIFIER_CARD = 'Stub_BonusChoiceModifier'

// BonusModifier with choices for appliesTo: ['construct']. Use by pushing onto
// player.activeModifiers in tests.
export const stubBonusChoiceModifier: BonusModifier = {
  type: 'bonus',
  cardId: STUB_BONUS_CHOICE_MODIFIER_CARD,
  appliesTo: ['construct'],
  optional: true,
  choices: [
    { discount: { wood: -1, clay: 2 } },
    { discount: { wood: -1, stone: 2 } },
  ],
}
