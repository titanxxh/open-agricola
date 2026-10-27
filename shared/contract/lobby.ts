import type { PlayerState } from './types'

export type MyActiveRoom = {
  id: string
  status: 'waiting' | 'playing'
  max_players: number
  created_at: number
  started_at: number | null
  updated_at: number
  player_index: number
  my_turn: number
  current_player_index: number | null
  players: Array<Pick<PlayerState, 'name' | 'nameIsDefault' | 'color'> & { playerIndex: number }>
}
