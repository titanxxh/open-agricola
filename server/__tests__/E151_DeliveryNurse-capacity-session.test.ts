import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { familySize } from '../../shared/domain/player'

const CARD_ID = 'E151_DeliveryNurse'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

// Confirmed Session seam: ordinary growth preserves the allowance, and a real
// next-round placement consumes it only after extra housing is full (#1126).
const waiting = (response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('Expected pending interaction')
  return response.interaction
}

const choiceOptions = (response: SessionResponse) => {
  const request = waiting(response).request
  if (request.kind !== 'choice') throw new Error('Expected choice interaction')
  return request.options
}

const farmSelection = (response: SessionResponse) => {
  const request = waiting(response).request
  return request.kind === 'farm-select' ? request.farm : undefined
}

const setup = (shed = true) => {
  const session = createWorkSession({ options: { playerCount: 4 }, configure: (state) => {
    state.round = 5
    state.players.forEach((player) => { player.resources.food = 20 })
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    player.minorPlayed = shed ? ['A010_WoodenShed'] : []
    Object.assign(player.resources, { sheep: 1, boar: 1, cattle: 1 })
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    player.stableTiles = [{ row: 0, col: 2 }, { row: 1, col: 2 }]
    player.stableAnimals = { '0-2': 'boar', '1-2': 'cattle' }
  } })
  sessions.push(session)
  return session
}

const confirm = (session: GameSession, response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(waiting(response).request.kind).toBe('confirm-next-player')
  const confirmed = session.resolveChoice(waiting(response).playerIndex, 'confirm')
  expect(confirmed.ok, confirmed.error).toBe(true)
  return confirmed
}

describe('E151 Delivery Nurse extra housing', () => {
  it.each(['absent', 'opponent', 'missing-animal', 'used'] as const)('does not admit no-room growth when %s', (control) => {
    const session = setup(false)
    const state = session.getState().state
    const player = state.players[0]!
    if (control === 'absent' || control === 'opponent') player.occupationPlayed = []
    if (control === 'opponent') state.players[1]!.occupationPlayed = [CARD_ID]
    if (control === 'missing-animal') {
      player.resources.boar = 0
      delete player.stableAnimals['0-2']
    }
    if (control === 'used') player.cardStates[CARD_ID] = { flagged: true }
    session.loadState(state)
    const response = session.takeAction(0, 'wish-children')
    expect(response.ok).toBe(false)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy).toHaveLength(0)
    expect(response.state.events.some((event) => event.type === 'card.triggered' && event.sourceCardId === CARD_ID)).toBe(false)
  })

  it('preserves its allowance when the player cancels before accepting its sole legal replacement', () => {
    const session = setup(false)
    const offered = session.takeAction(0, 'wish-children')
    expect(choiceOptions(offered)).toHaveLength(1)
    expect(choiceOptions(offered)[0]!.sourceCard).toBe(CARD_ID)
    expect(familySize(offered.state.players[0]!)).toBe(2)
    const response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy).toHaveLength(0)
  })

  it('restores its allowance and growth when the player undoes an accepted replacement', () => {
    const session = setup(false)
    let response = session.takeAction(0, 'wish-children')
    const replacement = choiceOptions(response).find((option) => option.sourceCard === CARD_ID)
    expect(replacement).toBeDefined()
    response = session.resolveChoice(0, replacement!.value)
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy).toHaveLength(0)
  })

  it('preserves the allowance for a real next-round growth after Wooden Shed fills', () => {
    const session = setup()
    let response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    response = confirm(session, response)

    for (const [actor, space] of [[1, 'forest'], [2, 'clay-pit'], [3, 'reed-bank'],
      [0, 'grain-seeds'], [1, 'day-laborer'], [2, 'fishing']] as const) {
      expect(response.state.currentPlayerIndex).toBe(actor)
      response = confirm(session, session.takeAction(actor, space))
    }
    response = session.takeAction(3, 'farmland')
    expect(response.ok, response.error).toBe(true)
    const farm = farmSelection(response)
    expect(farm?.farmType).toBe('plow')
    if (farm?.farmType !== 'plow') throw new Error('Expected plow selection')
    response = session.commitSelectionChoice(3, { tile: farm.selectableTiles[0]! })
    response = confirm(session, response)
    expect(response.state.round).toBe(6)
    expect(response.state.currentPlayerIndex).toBe(0)

    response = session.takeAction(0, 'wish-children')
    expect(response.ok, response.error).toBe(true)
    expect(waiting(response).promptKey).toBe('ui.interactionSelectReplacement')
    const replacement = choiceOptions(response).find((option) => option.sourceCard === CARD_ID)
    expect(replacement).toBeDefined()
    response = session.resolveChoice(0, replacement!.value)
    expect(response.ok, response.error).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(4)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    expect(response.state.events.filter((event) => event.type === 'card.triggered' && event.sourceCardId === CARD_ID)).toHaveLength(1)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(4)
  })
})
