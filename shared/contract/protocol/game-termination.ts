export type GameEndProposal = {
  id: string
  proposerIndex: number
  createdAt: number
  playerIndices: number[]
  agreements: Array<{ playerIndex: number; agreedAt: number }>
} & ({ intent: 'end' } | { intent: 'rematch'; nextRoomId: string })

export type GameTermination = {
  reason: 'agreement' | 'solo_confirmation' | 'hotseat_confirmation'
  intent: 'end' | 'rematch'
  proposerIndex: number
  startedAt: number
  endedAt: number
  round: number
  players: Array<{
    playerIndex: number
    displayName: string
    nameIsDefault?: boolean
    agreedAt: number
  }>
}
