import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { AnytimeAction } from '../../shared/contract/types'
import '../../shared/cards/B/B069_PottersMarket'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit21Potters from './_helpers/audit/ae-negative-21-potters'

const CARD_ID = 'B069_PottersMarket'

const ANYTIME_ID = 'B69-potters-market-anytime'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, round = 5, clay = 0, food = 0, wood = 0 } = {}) => {
  const session = new GameSession(6069, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.futureMeeples = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources = {
    ...owner.resources,
    wood, clay, reed: 0, stone: 0, food, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, begging: 0,
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = options(response).find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId === 'wait') {
    const card = options(response).find((option) => option.value === CARD_ID)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }
  return response
}

const enterActiveInteraction = (session: GameSession) => {
  const response = session.takeAction(0, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const anytimeIds = (response: SessionResponse) =>
  response.interaction.anytimeActions.map((action: AnytimeAction) => action.id)

const pendingVegetables = (response: SessionResponse) =>
  response.state.futureMeeples.filter((entry) => entry.cardId === CARD_ID && entry.playerId === response.state.players[0]!.id)
    .reduce((total, entry) => total + (entry.resources.vegetable ?? 0), 0)

describe("B069 Potter's Market parity", () => {
  it("B069 S1: paying two wood plays Potter's Market for one point", () => {
    const response = playMinor(setup({ played: false, wood: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    const entry = response.scores?.[0]?.categories.find((category) => category.key === 'cards')
      ?.entries.find((candidate) => 'cardId' in candidate && candidate.cardId === CARD_ID)
    expect(entry?.score).toBe(1)
  })

  it('B069 S2: paying three clay and two food at any time schedules one vegetable for each of the next two rounds', () => {
    const session = setup({ clay: 3, food: 2 })
    const active = enterActiveInteraction(session)
    expect(anytimeIds(active)).toContain(ANYTIME_ID)

    const response = session.takeAnytimeAction(0, ANYTIME_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, food: 0, vegetable: 0 })
    expect(pendingVegetables(response)).toBe(2)
  })

  it("B069 S3: Potter's Market is unavailable when either clay or food is insufficient", () => {
    for (const resources of [{ clay: 2, food: 2 }, { clay: 3, food: 1 }]) {
      const response = enterActiveInteraction(setup(resources))

      expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
      expect(pendingVegetables(response)).toBe(0)
    }
  })

  it("B069 S4: the first Potter's Market vegetable is received at the start of the next round", () => {
    const session = setup({ clay: 3, food: 22 })
    enterActiveInteraction(session)
    const scheduled = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(scheduled.ok, scheduled.error).toBe(true)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(pendingVegetables(response)).toBe(1)
  })

  it("B069 S5: OA hides Potter's Market in round fourteen and preserves the payment resources", () => {
    const response = enterActiveInteraction(setup({ round: 14, clay: 3, food: 2 }))

    expect(anytimeIds(response)).not.toContain(ANYTIME_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 3, food: 2, vegetable: 0 })
    expect(pendingVegetables(response)).toBe(0)
  })
})

describe('ae-negative-21-potters', () => {
  const { CARD, sessions, save, ok, setup, finish, buy, reach, ANYTIME, queue, loaded, active, use } = audit21Potters
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B069 N1 real two wood purchase gains no vegetable schedules nothing and whole undo restores cost',()=>{const s=setup(CARD,5,state=>state.players[0]!.resources.wood=2),{pending,r}=buy(s,CARD);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.vegetable,0);assert.deepEqual(queue(r),[]);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,2);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));const retry=buy(s,CARD).r;assert.deepEqual(queue(retry),[]);save('B069-N1',{pending,r,undone,retry})})
  it('B069 N2 recorded current three clay two food boundary pays once and insufficient resources or hand exclude anytime',()=>{const s=loaded(3,2),pending=active(s),r=use(s);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[0]!.resources.food,0);assert.equal(r.state.players[0]!.resources.vegetable,0);assert.deepEqual(queue(r),[{round:6,resources:{vegetable:1}},{round:7,resources:{vegetable:1}}]);for(const[clay,food,played]of[[2,2,true],[3,1,true],[3,2,false]]as const){const t=loaded(clay,food,played),before=active(t);assert.ok(!before.interaction.anytimeActions.some(a=>a.id===ANYTIME));assertRejectedUnchanged(t,()=>t.takeAnytimeAction(0,ANYTIME));assert.deepEqual(queue(t.getState()),[])}save('B069-N2',{pending,r,ruleLimit:'Frozen CSV four clay conflicts with both current implementations three; cost oracle deferred'})})
  it('B069 N3 two real current anytime payments stack independent future vegetables and wrong actor cannot add another',()=>{const s=loaded(6,4),pending=active(s),one=use(s);assertRejectedUnchanged(s,()=>s.takeAnytimeAction(1,ANYTIME));const two=use(s);assert.equal(two.state.players[0]!.resources.clay,0);assert.equal(two.state.players[0]!.resources.food,0);assert.equal(queue(two).reduce((n,x)=>n+(x.resources.vegetable??0),0),4);assert.equal(two.state.players[1]!.resources.vegetable,0);save('B069-N3',{pending,one,two})})
  it('B069 N4 actual active payment and natural two round starts deliver vegetables only at exact due rounds',()=>{const s=loaded(3),c=loaded(3,100,false),pending=active(s),cpending=active(c);use(s);finish(s,s.getState());finish(c,cpending);const six=reach(s,6),csix=reach(c,6),seven=reach(s,7),cseven=reach(c,7),eight=reach(s,8),ceight=reach(c,8);assert.equal(six.state.players[0]!.resources.vegetable,csix.state.players[0]!.resources.vegetable+1);assert.equal(seven.state.players[0]!.resources.vegetable,cseven.state.players[0]!.resources.vegetable+2);assert.equal(eight.state.players[0]!.resources.vegetable,ceight.state.players[0]!.resources.vegetable+2);assert.deepEqual(queue(eight),[]);assert.equal(eight.state.players[1]!.resources.vegetable,ceight.state.players[1]!.resources.vegetable);save('B069-N4',{pending,cpending,six,csix,seven,cseven,eight,ceight})})
  it('B069 N5 late round thirteen schedules only reachable fourteen and recorded final round behavior preserves OA resources',()=>{const s=loaded(3,2,true,13),pending=active(s),r=use(s);assert.deepEqual(queue(r),[{round:14,resources:{vegetable:1}}]);const t=loaded(3,2,true,14),last=active(t);assert.ok(!last.interaction.anytimeActions.some(a=>a.id===ANYTIME));assertRejectedUnchanged(t,()=>t.takeAnytimeAction(0,ANYTIME));assert.equal(t.getState().state.players[0]!.resources.clay,3);assert.equal(t.getState().state.players[0]!.resources.food,2);save('B069-N5',{pending,r,last,ruleLimit:'Final round availability differs historically; independent ruling deferred'})})
})
