import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C130_OutskirtsDirector'
import assert from 'node:assert/strict'
import * as audit51Family from './_helpers/audit/ae-negative-51-family'

const CARD_ID = 'C130_OutskirtsDirector'
const FILLER = '__test_placeholder__'

const setup = ({ played = true, workersAtHome = 2 } = {}) => {
  const session = new GameSession(6130, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  setWorkersAtHome(state, owner, workersAtHome)
  const grove = state.actionSpaces.find((space) => space.id === 'grove')!
  const hollow = state.actionSpaces.find((space) => space.id === 'hollow')!
  grove.resources = { ...grove.resources, wood: 3, reed: 0 }
  hollow.resources = { ...hollow.resources, clay: 2, reed: 0 }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const resolveCardTrigger = (session: GameSession, response: SessionResponse) =>
  resolveTriggerIfPresent(session, response, CARD_ID)

const chooseNonSkip = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = options(response).find((candidate) => candidate.value !== '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const acceptCard = (session: GameSession, response: SessionResponse) =>
  chooseNonSkip(session, resolveCardTrigger(session, response))

const resourceOn = (response: SessionResponse, spaceId: string, resource: 'reed') =>
  response.state.actionSpaces.find((space) => space.id === spaceId)?.resources[resource] ?? 0

const workersOn = (response: SessionResponse, spaceId: string) => {
  const playerId = response.state.players[0]!.id
  return response.state.actionSpaces.find((space) => space.id === spaceId)?.takenBy
    .filter((worker) => worker.playerId === playerId).length ?? 0
}

describe('C130 Outskirts Director parity', () => {
  it('C130 S1: Outskirts Director is played as the first occupation in a three-player game', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(3)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C130 S2: after Grove, accepting adds two reed to Hollow and permits another placement', () => {
    const session = setup()
    let response = acceptCard(session, session.takeAction(0, 'grove'))

    expect(resourceOn(response, 'hollow', 'reed')).toBe(2)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    response = chooseNonSkip(session, response)
    expect(options(response).some((option) => option.value === 'day-laborer')).toBe(true)
    response = session.resolveChoice(response.interaction.playerIndex, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 22 })
    expect(workersOn(response, 'grove')).toBe(1)
    expect(workersOn(response, 'day-laborer')).toBe(1)
  })

  it('C130 S3: after Hollow, accepting adds two reed to Grove while the extra placement may be declined', () => {
    const session = setup()
    let response = acceptCard(session, session.takeAction(0, 'hollow'))

    expect(resourceOn(response, 'grove', 'reed')).toBe(2)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(response.state.players[0]!.resources.clay).toBe(2)
    expect(workersOn(response, 'hollow')).toBe(1)
    expect(workersOn(response, 'day-laborer')).toBe(0)
  })

  it('C130 S4: declining the entire effect places no reed', () => {
    const session = setup()
    let response = resolveCardTrigger(session, session.takeAction(0, 'grove'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId === 'wait') {
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }

    expect(resourceOn(response, 'hollow', 'reed')).toBe(0)
    expect(workersOn(response, 'grove')).toBe(1)
    expect(response.state.actionSpaces.flatMap((space) => space.takenBy)
      .filter((worker) => worker.playerId === response.state.players[0]!.id)).toHaveLength(1)
  })

  it('C130 S5: a non-Grove, non-Hollow placement does not trigger Outskirts Director', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(resourceOn(response, 'grove', 'reed')).toBe(0)
    expect(resourceOn(response, 'hollow', 'reed')).toBe(0)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('C130 S6: with no person left, accepting still adds two reed to the paired space', () => {
    const session = setup({ workersAtHome: 1 })
    const response = acceptCard(session, session.takeAction(0, 'grove'))

    expect(resourceOn(response, 'hollow', 'reed')).toBe(2)
    expect(workersOn(response, 'grove')).toBe(1)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('C130 S7: the extra Hollow placement can trigger Outskirts Director a second time', () => {
    const session = setup()
    let response = acceptCard(session, session.takeAction(0, 'grove'))
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    response = chooseNonSkip(session, response)
    response = session.resolveChoice(response.interaction.playerIndex, 'hollow')
    response = acceptCard(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2 })
    expect(resourceOn(response, 'grove', 'reed')).toBe(2)
    expect(response.state.players[0]!.resources.reed).toBe(2)
    expect(resourceOn(response, 'hollow', 'reed')).toBe(0)
    expect(workersOn(response, 'grove')).toBe(1)
    expect(workersOn(response, 'hollow')).toBe(1)
  })
})

describe('ae-negative-51-family', () => {
  const { sessions, ok, save, setup, choose, finish, next, offer, take } = audit51Family
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('C130 N1 genuine Grove Hollow chain repeats deposit and extra placement with no person left after second use', () => { const s = setup('C130_OutskirtsDirector'); let r = offer(s, take(s, 'grove'), 'C130_OutskirtsDirector'); r = choose(s, r, o => !['__skip__', '__pass__'].includes(o.value)); assert.equal(r.state.actionSpaces.find(a => a.id === 'hollow')!.resources.reed, 2); r = choose(s, r, o => !['__skip__', '__pass__'].includes(o.value)); r = ok(s.resolveChoice(0, 'hollow')); r = offer(s, r, 'C130_OutskirtsDirector'); r = choose(s, r, o => !['__skip__', '__pass__'].includes(o.value)); r = finish(s, r); assert.equal(r.state.players[0]!.resources.wood, 3); assert.equal(r.state.players[0]!.resources.clay, 2); assert.equal(r.state.players[0]!.resources.reed, 2); assert.equal(r.state.actionSpaces.find(a => a.id === 'grove')!.resources.reed, 2); assert.equal(r.state.actionSpaces.find(a => a.id === 'hollow')!.resources.reed, 0); assert.equal(r.state.actionSpaces.flatMap(a => a.takenBy).filter(w => w.playerId === r.state.players[0]!.id).length, 2); save('C130-N1', r); })
  it('C130 N2 decline reverse-space extra decline unrelated and real opponent use cannot chain owner placements', () => {
    for (const mode of ['decline', 'reverse', 'unrelated', 'opponent']) {
      const s = setup('C130_OutskirtsDirector')
      let r = take(s, mode === 'decline' ? 'grove' : mode === 'reverse' ? 'hollow' : 'forest')
      if (mode === 'reverse') {
        r = offer(s, r, 'C130_OutskirtsDirector')
        r = choose(s, r, o => !['__skip__', '__pass__'].includes(o.value))
      }
      r = finish(s, r)
      if (mode === 'opponent') {
        next(s)
        r = finish(s, take(s, 'grove'))
      }
      assert.equal(r.state.actionSpaces.find(a => a.id === 'grove')!.resources.reed, mode === 'reverse' ? 2 : 0)
      assert.equal(r.state.actionSpaces.find(a => a.id === 'hollow')!.resources.reed, 0)
      assert.equal(r.state.actionSpaces.flatMap(a => a.takenBy).filter(w => w.playerId === r.state.players[0]!.id).length, 1)
      save(`C130-N2-${mode}`, r)
    }
  })
})
