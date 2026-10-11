import { afterEach, describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { choose, playImprovement, restoreSession, snapshotResponse } from './_helpers/card-play-lifecycle'
import { getAllTilePositions } from '../../shared/domain/farm'
import type { ActionRegistry } from '../../shared/engine/registry'

const CARD_ID = 'E128_Saddler'
const MAJOR_ID = 'Major_Fireplace1'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))
const setup = (fullFarm = true) => {
  const session = createWorkSession({ seed: 9707, configure: (state) => {
    state.round = 14
    state.availableMajorImprovements = [MAJOR_ID]
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    Object.assign(player.resources, { wood: 0, clay: 2, reed: 0, stone: 0, food: 1, grain: 0 })
    player.fields = (fullFarm ? getAllTilePositions() : [])
      .filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col))
      .map((tile) => ({ ...tile, stacks: [] }))
  } })
  sessions.push(session)
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
  it('pays once, rejects an occupied tile, and plows after the major is already committed', () => {
    const session = setup(false)
    const pending = acceptSaddler(session)
    expect(pending.state.players[0]!.improvements).toContain(MAJOR_ID)
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

  it.each([false, true])('keeps a failed paid follow-up blocked until explicit undo, reconnect=%s', (reconnect) => {
    let session = setup(false)
    const pending = acceptSaddler(session)
    expect(pending.state.players[0]!.improvements).toContain(MAJOR_ID)
    const tile = pending.interaction.request.farm.selectableTiles[0]!
    if (reconnect) {
      session = restoreSession(session)
      sessions.push(session)
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
    expect(response.ok).toBe(false)
    expect(response.interaction.request.kind).toBe('engine-blocked')
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0 })
    expect(response.state.players[0]!.fields).toHaveLength(0)
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.improvements).not.toContain(MAJOR_ID)
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 1, clay: 2 })
    expect(undone.state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy).toEqual([])

  })

  it('does not offer a paid plow on a full farm and restores the completed purchase', () => {
    const session = setup()
    const before = snapshotResponse(session.getState())
    let response = playImprovement(session, MAJOR_ID)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.players[0]!.improvements).toContain(MAJOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, clay: 0 })
    expect(response.state.players[0]!.fields).toHaveLength(13)
    expect(response.state.events.some((event) => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)).toBe(false)
    const restored = restoreSession(session)
    sessions.push(restored)
    expect(restored.getState().state.players[0]!.resources.food).toBe(1)
    response = restored.undoAction()
    expect(response.ok).toBe(true)
    expect(snapshotResponse(response)).toEqual(before)
    expect(response.state.availableMajorImprovements).toContain(MAJOR_ID)
    expect(response.state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy).toEqual([])
  })

  it('recovers a paid plow pending, rejects illegal placement atomically, and can undo the entire purchase', () => {
    const session = setup(false)
    const before = snapshotResponse(session.getState())
    const pending = acceptSaddler(session)
    const events = pending.state.events
    const major = events.find((event) => event.type === 'card.played' && event.cardId === MAJOR_ID)!
    const food = events.filter((event) => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)
    expect(food).toHaveLength(1)
    expect(food[0]!.seq).toBeGreaterThan(major.seq)
    const restored = restoreSession(session)
    sessions.push(restored)
    const invalid = restored.commitSelectionChoice(0, { tile: restored.state.players[0]!.roomTiles[0]! })
    expect(invalid.ok).toBe(false)
    expect(invalid.state.players[0]!.resources.food).toBe(0)
    expect(invalid.state.players[0]!.improvements).toContain(MAJOR_ID)
    const response = restored.commitSelectionChoice(0, { tile: pending.interaction.request.farm.selectableTiles[0]! })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(snapshotResponse(restored.undoAction())).toEqual(before)
  })

  it('does not react to a minor improvement purchase', () => {
    const session = setup(false)
    session.state.players[0]!.minorHand = ['A030_BakingSheet']
    const response = playImprovement(session, 'A030_BakingSheet')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.fields).toEqual([])
  })

  it('finishes the built Clay Oven onBuy before offering Saddler, then restores and plows once', () => {
    const session = setup(false)
    const oven = 'Major_ClayOven'
    session.state.availableMajorImprovements = [oven]
    Object.assign(session.state.players[0]!.resources, { clay: 3, stone: 1, food: 10, grain: 1 })
    const before = snapshotResponse(session.getState())
    let response = playImprovement(session, oven)
    expect(response.state.players[0]!.improvements).toContain(oven)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: oven, request: { kind: 'choice' } })
    expect(response.state.events.some((event) => event.type === 'resource.paid' && event.sourceCardId === CARD_ID)).toBe(false)
    response = choose(session, response, '__skip__')
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID, request: { kind: 'choice' } })
    const restored = restoreSession(session)
    sessions.push(restored)
    response = restored.getState()
    if (response.interaction.stateId !== 'wait') throw new Error('Expected Saddler optional plow')
    const accept = response.interaction.request.options!.find((option) => option.value !== '__skip__')!
    response = choose(restored, response, accept.value)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('Expected plow')
    expect(response.state.players[0]!.improvements).toContain(oven)
    response = restored.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0, food: 9, grain: 1 })
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(snapshotResponse(restored.undoAction())).toEqual(before)
  })
})
