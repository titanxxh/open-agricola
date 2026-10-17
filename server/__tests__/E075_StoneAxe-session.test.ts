import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E075_StoneAxe'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit41Resources from './_helpers/audit/ae-negative-41-resources'

const CARD_ID = 'E075_StoneAxe'
const FILLER = '__test_placeholder__'

const setup = ({
  played = false, occupations = 2, wood = 1, clay = 1, stone = 0, actor = 0,
}: {
  played?: boolean
  occupations?: number
  wood?: number
  clay?: number
  stone?: number
  actor?: number
} = {}) => {
  const session = new GameSession(7075, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.occupationPlayed = Array.from({ length: occupations }, (_, index) => 'STUB_OCC_' + index)
  Object.assign(owner.resources, { wood, clay, stone })
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && options(response).some((option) => option.value === CARD_ID)

const setSpaceResource = (
  session: GameSession,
  spaceId: string,
  resource: 'wood' | 'clay',
  count: number,
) => {
  const state = session.getState().state
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
  space.resources[resource] = count
  session.loadState(state)
}

const stoneAxeOption = (response: SessionResponse) => options(response).find((option) =>
  option.sourceCard === CARD_ID && option.value !== '__skip__')

const acceptStoneAxe = (session: GameSession, response: SessionResponse) => {
  const option = stoneAxeOption(response)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(
    response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0,
    option!.value,
  )
}

describe('E075 Stone Axe parity', () => {
  it('E075 S1: two occupations plus one wood and one clay play Stone Axe', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0 })
  })

  it('E075 S2: one occupation keeps Stone Axe unavailable', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1 })
  })

  it('E075 S3: no wood keeps Stone Axe unavailable despite satisfying its prerequisite', () => {
    const response = enterMinor(setup({ wood: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(1)
  })

  it('E075 S4: no clay keeps Stone Axe unavailable despite satisfying its prerequisite', () => {
    const response = enterMinor(setup({ clay: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('E075 S5: after collecting wood the owner may pay one stone for three additional wood', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1 })
    setSpaceResource(session, 'forest', 'wood', 3)

    const response = acceptStoneAxe(session, session.takeAction(0, 'forest'))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 6 })
  })

  it('E075 S6: the Stone Axe exchange after collecting wood may be declined', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1 })
    setSpaceResource(session, 'forest', 'wood', 3)
    let response = session.takeAction(0, 'forest')
    expect(stoneAxeOption(response)).toBeDefined()

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, wood: 3 })
  })

  it('E075 S7: without a stone OA skips the Stone Axe prompt', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 0 })
    setSpaceResource(session, 'forest', 'wood', 3)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 3 })
    expect(stoneAxeOption(response)).toBeUndefined()
    expect(response.interaction.stateId === 'wait' ? response.interaction.sourceCard : undefined)
      .not.toBe(CARD_ID)
  })

  it('E075 S8: a non-wood accumulation space does not trigger Stone Axe', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1 })
    setSpaceResource(session, 'clay-pit', 'clay', 2)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, stone: 1 })
    expect(stoneAxeOption(response)).toBeUndefined()
  })

  it("E075 S9: an opponent collecting wood does not trigger the owner's Stone Axe", () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1, actor: 1 })
    const state = session.getState().state
    state.players[1]!.resources.wood = 0
    state.players[1]!.resources.stone = 1
    session.loadState(state)
    setSpaceResource(session, 'forest', 'wood', 3)

    const response = session.takeAction(1, 'forest')

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 1 })
    expect(response.state.players[1]!.resources.wood).toBe(3)
    expect(stoneAxeOption(response)).toBeUndefined()
  })

  it('E075 S10: an empty wood accumulation space is rejected despite a supplied stone', () => {
    const session = setup({ played: true, wood: 0, clay: 0, stone: 1 })
    setSpaceResource(session, 'forest', 'wood', 0)
    const before = session.getState()

    const response = session.takeAction(0, 'forest')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 1, wood: 0 })
    session.dispose()
  })

  it('E075 S11: Stone Axe contributes its printed one point at scoring', () => {
    const response = setup({ played: true, wood: 0, clay: 0 }).getState()

    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })
})

describe('ae-negative-41-resources', () => {
  const { sessions, ok, save, setup, finish, play, next } = audit41Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E075 N1 actual purchase pays wood clay and later Forest exchange pays one stone for exactly three extra wood once', () => {
    const card = 'E075_StoneAxe', s = setup(card, st => { const p=st.players[0]!;p.occupationPlayed=['A100_Curator','A110_Roughcaster'];Object.assign(p.resources,{wood:1,clay:1,stone:2});st.actionSpaces.find(a=>a.id==='forest')!.resources.wood=3 },false,5)
    const bought=play(s,card);assert.equal(bought.state.players[0]!.resources.wood,0);assert.equal(bought.state.players[0]!.resources.clay,0)
    next(s,bought); const other=finish(s,ok(s.takeAction(1,'reed-bank')));next(s,other)
    const r=finish(s,ok(s.takeAction(0,'forest')),true);assert.equal(r.state.players[0]!.resources.wood,6);assert.equal(r.state.players[0]!.resources.stone,1)
    const bad=assertRejectedUnchanged(s,()=>s.takeAnytimeAction(0,'E75-stone-axe-anytime'));assert.equal(s.state.players[0]!.resources.wood,6);save('E075-N1',{bought,r,bad})
  })
  it('E075 N2 zero stone and explicit decline keep ordinary wood without an extra gain',()=>{
   for(const mode of ['stone','decline']){const s=setup('E075_StoneAxe',st=>{st.players[0]!.resources.stone=mode==='stone'?0:1;st.actionSpaces.find(a=>a.id==='forest')!.resources.wood=3}),r=finish(s,ok(s.takeAction(0,'forest')),mode==='stone');assert.equal(r.state.players[0]!.resources.wood,3);assert.equal(r.state.players[0]!.resources.stone,mode==='stone'?0:1);save(`E075-N2-${mode}`,r)}
  })
  it('E075 N3 card in hand foreign Forest and a nonwood space cannot consume owner stone or give extra wood',()=>{
   for(const mode of ['hand','other','nonwood']){const actor=mode==='other'?1:0,s=setup('E075_StoneAxe',st=>{st.currentPlayerIndex=actor;st.players[0]!.resources.stone=1;st.actionSpaces.find(a=>a.id==='forest')!.resources.wood=3},mode!=='hand'),r=finish(s,ok(s.takeAction(actor,mode==='nonwood'?'reed-bank':'forest')),true,'E075_StoneAxe');assert.equal(r.state.players[0]!.resources.stone,1);assert.equal(r.state.players[0]!.resources.wood,mode==='hand'?3:0);save(`E075-N3-${mode}`,r)}
  })
  it('E075 N4 whole action undo restores paid stone and original wood pile before exactly one successful retry',()=>{
   const s=setup('E075_StoneAxe',st=>{st.players[0]!.resources.stone=1;st.actionSpaces.find(a=>a.id==='forest')!.resources.wood=3}),r=finish(s,ok(s.takeAction(0,'forest')),true),u=ok(s.undoAction());assert.equal(u.state.players[0]!.resources.stone,1);assert.equal(u.state.players[0]!.resources.wood,0);assert.equal(u.state.actionSpaces.find(a=>a.id==='forest')!.resources.wood,3);const retry=finish(s,ok(s.takeAction(0,'forest')),true);assert.equal(retry.state.players[0]!.resources.wood,6);assert.equal(retry.state.players[0]!.resources.stone,0);save('E075-N4',{r,u,retry})
  })
})
