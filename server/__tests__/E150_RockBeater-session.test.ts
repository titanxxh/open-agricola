import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E150_RockBeater'

const CARD_ID = 'E150_RockBeater'
const FILLER = '__test_placeholder__'

const setup = ({
  cardLocation = 'played' as 'played' | 'hand' | null,
  houseType = 'wood' as 'wood' | 'clay' | 'stone',
  resources = {} as Partial<Record<'wood' | 'clay' | 'reed' | 'stone' | 'food', number>>,
  occupiedBy = null as number | null,
} = {}) => {
  const session = new GameSession(6150, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = cardLocation === 'hand' ? [CARD_ID] : [FILLER]
  owner.occupationPlayed = cardLocation === 'played' ? [CARD_ID] : []
  owner.houseType = houseType
  Object.assign(owner.resources, resources)
  if (occupiedBy !== null) {
    const occupant = state.players[occupiedBy]!
    const worker = occupant.workers.find((candidate) => candidate.isActive)!
    state.actionSpaces.find((space) => space.id === 'resource-market-4')!.takenBy = [{
      playerId: occupant.id, workerId: worker.id,
    }]
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait') {
    const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const openRoomSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'farm-expansion')
  if (response.interaction.stateId === 'wait') {
    const construct = response.interaction.request.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    if (construct) response = session.resolveChoice(response.interaction.playerIndex, construct.value)
  }
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    request: { kind: 'farm-select', farm: { farmType: 'room' } },
  })
  return response
}

const buildRooms = (session: GameSession, count: number): SessionResponse => {
  const selection = openRoomSelection(session)
  if (selection.interaction.stateId !== 'wait'
    || selection.interaction.request.kind !== 'farm-select') return selection
  const rooms = selection.interaction.request.farm.selectableTiles.slice(0, count)
  expect(rooms).toHaveLength(count)
  expect(selection.interaction.request.farm.maxSelections).toBeGreaterThanOrEqual(count)
  return session.commitSelectionChoice(selection.interaction.playerIndex, { rooms })
}

describe('E150 Rock Beater parity', () => {
  it('E150 S1: Rock Beater is played as the first occupation in a four-player game', () => {
    const response = playOccupation(setup({ cardLocation: 'hand' }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('E150 S2: an opponent-occupied Resource Market remains usable and grants its resources', () => {
    const session = setup({ occupiedBy: 1 })
    expect(session.getActionAvailability(0)['resource-market-4']).toBe(true)

    const response = session.takeAction(0, 'resource-market-4')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1, food: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'resource-market-4')!.takenBy)
      .toHaveLength(2)
    expect(session.getActionAvailability(0)['resource-market-4']).toBe(false)
    expect(session.takeAction(0, 'resource-market-4').ok).toBe(false)
  })

  it.each([false, true])('rejects an owner-occupied Resource Market (also occupied by an opponent %s)', (mixed) => {
    const session = setup({ occupiedBy: 0 })
    if (mixed) {
      const other = session.state.players[1]!
      session.state.actionSpaces.find((space) => space.id === 'resource-market-4')!.takenBy.push({ playerId: other.id, workerId: other.workers[0]!.id })
    }
    const before = session.getState()
    expect(session.getActionAvailability(0)['resource-market-4']).toBe(false)
    const response = session.takeAction(0, 'resource-market-4')
    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
  })

  it('E150 S4: without Rock Beater an opponent-occupied Resource Market is unavailable', () => {
    const session = setup({ cardLocation: null, occupiedBy: 1 })

    expect(session.getActionAvailability(0)['resource-market-4']).toBe(false)
    expect(session.takeAction(0, 'resource-market-4').ok).toBe(false)
  })

  it('E150 S5: one stone room costs three stone and two reed', () => {
    const response = buildRooms(setup({
      houseType: 'stone', resources: { stone: 3, reed: 2 },
    }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      rooms: 3, resources: { stone: 0, reed: 0 },
    })
  })

  it('E150 S6: two stone rooms each receive the two-stone discount', () => {
    const response = buildRooms(setup({
      houseType: 'stone', resources: { stone: 6, reed: 4 },
    }), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      rooms: 4, resources: { stone: 0, reed: 0 },
    })
  })

  it('E150 S7: a wood room still costs five wood and two reed', () => {
    const response = buildRooms(setup({ resources: { wood: 5, reed: 2 } }), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      rooms: 3, resources: { wood: 0, reed: 0 },
    })
  })
})
