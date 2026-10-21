import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B121_Geologist'
import assert from 'node:assert/strict'
import { createWorkSession } from './_helpers/session-fixtures'
import * as audit27Collection from './_helpers/audit/ae-negative-27-collection'

const CARD_ID = 'B121_Geologist'
const FIXED_HANDS = [
  { occupation: 'A116_WoodCutter', minor: 'A004_Baseboards' },
  { occupation: 'B116_Shoreforester', minor: 'B003_Moonshine' },
  { occupation: 'C109_SchnappsDistiller', minor: 'C004_WritingBoards' },
  { occupation: 'E113_Godmother', minor: 'E007_Pumpernickel' },
]

describe('B121_Geologist session', () => {
  const setup = (playerCount: 2 | 3 | 4 = 2) => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, playerCount)
    state.players.forEach((player, index) => {
      player.occupationHand = [FIXED_HANDS[index]!.occupation]
      player.minorHand = [FIXED_HANDS[index]!.minor]
    })
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    setWorkersAtHome(state, player, 2)
    state.players.forEach((p) => (p.workersAvailable = 2))

    // Pre-seed accumulation on relevant spaces
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 3
    const reed = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (reed) reed.resources.reed = 1
    const clay = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clay) clay.resources.clay = 2

    session.loadState(state)
    return session
  }

  it('B121 S1: Forest grants its accumulation and one extra clay', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const woodBefore = session.getState().state.players[0]!.resources.wood
    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 1)
    expect(after.resources.wood).toBe(woodBefore + 3)
  })

  it('B121 S2: Reed Bank grants its accumulation and one extra clay', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const reedBefore = session.getState().state.players[0]!.resources.reed
    const resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 1)
    expect(after.resources.reed).toBe(reedBefore + 1)
  })

  it('B121 S4: Clay Pit grants no extra clay with two players', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    // accumulates 2 clay but no geologist bonus at 2 players
    expect(after.resources.clay).toBe(before + 2)
  })

  it('B121 S3: Clay Pit grants one extra clay with three players', () => {
    const session = setup(3)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.clay).toBe(before + 2 + 1)
  })

  it('B121 S5: unrelated and opponent actions grant the owner no clay', () => {
    const session = setup(2)
    const before = session.getState().state.players[0]!.resources.clay
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(before)

    const state = session.getState().state
    state.currentPlayerIndex = 1
    session.loadState(state)
    const opponent = session.takeAction(1, 'forest')
    expect(opponent.ok).toBe(true)
    expect(opponent.state.players[0]!.resources.clay).toBe(before)
  })
})

describe('ae-negative-27-collection', () => {
  const { GEO, sessions, save, ok, ready, finish, make } = audit27Collection
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B121 N1 actual own Forest and Reed Bank take full pile and exactly one extra clay in two players',()=>{for(const[space,kind,count]of[['forest','wood',3],['reed-bank','reed',2]]as const){const s=make(GEO),pending=ok(s.takeAction(0,space)),r=finish(s,pending,false);assert.equal(r.state.players[0]!.resources[kind],count);assert.equal(r.state.players[0]!.resources.clay,1);assert.equal(r.state.players[1]!.resources.clay,0);assert.equal(r.state.actionSpaces.find(a=>a.id===space)!.resources[kind]??0,0);save(`B121-N1-${space}`,{pending,r})}})
  it('B121 N2 actual Clay Pit in two players grants only normal clay and hand or opponent Forest never grants owner extra clay',()=>{const s=make(GEO),r=finish(s,ok(s.takeAction(0,'clay-pit')),false);assert.equal(r.state.players[0]!.resources.clay,3);save('B121-N2-clay',r);for(const mode of['hand','opponent']){const ss=make(GEO,mode!=='hand');if(mode==='opponent'){finish(ss,ok(ss.takeAction(0,'grain-seeds')),false);ready(ss)}const actor=mode==='opponent'?1:0,pending=ok(ss.takeAction(actor,'forest')),end=finish(ss,pending,false);assert.equal(end.state.players[0]!.resources.clay,0);save(`B121-N2-${mode}`,{pending,end})}})
  it('B121 N3 printed three player Clay Pit branch gives exactly one additional clay with legal matching player count',()=>{const s=createWorkSession({seed:4242,options:{playerCount:3},configure(state){state.round=8;for(const p of state.players){p.minorHand=['__test_placeholder__'];p.occupationHand=['__test_placeholder__'];Object.assign(p.resources,{food:100,wood:0,clay:0,reed:0,stone:0})}state.players[0]!.occupationPlayed=[GEO];state.actionSpaces.find(a=>a.id==='clay-pit')!.resources.clay=3}});sessions.push(s);const pending=ok(s.takeAction(0,'clay-pit')),r=finish(s,pending,false);assert.equal(r.state.players.length,3);assert.equal(r.state.players[0]!.resources.clay,4);assert.equal(r.state.players[1]!.resources.clay,0);save('B121-N3',{pending,r})})
  it('B121 N4 entire Forest undo restores clay wood original pile workers and allows exactly one replay bonus',()=>{const s=make(GEO),before=ok(s.getState()),r=finish(s,ok(s.takeAction(0,'forest')),false),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,0);assert.equal(undone.state.players[0]!.resources.wood,0);assert.deepEqual(undone.state.actionSpaces,before.state.actionSpaces);assert.deepEqual(undone.state.players[0]!.workers,before.state.players[0]!.workers);const retry=finish(s,ok(s.takeAction(0,'forest')),false);assert.equal(retry.state.players[0]!.resources.clay,1);save('B121-N4',{before,r,undone,retry})})
})

describe('B121 before timing (#1321)', () => {
  const sessions: GameSession[] = []
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  const HUT = 'A042_ForestLakeHut'
  const options = (r: SessionResponse) => r.interaction.stateId === 'wait' ? r.interaction.request.options ?? [] : []
  // Equipper is a 3+ player card; three players is the smallest game where the same Forest use has an immediate minor action.
  const equipperForest = (geologist: boolean) => {
    const session = createWorkSession({ seed: 1321, options: { playerCount: 3 }, configure: state => {
      for (const player of state.players) {
        player.minorPlayed = []
        player.occupationPlayed = []
        for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
        setWorkersAtHome(state, player, 2)
      }
      for (const space of state.actionSpaces) space.takenBy = []
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
      const owner = state.players[0]!
      owner.occupationPlayed = geologist ? ['B131_Equipper', CARD_ID] : ['B131_Equipper']
      owner.minorHand = [HUT]
      owner.resources.clay = 1
    } })
    sessions.push(session)
    return session
  }

  it('pays its clay before the Forest collects, so the immediate Equipper minor action can build Forest Lake Hut', () => {
    const session = equipperForest(true)
    let r = session.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 2 })
    expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard, JSON.stringify(r.interaction)).toBe('B131_Equipper')
    const enter = options(r).find(o => o.value !== '__skip__' && !o.disabled)
    expect(enter).toBeDefined()
    r = session.resolveChoice(0, enter!.value)
    if (r.interaction.stateId === 'wait' && options(r).some(o => o.value === HUT)) r = session.resolveChoice(0, HUT)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.minorPlayed).toEqual([HUT])
    // Forest Lake Hut arrives after this Forest use's before window, so it adds no food now.
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 0, food: 0 })
    expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('confirm-next-player')
    const played = r.state.events.find(e => e.type === 'card.played' && e.cardId === HUT)
    expect(played?.type === 'card.played' && played.payment?.resources).toEqual({ clay: 2 })
    const clay = r.state.events.findIndex(e => e.type === 'resource.moved' && e.sourceCardId === CARD_ID)
    const host = r.state.events.findIndex(e => e.type === 'resource.moved' && e.sourceCardId === undefined && e.from.kind === 'actionSpace')
    expect(clay).toBeGreaterThanOrEqual(0)
    expect(clay).toBeLessThan(host)
    expect(host).toBeLessThan(r.state.events.indexOf(played!))
    expect(r.state.events.filter(e => e.type === 'resource.moved' && e.sourceCardId === HUT)).toEqual([])
  })

  it('without Geologist the same Forest use cannot afford Forest Lake Hut', () => {
    const session = equipperForest(false)
    const r = session.takeAction(0, 'forest')
    expect(r.ok, r.error).toBe(true)
    expect(options(r).some(o => o.value === HUT && !o.disabled)).toBe(false)
    expect(r.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 1 })
    expect(r.state.players[0]!.minorHand).toEqual([HUT])
  })
})
