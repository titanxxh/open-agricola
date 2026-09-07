import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import type { ActionRegistry } from '../../shared/engine/registry'

const CARD_ID = 'E128_Saddler'
const MAJOR_ID = 'Major_Fireplace1'

const setup = (fullFarm = true) => {
  const session = new GameSession(7128, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.round = 14
  state.roundPhase = 'work'
  state.currentPlayerIndex = 0
  state.availableMajorImprovements = [MAJOR_ID]
  for (const space of state.actionSpaces) space.takenBy = []
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    for (const resource of Object.keys(player.resources) as Array<keyof typeof player.resources>) {
      player.resources[resource] = 0
    }
    setWorkersAtHome(state, player, 2)
  }
  const player = state.players[0]!
  player.occupationPlayed = [CARD_ID]
  player.resources.clay = 2
  player.resources.food = 1
  player.fields = (fullFarm ? getAllTilePositions() : [])
    .filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col))
    .map((tile) => ({ ...tile, stacks: [] }))
  session.loadState(state)
  return session
}

const openSaddler = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  for (let step = 0; step < 10; step += 1) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId !== 'wait') throw new Error('expected purchase or Saddler choice')
    if (response.interaction.promptKey === 'ui.interactionSaddlerPlow') return response
    const options = response.interaction.request.options ?? []
    const option = options.find((entry) => entry.value === MAJOR_ID)
      ?? options.find((entry) => entry.value.startsWith('action-improvement-'))
      ?? options.find((entry) => entry.sourceCard === CARD_ID && !entry.disabled)
    expect(option).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  throw new Error('Saddler choice was not reached')
}

const acceptSaddler = (session: GameSession) => {
  const offered = openSaddler(session)
  const option = offered.interaction.request.options?.find((entry) => entry.value !== '__skip__' && !entry.disabled)
  expect(option).toBeDefined()
  const response = session.resolveChoice(0, option!.value)
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.request.kind).toBe('farm-select')
  expect(response.interaction.request.farm.farmType).toBe('plow')
  return response
}

describe('E128 Saddler session', () => {
  it('pays once, rejects an occupied tile, and completes the major after a legal plow', () => {
    const session = setup(false)
    const pending = acceptSaddler(session)
    const tile = pending.interaction.request.farm.selectableTiles[0]!
    const invalid = session.commitSelectionChoice(0, { tile: session.state.players[0]!.roomTiles[0]! })
    expect(invalid.ok).toBe(false)
    expect(invalid.interaction.request.farm.farmType).toBe('plow')
    expect(invalid.state.players[0]!.resources.food).toBe(0)
    const response = session.commitSelectionChoice(0, { tile })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, clay: 0 })
    expect(response.state.players[0]!.fields).toHaveLength(1)
  })

  it('declines a possible plow and retains the food', () => {
    const session = setup(false)
    openSaddler(session)
    const response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, clay: 0 })
    expect(response.state.players[0]!.fields).toHaveLength(0)
  })

  it.each([false, true])('restores the entire paid follow-up after a commit failure, reconnect=%s', (reconnect) => {
    let session = setup(false)
    const pending = acceptSaddler(session)
    const tile = pending.interaction.request.farm.selectableTiles[0]!
    if (reconnect) {
      const state = JSON.parse(JSON.stringify(session.state))
      const cursor = session.createSessionPrivateCursor()
      session = new GameSession(7128, undefined, { playerCount: 2 })
      session.loadState(state)
      session.restoreSessionPrivateCursor(cursor)
    }
    const registry = (session as unknown as { registry: ActionRegistry }).registry
    const plow = registry.get('plow')!
    let failed = false
    registry.register({
      ...plow,
      resolveChoice: (context, value, payload) => {
        if (!failed && context.state === session.state) {
          failed = true
          return { type: 'fail', errorKey: 'log.action' }
        }
        return plow.resolveChoice!(context, value, payload)
      },
    })
    const response = session.commitSelectionChoice(0, { tile })
    expect(failed).toBe(true)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.availableMajorImprovements).not.toContain(MAJOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, clay: 0 })
    expect(response.state.players[0]!.fields).toHaveLength(0)
    expect(response.interaction.request.kind).not.toBe('engine-blocked')
  })

  it('finishes the major purchase without offering payment for an impossible plow', () => {
    const session = setup()
    let response = session.takeAction(0, 'major-improvement')
    for (let step = 0; step < 10 && !response.state.players[0]!.improvements.includes(MAJOR_ID); step += 1) {
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.stateId).toBe('wait')
      if (response.interaction.stateId !== 'wait') throw new Error('expected purchase choice')
      expect(response.interaction.promptKey).not.toBe('ui.interactionSaddlerPlow')
      const choices = response.interaction.request.options ?? []
      const choice = choices.find((option) => option.value === MAJOR_ID)
        ?? choices.find((option) => option.value.startsWith('action-improvement-'))
        ?? choices.find((option) => option.sourceCard === CARD_ID && !option.disabled)
      expect(choice).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, choice!.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.availableMajorImprovements).not.toContain(MAJOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 1 })
    expect(response.state.players[0]!.fields).toHaveLength(13)
    expect(response.interaction.request.kind).not.toBe('engine-blocked')
  })
})
