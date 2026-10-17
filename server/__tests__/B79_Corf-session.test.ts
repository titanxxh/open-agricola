import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { B079_Corf_impl } from '../../shared/cards/B/B079_Corf'
import type { DraftGameEvent } from '../../shared/contract/events'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B079_Corf'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit22Corf from './_helpers/audit/ae-negative-22-corf'

const CARD_ID = 'B079_Corf'
const LISTENER = B079_Corf_impl.listeners[0]!

const setup = () => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5 // ensure eastern-quarry is available (round 5+)

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.stone = 0
  player.minorHand.push(CARD_ID)

  // Put stone on the eastern-quarry space so collect has 3+ stone
  const quarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
  if (quarry) quarry.resources.stone = 4

  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { stone: 3 },
  from: { kind: 'actionSpace', spaceId: 'eastern-quarry' },
  to: { kind: 'player', playerId: 'p2' },
  reason: 'collect',
  ...overrides,
})

const directContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
  actionEvents = transactionEvents,
): { session: GameSession; context: CardListenerContext } => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const owner = state.players[0]!
  const trigger = state.players[1]!
  owner.id = 'p1'
  trigger.id = 'p2'
  owner.minorPlayed.push(CARD_ID)
  return { session, context: {
    actionHooks: session.actionHooks,
    state,
    player: trigger,
    ownerPlayer: owner,
    triggerPlayer: trigger,
    space: state.actionSpaces.find((space) => space.id === 'eastern-quarry')!,
    actionId: 'collect',
    phase: 'after',
    transactionEvents,
    actionEvents,
    result: { type: 'ok', resourcesGained: { stone: 3 } },
  } as unknown as CardListenerContext }
}

describe('B079_Corf session', () => {
  it('owner gets 1 stone when collecting 3+ stone from accumulation space', () => {
    const session = setup()
    const state = session.getState().state
    const stoneBefore = state.players[0]!.resources.stone

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Collected 4 stone from quarry + 1 bonus from Corf = 5 stone total
    expect(player.resources.stone).toBe(stoneBefore + 4 + 1)
  })

  it('does not trigger when collecting less than 3 stone', () => {
    const session = setup()
    const state = session.getState().state

    // Reduce stone on quarry to 2 (less than 3)
    const quarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (quarry) quarry.resources.stone = 2
    session.loadState(state)

    const stoneBefore = session.getState().state.players[0]!.resources.stone

    const resp = session.takeAction(0, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // Collected 2 stone, no bonus (threshold is 3)
    expect(player.resources.stone).toBe(stoneBefore + 2)
  })

  it('triggers when opponent collects 3+ stone (scope any)', () => {
    const session = setup()
    const state = session.getState().state

    // Player 1 (opponent) has workers available
    state.currentPlayerIndex = 1
    state.players[1]!.workersAvailable = 2

    // Make sure quarry has 3+ stone
    const quarry = state.actionSpaces.find((s) => s.id === 'eastern-quarry')
    if (quarry) quarry.resources.stone = 3
    session.loadState(state)

    const ownerStoneBefore = session.getState().state.players[0]!.resources.stone

    // Player 1 (opponent) takes the quarry
    const resp = session.takeAction(1, 'eastern-quarry')
    expect(resp.ok).toBe(true)

    // Card owner (player 0) should have gained 1 stone from Corf
    expect(resp.state.players[0]!.resources.stone).toBe(ownerStoneBefore + 1)
  })

  it('does not trigger for non-stone accumulation spaces', () => {
    const session = setup()
    const state = session.getState().state

    // Put wood on forest
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 5
    session.loadState(state)

    const stoneBefore = session.getState().state.players[0]!.resources.stone

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    // No stone gained (forest gives wood, not stone)
    expect(resp.state.players[0]!.resources.stone).toBe(stoneBefore)
  })

  it('uses action-space stone events for scope-any trigger even without result gains', () => {
    const { session: ruleSession1, context: ctx } = directContext([moved()])
    ctx.result = { type: 'ok' }

    const result = ruleSession1.withCtx(() => executeCardListener(LISTENER, ctx))

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { stone: 1 },
      sourceCard: CARD_ID,
    })
  })

  it('does not trigger for supply/cardEffect stone even when result reports stone', () => {
    const { session: ruleSession2, context: ctx } = directContext([moved({
      from: { kind: 'supply' },
      reason: 'cardEffect',
    })])

    const result = ruleSession2.withCtx(() => executeCardListener(LISTENER, ctx))

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction stone when actionEvents has no current stone threshold', () => {
    const { session: ruleSession3, context: ctx } = directContext([moved()], [moved({ resources: { stone: 2 } })])

    const result = ruleSession3.withCtx(() => executeCardListener(LISTENER, ctx))

    expect(result).toBeUndefined()
  })
})

describe('ae-negative-22-corf', () => {
  const { CARD, sessions, save, ok, setup, ready, finish, menu, buy, make, use } = audit22Corf
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B079 N1 actual one reed purchase gives no immediate stone and whole undo restores cost and ownership before one replay',()=>{const s=make(),{pending,r}=buy(s,CARD);assert.equal(r.state.players[0]!.resources.reed,0);assert.equal(r.state.players[0]!.resources.stone,0);const undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.reed,1);assert.ok(undone.state.players[0]!.minorHand.includes(CARD));const retry=buy(s,CARD).r;assert.equal(retry.state.players[0]!.resources.stone,0);save('B079-N1',{pending,r,undone,retry});const denied=setup(CARD,9),menuState=menu(denied);assertRejectedUnchanged(denied,()=>denied.resolveChoice(0,CARD));const legal=finish(denied,ok(denied.resolveChoice(0,'B004_WoodPile')));assert.equal(legal.state.players[0]!.resources.stone,0);save('B079-N1-poor',{menuState,legal})})
  it('B079 N2 real owner quarry two three four stone awards the exact zero one one general supply bonus on both quarries',()=>{for(const space of['western-quarry','eastern-quarry'])for(const n of[2,3,4]){const s=make(n);buy(s,CARD);use(s,1,'grain-seeds');const a=use(s,0,space);assert.equal(a.r.state.players[0]!.resources.stone,n+(n>=3?1:0));assert.equal(a.r.state.actionSpaces.find(x=>x.id===space)!.resources.stone,0);assert.equal(a.r.state.players[1]!.resources.stone,0);save(`B079-N2-${space}-${n}`,{a})}})
  it('B079 N3 actual opponent quarry awards only one owner stone at the threshold and unrelated or hand card gives none',()=>{for(const n of[2,3,4]){const s=make(n);buy(s,CARD);const a=use(s,1,'western-quarry');assert.equal(a.r.state.players[0]!.resources.stone,n>=3?1:0);assert.equal(a.r.state.players[1]!.resources.stone,n);save(`B079-N3-${n}`,{a})}const h=use(make(3),0,'western-quarry');assert.equal(h.r.state.players[0]!.resources.stone,3);const s=make(3);buy(s,CARD);use(s,1,'grain-seeds');const a=use(s,0,'forest');assert.equal(a.r.state.players[0]!.resources.stone,0);save('B079-N3-hand-other',{h,a})})
  it('B079 N4 real quarry whole action undo restores pile resources and permits one replay while occupied retry rejects',()=>{const s=make(3,false,true);buy(s,CARD);use(s,1,'grain-seeds');const a=use(s,0,'western-quarry'),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.stone,a.before.state.players[0]!.resources.stone);assert.equal(undone.state.actionSpaces.find(x=>x.id==='western-quarry')!.resources.stone,3);const retry=use(s,0,'western-quarry');assert.equal(retry.r.state.players[0]!.resources.stone,4);use(s,1,'day-laborer');const occupied=ready(s);assert.equal(occupied.state.round,9);assert.ok(occupied.state.actionSpaces.find(a=>a.id==='western-quarry')!.takenBy.length);assertRejectedUnchanged(s,()=>s.takeAction(0,'western-quarry'));save('B079-N4',{a,undone,retry,rejected:s.getState()})})
})
