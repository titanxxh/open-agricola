import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { InteractionState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B075_WoodWorkshop'
import '../../shared/cards/A/A048_ShavingHorse'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit22Workshop from './_helpers/audit/ae-negative-22-workshop'

const B75 = 'B075_WoodWorkshop'
const A48 = 'A048_ShavingHorse'
const WOOD_MINOR = 'C013_WoodSlideHammer'
const FOOD_MINOR = 'A005_ClayEmbankment'

const setup = (overrides: {
  wood?: number
  food?: number
  minorHand?: string[]
  played?: string[]
  availableMajors?: string[]
} = {}) => {
  const session = new GameSession(1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    wood: overrides.wood ?? 0,
    clay: 0,
    reed: 0,
    stone: 0,
    food: overrides.food ?? 0,
  }
  player.minorPlayed = overrides.played ?? [B75]
  player.minorHand = overrides.minorHand ?? ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  state.availableMajorImprovements = overrides.availableMajors ?? []

  const space = state.actionSpaces.find((entry) => entry.id === 'major-improvement')
  if (!space) throw new Error('major-improvement missing')
  space.takenBy = []

  session.loadState(state)
  return session
}

type WaitResponse = SessionResponse & {
  interaction: Extract<InteractionState, { stateId: 'wait' }>
}

const expectWait = (resp: SessionResponse): WaitResponse => {
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') {
    throw new Error(`expected wait, got ${resp.interaction.stateId}`)
  }
  return resp as WaitResponse
}

describe('B075_WoodWorkshop session', () => {
  it('uses mandatory B75 before trigger to play a wood-cost minor', () => {
    const session = setup({ wood: 0, minorHand: [WOOD_MINOR] })

    const resp = session.takeAction(0, 'major-improvement')
    const wait = expectWait(resp)
    expect(resp.state.players[0]!.minorPlayed).toContain(WOOD_MINOR)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(wait.interaction.promptKey).toBe('ui.confirmNextPlayer')
  })

  it('uses real B75 wood then real A48 exchange to pay and pass a food-cost minor', () => {
    const session = setup({
      wood: 4,
      food: 0,
      minorHand: [FOOD_MINOR],
      played: [B75, A48],
    })

    let resp = session.takeAction(0, 'major-improvement')
    let wait = expectWait(resp)
    expect(resp.state.players[0]!.resources.wood).toBe(5)
    resp = resolveTriggerIfPresent(session, resp, A48)
    wait = expectWait(resp)
    expect(wait.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(wait.interaction.sourceCard).toBe(A48)

    const exchange = wait.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(exchange).toBeDefined()
    resp = session.resolveChoice(0, exchange!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).not.toContain(FOOD_MINOR)
    expect(resp.state.players[1]!.minorHand).toContain(FOOD_MINOR)
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.confirmNextPlayer')
  })

  it('blocks after gaining B75 wood and restores the attempt with undo', () => {
    const session = setup({
      wood: 0,
      food: 0,
      minorHand: [FOOD_MINOR],
      played: [B75],
      availableMajors: [],
    })

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    resp = session.undoAction(0)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.actionSpaces.find((space) => space.id === 'major-improvement')?.takenBy).toHaveLength(0)
  })
})

describe('ae-negative-22-workshop', () => {
  const { CARD, sessions, save, ok, ready, finish, menu, buy, TARGET, make, owner, chooseMajor } = audit22Workshop
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B075 N1 actual clay and occupation purchase gives no wood for itself and whole undo restores the payment',()=>{const s=make(),{pending,r}=buy(s,CARD);assert.equal(r.state.players[0]!.resources.clay,0);assert.equal(r.state.players[0]!.resources.wood,0);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.clay,1);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));const retry=buy(s,CARD).r;assert.equal(retry.state.players[0]!.resources.wood,0);save('B075-N1',{pending,r,undone,retry})})
  it('B075 N2 before reward affords a real one wood minor from zero stock and successful purchase undo removes the reward',()=>{const s=make();buy(s,CARD);const before=owner(s);let r=ok(s.takeAction(0,'major-improvement'));if(r.interaction.stateId==='wait'&&r.interaction.request.kind==='choice'){const o=r.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)r=ok(s.resolveChoice(0,o.value))}const pending=r;assert.equal(r.state.players[0]!.resources.wood,1);r=finish(s,ok(s.resolveChoice(0,TARGET)));assert.ok(r.state.players[0]!.minorPlayed.includes(TARGET));assert.equal(r.state.players[0]!.resources.wood,0);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,before.state.players[0]!.resources.wood);assert.ok(undone.state.players[0]!.minorHand.includes(TARGET));const retry=chooseMajor(s,TARGET);assert.equal(retry.r.state.players[0]!.resources.wood,0);save('B075-N2',{before,pending,r,undone,retry})})
  it('B075 N3 real major construction and passing minor each grant one before reward while occupation and opponent give none',()=>{const s=make(3);buy(s,CARD);const major=chooseMajor(s,'Major_Fireplace1');assert.equal(major.r.state.players[0]!.resources.clay,0);assert.equal(major.r.state.players[0]!.resources.wood,1);assert.ok(major.r.state.players[0]!.improvements.includes('Major_Fireplace1'));save('B075-N3-major',major);const passing=make();buy(passing,CARD);const a=chooseMajor(passing,'B004_WoodPile');assert.equal(a.r.state.players[0]!.resources.wood,1);assert.ok(a.r.state.players[1]!.minorHand.includes('B004_WoodPile'));save('B075-N3-passing',a);const foreign=make();buy(foreign,CARD);ready(foreign);let pending=ok(foreign.takeAction(1,'major-improvement'));if(pending.interaction.stateId==='wait'&&pending.interaction.request.kind==='choice'){const o=pending.interaction.request.options.find(o=>o.value.startsWith('action-improvement-'));if(o)pending=ok(foreign.resolveChoice(1,o.value))}const opponent=finish(foreign,ok(foreign.resolveChoice(1,'Major_Fireplace1')));assert.equal(opponent.state.players[0]!.resources.wood,0);owner(foreign);const lesson=finish(foreign,ok(foreign.takeAction(0,'lessons')));assert.ok(lesson.state.players[0]!.occupationPlayed.includes('A114_SeasonalWorker'));assert.equal(lesson.state.players[0]!.resources.wood,0);save('B075-N3-exclusions',{opponent,lesson})})
  it('B075 N4 absent clay or occupation refuses the actual initial purchase and creates no workshop wood',()=>{for(const mode of['clay','occupation']){const s=make(mode==='clay'?0:1,mode!=='occupation'),pending=menu(s);assertRejectedUnchanged(s,()=>s.resolveChoice(0,CARD));const legal=finish(s,ok(s.resolveChoice(0,'B004_WoodPile')));assert.equal(legal.state.players[0]!.resources.wood,0);assert.ok(!legal.state.players[0]!.minorPlayed.includes(CARD));save(`B075-N4-${mode}`,{pending,legal})}})
})
