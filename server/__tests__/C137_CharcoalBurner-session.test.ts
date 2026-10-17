import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C137_CharcoalBurner'
import '../../shared/cards/D/D064_BakingCourse'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit52Actions from './_helpers/audit/ae-negative-52-actions'

const CARD_ID = 'C137_CharcoalBurner'
const BAKING_MINOR_ID = 'D064_BakingCourse'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true,
  owner = 0,
  actor = 0,
  improvement = null as string | null,
} = {}) => {
  const session = new GameSession(5137, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = improvement?.startsWith('Major_') ? [improvement] : []

  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: index === actor ? 1 : 0,
      clay: index === actor ? 2 : 0,
      reed: 0,
      stone: index === actor ? 3 : 0,
      food: 0,
      grain: 0,
      vegetable: 0,
      sheep: 0,
      boar: 0,
      cattle: 0,
      begging: 0,
    }
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
  })

  const cardOwner = state.players[owner]!
  cardOwner.occupationHand = played ? [FILLER] : [CARD_ID, FILLER]
  cardOwner.occupationPlayed = played ? [CARD_ID] : []

  const actingPlayer = state.players[actor]!
  if (actor !== owner) actingPlayer.occupationPlayed = [FILLER]
  if (improvement === BAKING_MINOR_ID) actingPlayer.minorHand = [BAKING_MINOR_ID, FILLER]

  session.loadState(state)
  return session
}

const playCharcoalBurner = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationHand.includes(CARD_ID)) {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  return response
}

const resolveCharcoalBurnerTrigger = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait'
    || response.interaction.request.kind !== 'select-trigger') return response
  const option = response.interaction.request.options?.find((entry) =>
    entry.value === CARD_ID || entry.sourceCard === CARD_ID)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return option
    ? session.resolveChoice(response.interaction.playerIndex, option.value)
    : response
}

const buildImprovement = (session: GameSession, actor: number, cardId: string) => {
  let response = session.takeAction(actor, 'major-improvement')
  expect(response.ok, response.error).toBe(true)
  const hasBuiltCard = () => response.state.players[actor]!.improvements.includes(cardId)
    || response.state.players[actor]!.minorPlayed.includes(cardId)

  if (hasBuiltCard()) return resolveCharcoalBurnerTrigger(session, response)

  if (response.interaction.stateId === 'wait'
    && !response.interaction.request.options?.some((entry) => entry.value === cardId)) {
    const branch = response.interaction.request.options?.find((entry) =>
      entry.value.startsWith('action-improvement-'))
    expect(branch, JSON.stringify(response.interaction)).toBeDefined()
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }

  if (hasBuiltCard()) return resolveCharcoalBurnerTrigger(session, response)

  if (response.interaction.stateId === 'wait') {
    const card = response.interaction.request.options?.find((entry) => entry.value === cardId)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  }

  return resolveCharcoalBurnerTrigger(session, response)
}

describe('C137 Charcoal Burner parity', () => {
  it('C137 S1: Charcoal Burner can be played as the first occupation in a three-player game', () => {
    const response = playCharcoalBurner(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
  })

  it('C137 S2: the owner building a Fireplace gains one wood and one food', () => {
    const response = buildImprovement(setup({ improvement: 'Major_Fireplace1' }), 0, 'Major_Fireplace1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 0, food: 1 })
  })

  it('C137 S3: another player building a Fireplace rewards only the owner', () => {
    const response = buildImprovement(
      setup({ owner: 1, actor: 0, improvement: 'Major_Fireplace1' }),
      0,
      'Major_Fireplace1',
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0, food: 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, food: 1 })
  })

  it('C137 S4: building the non-baking Well grants no Charcoal Burner reward', () => {
    const response = buildImprovement(setup({ improvement: 'Major_Well' }), 0, 'Major_Well')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain('Major_Well')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, stone: 0, food: 0 })
  })

  it('C137 S5: the owner playing a baking minor gains one wood and one food', () => {
    const response = buildImprovement(setup({ improvement: BAKING_MINOR_ID }), 0, BAKING_MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(BAKING_MINOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 1 })
  })

  it('C137 S6: another player playing a baking minor rewards the owner', () => {
    const response = buildImprovement(
      setup({ owner: 1, actor: 0, improvement: BAKING_MINOR_ID }),
      0,
      BAKING_MINOR_ID,
    )

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(BAKING_MINOR_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 1, food: 1 })
  })
})

describe('ae-negative-52-actions', () => {
  const { sessions, save, ok, make, action, lesson, BURNER, burner, build } = audit52Actions
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('C137 N1 actual purchase gives no immediate reward and owner Fireplace purchase pays clay then rewards once through whole undo and replay',()=>{const bought=lesson(burner(false),BURNER);assert.deepEqual([bought.state.players[0]!.resources.wood,bought.state.players[0]!.resources.food],[1,100]);const s=burner(),r=build(s,0,'Major_Fireplace1');assert.deepEqual([r.state.players[0]!.resources.wood,r.state.players[0]!.resources.food,r.state.players[0]!.resources.clay],[2,101,0]);const u=ok(s.undoAction());assert.deepEqual([u.state.players[0]!.resources.wood,u.state.players[0]!.resources.food,u.state.players[0]!.resources.clay],[1,100,2]);const replay=build(s,0,'Major_Fireplace1');assert.equal(replay.state.players[0]!.resources.wood,2);save('C137-N1',{bought,r,u,replay})})
  it('C137 N2 a real opponent Fireplace and a prerequisite legal baking minor reward only the owner once',()=>{const s=burner(),first=action(s,0,'grain-seeds'),opponent=build(s,1,'Major_Fireplace1');assert.deepEqual([opponent.state.players[0]!.resources.wood,opponent.state.players[0]!.resources.food],[2,101]);assert.deepEqual([opponent.state.players[1]!.resources.wood,opponent.state.players[1]!.resources.food],[1,100]);const t=burner(),minor=build(t,0,'D064_BakingCourse');assert.deepEqual([minor.state.players[0]!.resources.wood,minor.state.players[0]!.resources.food],[2,101]);assert.ok(minor.state.players[0]!.minorPlayed.includes('D064_BakingCourse'));save('C137-N2',{first,opponent,minor})})
  it('C137 N3 nonbaking Well unavailable clay a held card and ordinary action never earn a bake reward',()=>{const s=burner(),well=build(s,0,'Major_Well');assert.deepEqual([well.state.players[0]!.resources.wood,well.state.players[0]!.resources.food,well.state.players[0]!.resources.stone],[0,100,0]);const t=make(BURNER,true,state=>state.availableMajorImprovements=['Major_Fireplace1']),bad=assertRejectedUnchanged(t,()=>t.takeAction(0,'major-improvement')),pending=bad;assert.equal(bad.state.players[0]!.resources.wood,0);const q=burner(false),hand=build(q,0,'Major_Fireplace1');assert.deepEqual([hand.state.players[0]!.resources.wood,hand.state.players[0]!.resources.food],[1,100]);const v=burner(),other=action(v,0,'grain-seeds');assert.equal(other.state.players[0]!.resources.wood,1);save('C137-N3',{well,pending,bad,hand,other})})
})
