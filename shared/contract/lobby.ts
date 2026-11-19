import type { GameState, PlayerState } from './types'

export type LobbyExpansion = keyof Pick<GameState,
  'enableParentCards' | 'enableThroughTheSeasons' | 'enableFarmersOfTheMoor' | 'enableCommunityDeck'>

export type LobbyGameProgress = { phase: 'playing'; round: number }
  | { phase: Exclude<GameState['phase'], 'playing'> }

export type MyActiveRoom = {
  id: string
  status: 'waiting' | 'playing'
  max_players: number
  created_at: number
  started_at: number | null
  updated_at: number
  player_index: number | null
  owned_player_indexes?: number[]
  my_turn: number
  current_player_index: number | null
  waiting_player_indexes: number[]
  hotseat: boolean
  progress: LobbyGameProgress | null
  expansions: LobbyExpansion[]
  /** Present only for a classic game (ADR 0049); absent means revised. */
  card_edition?: 'classic'
  players: Array<Pick<PlayerState, 'name' | 'nameIsDefault' | 'color'> & { playerIndex: number }>
}
