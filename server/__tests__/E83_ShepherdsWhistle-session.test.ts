import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getAdHocAction } from '../../shared/actions/helpers/ad-hoc-action-registry'

import '../../shared/cards/E/E083_ShepherdsWhistle'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import * as audit43Harvest from './_helpers/audit/ae-negative-43-harvest'

const CARD_ID = 'E083_ShepherdsWhistle'

const setupSession = () => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  return { session, state }
}

describe('E083_ShepherdsWhistle session — reorganize fallback', () => {
  it('returns gain sheep flow when player has at least 1 empty unfenced stable', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // One unfenced stable tile, no animal in it.
    player.stableTiles = [{ row: 0, col: 0 }]
    player.stableAnimals = {}
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onEndHarvestFeedingPhase!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ sheep: 1 })
  })

  it('returns optional reorganize+recheck seq when all unfenced stables are occupied', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // Single unfenced stable, occupied by a sheep.
    player.stableTiles = [{ row: 0, col: 0 }]
    player.stableAnimals = { '0-0': { animalType: 'sheep', animalCount: 1 } }
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onEndHarvestFeedingPhase!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const seq = flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.optional).toBe(true)
    expect(seq.children.length).toBe(2)
    const reorgChild = seq.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(reorgChild.actionId).toBe('reorganize')
    const checkChild = seq.children[1] as Extract<ActionFlow, { type: 'leaf' }>
    expect(checkChild.actionId).toBe('card_E083_ShepherdsWhistle_post-reorg-check')
  })

  it('does NOT trigger when player has no unfenced stables at all', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = []
    player.stableAnimals = {}
    session.loadState(state)

    const effect = session.withCtx(() => getCardEffect(CARD_ID))!
    const flow = session.withCtx(() => effect.onEndHarvestFeedingPhase!(state, player))
    expect(flow).toBeUndefined()
  })

  it('post-reorg-check leaf gains sheep when an empty unfenced stable exists after reorg', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    // Two unfenced stables — one now empty after the simulated reorg.
    player.stableTiles = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
    ]
    player.stableAnimals = { '0-0': { animalType: 'sheep', animalCount: 1 } }
    session.loadState(state)

    const adHoc = getAdHocAction('card_E083_ShepherdsWhistle_post-reorg-check')!
    const result = session.withCtx(() => adHoc.execute({
      state,
      player,
      params: undefined,
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0]))

    expect(result.type).toBe('flow')
    const r = result as Extract<typeof result, { type: 'flow' }>
    const leaf = r.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ sheep: 1 })
  })

  it('post-reorg-check leaf is no-op when reorg did not free any unfenced stable', () => {
    const { session, state } = setupSession()
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.stableTiles = [{ row: 0, col: 0 }]
    player.stableAnimals = { '0-0': { animalType: 'sheep', animalCount: 1 } }
    session.loadState(state)

    const adHoc = getAdHocAction('card_E083_ShepherdsWhistle_post-reorg-check')!
    const result = session.withCtx(() => adHoc.execute({
      state,
      player,
      params: undefined,
      sourceCard: CARD_ID,
    } as Parameters<typeof adHoc.execute>[0]))

    expect(result.type).toBe('ok')
  })
})

describe('ae-negative-43-harvest', () => {
  const { WHISTLE, sessions, save, ok, make, purchase, yard, nextRound } = audit43Harvest
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('E083 N1 actual wood purchase then natural harvest with several empty unfenced stables grants only one sheep',()=>{const s=make(WHISTLE,false,state=>state.players[0]!.resources.wood=1),a=purchase(s,WHISTLE);assert.equal(a.r.state.players[0]!.resources.wood,0);const t=make(WHISTLE,true,state=>state.players[0]!.stableTiles=[{row:0,col:1},{row:0,col:2}]),mid=ok(t.takeAction(0,'reed-bank')),r=nextRound(t,8);assert.equal(mid.state.players[0]!.resources.sheep,0);assert.equal(r.state.players[0]!.resources.sheep,1);assert.equal(r.state.players[1]!.resources.sheep,0);save('E083-N1',{a,mid,r})})
  it('E083 N2 no unfenced stable fenced stable and hand card never grant sheep',()=>{for(const mode of['none','fenced','hand']){const s=make(WHISTLE,mode!=='hand',state=>{const p=state.players[0]!;if(mode==='fenced')yard(state,1);if(mode==='hand')p.stableTiles=[{row:0,col:1}]}),r=nextRound(s,8,false);assert.equal(r.state.players[0]!.resources.sheep,mode==='fenced'?1:0);save(`E083-N2-${mode}`,r)}})
})
