import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit42Resources from './_helpers/audit/ae-negative-42-resources'

const CARD_ID = 'E077_Mattock'
const sessions: GameSession[] = []

// #1063: a local migration to the existing after listener; no new card infrastructure.
// Session coverage is required because calling the handler directly hid the broken
// place-farmer dispatch. Resource Market is a four-player-only action space.
const setup = (played = true) => {
  const session = createWorkSession({
    seed: 1063,
    options: { playerCount: 4 },
    configure: (state) => {
      for (const player of state.players) {
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        Object.assign(player.resources, {
          wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
          vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
        })
      }
      if (played) state.players[0]!.minorPlayed = [CARD_ID]
    },
  })
  sessions.push(session)
  expect(session.state.players).toHaveLength(4)
  expect(session.state.players.every((player) =>
    player.minorHand[0] === '__test_placeholder__'
    && player.occupationHand[0] === '__test_placeholder__')).toBe(true)
  return session
}

const cardLogs = (response: SessionResponse, key: string) => response.state.log.filter((entry) =>
  entry.key === key && entry.params?.cardId === CARD_ID)

afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

describe('E077 Mattock resource-market placement', () => {
  it('grants exactly one clay with the market goods, and restores it on undo and redo', () => {
    const session = setup()
    const before = session.getState()
    const resourcesBefore = { ...before.state.players[0]!.resources }
    const logsBefore = structuredClone(before.state.log)
    const scoresBefore = structuredClone(before.scores)

    const expectMarket = (response: SessionResponse) => {
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1, food: 1, clay: 1 })
      expect(response.state.players.slice(1).map((player) => player.resources.clay)).toEqual([0, 0, 0])
      expect(response.state.actionSpaces.find((space) => space.id === 'resource-market-4')!.takenBy)
        .toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id })])
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
      expect(cardLogs(response, 'log.cardEffectGain')).toEqual([
        expect.objectContaining({ params: expect.objectContaining({ gain: { clay: 1 } }) }),
      ])
      expect(cardLogs(response, 'log.cardTriggered')).toHaveLength(1)
      expect(response.scores).toEqual(scoresBefore)
    }

    expectMarket(session.takeAction(0, 'resource-market-4'))
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toEqual(resourcesBefore)
    expect(undone.state.actionSpaces.find((space) => space.id === 'resource-market-4')!.takenBy).toEqual([])
    expect(undone.interaction.stateId).toBe('idle')
    expect(undone.state.log).toEqual(logsBefore)
    expect(undone.scores).toEqual(scoresBefore)
    expectMarket(session.takeAction(0, 'resource-market-4'))
  })

  it.each([
    { played: false, actor: 0, spaceId: 'resource-market-4' },
    { played: true, actor: 1, spaceId: 'resource-market-4' },
    { played: true, actor: 0, spaceId: 'forest' },
  ])('does not reward a non-triggering placement: $played / $actor / $spaceId', ({ played, actor, spaceId }) => {
    const session = setup(played)
    session.state.currentPlayerIndex = actor
    session.loadState(session.state)
    const scoresBefore = session.getState().scores
    const response = session.takeAction(actor, spaceId)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.every((player) => player.resources.clay === 0)).toBe(true)
    expect(cardLogs(response, 'log.cardEffectGain')).toEqual([])
    expect(cardLogs(response, 'log.cardTriggered')).toEqual([])
    expect(response.scores).toEqual(scoresBefore)
  })
})

describe('ae-negative-42-resources', () => {
  const { sessions, ok, save, setup, finish, select, play, next } = audit42Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E077 N1 actual wood paid Mattock then Reed Bank or Western Quarry grants one clay once',()=>{for(const [space,resource]of [['reed-bank','reed'],['western-quarry','stone']]as const){const s=setup('E077_Mattock',st=>{st.players[0]!.resources.wood=1;st.actionSpaces.find(a=>a.id===space)!.resources[resource]=1},false,14),bought=play(s,'E077_Mattock');assert.equal(bought.state.players[0]!.resources.wood,0);next(s,bought);next(s,finish(s,ok(s.takeAction(1,'grain-seeds'))));const r=finish(s,ok(s.takeAction(0,space)),true);save(`E077-N1-early-${resource}`,{bought,r});assert.equal(r.state.players[0]!.resources.clay,1);assert.equal(r.state.players[0]!.resources[resource],1);const u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.clay,0);save(`E077-N1-${resource}`,{bought,r,u})}})
  it('E077 N2 wood clay food accumulation held card and foreign reed do not grant owner clay',()=>{for(const mode of ['forest','fishing','hand','other']){const actor=mode==='other'?1:0,s=setup('E077_Mattock',st=>{st.currentPlayerIndex=actor},mode!=='hand'),r=finish(s,ok(s.takeAction(actor,['hand','other'].includes(mode)?'reed-bank':mode)),true,'E077_Mattock');assert.equal(r.state.players[0]!.resources.clay,0);save(`E077-N2-${mode}`,r)}})
  it('E077 N3 no wood purchase denies Mattock before a legal free alternative',()=>{const s=setup('E077_Mattock',st=>{st.players[0]!.minorHand.push('E080_RockGarden','C071_Slurry')},false,5),p=select(s,ok(s.takeAction(0,'meeting-place')),o=>o.value.startsWith('action-improvement-')),bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'E077_Mattock')),r=finish(s,select(s,p,o=>o.value==='E080_RockGarden'));assert.ok(r.state.players[0]!.minorHand.includes('E077_Mattock'));assert.equal(r.state.players[0]!.resources.clay,0);save('E077-N3',{p,bad,r})})
})
