import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'
import { computeScores } from '../../shared/domain/scoring'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

import '../../shared/cards/E/E132_VeggieLover'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit52Harvest from './_helpers/audit/ae-negative-52-harvest'

const CARD_ID = 'E132_VeggieLover'
const CHOICE_PREFIX = `${CARD_ID}:pairs:`

const choiceValue = (pairs: number) => `${CHOICE_PREFIX}${pairs}`

const setupEndGameSession = (grain: number, vegetable: number) => {
  const session = new GameSession(132, undefined, { playerCount: 3 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.gameOver = false
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 0)
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.occupationPlayed = []
    player.minorPlayed = []
    player.improvements = []
    player.cardStates = {}
  })
  state.players[0]!.occupationPlayed = [CARD_ID]
  state.players[0]!.resources.grain = grain
  state.players[0]!.resources.vegetable = vegetable
  session.loadState(state)
  return session
}

const expectPairChoice = (response: SessionResponse, values: string[]) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected wait')
  expect(response.interaction.playerIndex).toBe(0)
  expect(response.interaction.request.kind).toBe('choice')
  expect(response.interaction.promptKey).toBe('ui.cards.E132_VeggieLover.prompt')
  expect(response.interaction.request.options?.map((option) => option.value)).toEqual(values)
}

const scoreCategory = (ruleOwner: SessionRuleOwner, response: SessionResponse, key: string) =>
  ruleOwner.withCtx(() => computeScores(response.state))[0]!.categories.find((category) => category.key === key)

describe('E132_VeggieLover session', () => {
  it('offers optional feeding exchange when player has grain and vegetable', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 2
    player.resources.vegetable = 1

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = session.withCtx(() => effect!.onHarvestFeedingPhase!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect((flow as Extract<ActionFlow, { type: 'seq' }>).optional).toBe(true)
  })

  it('returns undefined when player has no grain', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 0
    player.resources.vegetable = 2

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(session.withCtx(() => effect!.onHarvestFeedingPhase!(state, player))).toBeUndefined()
  })

  it('returns undefined when player has no vegetable', () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 3
    player.resources.vegetable = 0

    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))
    expect(session.withCtx(() => effect!.onHarvestFeedingPhase!(state, player))).toBeUndefined()
  })

  it('offers zero through three pairs and truly pays the selected pair before scoring', () => {
    const session = setupEndGameSession(3, 3)

    const offered = session.invokeAfterRoundEnd()
    expectPairChoice(offered, [
      choiceValue(0),
      choiceValue(1),
      choiceValue(2),
      choiceValue(3),
    ])

    const resolved = session.resolveChoice(0, choiceValue(1))

    expect(resolved.interaction.stateId).toBe('gameover')
    expect(resolved.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 2 })
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(2)
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.extraData?.scoringReserveBonus).toBeUndefined()
    expect(scoreCategory(session, resolved, 'grains')?.quantity).toBe(2)
    expect(scoreCategory(session, resolved, 'vegetables')?.quantity).toBe(2)
    expect(scoreCategory(session, resolved, 'cardBonusVp')?.entries).toContainEqual(
      expect.objectContaining({ cardId: CARD_ID, score: 2 }),
    )
  })

  it('choosing zero changes neither resources nor bonus state', () => {
    const session = setupEndGameSession(3, 3)
    const offered = session.invokeAfterRoundEnd()
    expectPairChoice(offered, [
      choiceValue(0),
      choiceValue(1),
      choiceValue(2),
      choiceValue(3),
    ])

    const resolved = session.resolveChoice(0, choiceValue(0))

    expect(resolved.state.players[0]!.resources).toMatchObject({ grain: 3, vegetable: 3 })
    expect(resolved.state.players[0]!.cardStates[CARD_ID]).toBeUndefined()
    expect(scoreCategory(session, resolved, 'cardBonusVp')).toBeUndefined()
  })

  it('limits choices to crops not already committed to a Scoring Reserve', () => {
    const session = setupEndGameSession(3, 3)
    session.state.players[0]!.cardStates = {
      TEST_Reserve: {
        extraData: {
          scoringReserveBonus: { reserved: { grain: 2 }, score: 1 },
        },
      },
    }
    session.loadState(session.state)

    const offered = session.invokeAfterRoundEnd()

    expectPairChoice(offered, [choiceValue(0), choiceValue(1)])
  })

  it('restores a pending pair choice and rejects a repeated command after scoring', () => {
    const session = setupEndGameSession(2, 2)
    const offered = session.invokeAfterRoundEnd()
    expectPairChoice(offered, [choiceValue(0), choiceValue(1), choiceValue(2)])
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))

    const resolved = restored.resolveChoice(0, choiceValue(2))

    expect(resolved.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
    expect(resolved.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(4)
    expect(resolved.interaction.stateId).toBe('gameover')
    const repeated = restored.resolveChoice(0, choiceValue(2))
    expect(repeated.ok).toBe(false)
    expect(repeated.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 0 })
    expect(repeated.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(4)
  })
})

describe('ae-negative-52-harvest', () => {
  const { sessions, save, ok, options, choose, pendingCard, trigger, finish, lesson, progress, bonus, VEGGIE, NONCROP, harvest, accept } = audit52Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E132 N1 actual purchase gives no free crop exchange and natural harvest can use exactly one pair for six food or decline',()=>{const bought=lesson(harvest(VEGGIE,false),VEGGIE);assert.deepEqual([bought.state.players[0]!.resources.grain,bought.state.players[0]!.resources.vegetable,bought.state.players[0]!.resources.food],[2,2,100]);for(const take of[true,false]){const s=harvest(VEGGIE),pending=progress(s,8,VEGGIE,NONCROP),r=take?accept(s,pending,VEGGIE):finish(s,pending);assert.deepEqual([r.state.players[0]!.resources.grain,r.state.players[0]!.resources.vegetable,r.state.players[0]!.resources.food,bonus(r,VEGGIE)],take?[1,1,102,0]:[2,2,96,0]);save(`E132-N1-${take}`,{bought,pending,r})}})
  it('E132 N2 a missing crop half card in hand and ordinary nonharvest cannot give six food or bonus points',()=>{for(const[mode,played,round,grain,veg]of[['grain',true,7,0,2],['vegetable',true,7,2,0],['hand',false,7,2,2],['nonharvest',true,8,2,2]] as const){const s=harvest(VEGGIE,played,round,grain,veg),pending=progress(s,round+1,VEGGIE,NONCROP);if(mode==='hand'||mode==='nonharvest')assert.equal(pendingCard(pending,VEGGIE),false,JSON.stringify(pending.interaction));const r=finish(s,pending);assert.equal(r.state.players[0]!.resources.grain,grain);assert.equal(r.state.players[0]!.resources.vegetable,veg);assert.equal(bonus(r,VEGGIE),0);assert.equal(r.state.players[0]!.resources.food,round===7?96:100);save(`E132-N2-${mode}`,r)}})
  it('E132 N3 natural scoring pays one two or three pairs for two four six points and cannot score the exchanged crops again',()=>{for(const n of[0,1,2,3]){const s=harvest(VEGGIE,true,14,4,4);let pending=progress(s,15,VEGGIE,NONCROP);pending=trigger(s,pending,VEGGIE);choose(s,pending,o=>o.value==='__skip__');pending=trigger(s,progress(s,15,VEGGIE,NONCROP),VEGGIE);assert.ok(options(pending).some(o=>o.value===`${VEGGIE}:pairs:3`));const bad=assertRejectedUnchanged(s,()=>s.resolveChoice(0,`${VEGGIE}:pairs:4`)),r=finish(s,ok(s.resolveChoice(0,`${VEGGIE}:pairs:${n}`)));assert.equal(r.state.gameOver,true);assert.equal(r.state.players[0]!.resources.grain,4-n);assert.equal(r.state.players[0]!.resources.vegetable,4-n);assert.equal(bonus(r,VEGGIE),n*2);assert.ok(r.scores);assert.deepEqual(r.scores[0]!.categories.filter(c=>c.key==='grains'||c.key==='vegetables').map(c=>({key:c.key,quantity:c.quantity,total:c.total})),[{key:'grains',quantity:4-n,total:n===0?2:1},{key:'vegetables',quantity:4-n,total:4-n}]);assert.equal(bonus(r,VEGGIE,1),0);save(`E132-N3-${n}`,{pending,bad,r})}})
})
