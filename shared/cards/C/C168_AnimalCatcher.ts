import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'C168_AnimalCatcher'
const harvestRounds = [4, 7, 9, 11, 13, 14]
const baseAnimals: Partial<Resource> = { sheep: 1, boar: 1, cattle: 1 }
const farmersOfTheMoorAnimalCombos: { gain: Partial<Resource>; labelKey: string }[] = [
  { gain: { sheep: 1, boar: 1, cattle: 1 }, labelKey: 'cards.C168_AnimalCatcher.choiceSheepBoarCattle' },
  { gain: { sheep: 1, boar: 1, horse: 1 }, labelKey: 'cards.C168_AnimalCatcher.choiceSheepBoarHorse' },
  { gain: { sheep: 1, cattle: 1, horse: 1 }, labelKey: 'cards.C168_AnimalCatcher.choiceSheepCattleHorse' },
  { gain: { boar: 1, cattle: 1, horse: 1 }, labelKey: 'cards.C168_AnimalCatcher.choiceBoarCattleHorse' },
]

const animalGainFlow = (context: CardListenerContext): ActionFlow => {
  if (context.state.enableFarmersOfTheMoor !== true) {
    return gainLeaf(CARD_ID, baseAnimals)
  }
  return {
    type: 'xor' as const,
    children: farmersOfTheMoorAnimalCombos.map((combo) =>
      gainLeaf(CARD_ID, combo.gain, combo.labelKey)),
  }
}

/**
 * computeReplace on gain action when on day-laborer space:
 * Offer an alternative: gain 1 sheep + 1 boar + 1 cattle, then pay 1 food per remaining harvest.
 */
const computeReplaceListener: CardListenerRegistration = {
  id: 'C168-animal-catcher-replace-day-laborer',
  cardIds: [CARD_ID],
  actions: ['gain'],
  phases: ['computeReplace' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.actionContext?.checkedReplaceAction) return
    if (context.sourceCard === CARD_ID) return
    if (context.space?.id !== 'day-laborer') return
    const remaining = harvestRounds.filter((r) => r >= context.state.round).length
    return {
      decline: true,
      alternativeFlow: {
        type: 'seq',
        children: [
          animalGainFlow(context),
          ...(remaining > 0
            ? [payLeaf({ cardId: CARD_ID, cost: { food: remaining } })]
            : []),
        ],
      },
    }
  },
}

const cardImpl = {
  listeners: [computeReplaceListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C168_AnimalCatcher = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Animal Catcher',
    deck: 'C',
    number: 168,
    category: 'LIVESTOCK_PROVIDER',
    desc: [
        'Each time you use the __Day Laborer__ action space, instead of 2 <FOOD>, you can get 3 different animals from the general supply. If you do, you must pay 1 <FOOD> each harvest left to play.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const C168_AnimalCatcher_impl = C168_AnimalCatcher.impl
