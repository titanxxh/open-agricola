import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/B/B108_OvenFiringBoy'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit26Baking from './_helpers/audit/ae-negative-26-baking'

const CARD_ID = 'B108_OvenFiringBoy'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, actor = 0, grain = 1, fireplace = true, playerCount = 4,
}: { played?: boolean; actor?: number; grain?: number; fireplace?: boolean; playerCount?: number } = {}) => {
  const session = new GameSession(5508, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.grain = grain
  owner.improvements = fireplace ? ['Major_Fireplace1'] : []
  if (fireplace) {
    state.availableMajorImprovements = state.availableMajorImprovements
      .filter((id) => id !== 'Major_Fireplace1')
  }
  for (const [spaceId, wood] of [['forest', 3], ['grove', 2], ['copse', 1]] as const) {
    const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
    if (space) space.resources.wood = wood
  }
  state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 1
  session.loadState(state)
  return session
}

const play = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const enterBake = (session: GameSession, response: SessionResponse) =>
  resolveTriggerIfPresent(session, response, CARD_ID)

const bakeOnce = (session: GameSession, response: SessionResponse) => {
  response = enterBake(session, response)
  if (response.interaction.stateId === 'wait' && response.interaction.sourceCard === CARD_ID) {
    const accept = response.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind === 'confirm-next-player') return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const fireplace = response.interaction.request.options?.find((option) =>
    option.value === 'Major_Fireplace1' || option.sourceCard === 'Major_Fireplace1')
  expect(fireplace, JSON.stringify(response.interaction)).toBeDefined()
  response = session.resolveChoice(response.interaction.playerIndex, fireplace!.value)
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionBakeBreadCount') {
    const one = response.interaction.request.options?.find((option) =>
      option.value === 'count-Major_Fireplace1-1')
    expect(one, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, one!.value)
  }
  return response
}

describe('B108 Oven Firing Boy parity', () => {
  it('B108 S1: playing Oven Firing Boy through Lessons leaves it in play', () => {
    const response = play(setup({ played: false, playerCount: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  for (const [scenario, spaceId, wood] of [
    ['S2', 'forest', 3],
    ['S3', 'grove', 2],
    ['S4', 'copse', 1],
  ] as const) {
    it(`B108 ${scenario}: its owner using ${spaceId} can bake one grain with a Fireplace`, () => {
      const session = setup()

      const response = bakeOnce(session, session.takeAction(0, spaceId))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood, grain: 0, food: 2 })
    })
  }

  it('B108 S5: declining the Forest bake keeps grain and food unchanged while collecting wood', () => {
    const session = setup()
    const offered = enterBake(session, session.takeAction(0, 'forest'))
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') return
    expect(offered.interaction.request.options?.some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1, food: 0 })
  })

  for (const [scenario, spaceId, expected] of [
    ['S6', 'clay-pit', { clay: 1, grain: 1, food: 0 }],
    ['S7', 'day-laborer', { grain: 1, food: 2 }],
  ] as const) {
    it(`B108 ${scenario}: ${spaceId} does not offer the Oven Firing Boy bake`, () => {
      const response = setup().takeAction(0, spaceId)

      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
        .not.toBe(CARD_ID)
      expect(response.state.players[0]!.resources).toMatchObject(expected)
    })
  }

  it('B108 S8: an opponent using Forest does not give the card owner a bake action', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 0 })
    expect(response.state.players[1]!.resources.wood).toBe(3)
  })
})

describe('ae-negative-26-baking', () => {
  const { OVEN, sessions, save, ok, ready, finish, make, entry } = audit26Baking
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B108 N1 actual Forest gives three wood and optional one grain baking gives exactly five food',()=>{const s=make(),a=entry(s),r=finish(s,a.menu.interaction.stateId==='wait'&&a.menu.interaction.request.kind==='choice'?ok(s.resolveChoice(0,OVEN)):a.menu,false);assert.equal(r.state.players[0]!.resources.wood,3);assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(r.state.players[0]!.resources.food,105);assert.equal(r.state.players[1]!.resources.food,100);assert.ok(r.state.log.some(e=>e.key==='log.bakeBread'));save('B108-N1',{a,r})})
  it('B108 N2 actual Forest optional decline keeps grain and food while no grain or oven cannot bake',()=>{for(const mode of['decline','grain','oven']){const s=make(true,mode==='grain'?0:2,mode!=='oven'),pending=ok(s.takeAction(0,'forest')),r=finish(s,pending,false);assert.equal(r.state.players[0]!.resources.wood,3);assert.equal(r.state.players[0]!.resources.grain,mode==='grain'?0:2);assert.equal(r.state.players[0]!.resources.food,100);save(`B108-N2-${mode}`,{pending,r})}})
  it('B108 N3 hand only unrelated Clay Pit and actual opponent Forest do not bake for owner',()=>{const s=make(false),first=finish(s,ok(s.takeAction(0,'clay-pit')),false);ready(s);const r=finish(s,ok(s.takeAction(1,'forest')),false);assert.equal(r.state.players[0]!.resources.grain,2);assert.equal(r.state.players[0]!.resources.food,100);save('B108-N3-hand',{first,r});const ss=make(),unrelated=finish(ss,ok(ss.takeAction(0,'clay-pit')),false);assert.equal(unrelated.state.players[0]!.resources.grain,2);assert.equal(unrelated.state.players[0]!.resources.food,100);save('B108-N3-unrelated',unrelated)})
  it('B108 N4 over oven limit and unknown provider reject before legal bake and whole Forest undo restores wood grain food',()=>{const s=make(true,2,true,true),a=entry(s),two=assertRejectedUnchanged(s,()=>s.resolveChoice(0,`count-${OVEN}-2`)),missing=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'missing-oven')),r=finish(s,a.menu.interaction.stateId==='wait'&&a.menu.interaction.request.kind==='choice'?ok(s.resolveChoice(0,OVEN)):a.menu,false),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,0);assert.equal(undone.state.players[0]!.resources.grain,2);assert.equal(undone.state.players[0]!.resources.food,100);assert.equal(undone.state.actionSpaces.find(a=>a.id==='forest')!.resources.wood,3);const replay=entry(s),retry=finish(s,replay.menu.interaction.stateId==='wait'&&replay.menu.interaction.request.kind==='choice'?ok(s.resolveChoice(0,OVEN)):replay.menu,false);assert.equal(retry.state.players[0]!.resources.food,105);save('B108-N4',{a,two,missing,r,undone,replay,retry})})
})
