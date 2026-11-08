import { describe, expect, it, vi } from 'vitest'
import { recordedRouterFixture } from '../../__tests__/_helpers/room-router'
import { createConnectionCtx } from '../connection-ctx'
import type { ServerEvent } from '../../../shared/contract/protocol/ws'
import type { StateUpdateEnvelope } from '../../../shared/contract/protocol/game'

const { newDeps, dispatch } = recordedRouterFixture()
const peer = (deps: ReturnType<typeof newDeps>, userId: string) => createConnectionCtx({
  OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn(),
} as never, deps, true, userId)
const messages = (client: ReturnType<typeof peer>): ServerEvent[] =>
  vi.mocked(client.ws.send).mock.calls.map(([raw]) => JSON.parse(String(raw)))
const latest = (client: ReturnType<typeof peer>): StateUpdateEnvelope => {
  const state = messages(client).findLast((event): event is StateUpdateEnvelope => event.type === 'stateUpdate')
  if (!state) throw new Error('Missing authoritative snapshot')
  return state
}

describe('Multihand room', () => {
  it.each([[4, 2], [6, 2], [6, 3]] as const)('gives each account its private seats and reports every seat online (%sp/%s per account)', async (maxPlayers, seatsPerTeam) => {
    const deps = newDeps(), host = peer(deps, 'host')
    const count = maxPlayers / seatsPerTeam
    const clients = [host, ...Array.from({ length: count - 1 }, (_, index) => peer(deps, `guest${index + 1}`))]
    await dispatch(host, { type: 'createRoom', maxPlayers,
      teamConfig: { mode: 'multihand', seatsPerTeam, seating: 'separated', scoring: 'sum' } })
    const room = host.currentRoom!
    for (const client of clients.slice(1)) await dispatch(client, { type: 'joinRoom', roomId: room.id })
    await dispatch(host, { type: 'startTeamGame' })
    expect(room.status).toBe('playing')
    expect(room.seatOwners).toEqual(Array.from({ length: maxPlayers }, (_, playerIndex) => ({
      playerIndex, userId: playerIndex % count === 0 ? 'host' : `guest${playerIndex % count}`,
    })))

    for (const [clientIndex, client] of clients.entries()) {
      const owned = Array.from({ length: seatsPerTeam }, (_, index) => clientIndex + index * count)
      const state = latest(client)
      expect(state.connectedPlayerIndexes).toEqual(Array.from({ length: maxPlayers }, (_, index) => index))
      for (const [index, player] of state.payload.state.players.entries()) {
        expect(player.minorHand).toHaveLength(7)
        expect(player.occupationHand).toHaveLength(7)
        if (owned.some(seat => seat === index)) {
          expect(player.minorHand).not.toContain('?')
          expect(player.occupationHand).not.toContain('?')
        } else {
          expect(player.minorHand).toEqual(Array(7).fill('?'))
          expect(player.occupationHand).toEqual(Array(7).fill('?'))
        }
      }
      expect(messages(client)).toContainEqual(expect.objectContaining({
        type: 'roomJoined', controlledPlayerIndexes: [...owned],
        visiblePlayerIds: owned.map(index => `p${index + 1}`),
      }))
    }
  })
})
