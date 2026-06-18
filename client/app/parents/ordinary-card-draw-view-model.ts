import type { OrdinaryCardDrawChoice } from '../../../shared/contract/types'

export interface OrdinaryCardDrawViewModel {
  choice: OrdinaryCardDrawChoice | null
  queueLength: number
}

const choiceOrder = (choice: OrdinaryCardDrawChoice): number => {
  const match = choice.id.match(/(\d+)$/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

export function computeOrdinaryCardDrawViewModel(
  choices: Record<string, OrdinaryCardDrawChoice>,
  playerId: string,
): OrdinaryCardDrawViewModel {
  const mine = Object.values(choices)
    .filter((choice) => choice.playerId === playerId)
    .sort((a, b) => choiceOrder(a) - choiceOrder(b) || a.id.localeCompare(b.id))

  return {
    choice: mine[0] ?? null,
    queueLength: mine.length,
  }
}
