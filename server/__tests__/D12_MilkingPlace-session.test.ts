import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D012_MilkingPlace'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit27Milking from './_helpers/audit/ae-negative-27-milking'

const CARD_ID = 'D012_MilkingPlace'

const playMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'meeting-place')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(0, card!.value)
}

describe('D012_MilkingPlace session', () => {
  const setup = () => {
    const session = new GameSession(12, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    session.loadState(state)
    return session
  }

  it('D012 S1: playing Milking Place pays one grain and leaves it in play', () => {
    const session = new GameSession(12, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = ['__test_placeholder__']
    player.resources.grain = 1
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)

    const response = playMinor(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })

  it('D012 S3: Milking Place removes the house animal zone', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const zones = session.withCtx(() => computeAnimalZones(player))
    const houseZone = zones.find(z => z.zoneType === 'house')
    expect(houseZone).toBeUndefined()
  })

  it('D012 S4: without Milking Place the house animal zone has capacity one', () => {
    const session = new GameSession(12, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    session.loadState(state)

    const player = state.players[0]!
    const zones = session.withCtx(() => computeAnimalZones(player))
    const houseZone = zones.find(z => z.zoneType === 'house')
    expect(houseZone).toBeDefined()
    expect(houseZone!.capacity).toBe(1)
  })

  it('D012 S2: Milking Place grants one food during harvest feeding', () => {
    const session = setup()
    const state = session.getState().state

    // Set up for harvest round 4
    state.round = 4
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10 // enough food so no begging
    }
    // Player 0 starts with exactly 1 food (needs 2 to feed family of 1)
    // With the card granting 1 food, total becomes 2 — just enough, no begging
    state.players[0]!.resources.food = 1
    session.loadState(state)

    autoAdvanceRoundEnd(session)

    // Player 0 had 1 food, got 1 from MilkingPlace card = 2 food total.
    // Family of 1 requires 2 food. Should have 0 begging.
    const playerAfter = session.getState().state.players[0]!
    expect(playerAfter.resources.begging).toBe(0)
    // Food should be fully consumed
    expect(playerAfter.resources.food).toBe(0)
  })

  it('without card, same harvest setup results in begging', () => {
    const session = new GameSession(12, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 4

    for (const p of state.players) {
      markAllWorkersUsed(state, p)
      setActiveWorkerCount(p, 1)
      p.resources.food = 10
    }
    // Player 0 has only 1 food, needs 2 for family of 1, no card
    state.players[0]!.resources.food = 1
    session.loadState(state)

    autoAdvanceRoundEnd(session)

    // Without the card: 1 food, need 2, so 1 begging
    const playerAfter = session.getState().state.players[0]!
    expect(playerAfter.resources.begging).toBe(1)
  })
})

describe('ae-negative-27-milking', () => {
  const { CARD, sessions, save, ok, finish, make, menu, next } = audit27Milking
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('D012 N1 real minor purchase pays exactly one grain prints one point and whole undo restores card hand and grain',()=>{const s=make(false),pending=menu(s),r=finish(s,ok(s.resolveChoice(0,CARD)),false),undone=ok(s.undoAction());assert.equal(r.state.players[0]!.resources.grain,0);assert.ok(r.state.players[0]!.minorPlayed.includes(CARD));assert.equal(r.scores![0]!.categories.find(c=>c.key==='cards')!.entries.find(e=>'cardId'in e&&e.cardId===CARD)!.score,1);assert.equal(undone.state.players[0]!.resources.grain,1);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));save('D012-N1',{pending,r,undone})})
  it('D012 N2 zero grain cannot purchase the card in the actual minor menu before a real free alternative',()=>{const s=make(false,0),pending=menu(s),invalid=assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD)),r=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')),false);assert.ok(r.state.players[0]!.minorHand.includes(CARD));assert.equal(r.state.players[0]!.resources.grain,0);save('D012-N2',{pending,invalid,r})})
  it('D012 N3 natural harvest feeding grants exactly one owner food per harvest and no midround or opponent extra food',()=>{const s=make(),control=make(false),r=next(s),c=next(control);assert.equal(r.state.players[0]!.resources.food,c.state.players[0]!.resources.food+1);assert.equal(r.state.players[1]!.resources.food,c.state.players[1]!.resources.food);assert.equal(r.state.players[0]!.resources.begging,0);const mid=make(true,1,false,8),before=ok(mid.getState()),after=finish(mid,ok(mid.takeAction(0,'reed-bank')),false);assert.equal(after.state.players[0]!.resources.food,before.state.players[0]!.resources.food);save('D012-N3',{r,c,before,after})})
  it('D012 N4 actual animal reorganization removes all house holders even with Animal Tamer and rejects room storage before legal pasture storage',()=>{for(const tamer of[false,true]){const s=make(true,1,tamer),pending=ok(s.takeAction(0,'sheep-market'));assert.ok(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='animal-reorg');assert.ok(pending.interaction.request.zones.every(z=>z.zoneType!=='house'));const z=pending.interaction.request.zones.find(z=>z.zoneType==='pasture');assert.ok(z);const invalid=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'confirm',{zones:[{...z,id:'house-0',zoneType:'house',animalType:'sheep',animalCount:1}]})),r=ok(s.resolveChoice(0,'confirm',{zones:[{...z,animalType:'sheep',animalCount:1}]}));assert.equal(r.state.players[0]!.resources.sheep,1);assert.equal(r.state.players[0]!.pastures[0]!.animalCount,1);assert.equal(Object.keys(r.state.players[0]!.houseAnimals??{}).length,0);save(`D012-N4-${tamer}`,{pending,invalid,r})}})
})
