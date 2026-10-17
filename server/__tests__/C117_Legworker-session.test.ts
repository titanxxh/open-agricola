import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C117_Legworker'
import { hasAdjacentWorker } from '../../shared/cards/C/C117_Legworker'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit49Work from './_helpers/audit/ae-negative-49-work'


const CARD_ID = 'C117_Legworker'
const FILLER = '__test_placeholder__'

const findListener = (ruleOwner: SessionRuleOwner, id: string) =>
  ruleOwner.withCtx(() => getRegisteredCardListeners()).find((l) => l.id === id)

const setupParity = ({ played = true } = {}) => {
  const session = new GameSession(5117, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')!
  forest.resources = { ...forest.resources, wood: 1 }
  clayPit.resources = { ...clayPit.resources, clay: 1 }
  session.loadState(state)
  return session
}

const occupy = (session: GameSession, playerIndex: number, spaceId: string) => {
  const state = session.getState().state
  const player = state.players[playerIndex]!
  const occupiedWorkerIds = new Set(state.actionSpaces.flatMap((space) =>
    space.takenBy.filter((ref) => ref.playerId === player.id).map((ref) => ref.workerId)))
  const worker = player.workers.find((candidate) => candidate.isActive && !occupiedWorkerIds.has(candidate.id))
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!worker || !space) throw new Error(`cannot occupy ${spaceId}`)
  space.takenBy.push({ playerId: player.id, workerId: worker.id })
  session.loadState(state)
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

describe('C117_Legworker session', () => {
  it('hasAdjacentWorker returns true when owner occupies neighbour', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    // Force farmland and grain-seeds into the state (common spaces)
    // grain-seeds is adjacent to farmland in COMMON_ADJACENCY for farmland.
    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!farmland || !grainSeeds) return
    grainSeeds.takenBy = [{ playerId: player.id, workerId: "1" }]
    session.loadState(state)

    expect(hasAdjacentWorker(state, player.id, 'farmland')).toBe(true)
  })

  it('hasAdjacentWorker returns false when neighbour is taken by opponent', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    const opponent = state.players[1]!
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!grainSeeds) return
    grainSeeds.takenBy = [{ playerId: opponent.id, workerId: "1" }]
    session.loadState(state)

    expect(hasAdjacentWorker(state, player.id, 'farmland')).toBe(false)
  })

  it('hasAdjacentWorker returns false when no neighbour is occupied', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    expect(hasAdjacentWorker(state, state.players[0]!.id, 'farmland')).toBe(false)
  })

  it('after-place-farmer gains 1 wood when adjacent to own worker', () => {


    const session = new GameSession(42)
    const listener = findListener(session, 'C117-legworker-after-place-farmer')!
    expect(listener).toBeDefined()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!grainSeeds) return
    grainSeeds.takenBy = [{ playerId: player.id, workerId: "1" }]
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 1 })
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('does not trigger when no adjacent worker', () => {

    const session = new GameSession(42)
    const listener = findListener(session, 'C117-legworker-after-place-farmer')!
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('C117 S1: Legworker can be played as the first occupation for no food', () => {
    const session = setupParity({ played: false })
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const response = playOccupation(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C117 S2: using a stocked Forest adjacent to your Grain Seeds worker gains one extra wood', () => {
    const session = setupParity()
    occupy(session, 0, 'grain-seeds')

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toHaveLength(1)
  })

  it('C117 S3: an opponent on adjacent Grain Seeds does not grant wood', () => {
    const session = setupParity()
    occupy(session, 1, 'grain-seeds')

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('C117 S4: your worker on nonadjacent Day Laborer does not grant wood at Forest', () => {
    const session = setupParity()
    occupy(session, 0, 'day-laborer')

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('C117 S5: round-space adjacency is resolved through the current action-card layout', () => {
    const session = setupParity()
    const roundFive = session.state.roundActionOrder[4]
    expect(roundFive).toBeTruthy()
    occupy(session, 0, roundFive!)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })

  it('C117 S6: Forest and Clay Pit are mutually adjacent for Legworker', () => {
    const session = setupParity()
    occupy(session, 0, 'forest')

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1 })
  })

  it('C117 S7: without Legworker the same stocked adjacent placement grants no extra wood', () => {
    const session = setupParity({ played: false })
    const state = session.getState().state
    state.players[0]!.occupationHand = [FILLER]
    session.loadState(state)
    occupy(session, 0, 'grain-seeds')

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('C117 S8: an adjacent worker does not authorize an empty Forest', () => {
    const session = setupParity()
    occupy(session, 0, 'grain-seeds')
    session.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 0
    const response = session.takeAction(0, 'forest')
    expect(response.ok).toBe(false)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.takenBy).toEqual([])
  })

})

describe('ae-negative-49-work', () => {
  const { LEG, sessions, save, ok, make, lesson, action, rooms, wood } = audit49Work
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C117 N1 actual Lessons grants no immediate wood and a real second owner action orthogonally adjacent to its first gives one',()=>{const bought=lesson(make(LEG,false),LEG);assert.equal(wood(bought),0);const s=make(LEG),first=action(s,0,'forest');assert.equal(wood(first),3);action(s,1,'day-laborer');const r=action(s,0,'clay-pit');assert.equal(wood(r),4);assert.equal(r.state.players[0]!.resources.clay,1);save('C117-N1',{bought,first,r})})
  it('C117 N2 nonadjacent owned worker opposite owner adjacency and a card in hand never grant extra wood',()=>{for(const mode of['nonadjacent','opponent','hand']){const s=make(LEG,mode!=='hand');action(s,0,mode==='hand'?'forest':'grain-seeds');action(s,1,mode==='opponent'?'forest':'day-laborer');const r=action(s,0,'clay-pit');assert.equal(wood(r),mode==='hand'?3:0);save(`C117-N2-${mode}`,r)}})
  it('C117 N3 two adjacent owned neighbours still grant only one wood and whole last action undo permits only one replay',()=>{const s=make(LEG,true,state=>rooms(state,3));action(s,0,'forest');action(s,1,'grain-seeds');action(s,0,'reed-bank');action(s,1,'day-laborer');const a=action(s,0,'clay-pit');assert.equal(wood(a),4);const u=ok(s.undoAction());assert.equal(wood(u),3);const r=action(s,0,'clay-pit');assert.equal(wood(r),4);save('C117-N3',{a,u,r})})
})
