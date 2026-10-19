import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { readActionSnapshotToken } from '../../shared/cards/helpers/action-snapshot-state'
import { moveMajorImprovementToSupplyTop } from '../../shared/cards/major/supply'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import type { GameState } from '../../shared/contract/types'

const CARD = 'C048_Farmstead'
const STOCK = 'B094_StockProtector'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
const outerFence = ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3']
const options = (response: SessionResponse) => response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []

function choose(session: GameSession, response: SessionResponse, value: string) {
  const option = options(response).find(candidate => candidate.value === value)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  expect(option?.disabled).not.toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a waiting interaction')
  const next = session.resolveChoice(response.interaction.playerIndex, value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function accept(session: GameSession, response: SessionResponse) {
  const option = options(response).find(candidate => !candidate.disabled && !candidate.value.startsWith('__'))
  if (!option) throw new Error(`Expected an offer: ${JSON.stringify(response.interaction)}`)
  return choose(session, response, option.value)
}
function beforeFarm(session: GameSession, response: SessionResponse) {
  while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
    const option = options(response).find(candidate => candidate.value === STOCK)
      ?? options(response).find(candidate => candidate.value === CARD)
    response = choose(session, response, option?.value ?? '__pass__')
  }
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('farm-select')
  return response
}
function setup(configure?: (state: GameState) => void) {
  const session = createWorkSession({ configure: state => {
    state.round = 10
    const player = state.players[0]!
    player.minorPlayed = [CARD]
    player.occupationPlayed = [STOCK]
    Object.assign(player.resources, { wood: 20, reed: 0, food: 2 })
    player.fields = [{ row: 0, col: 3, stacks: [] }]
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  return restored
}
function meetingMinor(session: GameSession, response = session.takeAction(0, 'meeting-place')) {
  const branch = options(response).find(option => option.value.startsWith('action-improvement-') || option.labelKey === 'actions.improvement.name')
  if (branch) response = choose(session, response, branch.value)
  if (options(response).some(option => option.value === CARD)) response = choose(session, response, CARD)
  expect(response.state.players[0]!.minorPlayed).toContain(CARD)
  return response
}
function moorMinor(session: GameSession, card: string) {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  const improvement = options(response).find(option => option.value.startsWith('action-improvement-'))
  if (improvement) response = choose(session, response, improvement.value)
  if (options(response).some(option => option.value === card)) response = choose(session, response, card)
  return response
}
function nextTurn(session: GameSession) {
  let response = session.resolveChoice(0, 'confirm')
  expect(response.ok, response.error).toBe(true)
  for (let player = 1; player < session.state.players.length; player++) {
    response = session.takeAction(player, player === 1 ? 'forest' : 'clay-pit')
    expect(response.ok, response.error).toBe(true)
    response = session.resolveChoice(player, 'confirm')
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

function qualifiedEndWindow(session: GameSession) {
  beforeFarm(session, session.takeAction(0, 'farm-expansion'))
  let response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })
  for (let guard = 0; guard < 4; guard++) {
    if (response.state.players[0]!.cardStates[CARD]?.extraData?.qualifiedTurnToken !== undefined
      && response.state.players[0]!.cardStates.B027_Toolbox?.flagged) break
    const card = options(response).find(option => option.value === CARD || option.value === 'B027_Toolbox')
    if (!card) throw new Error(`Expected construction reactions: ${JSON.stringify(response.interaction)}`)
    response = choose(session, response, card.value)
  }
  expect(options(response).map(option => option.value)).toEqual(expect.arrayContaining([CARD, 'B027_Toolbox']))
  expect(response.state.players[0]!.resources.food).toBe(2)
  return response
}

const stableFacts = (value: unknown) => JSON.parse(JSON.stringify(value,
  (key, entry: unknown) => key === 'occurrenceId' || key === 'paymentId' ? undefined : entry))

// Approved seams: real Session commands, resources, farm, interaction, event/log
// and persisted cursor. Turn qualification needs shared end-turn dispatch.
describe('C048 Farmstead at the true Turn end', () => {
  it.each([
    { mode: 'outer', first: false }, { mode: 'outer', first: true },
    { mode: 'both', first: false }, { mode: 'both', first: true },
    { mode: 'inner', first: false }, { mode: 'inner', first: true },
  ])('awards once after all nested actions: $mode, qualificationFirst=$first', ({ mode, first }) => {
    let session = setup(state => {
      if (mode === 'inner') state.players[0]!.stableTiles = [{ row: 1, col: 1 }, { row: 1, col: 2 }]
    })
    beforeFarm(session, session.takeAction(0, 'fencing'))
    let response = session.commitSelectionChoice(0, { edges: outerFence })
    if (mode === 'outer' && !first) { session = restore(session); response = session.getState() }
    if (first && options(response).some(option => option.value === CARD)) response = choose(session, response, CARD)
    if (options(response).some(option => option.value === STOCK)) response = choose(session, response, STOCK)
    response = accept(session, response)
    expect(response.state.players[0]!.resources.food).toBe(2)
    response = choose(session, response, mode === 'outer' ? 'forest' : 'farm-expansion')
    if (mode !== 'outer') {
      expect(response.state.players[0]!.resources.food).toBe(2)
      response = session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] })
      expect(response.ok, response.error).toBe(true)
    }
    while (options(response).some(option => option.value === CARD)) {
      expect(response.state.players[0]!.resources.food).toBe(2)
      response = choose(session, response, CARD)
    }
    expect(response.state.players[0]!.resources.food).toBe(3)
    const receipt = response.state.players[0]!.cardStates[CARD]?.extraData
    expect(receipt?.rewardedTurnToken).toBe(receipt?.qualifiedTurnToken)
    expect(readActionSnapshotToken(response.state.players[0]!)).toBeUndefined()
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
  })

  it.each(['end', 'chain', 'reward'])('keeps the late paid Toolbox/Craft Teacher/Stable Master chain after restoring at %s', restoreAt => {
    let session = createWorkSession({ options: { playerCount: 3 }, configure: state => {
      state.round = 10
      const player = state.players[0]!
      player.minorPlayed = [CARD, 'B027_Toolbox']
      player.occupationPlayed = ['A131_CraftTeacher']
      player.occupationHand = ['C089_StableMaster']
      Object.assign(player.resources, { wood: 8, stone: 2, reed: 0, food: 2 })
      player.pastures = [{ id: 'existing', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 }]
      player.fenceSegments = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    } })
    sessions.push(session)
    beforeFarm(session, session.takeAction(0, 'farm-expansion'))
    let response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    for (let guard = 0; guard < 4 && options(response).some(option => option.value === 'B027_Toolbox'); guard++) {
      expect(options(response).some(option => option.value === CARD)).toBe(false)
      if (restoreAt === 'end' && response.state.players[0]!.cardStates.B027_Toolbox?.flagged) {
        session = restore(session)
        response = session.getState()
      }
      response = choose(session, response, 'B027_Toolbox')
    }
    expect(response.interaction.stateId === 'wait' && response.interaction.promptKey).toBe('ui.interactionToolboxImprovement')
    response = accept(session, response)
    for (let guard = 0; guard < 10; guard++) {
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') break
      const next = ['Major_Joinery', 'A131_CraftTeacher', 'C089_StableMaster'].find(card => options(response).some(option => option.value === card))
      response = next ? choose(session, response, next) : accept(session, response)
    }
    if (restoreAt === 'chain') { session = restore(session); response = session.getState() }
    expect(response.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(response.state.players[0]!.occupationPlayed).toContain('C089_StableMaster')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, stone: 0, food: 2 })
    response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    if (response.state.players[0]!.cardStates[CARD]?.extraData?.qualifiedTurnToken === undefined) {
      response = choose(session, response, CARD)
    }
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 2 })
    if (restoreAt === 'reward') { session = restore(session); response = session.getState() }
    expect(options(response).map(option => option.value)).toContain(CARD)
    expect(options(response).some(option => option.value === 'B027_Toolbox')).toBe(false)
    expect(options(response).find(option => option.value === '__pass__')?.disabled ?? true).toBe(true)
    response = choose(session, response, CARD)
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', sourceCardId: 'C089_StableMaster', paymentFor: 'stables', resources: { wood: 1 } }))
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
  })


  it.each([false, true])('does not reuse a past qualification; new geometry in the next Turn=%s', newGeometry => {
    const session = setup(state => { state.players[0]!.occupationPlayed = ['A116_WoodCutter'] })
    session.takeAction(0, 'farmland')
    let response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.state.players[0]!.resources.food).toBe(3)
    const firstToken = response.state.players[0]!.cardStates[CARD]?.extraData?.rewardedTurnToken
    nextTurn(session)
    response = session.takeAction(0, newGeometry ? 'farm-expansion' : 'reed-bank')
    if (newGeometry) response = session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(newGeometry ? 4 : 3)
    const receipt = response.state.players[0]!.cardStates[CARD]?.extraData
    if (newGeometry) expect(receipt?.rewardedTurnToken).not.toBe(firstToken)
    else expect(receipt?.rewardedTurnToken).toBe(firstToken)
  })

  it('does not retroactively qualify a fence committed before the card was played in its reaction', () => {
    const session = setup(state => { state.players[0]!.minorPlayed = []; state.players[0]!.minorHand = [CARD] })
    beforeFarm(session, session.takeAction(0, 'fencing'))
    let response = session.commitSelectionChoice(0, { edges: outerFence })
    if (options(response).some(option => option.value === STOCK)) response = choose(session, response, STOCK)
    response = accept(session, response)
    response = choose(session, response, 'meeting-place')
    response = meetingMinor(session, response)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.qualifiedTurnToken).toBeUndefined()
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD)).toEqual([])
  })

  it('qualifies a separate plow committed after the card is played in the same Turn', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed = ['E018_SeedAlmanac']
      player.minorHand = [CARD]
      player.occupationPlayed = [STOCK, 'A116_WoodCutter', 'A110_Roughcaster', 'B113_PatchCaregiver']
    })
    let response = meetingMinor(session)
    response = accept(session, response)
    expect(response.state.players[0]!.resources.food).toBe(1)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.fields).toHaveLength(2)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.rewardedTurnToken).toBeDefined()
  })

  it.each(['none', 'pasture-stable', 'pasture-division'])('does not qualify for %s', mode => {
    const session = setup(state => {
      const player = state.players[0]!
      player.occupationPlayed = ['A116_WoodCutter']
      if (mode !== 'none') {
        player.pastures = [{ id: 'existing', tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }], animalType: null, animalCount: 0 }]
        player.fenceSegments = outerFence.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
      }
    })
    let response = session.takeAction(0, mode === 'none' ? 'day-laborer' : mode === 'pasture-stable' ? 'farm-expansion' : 'fencing')
    if (mode !== 'none') response = session.commitSelectionChoice(0, mode === 'pasture-stable' ? { stables: [{ row: 1, col: 1 }] } : { edges: ['V-1-2'] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(mode === 'none' ? 4 : 2)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.qualifiedTurnToken).toBeUndefined()
  })


  it.each([CARD, 'B027_Toolbox'])('allows either qualified end-turn source first: %s', first => {
    const session = setup(state => { state.players[0]!.minorPlayed.push('B027_Toolbox'); state.players[0]!.resources.stone = 2; state.players[0]!.occupationPlayed = ['A116_WoodCutter'] })
    let response = qualifiedEndWindow(session)
    response = choose(session, response, first)
    if (first === 'B027_Toolbox') response = choose(session, response, '__skip__')
    const second = first === CARD ? 'B027_Toolbox' : CARD
    expect(options(response).map(option => option.value)).toContain(second)
    response = choose(session, response, second)
    if (second === 'B027_Toolbox') response = choose(session, response, '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.resources.food === 1)).toHaveLength(1)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
  })

  it('preserves both remaining sources across an anytime detour, pending restore, reward undo and action redo', () => {
    let session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed.push('B027_Toolbox')
      player.resources.stone = 2
      player.occupationPlayed = ['A102_Grocer']
      player.cardStates.A102_Grocer = { stack: ['vegetable', 'reed', 'clay', 'vegetable', 'stone', 'reed', 'grain', 'wood'] }
    })
    let response = qualifiedEndWindow(session)
    const originalOptions = options(response).map(option => option.value)
    const originalTurn = readActionSnapshotToken(response.state.players[0]!)
    response = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 19 })
    expect(options(response).map(option => option.value)).toEqual(originalOptions)
    session = restore(session)
    response = session.getState()
    expect(options(response).map(option => option.value)).toEqual(originalOptions)
    response = choose(session, response, CARD)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(options(response).some(option => option.value === CARD)).toBe(false)
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.rewardedTurnToken).toBeUndefined()
    response = choose(session, response, CARD)
    expect(response.state.players[0]!.resources.food).toBe(2)
    response = choose(session, response, 'B027_Toolbox')
    response = choose(session, response, '__skip__')
    const completed = stableFacts({ events: response.state.events.filter(event => event.type !== 'anytime.completed'), log: response.state.log, stables: response.state.players[0]!.stableTiles })
    const completedActivations = response.state.events.filter(event => event.type === 'anytime.completed')
    expect(completedActivations).toHaveLength(1)
    expect(completedActivations[0]!.actorPlayerId).toBe('p1')
    expect(completedActivations[0]!.parentActivationId).toBeUndefined()
    expect(completedActivations[0]!.turn).toEqual({ kind: 'inside-turn', token: originalTurn })
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.resources.food === 1)).toHaveLength(1)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 20 })
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.qualifiedTurnToken).toBeUndefined()
    response = qualifiedEndWindow(session)
    const redoneTurn = readActionSnapshotToken(response.state.players[0]!)
    response = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    response = choose(session, response, CARD)
    response = choose(session, response, 'B027_Toolbox')
    response = choose(session, response, '__skip__')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 19 })
    expect(stableFacts({ events: response.state.events.filter(event => event.type !== 'anytime.completed'), log: response.state.log, stables: response.state.players[0]!.stableTiles })).toEqual(completed)
    const redoneActivations = response.state.events.filter(event => event.type === 'anytime.completed')
    expect(redoneActivations).toHaveLength(1)
    expect(redoneActivations[0]!.anytimeActionId).toBe('A102-grocer-anytime')
    expect(redoneActivations[0]!.actorPlayerId).toBe('p1')
    expect(redoneActivations[0]!.parentActivationId).toBeUndefined()
    expect(redoneActivations[0]!.turn).toEqual({ kind: 'inside-turn', token: redoneTurn })
    expect(redoneActivations[0]!.activationId).not.toBe(completedActivations[0]!.activationId)
    expect(redoneActivations[0]!.turn).not.toEqual(completedActivations[0]!.turn)
    const receipt = response.state.players[0]!.cardStates[CARD]?.extraData
    expect(receipt?.rewardedTurnToken).toBe(receipt?.qualifiedTurnToken)
  })

  it('does not add a newly played Farmstead to an open end-turn source tree or carry its qualification to the next Turn', () => {
    const session = createWorkSession({ options: { playerCount: 3 }, configure: state => {
      state.round = 10
      const player = state.players[0]!
      player.minorPlayed = ['B027_Toolbox', 'E018_SeedAlmanac']
      player.minorHand = [CARD]
      player.occupationPlayed = ['A131_CraftTeacher', 'A116_WoodCutter', 'A110_Roughcaster', 'B113_PatchCaregiver', 'E093_Motivator']
      player.occupationHand = ['A096_TaskArtisan']
      Object.assign(player.resources, { wood: 8, stone: 2, reed: 0, food: 2 })
      player.fields = [{ row: 0, col: 3, stacks: [] }]
      player.pastures = [{ id: 'existing', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 }]
      player.fenceSegments = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    } })
    sessions.push(session)
    beforeFarm(session, session.takeAction(0, 'farm-expansion'))
    let response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    for (let guard = 0; guard < 16; guard++) {
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'farm-select') break
      const next = ['B027_Toolbox', 'Major_Joinery', 'A131_CraftTeacher', 'A096_TaskArtisan', CARD].find(card => options(response).some(option => option.value === card))
      response = next ? choose(session, response, next) : accept(session, response)
    }
    expect(response.state.players[0]!.minorPlayed).toContain(CARD)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.qualifiedTurnToken).toBeDefined()
    expect(options(response).some(option => option.value === CARD)).toBe(false)
    response = choose(session, response, 'E093_Motivator')
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.rewardedTurnToken).toBeUndefined()
    expect(response.state.players[0]!.cardStates.E093_Motivator?.flagged).toBe(true)
    nextTurn(session)
    response = session.takeAction(0, 'reed-bank')
    response = choose(session, response, 'E093_Motivator')
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.rewardedTurnToken).toBeUndefined()
  })

  it('awards a fresh independent Turn when the Archway worker moves before returning home', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed.push('D051_Archway')
      player.occupationPlayed = ['A116_WoodCutter', 'E093_Motivator']
      state.actionSpaces.push(...createPlayerActionSpaces(state).filter(space => !state.actionSpaces.some(existing => existing.id === space.id)))
    })
    session.takeAction(0, 'farm-expansion')
    let response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })
    response = choose(session, response, CARD)
    response = choose(session, response, 'E093_Motivator')
    expect(response.state.players[0]!.resources.food).toBe(3)
    const firstToken = response.state.players[0]!.cardStates[CARD]?.extraData?.rewardedTurnToken
    nextTurn(session)
    response = session.takeAction(0, 'D051_Archway')
    response = choose(session, response, 'E093_Motivator')
    expect(response.state.players[0]!.resources.food).toBe(4)
    response = session.resolveChoice(0, 'confirm')
    response = session.takeAction(1, 'reed-bank')
    response = session.resolveChoice(1, 'confirm')
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    }
    if (options(response).some(option => option.value === 'D051_Archway')) response = choose(session, response, 'D051_Archway')
    response = accept(session, response)
    response = choose(session, response, 'farmland')
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(options(response).map(option => option.value)).toEqual(expect.arrayContaining([CARD, 'E093_Motivator']))
    expect(response.state.players[0]!.resources.food).toBe(4)
    expect(readActionSnapshotToken(response.state.players[0]!)).not.toBe(firstToken)
    response = choose(session, response, 'E093_Motivator')
    response = choose(session, response, CARD)
    expect(response.state.players[0]!.resources.food).toBe(5)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.rewardedTurnToken).not.toBe(firstToken)
    expect(readActionSnapshotToken(response.state.players[0]!)).toBeUndefined()
  })


  it.each([
    'M017_Reforestation',
    'M042_DeepPlow',
    'M066_LandParcel',
    'M064_FamilyBurialPlot',
  ])('rewards a previously unused space made used by %s at the true Turn end', card => {
    const session = createWorkSession({ options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
      state.round = 10
      const player = state.players[0]!
      player.farmTerrain = []
      player.minorPlayed = [CARD]
      player.minorHand = [card]
      player.occupationPlayed = [STOCK]
      player.houseType = 'stone'
      player.improvements = card === 'M066_LandParcel' ? [] : ['Major_Fireplace1', 'Major_Fireplace2', 'Major_Joinery']
      Object.assign(player.resources, { wood: card === 'M042_DeepPlow' ? 3 : 0, clay: 0, reed: 0, stone: 1, food: 2 })
      state.availableMajorImprovements = state.availableMajorImprovements.filter(id => !player.improvements.includes(id))
    } })
    sessions.push(session)
    let response = moorMinor(session, card)
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionOptionalAction') response = accept(session, response)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.selection?.kind, JSON.stringify(response.interaction)).toBe('farm-position')
    expect(response.state.players[0]!.resources.food).toBe(2)
    const live = restore(session)
    response = live.commitSelectionChoice(0, { positions: [{ row: 1, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    const player = response.state.players[0]!
    if (card === 'M064_FamilyBurialPlot') expect(player.farmyardSpaceStates).toContainEqual(expect.objectContaining({ spaceKey: '1-3', blocksPlacement: true }))
    else expect(player.farmTerrain).toContainEqual({ row: 1, col: 3, kind: card === 'M042_DeepPlow' ? 'moor' : 'forest' })
    expect(player.resources.food).toBe(3)
    expect(player.cardStates[CARD]?.extraData?.rewardedTurnToken).toBe(player.cardStates[CARD]?.extraData?.qualifiedTurnToken)
    expect(response.state.events.filter(event => event.type === 'farm.spacesUsed')).toMatchObject([
      { sourceCardId: card, newlyUsedTiles: [{ playerId: player.id, row: 1, col: 3 }] },
    ])
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    const undone = live.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.food).toBe(2)
    expect(undone.state.events.filter(event => event.type === 'farm.spacesUsed')).toHaveLength(0)
    response = moorMinor(live, card)
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'ui.interactionOptionalAction') response = accept(live, response)
    const redone = live.commitSelectionChoice(0, { positions: [{ row: 1, col: 3 }] })
    expect(redone.ok, redone.error).toBe(true)
    expect(redone.state.players[0]!.resources.food).toBe(3)
    expect(redone.state.events.filter(event => event.type === 'farm.spacesUsed')).toHaveLength(1)
  })

  it.each(['accept', 'skip', 'covered'] as const)('uses only actual new blocking usage from Moor Archaeology: %s', mode => {
    const session = createWorkSession({ options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
      state.round = 10
      const player = state.players[0]!
      player.minorPlayed = [CARD, 'M070_MoorArchaeology']
      player.occupationPlayed = [STOCK]
      player.houseType = 'clay'
      player.resources.food = 2
      player.farmTerrain = [{ row: 0, col: 3, kind: 'moor', ...(mode === 'covered' ? { covered: 'forest' } : {}) }]
    } })
    sessions.push(session)
    const special = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('cut-peat'))!
    let response = session.takeSpecialAction(0, special.id, 'cut-peat', { tile: { row: 0, col: 3 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    const live = restore(session)
    if (mode !== 'covered') {
      expect(response.interaction.stateId === 'wait' && response.interaction.promptKey).toBe('ui.interactionOptionalAction')
      response = mode === 'accept' ? accept(live, live.getState()) : choose(live, live.getState(), '__skip__')
    } else response = live.getState()
    const player = response.state.players[0]!
    expect(player.resources.food).toBe(mode === 'accept' ? 3 : 2)
    expect(response.state.events.filter(event => event.type === 'farm.spacesUsed')).toHaveLength(mode === 'accept' ? 1 : 0)
    if (mode === 'accept') {
      expect(player.farmyardSpaceStates).toContainEqual(expect.objectContaining({ spaceKey: '0-3', blocksPlacement: true }))
      expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'farm.spacesUsed', sourceCardId: 'M070_MoorArchaeology', newlyUsedTiles: [{ playerId: player.id, row: 0, col: 3 }] }))
      expect(live.undoAction().state.players[0]!.resources.food).toBe(2)
      const repeated = live.takeSpecialAction(0, special.id, 'cut-peat', { tile: { row: 0, col: 3 } })
      expect(accept(live, repeated).state.players[0]!.resources.food).toBe(3)
    } else expect(player.farmyardSpaceStates ?? []).toEqual([])
  })

  it.each(['M051_MoorEnclosures', 'M064_FamilyBurialPlot'])('does not qualify initial extension terrain or a skipped tombstone: %s', card => {
    const session = createWorkSession({ options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
      state.round = 10
      const player = state.players[0]!
      player.minorPlayed = [CARD]
      player.minorHand = [card]
      player.occupationPlayed = [STOCK]
      player.houseType = card === 'M051_MoorEnclosures' ? 'clay' : 'stone'
      player.farmTerrain = []
      Object.assign(player.resources, { stone: 1, food: 2 })
    } })
    sessions.push(session)
    let response = moorMinor(session, card)
    if (card === 'M064_FamilyBurialPlot') response = choose(session, response, '__skip__')
    else {
      response = session.commitSelectionChoice(0, { positions: [{ row: -1, col: 0 }, { row: -1, col: 1 }] })
      expect(response.state.players[0]!.farmTerrain).toEqual([{ row: -1, col: 0, kind: 'moor' }, { row: -1, col: 1, kind: 'moor' }])
      expect(response.state.players[0]!.farmyardExtensions).toHaveLength(1)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.qualifiedTurnToken).toBeUndefined()
    expect(response.state.events.filter(event => event.type === 'farm.spacesUsed')).toEqual([])
  })

  it('does not invent unused-to-used qualification while cleared Nature Reserve terrain becomes pasture', () => {
    const card = 'M021_PeatCuttingExpedition'
    const session = createWorkSession({ options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
      state.round = 10
      const player = state.players[0]!
      player.minorPlayed = [CARD, 'M038_NatureReserve']
      player.minorHand = [card]
      player.occupationPlayed = [STOCK]
      player.resources.food = 6
      player.farmTerrain = [{ row: 0, col: 1, kind: 'moor' }]
      player.fenceSegments = ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1', 'H-0-1', 'H-1-1', 'V-0-2']
        .map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
      player.pastures = [{ id: 'old', tiles: [{ row: 0, col: 0 }], animalType: null, animalCount: 0 }]
      player.cardStates.M038_NatureReserve = { extraData: { natureReserveTiles: [{ row: 0, col: 1 }] } }
    } })
    sessions.push(session)
    let response = moorMinor(session, card)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.selection?.kind).toBe('farm-position')
    response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] })
    expect(response.ok, response.error).toBe(true)
    if (options(response).some(option => option.value === 'M038_NatureReserve')) response = choose(session, response, 'M038_NatureReserve')
    expect(response.state.players[0]!.pastures).toHaveLength(2)
    expect(response.state.players[0]!.farmTerrain).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, fuel: 2 })
    expect(response.state.players[0]!.cardStates[CARD]?.extraData?.qualifiedTurnToken).toBeUndefined()
    expect(response.state.events.filter(event => event.type === 'farm.spacesUsed')).toEqual([])
  })

  it.each([
    { card: 'M062_HearthBrush', major: 'Major_Moor_TiledOven', resource: 'clay', buy: true },
    { card: 'M063_PastoralLetter', major: 'Major_Moor_VillageChurch', resource: 'wood', buy: true },
    { card: 'M063_PastoralLetter', major: 'Major_Moor_VillageChurch', resource: 'wood', buy: false },
  ])('retains an unaffordable $card until anytime payment changes; buy=$buy', ({ card, major, resource, buy }) => {
    const session = createWorkSession({ options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true }, configure: state => {
      state.round = 10
      const player = state.players[0]!
      player.farmTerrain = []
      player.minorPlayed = [CARD, card]
      player.occupationPlayed = ['A102_Grocer']
      if (resource === 'wood') player.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
      Object.assign(player.resources, { wood: resource === 'wood' ? 3 : 2, clay: 1, stone: resource === 'wood' ? 4 : 1, reed: 0, food: 2 })
      player.cardStates[card] = { extraData: { playedRound: 9 } }
      player.cardStates.A102_Grocer = { stack: resource === 'wood'
        ? ['vegetable', 'reed', 'clay', 'vegetable', 'stone', 'reed', 'grain', 'wood'] : ['vegetable', 'reed', 'clay'] }
      moveMajorImprovementToSupplyTop(state, major)
    } })
    sessions.push(session)
    session.takeAction(0, 'farm-expansion')
    let response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    expect(options(response).some(option => option.value === CARD)).toBe(true)
    expect(options(response).some(option => option.value === card)).toBe(false)
    response = session.takeAnytimeAction(0, 'A102-grocer-anytime')
    expect(response.ok, response.error).toBe(true)
    expect(options(response).some(option => option.value === card && !option.disabled), JSON.stringify({ interaction: response.interaction, resources: response.state.players[0]!.resources })).toBe(true)
    response = choose(session, response, CARD)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(options(response).find(option => option.value === '__pass__')?.disabled).not.toBe(true)
    if (buy) {
      response = choose(session, response, card)
      if (options(response).some(option => option.value === major)) response = choose(session, response, major)
      expect(response.state.players[0]!.improvements).toContain(major)
      expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', sourceCardId: major, paymentFor: 'major-improvement' }))
    } else {
      response = choose(session, response, '__pass__')
      expect(response.state.players[0]!.improvements).not.toContain(major)
    }
    expect(response.state.players[0]!.resources.food).toBe(buy && resource === 'wood' ? 4 : 2)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
  })


  it('keeps Royal Wood and Toolbox source attribution in the same Turn-end tree', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.minorPlayed.push('B027_Toolbox', 'D074_RoyalWood')
      player.occupationPlayed = ['A116_WoodCutter']
      player.resources.stone = 2
    })
    beforeFarm(session, session.takeAction(0, 'farm-expansion'))
    let response = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] })
    for (let guard = 0; guard < 6; guard++) {
      if (response.state.players[0]!.cardStates[CARD]?.extraData?.qualifiedTurnToken !== undefined
        && response.state.players[0]!.cardStates.B027_Toolbox?.flagged
        && response.state.players[0]!.cardStates.D074_RoyalWood?.extraData?.woodSpent === 2) break
      const next = [CARD, 'B027_Toolbox', 'D074_RoyalWood'].find(card => options(response).some(option => option.value === card))
      if (!next) throw new Error(`Expected build bookkeeping: ${JSON.stringify(response.interaction)}`)
      response = choose(session, response, next)
    }
    expect(options(response).map(option => option.value)).toEqual(expect.arrayContaining([CARD, 'B027_Toolbox', 'D074_RoyalWood']))
    response = choose(session, response, 'D074_RoyalWood')
    expect(response.state.players[0]!.resources.wood).toBe(19)
    response = choose(session, response, CARD)
    response = choose(session, response, 'B027_Toolbox')
    response = choose(session, response, '__skip__')
    expect(response.state.players[0]!.resources.food).toBe(3)
    expect(response.state.players[0]!.cardStates.D074_RoyalWood?.extraData?.woodSpent).toBe(0)
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.moved', sourceCardId: 'D074_RoyalWood', resources: { wood: 1 } }))
  })


  it('waits for both room and stable Rule Actions before awarding once', () => {
    const session = setup(state => {
      state.players[0]!.occupationPlayed = ['A116_WoodCutter']
      Object.assign(state.players[0]!.resources, { wood: 7, reed: 2 })
    })
    let response = session.takeAction(0, 'farm-expansion')
    const room = options(response).find(option => option.labelKey === 'actions.construct.name')
    if (!room) throw new Error('Expected a room branch')
    response = choose(session, response, room.value)
    response = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    const stable = options(response).find(option => option.labelKey === 'actions.stables.name')
    if (!stable) throw new Error('Expected a stable branch')
    response = choose(session, response, stable.value)
    response = session.commitSelectionChoice(0, { stables: [{ row: 2, col: 3 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, wood: 0, reed: 0 })
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD && event.resources.food === 1)).toHaveLength(1)
  })

})
