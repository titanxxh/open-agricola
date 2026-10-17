import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import { createEventQuery } from '../../shared/events/query'
import type { DraftGameEvent } from '../../shared/contract/events'

import { setWorkersAtHome, familySize } from '../../shared/domain/player'
import { B021_HayloftBarn_impl } from '../../shared/cards/B/B021_HayloftBarn'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit19Family from './_helpers/audit/ae-negative-19-family'

const CARD_ID = 'B021_HayloftBarn'

const setup = (options?: { foodCount?: number }) => {
  const session = new GameSession(42)
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 10
  player.resources.wood = 10
  player.resources.grain = 0

  // Manually add card
  player.minorPlayed.push(CARD_ID)
  if (!player.cardStates) player.cardStates = {}
  player.cardStates[CARD_ID] = {
    extraData: { foodCount: options?.foodCount ?? 4 },
    infobox: `${options?.foodCount ?? 4} Food`,
  }

  session.loadState(state)
  return session
}

describe('B021_HayloftBarn session', () => {
  it('onBuy sets foodCount to 4', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    session.loadState(state)
    session.devPlayCard(0, CARD_ID)

    const updated = session.getState().state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(4)
  })

  it('obtaining grain releases 1 food from card', () => {
    const session = setup()
    const state = session.getState().state
    // Put grain on the grain-seeds space
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    expect(grainSeeds).toBeDefined()

    const foodBefore = state.players[0]!.resources.food
    session.loadState(state)

    // grain-seeds gives 1 grain
    let resp = session.takeAction(0, 'grain-seeds')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.grain).toBeGreaterThanOrEqual(1)
    // Should have gotten 1 food from the card
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(3)
    expect(player.resources.food).toBe(foodBefore + 1)
    const grainIndex = resp.state.events.findIndex((event) =>
      event.type === 'resource.moved' && (event.resources.grain ?? 0) > 0
    )
    const triggerIndex = resp.state.events.findIndex((event) =>
      event.type === 'card.triggered' && event.sourceCardId === CARD_ID
    )
    const stateChangedIndex = resp.state.events.findIndex((event) =>
      event.type === 'card.stateChanged'
      && event.sourceCardId === CARD_ID
      && event.cardId === CARD_ID
      && event.key === 'foodCount'
      && !Object.hasOwn(event, 'value')
    )
    const infoboxChangedIndex = resp.state.events.findIndex((event) =>
      event.type === 'card.infoboxChanged'
      && event.sourceCardId === CARD_ID
      && event.cardId === CARD_ID
      && event.text === '3 Food'
    )
    const foodIndex = resp.state.events.findIndex((event) =>
      event.type === 'resource.moved'
      && event.sourceCardId === CARD_ID
      && (event.resources.food ?? 0) === 1
    )
    expect(grainIndex).toBeGreaterThanOrEqual(0)
    expect(triggerIndex).toBeGreaterThan(grainIndex)
    expect(stateChangedIndex).toBeGreaterThan(triggerIndex)
    expect(infoboxChangedIndex).toBeGreaterThan(stateChangedIndex)
    expect(foodIndex).toBeGreaterThan(infoboxChangedIndex)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'card.stateChanged',
        sourceCardId: CARD_ID,
        cardId: CARD_ID,
        key: 'foodCount',
        targetPlayerId: player.id,
      }),
      expect.objectContaining({
        type: 'card.infoboxChanged',
        sourceCardId: CARD_ID,
        cardId: CARD_ID,
        text: '3 Food',
        targetPlayerId: player.id,
      }),
      expect.objectContaining({
        type: 'resource.moved',
        sourceCardId: CARD_ID,
        from: { kind: 'card', playerId: expect.any(String), cardId: CARD_ID },
        to: { kind: 'player', playerId: expect.any(String) },
        resources: { food: 1 },
      }),
    ]))
  })

  it('exchange gaining grain releases 1 food from card', () => {
    const session = setup({ foodCount: 4 })
    const state = session.getState().state
    const player = state.players[0]!
    const exchangeEvent: DraftGameEvent<'resource.exchanged'> = {
      type: 'resource.exchanged',
      paid: { wood: 1 },
      gained: { grain: 1 },
      paidFrom: { kind: 'player', playerId: player.id },
      paidTo: { kind: 'supply' },
      gainedFrom: { kind: 'supply' },
      gainedTo: { kind: 'player', playerId: player.id },
      exchangeSource: 'test-grain-exchange',
    }
    const listener = B021_HayloftBarn_impl.listeners?.find((entry) =>
      entry.id === 'B21-hayloft-barn-after-grain-gain'
    )

    const result = listener?.handler({
      state,
      player,
      space: state.actionSpaces[0]!,
      actionId: 'exchange',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [exchangeEvent],
      actionEvents: [exchangeEvent],
      eventQuery: createEventQuery([exchangeEvent]),
    } as CardListenerContext)

    expect(listener).toBeDefined()
    expect(result?.sourceCard).toBe(CARD_ID)
    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type !== 'seq') throw new Error('expected B21 release flow')
    expect(result.flow.children).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'foodCount', value: 3 },
      }),
      expect.objectContaining({
        actionId: 'gain',
        sourceCard: CARD_ID,
        params: { food: 1 },
      }),
    ]))
  })

  it('does not include family growth in listener flow when only removed supply tokens remain', () => {
    const session = setup({ foodCount: 1 })
    const state = session.getState().state
    const player = state.players[0]!
    player.workers = [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false, removedFromSupply: true },
      { id: '4', isActive: false, isNewborn: false, removedFromSupply: true },
      { id: '5', isActive: false, isNewborn: false, removedFromSupply: true },
    ]
    const grainEvent: DraftGameEvent<'resource.moved'> = {
      type: 'resource.moved',
      resources: { grain: 1 },
      from: { kind: 'supply' },
      to: { kind: 'player', playerId: player.id },
      reason: 'gain',
    }
    const listener = B021_HayloftBarn_impl.listeners?.find((entry) =>
      entry.id === 'B21-hayloft-barn-after-grain-gain'
    )

    const result = listener?.handler({
      state,
      player,
      space: state.actionSpaces[0]!,
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [grainEvent],
      actionEvents: [grainEvent],
      eventQuery: createEventQuery([grainEvent]),
    } as CardListenerContext)

    expect(result?.flow?.type).toBe('seq')
    if (result?.flow?.type !== 'seq') throw new Error('expected B21 release flow')
    expect(JSON.stringify(result.flow)).not.toContain('family-growth')
  })

  it('does not release food when card is empty', () => {
    const session = setup({ foodCount: 0 })
    const state = session.getState().state
    const foodBefore = state.players[0]!.resources.food
    session.loadState(state)

    let resp = session.takeAction(0, 'grain-seeds')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(0)
    // No extra food from card
    expect(player.resources.food).toBe(foodBefore)
  })

  it('non-grain action does not trigger food release', () => {
    const session = setup()
    const state = session.getState().state
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    if (forest) forest.resources.wood = 6
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    // foodCount should remain 4 (no grain obtained)
    expect(readCardExtraData<number>(player, CARD_ID, 'foodCount')).toBe(4)
    expect(resp.state.events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'card.triggered',
        sourceCardId: CARD_ID,
      }),
    ]))
  })

  it('food releases one at a time (only 1 per grain-obtaining action)', () => {
    const session = setup({ foodCount: 4 })

    // First grain action
    let resp = session.takeAction(0, 'grain-seeds')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(3)

    // Reset for second action
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.players[0]!.workersAvailable = 1
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (grainSeeds) grainSeeds.takenBy = []
    session.loadState(state)

    // Second grain action
    resp = session.takeAction(0, 'grain-seeds')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)
    expect(readCardExtraData<number>(resp.state.players[0]!, CARD_ID, 'foodCount')).toBe(2)
  })

  it('when card empties via grain gain, triggers family growth without room', () => {
    // Set up with foodCount=1 so the grain-seeds action drains it.
    // Player has 2 active workers and 2 rooms, so a normal family growth
    // would not be doable (no free room) — we expect skipRoomCheck to bypass.
    const session = setup({ foodCount: 1 })
    const state = session.getState().state
    const player = state.players[0]!
    const foodBefore = player.resources.food
    const familyBefore = player.workers.filter((w) => w.isActive).length
    expect(familyBefore).toBe(2)
    expect(player.rooms).toBe(2)

    let resp = session.takeAction(0, 'grain-seeds')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    // Card empty
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
    // Got the food (card released 1)
    expect(updated.resources.food).toBe(foodBefore + 1)
    // Family grew without room (now 3 active workers despite 2 rooms)
    const familyAfter = updated.workers.filter((w) => w.isActive).length
    expect(familyAfter).toBe(familyBefore + 1)
  })

  it('does not trigger family growth when only removed supply tokens remain', () => {
    const session = setup({ foodCount: 1 })
    const state = session.getState().state
    const player = state.players[0]!
    player.workers = [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false, removedFromSupply: true },
      { id: '4', isActive: false, isNewborn: false, removedFromSupply: true },
      { id: '5', isActive: false, isNewborn: false, removedFromSupply: true },
    ]
    const foodBefore = player.resources.food
    const familyBefore = player.workers.filter((w) => w.isActive).length
    session.loadState(state)

    let resp = session.takeAction(0, 'grain-seeds')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(0)
    expect(updated.resources.food).toBe(foodBefore + 1)
    expect(updated.workers.filter((w) => w.isActive).length).toBe(familyBefore)
  })

  it('does not trigger family growth when card is not empty after gain', () => {
    const session = setup({ foodCount: 4 })
    const state = session.getState().state
    const familyBefore = state.players[0]!.workers.filter((w) => w.isActive).length

    let resp = session.takeAction(0, 'grain-seeds')
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.ok).toBe(true)

    const updated = resp.state.players[0]!
    expect(readCardExtraData<number>(updated, CARD_ID, 'foodCount')).toBe(3)
    // No new family member
    expect(updated.workers.filter((w) => w.isActive).length).toBe(familyBefore)
  })
})

describe('ae-negative-19-family', () => {
  const { CARD, sessions, save, ok, setup, stored, turn, finish, menu, buy, next } = audit19Family
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B021 N1 actual paid purchase stores four food without granting food and prerequisite or cost shortfall rejects',()=>{const s=setup(),{pending,r}=buy(s);assert.equal(r.state.players[0]!.resources.food,100);assert.equal(familySize(r.state.players[0]!),2);save('B021-N1',{pending,r});for(const[wood,occupation]of[[2,true],[3,false]]as const){const denied=setup(wood,occupation),p=menu(denied);assertRejectedUnchanged(denied,()=>denied.resolveChoice(0,CARD));const legal=ok(denied.resolveChoice(0,'A030_BakingSheet'));assert.equal(legal.state.players[0]!.resources.wood,wood);assert.equal(stored(legal),0);save(`B021-N1-${wood}-${occupation}`,{p,legal})}})
  it('B021 N2 opponent grain cannot consume owners stored food and owners actual grain releases exactly one food',()=>{const s=setup();buy(s);const other=finish(s,turn(s,1,'grain-seeds'));assert.equal(stored(other),4);assert.equal(other.state.players[0]!.resources.food,100);assert.equal(other.state.players[1]!.resources.food,100);next(s,4);const before=JSON.parse(JSON.stringify(s.getState())) as SessionResponse,r=finish(s,turn(s,0,'grain-seeds'));assert.equal(stored(r),3);assert.equal(r.state.players[0]!.resources.food,before.state.players[0]!.resources.food+1);assert.equal(r.state.players[0]!.resources.grain,1);save('B021-N2',{other,before,r})})
  it('B021 N3 four genuine grain acquisitions empty card and grow one newborn without room exactly once',()=>{const s=setup();buy(s);turn(s,1,'day-laborer');const steps:SessionResponse[]=[];for(const round of[3,4,5,6]){if(round>3)next(s,round);const before=JSON.parse(JSON.stringify(s.getState())) as SessionResponse,r=finish(s,turn(s,0,'grain-seeds'));assert.equal(stored(r),6-round);assert.equal(r.state.players[0]!.resources.food,before.state.players[0]!.resources.food+1);assert.equal(familySize(r.state.players[0]!),round===6?3:2);assert.equal(r.state.players[0]!.rooms,2);steps.push(JSON.parse(JSON.stringify(r)))}const r=s.getState();assert.equal(r.state.players[0]!.workers.filter(w=>w.isActive&&w.isNewborn).length,1);assert.equal(r.state.players[0]!.workers.length,5);save('B021-N3',{steps,r})})
  it('B021 N4 unrelated resource cannot consume food and real grain acquisition undo restores card count before one retry',()=>{const s=setup();buy(s);turn(s,1,'day-laborer');const unrelated=turn(s,0,'forest');assert.equal(stored(unrelated),4);next(s,4);const r=finish(s,turn(s,0,'grain-seeds')),undone=ok(s.undoAction());assert.equal(stored(undone),4);assert.equal(undone.state.players[0]!.resources.grain,0);const retry=finish(s,turn(s,0,'grain-seeds'));assert.equal(stored(retry),3);assert.equal(retry.state.players[0]!.resources.food,undone.state.players[0]!.resources.food+1);save('B021-N4',{unrelated,r,undone,retry})})
})
