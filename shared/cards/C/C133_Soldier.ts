import type { CardImpl } from '../registry'
import type { ActionChoiceOption, ActionFlow, PlayerState, Resource } from '../../contract/types'
import { sumSelectedScoringReserve } from '../../domain/scoring-reserve'
import { C133_Soldier } from '../../cards-display/C/C133_Soldier'

const CARD_ID = C133_Soldier.id
const CHOICE_PREFIX = `${CARD_ID}:pairs:`

const maxSoldierPairs = (player: PlayerState) => {
  const reserved = sumSelectedScoringReserve(player, { excludeCardId: CARD_ID })
  return Math.max(0, Math.min(
    (player.resources.wood ?? 0) - (reserved.wood ?? 0),
    (player.resources.stone ?? 0) - (reserved.stone ?? 0),
  ))
}

const choiceValue = (pairs: number) => `${CHOICE_PREFIX}${pairs}`

const parseChoice = (choice: string): number | null => {
  if (!choice.startsWith(CHOICE_PREFIX)) return null
  const raw = Number(choice.slice(CHOICE_PREFIX.length))
  return Number.isInteger(raw) && raw >= 0 ? raw : null
}

const choiceOptions = (maxPairs: number): ActionChoiceOption[] =>
  Array.from({ length: maxPairs + 1 }, (_, pairs) => ({
    value: choiceValue(pairs),
    labelKey: 'ui.cards.C133_Soldier.scorePairs',
    labelParams: { pairs, score: pairs },
    sourceCard: CARD_ID,
  }))

const reserveForPairs = (pairs: number): Partial<Resource> => ({
  wood: pairs,
  stone: pairs,
})

export const C133_Soldier_impl = {
  effect: {
    id: CARD_ID,
    beforeEndGameDispatchMode: 'select',
    beforeEndGameMandatory: true,
    onBeforeEndGame: (_state, player) => {
      const maxPairs = maxSoldierPairs(player)
      if (maxPairs <= 0) return
      return {
        type: 'leaf',
        actionId: 'emit-choice',
        sourceCard: CARD_ID,
        targetPlayerId: player.id,
        actionContext: { targetPlayerId: player.id },
        params: {
          promptKey: 'ui.cards.C133_Soldier.prompt',
          options: choiceOptions(maxPairs),
        },
      } satisfies ActionFlow
    },
    resolveChoice: (_state, player, choice) => {
      const pairs = parseChoice(choice)
      if (pairs === null || pairs <= 0) return
      if (pairs > maxSoldierPairs(player)) return
      return {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        targetPlayerId: player.id,
        actionContext: { targetPlayerId: player.id },
        params: {
          kind: 'record-scoring-reserve-bonus',
          reserved: reserveForPairs(pairs),
          score: pairs,
          cardType: 'occupation',
        },
      } satisfies ActionFlow
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
