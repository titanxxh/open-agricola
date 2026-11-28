import { breedLeaf, canBreedAnimals } from '../../../actions/effects/breed'
import { canAffordTrade, getExchangeCatalog } from '../../../actions/effects/exchange'
import type { ActionHookRegistry } from '../../../actions/hooks'
import type { ActionFlow, GameState, PlayerState } from '../../../contract/types'
import { BASIC_CONVERSION_SOURCE_ID } from '../../basic-conversion'
import { defineMinorCard } from '../../card-source'
import { payLeaf } from '../../helpers/pay-gain-node'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM102_Ram'
const EXTRA_BREED_ROUNDS = [6, 8, 10, 12]

// A cooking-style exchange (e.g. Fireplace) the player can use now to raise food for the fee.
const canCookForFood = (state: GameState, player: PlayerState, actionHooks?: ActionHookRegistry): boolean =>
  getExchangeCatalog({
    player,
    windows: state.roundPhase === 'feeding' ? ['anytime', 'harvest'] : ['anytime'],
    state,
    actionHooks,
  }).some((entry) => (entry.to.food ?? 0) > 0 && canAffordTrade(player, entry.trade, 1, state))

// The feeding-phase anytime menu only lists cooking, so the basic 1 crop -> 1 food conversion
// runs here as a standard exchange before the fee is paid.
const payWithCrop = (crop: 'grain' | 'vegetable'): ActionFlow => ({
  type: 'seq',
  children: [
    {
      type: 'leaf',
      actionId: 'exchange',
      sourceCard: CARD_ID,
      actionContext: {
        directTrade: { from: { [crop]: 1 }, to: { food: 1 }, sourceId: BASIC_CONVERSION_SOURCE_ID },
      },
    },
    payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
  ],
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    computeBreedableAnimalCount: (_state, _player, animalType, count) =>
      animalType === 'sheep' ? count + 1 : undefined,
    getRuleContributions: () => ({ scoringAnimals: { sheep: 1 } }),
    onHarvestFeedingPhase: (state, player, ctx) => ({
      type: 'xor',
      anytimeWindow: { allowed: true },
      ...(player.resources.food < 1 && canCookForFood(state, player, ctx?.actionHooks)
        ? { requiresExplicitChoice: true }
        : {}),
      children: [
        payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
        ...(player.resources.food < 1
          ? (['grain', 'vegetable'] as const).filter((crop) => player.resources[crop] >= 1).map(payWithCrop)
          : []),
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
