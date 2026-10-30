import { randomUUID } from 'node:crypto'
import type { GameEndProposal, GameTermination } from '../../shared/contract/protocol/game-termination'
import type { Room } from './room'

export function createGameEndProposal(room: Room, proposerIndex: number, intent: GameEndProposal['intent'], now = Date.now()): GameEndProposal {
  if (room.status !== 'playing' || room.session.state.gameOver) throw new Error('Only an unfinished started game can be ended')
  if (room.endProposal) throw new Error('An end proposal is already pending')
  const playerIndices = room.session.state.players.map((_, index) => index)
  if (!playerIndices.includes(proposerIndex)) throw new Error('Only seated players may propose ending a game')
  return {
    id: randomUUID(), ...(intent === 'rematch' ? { intent, nextRoomId: randomUUID() } : { intent }), proposerIndex, createdAt: now, playerIndices,
    agreements: (room.hotseat || playerIndices.length === 1 ? playerIndices : [proposerIndex])
      .map(playerIndex => ({ playerIndex, agreedAt: now })),
  }
}

export function agreeToGameEnd(proposal: GameEndProposal, playerIndex: number, now = Date.now()): GameEndProposal {
  if (!proposal.playerIndices.includes(playerIndex)) throw new Error('Only original players may agree')
  return proposal.agreements.some(vote => vote.playerIndex === playerIndex)
    ? proposal
    : { ...proposal, agreements: [...proposal.agreements, { playerIndex, agreedAt: now }] }
}

export const hasUnanimousAgreement = (proposal: GameEndProposal): boolean =>
  proposal.playerIndices.every(index => proposal.agreements.some(vote => vote.playerIndex === index))

export function buildGameTermination(room: Room, proposal: GameEndProposal, now = Date.now()): GameTermination {
  if (!hasUnanimousAgreement(proposal)) throw new Error('Every player must agree before ending the game')
  return {
    reason: room.hotseat ? 'hotseat_confirmation' : proposal.playerIndices.length === 1 ? 'solo_confirmation' : 'agreement',
    intent: proposal.intent, proposerIndex: proposal.proposerIndex,
    startedAt: room.startedAt ?? proposal.createdAt, endedAt: now, round: room.session.state.round,
    players: proposal.playerIndices.map(playerIndex => {
      const player = room.session.state.players[playerIndex]!
      return { playerIndex, displayName: player.name, ...(player.nameIsDefault ? { nameIsDefault: true } : {}),
        agreedAt: proposal.agreements.find(vote => vote.playerIndex === playerIndex)!.agreedAt }
    }),
  }
}
