import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { A028_ForestSchool as A28Card } from '../../shared/cards/A/A028_ForestSchool'

import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import '../../shared/cards/A/A028_ForestSchool'
import '../../shared/cards/A/A123_FrameBuilder'
import '../../shared/cards/A/A027_OvenSite'
import '../../shared/cards/A/A029_AleBenches'
import '../../shared/cards/A/A060_OrientalFireplace'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit06Improvements from './_helpers/audit/ae-negative-06-improvements'

const CARD_ID = 'A028_ForestSchool'

const setup = (withForestSchool: boolean, options?: { playerCount?: number; spaceId?: string }) => {
  const playerCount = options?.playerCount ?? 2
  const spaceId = options?.spaceId ?? 'lessons'
  const session = new GameSession(undefined, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, playerCount)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: withForestSchool ? (spaceId === 'lessons-3' ? 2 : 1) : 0,
    food: 0,
  }
  player.occupationHand = ['A123_FrameBuilder']
  player.occupationPlayed = ['D152_Patron']

  if (withForestSchool) {
    player.minorPlayed.push('A028_ForestSchool')
    player.activeModifiers.push({ ...(A28Card.impl.modifiers![0] ?? {}) })
  }

  const lessons = state.actionSpaces.find((space) => space.id === spaceId)
  if (!lessons) throw new Error(`${spaceId} space missing`)
  lessons.takenBy = [{ playerId: state.players[1]!.id, workerId: state.players[1]!.workers[0]!.id }]

  session.loadState(state)
  return session
}

describe('A028_ForestSchool session', () => {
  it('A028 S1: paying one wood and one clay plays Forest School', () => {
    const session = new GameSession(7028, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    state.players.forEach((candidate) => {
      setWorkersAtHome(state, candidate, 2)
      candidate.minorHand = ['__test_placeholder__']
      candidate.occupationHand = ['__test_placeholder__']
      candidate.resources.wood = 0
      candidate.resources.clay = 0
    })
    state.players[0]!.minorHand = [CARD_ID]
    state.players[0]!.resources.wood = 1
    state.players[0]!.resources.clay = 1
    session.loadState(state)

    let response = session.takeAction(0, 'meeting-place')
    for (let guard = 0; guard < 6 && response.state.players[0]!.minorHand.includes(CARD_ID); guard += 1) {
      if (response.interaction.stateId !== 'wait') break
      const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
      const branch = response.interaction.request.options?.find((option) =>
        option.value.startsWith('action-improvement-'))
      const next = card ?? branch
      if (!next) break
      response = session.resolveChoice(response.interaction.playerIndex, next.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })

  it('A028 S3: occupied ordinary Lessons remains usable through the public action entry', () => {
    const withCard = setup(true).getState()
    expect(withCard.ok).toBe(true)
    expect(withCard.interaction.stateId).toBe('idle')
    expect(withCard.actionAvailability?.lessons).toBe(true)

    const withoutCardSession = setup(false)
    const withoutCard = withoutCardSession.getState()
    expect(withoutCard.actionAvailability?.lessons).toBe(false)

    const failedTake = withoutCardSession.takeAction(0, 'lessons')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('A028 S2: occupied three-player Lessons remains usable and two food can be replaced by wood', () => {
    const withCard = setup(true, { playerCount: 3, spaceId: 'lessons-3' }).getState()
    expect(withCard.ok).toBe(true)
    expect(withCard.interaction.stateId).toBe('idle')
    expect(withCard.actionAvailability?.['lessons-3']).toBe(true)

    const withoutCardSession = setup(false, { playerCount: 3, spaceId: 'lessons-3' })
    const withoutCard = withoutCardSession.getState()
    expect(withoutCard.actionAvailability?.['lessons-3']).toBe(false)

    const failedTake = withoutCardSession.takeAction(0, 'lessons-3')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('A028 payment regression: one-food occupation cost exposes and honours the wood replacement', () => {
    const session = setup(true)

    // D152_Patron triggers `before` on occupation and grants +2 food.
    // After that hook the player holds {food: 2, wood: 1} and the lessons
    // cost (1 food) is payable two distinct ways: directly via 1 food, or
    // via A28 ForestSchool's wood→food trade (1 wood, 0 food). The pay
    // leaf must surface `prompt.selectPayment` instead of auto-picking.
    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    expect(resp.interaction.request.options?.length).toBeGreaterThanOrEqual(2)

    const tradeOption = resp.interaction.request.options?.find((option) => {
      const params = option.labelParams as Record<string, unknown> | undefined
      const paid = params?.resourcesPaid as Record<string, number> | undefined
      return !!paid && (paid.wood ?? 0) === 1 && !paid.food
    })
    expect(tradeOption).toBeDefined()

    resp = session.resolveChoice(0, tradeOption!.value)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    // D152 granted 2 food; A28 trade burned the wood instead of any food.
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
    expect(resp.state.players[0]!.occupationHand).not.toContain('A123_FrameBuilder')
    expect(resp.state.actionSpaces.find((space) => space.id === 'lessons')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)
  })

  it('auto-pays when only one payment solution is affordable', () => {
    // Strip A28 ForestSchool so the wood→food trade modifier never activates.
    // Player still receives D152 Patron's +2 food, but the only viable
    // payment path is direct food — the pay leaf should auto-resolve and
    // never surface a selectPayment prompt.
    const session = new GameSession(undefined, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources = { ...player.resources, wood: 0, food: 0 }
    player.occupationHand = ['A123_FrameBuilder']
    player.occupationPlayed = ['D152_Patron']
    const lessons = state.actionSpaces.find((space) => space.id === 'lessons')
    if (!lessons) throw new Error('lessons space missing')
    session.loadState(state)

    const resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    // D152 granted 2 food; lessons cost (1 food) was auto-paid without
    // surfacing a selectPayment prompt — net food: 2 - 1 = 1.
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
  })
})

describe('ae-negative-06-improvements', () => {
  const { SCHOOL, sessions, setup, enter, buy, ready, turn, offered, occupation, occupiedSchool } = audit06Improvements
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A028 N1 actual purchase pays one wood and one clay and earns the printed point',()=>{const s=setup(SCHOOL,{resources:{wood:1,clay:1}});const r=buy(s,enter(s),SCHOOL);assert.deepEqual([r.state.players[0]!.resources.wood,r.state.players[0]!.resources.clay],[0,0]);assert.ok(r.scores);assert.equal(r.scores[0]!.categories.find(c=>c.key==='cards')?.entries?.find(e=>e.type==='card'&&e.cardId===SCHOOL)?.score,1)})
  it('A028 N2 missing either printed resource rejects Forest School before legal retry',()=>{for(const resources of[{wood:0,clay:1},{wood:1,clay:0}]){const s=setup(SCHOOL,{resources});const r=enter(s);assert.equal(offered(r,SCHOOL),false);assertRejectedUnchanged(s,()=>s.resolveChoice(0,SCHOOL));const done=buy(s,r,'A054_Credit');assert.deepEqual([done.state.players[0]!.resources.wood,done.state.players[0]!.resources.clay],[resources.wood,resources.clay])}})
  it('A028 N3 real occupied Lessons allows the owner to pay one wood for a second occupation',()=>{const s=occupiedSchool();const before=structuredClone(s.getState().state.actionSpaces.find(a=>a.id==='lessons')!.takenBy);const r=occupation(s,turn(s,0,'lessons'),0,{wood:1,food:0});assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.food,0);assert.ok(before);assert.notDeepEqual(r.state.actionSpaces.find(a=>a.id==='lessons')!.takenBy,before);assert.deepEqual(r.state.actionSpaces.find(a=>a.id==='lessons')!.takenBy,[{playerId:r.state.players[1]!.id,workerId:'1'},{playerId:r.state.players[0]!.id,workerId:'2'}])})
  it('A028 N4 without owner Forest School occupied Lessons rejects before legal retry',()=>{for(const other of[false,true]){const s=occupiedSchool({played:false,other});assertRejectedUnchanged(s,()=>s.takeAction(0,'lessons'));const r=turn(s,0,'forest');assert.equal(r.state.players[0]!.occupationPlayed.includes('A123_FrameBuilder'),false)}})
  it('A028 N5 Forest School cannot enter an occupied non Lessons space',()=>{const s=setup(SCHOOL,{played:true,round:5,occupations:1,resources:{wood:1,food:0}});turn(s,0,'grain-seeds');turn(s,1,'forest');ready(s,0);assertRejectedUnchanged(s,()=>s.takeAction(0,'forest'));occupation(s,turn(s,0,'lessons'),0,{wood:1,food:0})})
  it('A028 N6 occupied three player Lessons preserves pure food mixed and pure wood two unit payments',()=>{for(const paid of[{food:2,wood:0},{food:1,wood:1},{food:0,wood:2}]){const s=occupiedSchool({players:3,resources:{food:2,wood:2},space:'lessons-3'});const r=occupation(s,turn(s,0,'lessons-3'),0,paid);assert.deepEqual([r.state.players[0]!.resources.food,r.state.players[0]!.resources.wood],[2-paid.food,2-paid.wood])}})
  it('A028 N7 insufficient combined food and wood rejects an occupation before legal retry',()=>{const s=occupiedSchool({players:3,resources:{food:0,wood:1},space:'lessons-3'});assertRejectedUnchanged(s,()=>s.takeAction(0,'lessons-3'));const r=turn(s,0,'clay-pit');assert.equal(r.state.players[0]!.occupationPlayed.includes('A123_FrameBuilder'),false);assert.equal(r.state.players[0]!.resources.wood,1)})
  it('A028 N8 the first ordinary Lessons occupation remains free',()=>{const s=setup(SCHOOL,{played:true,round:5,resources:{wood:1,food:0}});const r=occupation(s,turn(s,0,'lessons'),0,{wood:0,food:0});assert.equal(r.state.players[0]!.resources.wood,1)})
})
