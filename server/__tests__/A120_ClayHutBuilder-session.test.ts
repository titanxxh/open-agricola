import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A120_ClayHutBuilder'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, confirmNext } from './_helpers/negative-rule-audit'
import * as audit14Build from './_helpers/audit/ae-negative-14-build'

const CARD_ID = 'A120_ClayHutBuilder'
const FILLER = '__test_placeholder__'

const setup = ({
  houseType = 'wood',
  played = false,
  flagged = false,
  round = 5,
}: {
  houseType?: 'wood' | 'clay' | 'stone'
  played?: boolean
  flagged?: boolean
  round?: number
} = {}) => {
  const session = new GameSession(5120, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 0
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  player.houseType = houseType
  player.resources.clay = 2
  player.resources.stone = 2
  player.resources.reed = 1
  if (flagged) player.cardStates[CARD_ID] = { flagged: true }
  const redevelopment = state.actionSpaces.find((space) => space.id === 'house-redevelopment')
  if (!redevelopment) throw new Error('missing house-redevelopment')
  redevelopment.roundAvailable = 1
  redevelopment.takenBy = []
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession): SessionResponse => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const renovate = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'house-redevelopment')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
      const targetType = response.state.players[0]!.houseType === 'wood' ? 'clay' : 'stone'
      const target = response.interaction.request.options?.find((option) => option.value === targetType)
      expect(target).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, target!.value)
      continue
    }
    const skip = response.interaction.request.options?.find((option) =>
      option.value === '__skip__' || option.value === 'skip')
    if (!skip) break
    response = session.resolveChoice(response.interaction.playerIndex, skip.value)
  }
  return response
}

const clayEntries = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID)

describe('A120 Clay Hut Builder parity', () => {
  it('A120 S1: playing Clay Hut Builder in a wooden house schedules nothing', () => {
    const response = playOccupation(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(clayEntries(response)).toEqual([])
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('A120 S2: playing Clay Hut Builder in a clay house schedules two clay for five rounds', () => {
    const response = playOccupation(setup({ houseType: 'clay' }))
    const entries = clayEntries(response)

    expect(entries.map((entry) => entry.round)).toEqual([6, 7, 8, 9, 10])
    entries.forEach((entry) => expect(entry.resources).toEqual({ clay: 2 }))
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('A120 S3: the first renovation out of wood schedules two clay for five rounds', () => {
    const response = renovate(setup({ played: true }))
    const entries = clayEntries(response)

    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(entries.map((entry) => entry.round)).toEqual([6, 7, 8, 9, 10])
    entries.forEach((entry) => expect(entry.resources).toEqual({ clay: 2 }))
    expect(isCardFlagged(response.state.players[0]!, CARD_ID)).toBe(true)
  })

  it('A120 S4: after its first trigger a later renovation schedules no additional clay', () => {
    const response = renovate(setup({ houseType: 'clay', played: true, flagged: true }))

    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(clayEntries(response)).toEqual([])
  })

  it('A120 S4b: a renovation after playing it in a clay house adds no second schedule', () => {
    const session = setup({ houseType: 'clay' })
    const played = playOccupation(session)
    expect(clayEntries(played)).toHaveLength(5)
    confirmNext(session, played)
    confirmNext(session, session.takeAction(1, 'day-laborer'))

    const response = renovate(session)

    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(clayEntries(response).map((entry) => entry.round)).toEqual([6, 7, 8, 9, 10])
  })

  it('A120 S4c: undoing the play removes the schedule and the flag', () => {
    const session = setup({ houseType: 'clay' })
    playOccupation(session)

    const undone = session.undoAction()

    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.occupationHand).toContain(CARD_ID)
    expect(clayEntries(undone)).toEqual([])
    expect(undone.state.pendingFutureMeeples).toEqual([])
    expect(isCardFlagged(undone.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('A120 S5: scheduled clay is received at the next round start', () => {
    const session = setup({ houseType: 'clay' })
    playOccupation(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.resources.food = 20
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.clay).toBe(clayBefore + 2)
    expect(clayEntries(response).map((entry) => entry.round)).toEqual([7, 8, 9, 10])
  })

  it('A120 S6: late activation schedules clay only on rounds that still exist', () => {
    const response = playOccupation(setup({ houseType: 'stone', round: 12 }))
    const entries = clayEntries(response)

    expect(entries.map((entry) => entry.round)).toEqual([13, 14])
    entries.forEach((entry) => expect(entry.resources).toEqual({ clay: 2 }))
  })
})

describe('ae-negative-14-build', () => {
  const { CLAY, sessions, save, ok, setup, turn, play, renovation, schedule, finish, cleanup } = audit14Build
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('A120 N1 actual play in wood waits while clay and stone schedule next five rounds once',()=>{for(const material of['wood','clay','stone'] as const){const s=setup(CLAY,state=>state.players[0]!.houseType=material,false);const r=play(s,CLAY);assert.equal(r.state.players[0]!.resources.clay,10);assert.deepEqual(schedule(r).map(e=>e.slice(0,2)),material==='wood'?[]:[[6,2],[7,2],[8,2],[9,2],[10,2]]);save(`A120-N1-${material}`,r)}})
  it('A120 N2 actual first renovation schedules once and natural second renovation cannot reschedule',()=>{const s=setup(CLAY,undefined,true,10);const first=renovation(s);assert.deepEqual(schedule(first).map(e=>e.slice(0,2)),[[11,2],[12,2],[13,2],[14,2]]);assert.equal(first.state.players[0]!.resources.clay,8);turn(s,1,'reed-bank');turn(s,0,'day-laborer');const next=cleanup(s,confirmNext(s,turn(s,1,'clay-pit')));assert.equal(next.state.round,11);assert.equal(next.state.players[0]!.resources.clay,10);const second=renovation(s);assert.equal(second.state.players[0]!.houseType,'stone');assert.deepEqual(schedule(second).map(e=>e.slice(0,2)),[[12,2],[13,2],[14,2]]);save('A120-N2',{first,next,second})})
  it('A120 N3 natural next five starts deliver exactly two clay owner only then stop',()=>{const s=setup(CLAY,state=>state.players[0]!.houseType='clay',false);const bought=play(s,CLAY);turn(s,1,'reed-bank');turn(s,0,'day-laborer');let r=cleanup(s,confirmNext(s,turn(s,1,'clay-pit')));assert.equal(r.state.round,6);assert.equal(r.state.players[0]!.resources.clay,12);assert.equal(r.state.players[1]!.resources.clay,11);for(const round of[7,8,9,10]){r=finish(s);assert.equal(r.state.round,round);assert.equal(r.state.players[0]!.resources.clay,10+2*(round-5));assert.equal(schedule(r).length,10-round)}r=finish(s);assert.equal(r.state.round,11);assert.equal(r.state.players[0]!.resources.clay,20);assert.deepEqual(schedule(r),[]);save('A120-N3',{bought,r})})
  it('A120 N4 late activation clips rounds and round fourteen cannot award immediate clay',()=>{for(const round of[12,14]){const r=play(setup(CLAY,state=>state.players[0]!.houseType='stone',false,round),CLAY);assert.deepEqual(schedule(r).map(e=>e.slice(0,2)),round===12?[[13,2],[14,2]]:[]);assert.equal(r.state.players[0]!.resources.clay,10);save(`A120-N4-${round}`,r)}})
  it('A120 N5 hand opponent and rejected renovation cannot leave owner schedule and undo resets flag',()=>{const hand=renovation(setup(CLAY,undefined,false,14));assert.deepEqual(schedule(hand),[]);const otherS=setup(CLAY,undefined,true,14);turn(otherS,0,'grain-seeds');const other=renovation(otherS,1);assert.deepEqual(schedule(other),[]);const poor=setup(CLAY,state=>state.players[0]!.resources.reed=0);assertRejectedUnchanged(poor,()=>poor.takeAction(0,'house-redevelopment'));assert.deepEqual(schedule(poor.getState()),[]);const s=setup(CLAY);const first=renovation(s);const undone=ok(s.undoAction());assert.deepEqual(schedule(undone),[]);assert.equal(undone.state.players[0]!.houseType,'wood');const retry=renovation(s);assert.equal(schedule(retry).length,5);save('A120-N5',{hand,other,first,undone,retry})})
})
