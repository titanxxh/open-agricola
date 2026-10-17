import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { getStableCountForCards } from '../../shared/domain/stables'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/B/B085_FarmHand'
import '../../shared/cards/E/E114_ShedBuilder'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit49Farm from './_helpers/audit/ae-negative-49-farm'

const CARD_ID = 'E114_ShedBuilder'
const FARM_HAND_ID = 'B085_FarmHand'
const FILLER = '__test_placeholder__'
const PRIOR_STABLES = [
  { row: 0, col: 2 },
  { row: 0, col: 3 },
  { row: 0, col: 4 },
  { row: 1, col: 2 },
]

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, priorStables = 0, actor = 0, farmHand = false,
}: {
  played?: boolean
  priorStables?: number
  actor?: number
  farmHand?: boolean
} = {}) => {
  const session = new GameSession(7114, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.stableTiles = []
    Object.assign(player.resources, {
      wood: index === actor ? 10 : 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  const builder = state.players[actor]!
  builder.stableTiles = PRIOR_STABLES.slice(0, priorStables)
  if (farmHand) {
    builder.occupationPlayed.push(FARM_HAND_ID)
    builder.cardStates[FARM_HAND_ID] = {
      flagged: true,
      extraData: { position: { row: 2, col: 4 } },
    }
  }
  session.loadState(state)
  return session
}

const settleShedBuilder = (session: GameSession, initial: SessionResponse) => {
  let response = initial
  for (let step = 0; step < 6 && response.interaction.stateId === 'wait'; step += 1) {
    if (response.interaction.request.kind === 'confirm-next-player'
      || response.interaction.request.kind === 'confirm-player-switch') break
    const choice = optionsOf(response).find((option) =>
      (option.sourceCard === CARD_ID || option.value === CARD_ID)
        && option.value !== '__skip__')
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
  return response
}

const playShedBuilder = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId === 'wait'
    && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    const card = optionsOf(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, card!.value)
  }
  return settleShedBuilder(session, response)
}

const buildStables = (session: GameSession, actor: number, count: number) => {
  let response = session.takeAction(actor, 'farm-expansion')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind !== 'farm-select') {
    const stableMode = optionsOf(response).find((option) =>
      option.labelKey === 'actions.stables.name')
    expect(stableMode, JSON.stringify(response.interaction, null, 2)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, stableMode!.value)
  }
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.request.farm.farmType).toBe('stable')
  if (response.interaction.request.farm.farmType !== 'stable') return response
  const stables = response.interaction.request.farm.selectableTiles.slice(0, count)
  expect(stables).toHaveLength(count)
  response = session.commitSelectionChoice(actor, { stables })
  return settleShedBuilder(session, response)
}

describe('E114 Shed Builder parity', () => {
  it('E114 S1: playing Shed Builder gives no rewards for stables already built', () => {
    const response = playShedBuilder(setup({ played: false, priorStables: 2 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })

  for (const { scenario, priorStables, expected } of [
    { scenario: 'S2', priorStables: 0, expected: { grain: 1, vegetable: 0 } },
    { scenario: 'S3', priorStables: 1, expected: { grain: 1, vegetable: 0 } },
    { scenario: 'S4', priorStables: 2, expected: { grain: 0, vegetable: 1 } },
    { scenario: 'S5', priorStables: 3, expected: { grain: 0, vegetable: 1 } },
  ]) {
    it(`E114 ${scenario}: building stable ${priorStables + 1} grants its ordinal crop`, () => {
      const session = setup({ priorStables })
      const response = buildStables(session, 0, 1)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject(expected)
      expect(session.withCtx(() => getStableCountForCards(response.state.players[0]!))).toBe(priorStables + 1)
    })
  }

  it('E114 S6: building the second and third stables together gains one grain and one vegetable', () => {
    const session = setup({ priorStables: 1 })
    const response = buildStables(session, 0, 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
    expect(session.withCtx(() => getStableCountForCards(response.state.players[0]!))).toBe(3)
  })

  it('E114 S7: a built Farm Hand stable counts when locating the next stable ordinal', () => {
    const session = setup({ priorStables: 1, farmHand: true })
    const response = buildStables(session, 0, 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 1 })
    expect(session.withCtx(() => getStableCountForCards(response.state.players[0]!))).toBe(3)
  })

  it('E114 S8: an opponent building a stable grants the Shed Builder owner no crops', () => {
    const session = setup({ actor: 1 })
    const response = buildStables(session, 1, 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
  })
})

describe('ae-negative-49-farm', () => {
  const { SHED, sessions, save, ok, make, finish, lesson, ready, action, STABLES, shed, stablePending, buildStable } = audit49Farm
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E114 N1 actual purchase never rewards already built stables and the four real stable ordinals give exactly grain grain vegetable vegetable',()=>{const bought=lesson(shed(2,false),SHED);assert.equal(bought.state.players[0]!.resources.grain,0);assert.equal(bought.state.players[0]!.resources.vegetable,0);for(const[prior,grain,vegetable]of[[0,1,0],[1,1,0],[2,0,1],[3,0,1]] as const){const r=buildStable(shed(prior));assert.equal(r.state.players[0]!.resources.grain,grain);assert.equal(r.state.players[0]!.resources.vegetable,vegetable);assert.equal(r.state.players[0]!.stableTiles.length,prior+1);assert.equal(r.state.players[0]!.resources.wood,6);save(`E114-N1-${prior}`,{bought,r})}})
  it('E114 N2 combined construction pays for every real stable and crosses the second and third ordinal exactly once',()=>{for(const[prior,count,grain,vegetable]of[[0,4,2,2],[1,2,1,1]] as const){const r=buildStable(shed(prior),count);assert.equal(r.state.players[0]!.resources.grain,grain);assert.equal(r.state.players[0]!.resources.vegetable,vegetable);assert.equal(r.state.players[0]!.resources.wood,prior===0?0:4);assert.equal(r.state.players[0]!.stableTiles.length,prior+count);save(`E114-N2-${prior}`,r)}})
  it('E114 N3 occupied farm tile insufficient wood finite fifth stable hand card and actual opponent construction never grant phantom crops',()=>{const s=shed(),pending=stablePending(s),bad=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{stables:[{row:1,col:0}]})),r=finish(s,ok(s.commitSelectionChoice(0,{stables:[STABLES[0]!]})));assert.equal(r.state.players[0]!.resources.grain,1);for(const[prior,wood]of[[0,1],[4,8]]){const t=shed(prior,true,wood),rejected=assertRejectedUnchanged(t,()=>t.takeAction(0,'farm-expansion')),legal=ok(t.takeAction(0,'grain-seeds'));assert.equal(legal.state.players[0]!.resources.vegetable,0);assert.equal(legal.state.players[0]!.stableTiles.length,prior);save(`E114-N3-${prior}-${wood}`,{rejected,legal})}const hand=buildStable(shed(0,false));assert.equal(hand.state.players[0]!.resources.grain,0);const q=make(SHED,true,state=>state.players[1]!.resources.wood=2);action(q,0,'day-laborer');ready(q);const opponent=buildStable(q,1,1);assert.equal(opponent.state.players[0]!.resources.grain,0);assert.equal(opponent.state.players[1]!.resources.grain,0);save('E114-N3',{pending,bad,r,hand,opponent})})
})
