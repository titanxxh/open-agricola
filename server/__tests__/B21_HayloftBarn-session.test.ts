import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B21_HayloftBarn'

const CARD_ID = 'B21_HayloftBarn'

const setup = (options?: { foodCount?: number }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 10
  player.resources.wood = 10
  player.resources.grain = 0

  // Manually add card
  player.minorPlayed.push(CARD_ID)
  if (!player.cardStates) player.cardStates = {}
  player.cardStates[CARD_ID] = {
    extraData: { foodCount: options?.foodCount ?? 4 },
    infobox: `${options?.foodCount ?? 4} Food`,
  }

  session.loadState(state)
  return session
}

describe('B21_HayloftBarn session', () => {
  it('onBuy sets foodCount to 4', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updated = session.getState().state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(4)
  })

  it('obtaining grain releases 1 food from card', () => {
    const session = setup()
    const state = session.getState().state
    // Put grain on the grain-seeds space
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    expect(grainSeeds).toBeDefined()

    const foodBefore = state.players[0]!.resources.food
    session.loadState(state)

    // grain-seeds gives 1 grain
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.grain).toBeGreaterThanOrEqual(1)
    // Should have gotten 1 food from the card
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(3)
    expect(player.resources.food).toBe(foodBefore + 1)
    const grainIndex = resp.state.events.findIndex((event) =>
      event.type === 'resource.moved' && (event.resources.grain ?? 0) > 0
    )
    const triggerIndex = resp.state.events.findIndex((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID
    )
    const stateChangedIndex = resp.state.events.findIndex((event) =>
      event.type === 'card.stateChanged'
      && event.sourceCardId === CARD_ID
      && event.cardId === CARD_ID
      && event.key === 'foodCount'
      && event.value === 3
    )
    const infoboxChangedIndex = resp.state.events.findIndex((event) =>
      event.type === 'card.infoboxChanged'
      && event.sourceCardId === CARD_ID
      && event.cardId === CARD_ID
      && event.text === '3 Food'
    )
    const foodIndex = resp.state.events.findIndex((event) =>
      event.type === 'resource.moved'
      && event.sourceCardId === CARD_ID
      && (event.resources.food ?? 0) === 1
    )
    expect(grainIndex).toBeGreaterThanOrEqual(0)
    expect(triggerIndex).toBeGreaterThan(grainIndex)
    expect(stateChangedIndex).toBeGreaterThan(triggerIndex)
    expect(infoboxChangedIndex).toBeGreaterThan(stateChangedIndex)
    expect(foodIndex).toBeGreaterThan(infoboxChangedIndex)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'card.stateChanged',
        sourceCardId: CARD_ID,
        cardId: CARD_ID,
        key: 'foodCount',
        value: 3,
        targetPlayerId: player.id,
      }),
      expect.objectContaining({
        type: 'card.infoboxChanged',
        sourceCardId: CARD_ID,
        cardId: CARD_ID,
        text: '3 Food',
        targetPlayerId: player.id,
      }),
      expect.objectContaining({
        type: 'resource.moved',
        sourceCardId: CARD_ID,
        from: { kind: 'card', playerId: expect.any(String), cardId: CARD_ID },
        to: { kind: 'player', playerId: expect.any(String) },
        resources: { food: 1 },
      }),
    ]))
  })

  it('does not release food when card is empty', () => {
    const session = setup({ foodCount: 0 })
    const state = session.getState().state
    const foodBefore = state.players[0]!.resources.food
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(0)
    // No extra food from card
    expect(player.resources.food).toBe(foodBefore)
  })

  it('non-grain action does not trigger food release', () => {
    const session = setup()
    const state = session.getState().state
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 6
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // foodCount should remain 4 (no grain obtained)
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(4)
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'card.triggered',
        sourceCardId: CARD_ID,
      }),
    ]))
  })

  it('food releases one at a time (only 1 per grain-obtaining action)', () => {
    const session = setup({ foodCount: 4 })

    // First grain action
    let resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(3)

    // Reset for second action
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 1
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (grainSeeds) grainSeeds.takenBy = []
    session.loadState(state)

    // Second grain action
    resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(2)
  })

  it('when card empties via grain gain, triggers family growth without room', () => {
    // Set up with foodCount=1 so the grain-seeds action drains it.
    // Player has 2 active workers and 2 rooms, so a normal family growth
    // would not be doable (no free room) — we expect skipRoomCheck to bypass.
    const session = setup({ foodCount: 1 })
    const state = session.getState().state
    const player = state.players[0]!
    const foodBefore = player.resources.food
    const familyBefore = player.workers.filter((w) => w.isActive).length
    expect(familyBefore).toBe(2)
    expect(player.rooms).toBe(2)

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // Card empty
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
    // Got the food (card released 1)
    expect(updated.resources.food).toBe(foodBefore + 1)
    // Family grew without room (now 3 active workers despite 2 rooms)
    const familyAfter = updated.workers.filter((w) => w.isActive).length
    expect(familyAfter).toBe(familyBefore + 1)
  })

  it('does not trigger family growth when card is not empty after gain', () => {
    const session = setup({ foodCount: 4 })
    const state = session.getState().state
    const familyBefore = state.players[0]!.workers.filter((w) => w.isActive).length

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(3)
    // No new family member
    expect(updated.workers.filter((w) => w.isActive).length).toBe(familyBefore)
  })
})
