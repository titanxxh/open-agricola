import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import '../../shared/cards/register-all'
import { clearActionHooks, registerActionHook } from '../../shared/actions/hooks'
import { markAllWorkersUsed } from '../../shared/domain/player'

import '../../shared/cards/A/A165_PigBreeder'

const CARD_ID = 'A165_PigBreeder'

const setupPlayerWithCard = (round: number) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = round
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  session.loadState(state)
  return { state, player, session }
}

const withPasture = (player: { pastures: unknown }, capacityTiles = 1) => {
  player.pastures = [
    { id: 'past-1', tiles: Array.from({ length: capacityTiles }, () => ({ row: 0, col: 0 })), stables: 0, animalType: null, animalCount: 0 },
  ] as unknown as typeof player.pastures
}

describe('A165 PigBreeder onAfterRoundEnd', () => {
  it('round 11: no breed flow (only fires at round 12)', () => {
    const { state, player } = setupPlayerWithCard(11)
    player.resources.boar = 4
    withPasture(player, 1)
    const effect = getCardEffect(CARD_ID)
    expect(effect?.onAfterRoundEnd).toBeDefined()
    const flow = effect!.onAfterRoundEnd!(state, player)
    expect(flow).toBeUndefined()
  })

  it('round 12 with 0 boar: no breed flow', () => {
    const { state, player } = setupPlayerWithCard(12)
    player.resources.boar = 0
    withPasture(player, 1)
    const flow = getCardEffect(CARD_ID)!.onAfterRoundEnd!(state, player)
    expect(flow).toBeUndefined()
  })

  it('round 12 with 1 boar: no breed flow (need ≥2)', () => {
    const { state, player } = setupPlayerWithCard(12)
    player.resources.boar = 1
    withPasture(player, 1)
    const flow = getCardEffect(CARD_ID)!.onAfterRoundEnd!(state, player)
    expect(flow).toBeUndefined()
  })

  it('round 12 with ≥2 boar but no free capacity: no breed flow', () => {
    const { state, player } = setupPlayerWithCard(12)
    // House has cap 1, occupy it. No pastures, no stables.
    player.pastures = [] as unknown as typeof player.pastures
    player.houseAnimalType = 'boar'
    player.houseAnimalCount = 1
    player.resources.boar = 2
    const flow = getCardEffect(CARD_ID)!.onAfterRoundEnd!(state, player)
    expect(flow).toBeUndefined()
  })

  it('round 12 with ≥2 boar and free capacity: returns breedLeaf for boar', () => {
    const { state, player } = setupPlayerWithCard(12)
    withPasture(player, 1)
    player.resources.boar = 2
    const flow = getCardEffect(CARD_ID)!.onAfterRoundEnd!(state, player)
    expect(flow).toBeDefined()
    expect(flow).toMatchObject({
      type: 'leaf',
      actionId: 'breed',
      sourceCard: CARD_ID,
      actionContext: expect.objectContaining({
        animalTypes: ['boar'],
        sourceCard: CARD_ID,
      }),
    })
  })
})

describe('A165 PigBreeder session integration', () => {
  beforeEach(() => {
    clearActionHooks()
  })

  it('round 12 finalize: boar+1 + animalReorg pending', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 12
    const p0 = state.players[0]!
    p0.occupationPlayed.push(CARD_ID)
    p0.resources.boar = 2
    // capacity-2 pasture pre-populated with 2 boar so hasPendingAnimals=false
    // before performRoundEnd; the +1 boar from breeding will then leave 1 free
    // capacity remaining (size=2 → capacity=4), and reorg pending fires from
    // breedAction.execute returning {type:'animalReorg'}.
    p0.pastures = [
      {
        id: 'past-1',
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: 'boar',
        animalCount: 2,
      },
    ] as unknown as typeof p0.pastures
    state.players.forEach((p) => markAllWorkersUsed(state, p))
    session.loadState(state)

    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.boar).toBe(3)
    expect(resp.interaction.stateId).toBe("wait")
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.playerIndex : -1).toBe(0)
  })

  it('round 12 finalize: triggers onBreed-style after listener with sourceCard A165', () => {
    const session = new GameSession()
    // GameSession constructor calls clearActionHooks(); register AFTER it so the
    // hook survives until performRoundEnd is invoked.
    const observed: Array<{ sourceCard: unknown; animalTypes: unknown }> = []
    registerActionHook({
      id: 'test-on-breed-after',
      actions: ['breed'],
      phases: ['after'],
      handler: (ctx) => {
        const ac = ctx.actionContext as { sourceCard?: unknown; animalTypes?: unknown } | undefined
        observed.push({ sourceCard: ac?.sourceCard, animalTypes: ac?.animalTypes })
      },
    })
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 12
    const p0 = state.players[0]!
    p0.occupationPlayed.push(CARD_ID)
    p0.resources.boar = 2
    // capacity-2 pasture pre-populated with 2 boar so hasPendingAnimals=false
    // before performRoundEnd; the +1 boar from breeding will then leave 1 free
    // capacity remaining (size=2 → capacity=4), and reorg pending fires from
    // breedAction.execute returning {type:'animalReorg'}.
    p0.pastures = [
      {
        id: 'past-1',
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
        stables: 0,
        animalType: 'boar',
        animalCount: 2,
      },
    ] as unknown as typeof p0.pastures
    state.players.forEach((p) => markAllWorkersUsed(state, p))
    session.loadState(state)

    session.performRoundEnd()
    expect(observed.length).toBeGreaterThan(0)
    const a165Event = observed.find((o) => o.sourceCard === CARD_ID)
    expect(a165Event).toBeDefined()
    expect(a165Event?.animalTypes).toEqual(['boar'])
  })
})
