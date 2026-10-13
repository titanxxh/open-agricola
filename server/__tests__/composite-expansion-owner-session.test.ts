import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { ActionRegistry } from '../../shared/engine/registry'
import type { GameSession } from '../game/authoritative-session'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

describe('deferred composite ownership through GameSession', () => {
  // Generic action-definition seam: register a composite on a real board space.
  // The Session driver must recompute the actor after its children become visible.
  it('gives the first expanded gain to the other player and the next gain to the owner', () => {
    const session = createWorkSession({ configure: (state) => {
      state.players.forEach((player) => { player.resources.wood = 0; player.resources.reed = 0 })
    } })
    sessions.push(session)
    const registry: unknown = Reflect.get(session, 'registry')
    if (!(registry instanceof ActionRegistry)) throw new Error('Expected Session action registry')
    const original = registry.get('forest')
    if (!original) throw new Error('Expected Forest action')
    const opponentId = session.state.players[1]!.id
    const ownerId = session.state.players[0]!.id
    const composite = { ...original, canBeExecutedByPlayer: () => true, flow: {
      type: 'seq' as const,
      children: [
        { type: 'leaf' as const, actionId: 'gain', targetPlayerId: opponentId, params: { wood: 1 } },
        { type: 'leaf' as const, actionId: 'gain', params: { reed: 2 } },
      ],
    } }
    registry.register(composite)
    Object.assign(session.state.actionSpaces.find((space) => space.id === 'forest')!, composite)
    let response = session.takeAction(0, 'forest')
    for (let step = 0; step < 3 && response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'confirm-player-switch'; step++) {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 2 })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, reed: 0 })
    if (response.interaction.stateId !== 'wait') throw new Error('Expected turn confirmation')
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.interaction.playerIndex).toBe(0)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', resources: { wood: 1 }, to: { kind: 'player', playerId: opponentId },
    }))
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', resources: { reed: 2 }, to: { kind: 'player', playerId: ownerId },
    }))
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail', playerId: opponentId,
      params: expect.objectContaining({ detailParts: expect.objectContaining({ gains: { wood: 1 } }) }),
    }))
    expect(response.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail', playerId: ownerId,
      params: expect.objectContaining({ detailParts: expect.objectContaining({ gains: { reed: 2 } }) }),
    }))
  })
})
