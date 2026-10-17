import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/E/E078_SleightofHand'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit42Purchase from './_helpers/audit/ae-negative-42-purchase'

const CARD_ID = 'E078_SleightofHand'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['__test_occupation_1__', '__test_occupation_2__', '__test_occupation_3__']

type BuildingResources = {
  wood: number
  clay: number
  reed: number
  stone: number
  food: number
}

const setup = ({
  occupations = 3, wood = 2, clay = 1, reed = 0, stone = 0, food = 0,
}: Partial<BuildingResources> & { occupations?: number } = {}) => {
  const session = new GameSession(7078, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  Object.assign(player.resources, {
    wood, clay, reed, stone, food, grain: 0, vegetable: 0,
  })
  session.loadState(state)
  return session
}

const resources = (response: SessionResponse): BuildingResources => {
  const stock = response.state.players[0]!.resources
  return {
    wood: stock.wood,
    clay: stock.clay,
    reed: stock.reed,
    stone: stock.stone,
    food: stock.food,
  }
}

const isBatchPrompt = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && response.interaction.request.kind === 'resource-batch-exchange-select'

const playUntilBatchPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let safety = 0; safety < 20; safety += 1) {
    expect(response.ok, response.error).toBe(true)
    if (isBatchPrompt(response)) return response
    if (response.interaction.stateId !== 'wait') break
    const next = response.interaction.request.options?.find((option) =>
      option.value === CARD_ID
      || (option.value !== '__skip__' && option.value !== 'cancel'))
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  throw new Error('resource batch prompt not reached')
}

const commitExchange = (session: GameSession, discard: Record<string, number>, receive: Record<string, number>) =>
  session.commitSelectionChoice(0, { resourceBatchExchange: { discard, receive } })

const expectRejectedWithoutMutation = (
  session: GameSession,
  discard: Record<string, number>,
  receive: Record<string, number>,
  error: string,
) => {
  const before = JSON.parse(JSON.stringify(session.getState()))

  const response = commitExchange(session, discard, receive)

  expect(response.ok).toBe(false)
  expect(response.error).toBe(error)
  expect(JSON.parse(JSON.stringify(session.getState()))).toEqual(before)
  expect(isBatchPrompt(response)).toBe(true)
}

describe('E078 Sleight of Hand parity', () => {
  it('E078 S1: three occupations allow Sleight of Hand to be played for no resources and open its exchange', () => {
    const session = setup()
    const before = resources(session.getState())

    const response = playUntilBatchPrompt(session)

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resources(response)).toEqual(before)
    expect(isBatchPrompt(response)).toBe(true)
  })

  it('E078 S2: two occupations keep Sleight of Hand unavailable', () => {
    const session = setup({ occupations: 2 })

    const response = session.takeAction(0, 'meeting-place')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
  })

  it('E078 S3: a mixed three-resource exchange pays and receives equal quantities', () => {
    const session = setup()
    playUntilBatchPrompt(session)

    const response = commitExchange(
      session,
      { wood: 2, clay: 1 },
      { wood: 1, stone: 2 },
    )

    expect(response.ok, response.error).toBe(true)
    expect(resources(response)).toEqual({ wood: 1, clay: 0, reed: 0, stone: 2, food: 0 })
  })

  it('E078 S4: exchanging zero resources declines the optional exchange without changing resources', () => {
    const session = setup()
    const prompt = playUntilBatchPrompt(session)
    const before = resources(prompt)

    const response = commitExchange(session, {}, {})

    expect(response.ok, response.error).toBe(true)
    expect(resources(response)).toEqual(before)
    expect(isBatchPrompt(response)).toBe(false)
  })

  it('E078 S5: rejects an exchange whose receive total exceeds its discard total and fully rolls back', () => {
    const session = setup()
    playUntilBatchPrompt(session)

    expectRejectedWithoutMutation(
      session,
      { wood: 1 },
      { stone: 2 },
      'resource-batch.error.total-mismatch',
    )
  })

  it('E078 S6: rejects discarding more resources than held and fully rolls back', () => {
    const session = setup()
    playUntilBatchPrompt(session)

    expectRejectedWithoutMutation(
      session,
      { wood: 3 },
      { stone: 3 },
      'resource-batch.error.invalid-discard-wood',
    )
  })

  it('E078 S7: rejects an equal exchange of more than four building resources and fully rolls back', () => {
    const session = setup({ wood: 4, clay: 1 })
    playUntilBatchPrompt(session)

    expectRejectedWithoutMutation(
      session,
      { wood: 4, clay: 1 },
      { stone: 4, reed: 1 },
      'resource-batch.error.too-many',
    )
  })

  it('E078 S8: rejects food as a received non-building resource and fully rolls back', () => {
    const session = setup()
    playUntilBatchPrompt(session)

    expectRejectedWithoutMutation(
      session,
      { wood: 1 },
      { food: 1 },
      'resource-batch.error.invalid-receive-food',
    )
  })

  it('E078 S9: no building resources still allow the card play but skip the exchange prompt', () => {
    const session = setup({ wood: 0, clay: 0, reed: 0, stone: 0 })
    let response = session.takeAction(0, 'meeting-place')
    for (let safety = 0; safety < 20 && !response.state.players[0]!.minorPlayed.includes(CARD_ID); safety += 1) {
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId !== 'wait') break
      const next = response.interaction.request.options?.find((option) =>
        option.value === CARD_ID
        || (option.value !== '__skip__' && option.value !== 'cancel'))
      if (!next) break
      response = session.resolveChoice(response.interaction.playerIndex, next.value)
    }

    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(resources(response)).toEqual({ wood: 0, clay: 0, reed: 0, stone: 0, food: 0 })
    expect(isBatchPrompt(response)).toBe(false)
  })
})

describe('ae-negative-42-purchase', () => {
  const { sessions, ok, save, setup, finish, select, play, occupations, pendingBuy, batch } = audit42Purchase
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E078 N1 actual three occupation purchase exchanges three resources equally and zero exchanges preserve stock',()=>{for(const zero of [false,true]){const s=setup('E078_SleightofHand',st=>{occupations(st);Object.assign(st.players[0]!.resources,{wood:2,clay:1})},false,5),p=pendingBuy(s,'E078_SleightofHand'),r=finish(s,ok(batch(s,zero?{}:{wood:2,clay:1},zero?{}:{wood:1,stone:2})));assert.equal(r.state.players[0]!.resources.wood,zero?2:1);assert.equal(r.state.players[0]!.resources.clay,zero?1:0);assert.equal(r.state.players[0]!.resources.stone,zero?0:2);save(`E078-N1-${zero}`,{p,r})}})
  it('E078 N2 unequal receive total rejects before a legal four resource exchange',()=>{const s=setup('E078_SleightofHand',st=>{occupations(st);st.players[0]!.resources.wood=4},false,5),p=pendingBuy(s,'E078_SleightofHand'),bad=assertRejectedUnchanged(s,()=>batch(s,{wood:1},{stone:2})),r=finish(s,ok(batch(s,{wood:4},{stone:2,clay:2})));assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.stone,2);assert.equal(r.state.players[0]!.resources.clay,2);save('E078-N2',{p,bad,r})})
  it('E078 N3 five resource exchange rejects before legal equal four resource exchange',()=>{const s=setup('E078_SleightofHand',st=>{occupations(st);st.players[0]!.resources.wood=5},false,5),p=pendingBuy(s,'E078_SleightofHand'),bad=assertRejectedUnchanged(s,()=>batch(s,{wood:5},{stone:5})),r=finish(s,ok(batch(s,{wood:4},{stone:4})));assert.equal(r.state.players[0]!.resources.wood,1);assert.equal(r.state.players[0]!.resources.stone,4);save('E078-N3',{p,bad,r})})
  it('E078 N4 a nonbuilding grain resource rejects before legal wood exchange and grain remains untouched',()=>{const s=setup('E078_SleightofHand',st=>{occupations(st);Object.assign(st.players[0]!.resources,{wood:1,grain:1})},false,5),p=pendingBuy(s,'E078_SleightofHand'),bad=assertRejectedUnchanged(s,()=>batch(s,{grain:1},{stone:1})),r=finish(s,ok(batch(s,{wood:1},{stone:1})));assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.stone,1);save('E078-N4',{p,bad,r})})
  it('E078 N5 overstock negative and fractional payments reject unchanged before a legal exchange',()=>{const s=setup('E078_SleightofHand',st=>{occupations(st);st.players[0]!.resources.wood=2},false,5),p=pendingBuy(s,'E078_SleightofHand'),bad=assertRejectedUnchanged(s,()=>batch(s,{wood:3},{stone:3})),negative=assertRejectedUnchanged(s,()=>batch(s,{wood:-1},{stone:-1})),fraction=assertRejectedUnchanged(s,()=>batch(s,{wood:1.5},{stone:1.5})),r=finish(s,ok(batch(s,{wood:2},{stone:2})));assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.stone,2);save('E078-N5',{p,bad,negative,fraction,r})})
  it('E078 N6 two occupations reject card before a free legal alternative and zero stock card grants no resources',()=>{const s=setup('E078_SleightofHand',st=>{occupations(st,2);st.players[0]!.minorHand.push('E080_RockGarden','C071_Slurry')},false,5),p=select(s,ok(s.takeAction(0,'meeting-place')),o=>o.value.startsWith('action-improvement-')),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'E078_SleightofHand')),r=finish(s,select(s,p,o=>o.value==='E080_RockGarden'));assert.equal(r.state.players[0]!.resources.stone,0);const t=setup('E078_SleightofHand',st=>occupations(st),false,5),empty=play(t,'E078_SleightofHand');assert.ok(empty.state.players[0]!.minorPlayed.includes('E078_SleightofHand'));assert.equal(empty.state.players[0]!.resources.stone,0);save('E078-N6',{p,bad,r,empty})})
})
