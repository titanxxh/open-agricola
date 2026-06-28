import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent, ResourceMovedEvent } from '../../shared/contract/events'
import { E047_SyrupTap_impl } from '../../shared/cards/E/E047_SyrupTap'

import '../../shared/cards/E/E047_SyrupTap'
import '../../shared/cards/C/C162_ForestOwner'

const CARD_ID = 'E047_SyrupTap'

describe('E047_SyrupTap session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    session.loadState(state)
    return session
  }

  const listener = E047_SyrupTap_impl.listeners?.[0]

  const movedWood = (
    playerId: string,
    resources: ResourceMovedEvent['resources'] = { wood: 1 },
  ): DraftGameEvent<'resource.moved'> => ({
    type: 'resource.moved',
    resources,
    from: { kind: 'actionSpace', spaceId: 'forest' },
    to: { kind: 'player', playerId },
    reason: 'collect',
  })

  const listenerContext = (
    events: DraftGameEvent<'resource.moved'>[],
    actionEvents?: DraftGameEvent<'resource.moved'>[],
  ): CardListenerContext => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    return {
      state,
      player,
      space: state.actionSpaces.find((space) => space.id === 'forest')!,
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: events,
      ...(actionEvents ? { actionEvents } : {}),
    }
  }

  it('falls back to transactionEvents when actionEvents is absent', () => {
    if (!listener) throw new Error('missing listener')
    const ctx = listenerContext([movedWood('p1')])

    const result = listener.handler(ctx)

    expect(result?.flow?.type).toBe('leaf')
    if (result?.flow?.type !== 'leaf') return
    expect(result.flow.actionId).toBe('future-meeples')
    expect(result.sourceCard).toBe(CARD_ID)
  })

  it('ignores stale transaction wood when current actionEvents have no wood', () => {
    if (!listener) throw new Error('missing listener')
    const ctx = listenerContext([movedWood('p1')], [movedWood('p1', { clay: 1 })])

    const result = listener.handler(ctx)

    expect(result).toBeUndefined()
  })

  it('collecting wood from forest queues 1 food on next round', () => {
    const session = setup()
    const state = session.getState().state
    // Ensure forest has wood
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    expect(forest).toBeDefined()
    if (forest) {
      forest.resources.wood = 3
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    // Check futureMeeples are queued for round 2
    const futureMeeples = resp.state.futureMeeples.filter(
      (fm) => fm.cardId === CARD_ID,
    )
    expect(futureMeeples.length).toBe(1)
    expect(futureMeeples[0]!.round).toBe(2)
    expect(futureMeeples[0]!.resources.food).toBe(1)
    const playerId = resp.state.players[0]!.id
    const woodIndex = resp.state.events.findIndex((event) =>
      event.type === 'resource.moved'
      && event.from.kind === 'actionSpace'
      && event.to.kind === 'player'
      && event.to.playerId === playerId
      && (event.resources.wood ?? 0) > 0
    )
    const triggerIndex = resp.state.events.findIndex((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID
    )
    const queuedIndex = resp.state.events.findIndex((event) =>
      event.type === 'futureMeeple.queued' && event.sourceCardId === CARD_ID
    )
    expect(woodIndex).toBeGreaterThanOrEqual(0)
    expect(triggerIndex).toBeGreaterThan(woodIndex)
    expect(queuedIndex).toBeGreaterThan(triggerIndex)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: { kind: 'player', playerId },
        resources: expect.objectContaining({ wood: expect.any(Number) }),
      }),
      expect.objectContaining({
        type: 'card.triggered',
        sourceCardId: CARD_ID,
      }),
      expect.objectContaining({
        type: 'futureMeeple.queued',
        sourceCardId: CARD_ID,
      }),
    ]))
  })

  it('getting wood from a player action space queues 1 food on next round', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('C162_ForestOwner')
    for (const space of createPlayerActionSpaces(state)) {
      if (!state.actionSpaces.some((entry) => entry.id === space.id)) {
        state.actionSpaces.push(space)
      }
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'C162_ForestOwner')
    expect(resp.ok).toBe(true)

    expect(resp.state.futureMeeples).toEqual(expect.arrayContaining([
      expect.objectContaining({
        cardId: CARD_ID,
        round: 2,
        resources: { food: 1 },
      }),
    ]))
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: { kind: 'actionSpace', spaceId: 'C162_ForestOwner' },
        to: { kind: 'player', playerId: player.id },
        resources: { wood: 4 },
      }),
      expect.objectContaining({ type: 'card.triggered', sourceCardId: CARD_ID }),
    ]))
  })

  it('collecting non-wood resources does not trigger', () => {
    const session = setup()
    const state = session.getState().state
    // Use clay-pit (clay accumulation space)
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    expect(clayPit).toBeDefined()
    if (clayPit) {
      clayPit.resources.clay = 2
      clayPit.resources.wood = 0
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    const futureMeeples = resp.state.futureMeeples.filter(
      (fm) => fm.cardId === CARD_ID,
    )
    expect(futureMeeples.length).toBe(0)
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'card.triggered', sourceCardId: CARD_ID }),
      expect.objectContaining({ type: 'futureMeeple.queued', sourceCardId: CARD_ID }),
    ]))
  })

  it('does not trigger on round 14 (no next round)', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 14

    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) {
      forest.resources.wood = 3
    }
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const futureMeeples = resp.state.futureMeeples.filter(
      (fm) => fm.cardId === CARD_ID,
    )
    expect(futureMeeples.length).toBe(0)
  })
})
