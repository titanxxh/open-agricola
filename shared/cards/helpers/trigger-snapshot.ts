import type { CardType } from '../../contract/cards'
import type { GameState, PlayerState } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'
import { collectCardsAs } from './card-type'

export type TriggerCardListKind = CardType | 'improvement' | 'played'

export type TriggerCardCounts = Record<TriggerCardListKind, number>

export type TriggerCardSnapshot = {
  playerId: string
  occupation: string[]
  minor: string[]
  major: string[]
  improvement: string[]
  played: string[]
  counts: TriggerCardCounts
}

export type TriggerSnapshot = {
  players: Record<string, TriggerCardSnapshot>
}

const unique = (cards: readonly string[]): string[] => [...new Set(cards)]

const buildPlayerTriggerSnapshot = (player: PlayerState): TriggerCardSnapshot => {
  const occupation = collectCardsAs(player, 'occupation')
  const minor = collectCardsAs(player, 'minor')
  const major = collectCardsAs(player, 'major')
  const improvement = unique([...minor, ...major])
  const played = unique([...occupation, ...minor, ...major])
  return {
    playerId: player.id,
    occupation,
    minor,
    major,
    improvement,
    played,
    counts: {
      occupation: occupation.length,
      minor: minor.length,
      major: major.length,
      improvement: improvement.length,
      played: played.length,
    },
  }
}

export const createTriggerSnapshot = (state: Pick<GameState, 'players'>): TriggerSnapshot => ({
  players: Object.fromEntries(
    (state.players ?? []).map((player) => [player.id, buildPlayerTriggerSnapshot(player)]),
  ),
})

export const getTriggerCardSnapshot = (
  context: Pick<CardListenerContext, 'triggerSnapshot'>,
  player: PlayerState,
): TriggerCardSnapshot =>
  context.triggerSnapshot?.players[player.id] ?? buildPlayerTriggerSnapshot(player)

export const collectTriggerCardsAs = (
  context: Pick<CardListenerContext, 'triggerSnapshot'>,
  player: PlayerState,
  kind: TriggerCardListKind,
): string[] => [...getTriggerCardSnapshot(context, player)[kind]]

export const countTriggerCardsAs = (
  context: Pick<CardListenerContext, 'triggerSnapshot'>,
  player: PlayerState,
  kind: TriggerCardListKind,
): number => getTriggerCardSnapshot(context, player).counts[kind]
