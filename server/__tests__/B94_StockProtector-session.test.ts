import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'

import '../../shared/cards/B/B094_StockProtector'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit24Protector from './_helpers/audit/ae-negative-24-protector'

const CARD_ID = 'B094_StockProtector'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('B094_StockProtector session', () => {
  it('B094 S1: playing Stock Protector through Lessons keeps the occupation in play', () => {
    const session = new GameSession(94, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 14
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationHand = [CARD_ID]
    player.occupationPlayed = []
    session.loadState(state)

    const response = session.takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('B094 S2-S3: Fencing grants two wood and can place another person', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      wood: 6,
    }

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(8)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionFenceSelect')

    resp = session.commitSelectionChoice(0, {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionStockProtectorPlace')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.stateId).toBe('wait')
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBe(CARD_ID)

    const accept = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.options?.some((option) => option.value === 'day-laborer')).toBe(true)

    resp = session.resolveChoice(0, 'day-laborer')

    expect(resp.ok, resp.error).toBe(true)
    expect(resp.state.actionSpaces.find((space) => space.id === 'fencing')!.takenBy).toHaveLength(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy).toHaveLength(1)
  })

  it('B094 S5: blocks after gaining wood if fencing is still not doable, then explicitly undoes', () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources = { ...player.resources, wood: 0 }

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    expect(resp.state.players[0]!.resources.wood).toBe(2)
    resp = session.undoAction(0)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.actionSpaces.find((space) => space.id === 'fencing')?.takenBy).toHaveLength(0)
  })

  it('B094 S4: declining the post-Fencing option places no second person', () => {
    const session = new GameSession(94, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed.push(CARD_ID)
    player.resources.wood = 6
    session.loadState(state)

    let response = session.takeAction(0, 'fencing')
    response = session.commitSelectionChoice(0, { edges: edgesForTile(1, 1), extraWood: 0 })
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    expect(response.interaction.stateId).toBe('wait')

    response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'fencing')!.takenBy).toHaveLength(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy).toHaveLength(0)
  })
})

describe('ae-negative-24-protector', () => {
  const { sessions, save, ok, finish, make, turn, fencePending, fence, extra } = audit24Protector
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B094 N1 actual Fencing grants two wood before four fence payment and places the one remaining real person immediately',()=>{const s=make(),before=ok(s.getState()),start=turn(s,0,'fencing'),pending=fencePending(s,start);assert.equal(pending.state.players[0]!.resources.wood,4);const fenced=fence(s),placement=extra(s,fenced),r=finish(s,ok(s.resolveChoice(0,'grain-seeds')),false);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);assert.equal(r.state.players[0]!.resources.grain,1);assert.equal(workersAvailable(r.state,r.state.players[0]!),0);assert.deepEqual(r.state.players[0]!.workers.map(w=>w.id),before.state.players[0]!.workers.map(w=>w.id));assert.equal(r.state.actionSpaces.find(a=>a.id==='fencing')!.takenBy.length,1);assert.equal(r.state.actionSpaces.find(a=>a.id==='grain-seeds')!.takenBy.length,1);save('B094-N1',{before,start,pending,fenced,placement,r})})
  it('B094 N2 illegal fence rejects before legal fence and occupied bonus target rejects before a real legal target',()=>{const s=make(),pending=fencePending(s,turn(s,0,'fencing')),error=assertRejectedUnchanged(s,()=>s.commitSelectionChoice(0,{edges:['H-99-99'],palisadeEdges:[],extraWood:0})),fenced=fence(s),placement=extra(s,fenced),occupied=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'fencing')),unknown=assertRejectedUnchanged(s,()=>s.resolveChoice(0,'missing-action')),r=finish(s,ok(s.resolveChoice(0,'grain-seeds')),false);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.resources.grain,1);save('B094-N2',{pending,error,fenced,placement,occupied,unknown,r})})
  it('B094 N3 decline or no remaining person preserves exactly two bonus wood and card in hand receives no bonus',()=>{for(const mode of['decline','last','hand']){const s=make(mode!=='hand',mode==='hand'?4:2);if(mode==='last'){finish(s,turn(s,0,'grain-seeds'),false);finish(s,turn(s,1,'reed-bank'),false)}const pending=fencePending(s,turn(s,0,'fencing')),fenced=fence(s),r=finish(s,fenced,false);assert.equal(r.state.players[0]!.resources.wood,0);assert.equal(r.state.players[0]!.fenceSegments.length,4);assert.equal(r.state.players[0]!.resources.grain,mode==='last'?1:0);assert.equal(workersAvailable(r.state,r.state.players[0]!),mode==='last'?0:1);save(`B094-N3-${mode}`,{pending,fenced,r})}})
  it('B094 N4 whole Fencing and bonus placement undo restores wood fences both worker identities and occupancy before declined replay',()=>{const s=make(),before=ok(s.getState()),pending=fencePending(s,turn(s,0,'fencing')),placement=extra(s,fence(s)),r=finish(s,ok(s.resolveChoice(0,'grain-seeds')),false),undone=ok(s.undoAction());assert.equal(undone.state.players[0]!.resources.wood,2);assert.equal(undone.state.players[0]!.resources.grain,0);assert.equal(undone.state.players[0]!.fenceSegments.length,0);assert.deepEqual(undone.state.actionSpaces,before.state.actionSpaces);assert.deepEqual(undone.state.players[0]!.workers,before.state.players[0]!.workers);fencePending(s,turn(s,0,'fencing'));const retry=finish(s,fence(s),false);assert.equal(retry.state.players[0]!.resources.wood,0);assert.equal(retry.state.players[0]!.resources.grain,0);save('B094-N4',{before,pending,placement,r,undone,retry})})
})
