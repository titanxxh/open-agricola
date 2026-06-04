import { defineOccupationCard } from '../card-source'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import type { ActionChoiceOption, ActionFlow, PlayerState, Resource } from '../../contract/types'
import { sumSelectedScoringReserve } from '../../domain/scoring-reserve'

const CARD_ID = 'A136_DrudgeryReeve'
const WOOD_BY_REMAINING: number[] = [0, 1, 1, 2, 2, 2, 3, 3, 3, 4]

const BONUS_BY_SETS: number[] = [0, 1, 3, 5]
const BUILDING_RESOURCES = ['wood', 'clay', 'stone', 'reed'] as const
const CHOICE_PREFIX = `${CARD_ID}:sets:`

const maxScoringSets = (player: PlayerState) => {
  const reserved = sumSelectedScoringReserve(player, { excludeCardId: CARD_ID })
  return Math.max(0, Math.min(
    3,
    ...BUILDING_RESOURCES.map((resource) =>
      (player.resources[resource] ?? 0) - (reserved[resource] ?? 0),
    ),
  ))
}

const choiceValue = (sets: number) => `${CHOICE_PREFIX}${sets}`

const parseChoice = (choice: string): number | null => {
  if (!choice.startsWith(CHOICE_PREFIX)) return null
  const raw = Number(choice.slice(CHOICE_PREFIX.length))
  return Number.isInteger(raw) && raw >= 0 ? raw : null
}

const choiceOptions = (maxSets: number): ActionChoiceOption[] =>
  Array.from({ length: maxSets + 1 }, (_, sets) => ({
    value: choiceValue(sets),
    labelKey: 'ui.cards.A136_DrudgeryReeve.scoreSets',
    labelParams: { sets, score: BONUS_BY_SETS[sets] ?? 0 },
    sourceCard: CARD_ID,
  }))

const reserveForSets = (sets: number): Partial<Resource> => ({
  wood: sets,
  clay: sets,
  reed: sets,
  stone: sets,
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    beforeEndGameScope: 'allPlayers',
    beforeEndGameDispatchMode: 'select',
    beforeEndGameMandatory: true,
    onBuy: (state, _player) => {
      const remainingTurns = 14 - state.round
      const wood = WOOD_BY_REMAINING[remainingTurns] ?? (remainingTurns >= 9 ? 4 : 0)
      if (wood > 0) {
        return gainLeaf(CARD_ID, { wood })
      }
    },
    onBeforeEndGame: (_state, player) => {
      const maxSets = maxScoringSets(player)
      if (maxSets <= 0) return
      return {
        type: 'leaf',
        actionId: 'emit-choice',
        sourceCard: CARD_ID,
        targetPlayerId: player.id,
        actionContext: { targetPlayerId: player.id },
        params: {
          promptKey: 'ui.cards.A136_DrudgeryReeve.prompt',
          options: choiceOptions(maxSets),
        },
      } satisfies ActionFlow
    },
    resolveChoice: (_state, player, choice) => {
      const sets = parseChoice(choice)
      if (sets === null || sets <= 0) return
      if (sets > maxScoringSets(player)) return
      return {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        targetPlayerId: player.id,
        actionContext: { targetPlayerId: player.id },
        params: {
          kind: 'record-scoring-reserve-bonus',
          reserved: reserveForSets(sets),
          score: BONUS_BY_SETS[sets] ?? 0,
          cardType: 'occupation',
        },
      } satisfies ActionFlow
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A136_DrudgeryReeve = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Drudgery Reeve",
    deck: "A",
    number: 136,
    category: "POINTS_PROVIDER",
    desc: ["If there are still 1/3/6/9 complete rounds left to play, you immediately get 1/2/3/4 <WOOD>. During scoring, each player with 1+/2+/3+ building resources of each type gets 1/3/5 bonus <SCORE>."],
    cost: {},
    players: "3+",
    extraVp: true,
  },
  impl: cardImpl,
})

export const A136_DrudgeryReeve_impl = A136_DrudgeryReeve.impl
