import { breedLeaf, canBreedAnimals } from '../../../actions/effects/breed'
import { defineMinorCard } from '../../card-source'
import { payLeaf } from '../../helpers/pay-gain-node'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM102_Ram'
const EXTRA_BREED_ROUNDS = [6, 8, 10, 12]

const sheepTierScore = (count: number): number => {
  if (count <= 0) return -1
  if (count <= 3) return 1
  if (count <= 5) return 2
  if (count <= 7) return 3
  return 4
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBreedableAnimalCount: (_state, _player, animalType, count) =>
      animalType === 'sheep' ? count + 1 : undefined,
    computeBonusScore: (_state, player, ctx) => {
      const sheep =
        ctx?.categories.find((category) => category.key === 'sheeps')?.quantity ??
        player.resources.sheep
      return sheepTierScore(sheep + 1) - sheepTierScore(sheep)
    },
    onHarvestFeedingPhase: () => ({
      type: 'xor',
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        {
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          choiceLabelKey: 'actions.special-effect.return-card-to-board.name',
          params: { kind: 'return-card-to-board', cardId: CARD_ID },
        },
      ],
    }),
    onRoundEnd: (state, player) =>
      EXTRA_BREED_ROUNDS.includes(state.round) &&
      canBreedAnimals(state, player, { sourceCard: CARD_ID, animalTypes: ['sheep'] })
        ? breedLeaf(CARD_ID, ['sheep'])
        : undefined,
  },
} satisfies CardImpl

export const CWM102_Ram = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Ram',
    deck: 'CWM',
    number: 102,
    desc: [
      'The Ram counts as a <SHEEP> in your farm for scoring and breeding, but must be fed 1 <FOOD> in the Feeding phase of each Harvest or it is discarded. Your <SHEEP> breed at the end of Rounds 6, 8, 10, and 12.',
    ],
    cost: { sheep: 1 },
    vp: 1,
    prerequisite: '',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM102.png',
  },
  impl: cardImpl,
})

export const CWM102_Ram_impl = CWM102_Ram.impl
