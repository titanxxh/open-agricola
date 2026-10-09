import { type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B089_Groom'
import type { ActionFlow } from '../../shared/contract/types'

describe('B089_Groom session', () => {
  const setup = (options?: { houseType?: 'wood' | 'clay' | 'stone' }) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('B089_Groom')
    player.houseType = options?.houseType ?? 'stone'
    player.resources.wood = 0
    player.resources.food = 10
    session.loadState(state)
    session.devPlayCard(0, 'B089_Groom')
    return session
  }

  it('onBuy returns gain 1 wood flow', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 1 })
  })

  it('onBeforeStartOfTurn in stone house returns single optional stables leaf with internal cost', () => {
    const session = setup({ houseType: 'stone' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3 // enough for stable

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBeforeStartOfTurn')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('stables')
    expect(leaf.optional).toBe(true)
    expect(leaf.actionContext?.max).toBe(1)
    expect(leaf.actionContext?.exactCost).toEqual({ wood: 1, max: 1 })
    expect(leaf.actionContext?.costOverride).toBeUndefined()
  })

  it('onBeforeStartOfTurn in stone house with 0 wood: still emits trigger (no upfront block)', () => {
    const session = setup({ houseType: 'stone' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 0

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBeforeStartOfTurn')
    // The reference does not block at trigger time — payability is checked when player
    // chooses to act. Effect must still emit the leaf.
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('stables')
    expect(leaf.optional).toBe(true)
  })

  it('onBeforeStartOfTurn does not trigger in clay house', () => {
    const session = setup({ houseType: 'clay' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })

  it('onBeforeStartOfTurn does not trigger in wood house', () => {
    const session = setup({ houseType: 'wood' })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.wood = 3

    const flow = runCardEffectHook(state, player, 'B089_Groom', 'onBeforeStartOfTurn')
    expect(flow).toBeNull()
  })
})

describe('B089 Groom parity', () => {
  const CARD_ID = 'B089_Groom'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, houseType = 'stone' as 'wood' | 'clay' | 'stone', wood = 0,
  }: { played?: boolean; houseType?: 'wood' | 'clay' | 'stone'; wood?: number } = {}) => {
    const session = new GameSession(6089, undefined, { playerCount: 4 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.houseType = houseType
    owner.resources.wood = wood
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playOccupation = (session: GameSession) => {
    const response = session.takeAction(0, 'lessons')
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, card!.value)
  }

  const startNextRound = (session: GameSession) => {
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    return session.performRoundEnd()
  }

  const acceptGroom = (session: GameSession, response: SessionResponse) => {
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) =>
      option.value !== '__skip__' && option.sourceCard === CARD_ID)
      ?? options(response).find((option) => option.value !== '__skip__')
    if (!accept) return response
    return session.resolveChoice(response.interaction.playerIndex, accept.value)
  }

  it('B089 S1: playing Groom immediately gains one wood', () => {
    const response = playOccupation(setup({ played: false, houseType: 'wood' }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players).toHaveLength(4)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('B089 S2: at round start a stone-house owner can pay one wood for exactly one stable', () => {
    const session = setup({ wood: 1 })
    let response = acceptGroom(session, startNextRound(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'farm-select') return
    const stable = response.interaction.request.farm.selectableTiles[0]
    expect(stable).toBeDefined()

    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('B089 S3: the Groom stable may be declined without paying wood', () => {
    const session = setup({ wood: 1 })
    let response = startNextRound(session)
    expect(options(response).some((option) => option.value === '__skip__')).toBe(true)

    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  for (const { scenario, houseType } of [
    { scenario: 'S4', houseType: 'wood' as const },
    { scenario: 'S5', houseType: 'clay' as const },
  ]) {
    it(`B089 ${scenario}: a ${houseType} house receives no Groom stable offer at round start`, () => {
      const response = startNextRound(setup({ houseType, wood: 1 }))

      expect(response.state.round).toBe(6)
      expect(options(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
      expect(response.state.players[0]!.stableTiles).toHaveLength(0)
      expect(response.state.players[0]!.resources.wood).toBe(1)
    })
  }

  it('B089 S6: a stone-house owner with no wood receives only a decline path for Groom', () => {
    const response = startNextRound(setup({ wood: 0 }))

    expect(options(response).filter((option) => option.value !== '__skip__'
      && option.sourceCard === CARD_ID)).toHaveLength(0)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('B089 S7: Groom cannot build two stables and remains legally retryable with one', () => {
    const session = setup({ wood: 2 })
    const opened = acceptGroom(session, startNextRound(session))
    expect(opened.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (opened.interaction.stateId !== 'wait'
      || opened.interaction.request.kind !== 'farm-select') return
    const stables = opened.interaction.request.farm.selectableTiles.slice(0, 2)
    expect(stables).toHaveLength(2)

    const bad = session.commitSelectionChoice(opened.interaction.playerIndex, { stables })
    expect(bad.ok).toBe(false)
    expect(bad.state.players[0]!.stableTiles).toHaveLength(0)
    expect(bad.state.players[0]!.resources.wood).toBe(2)

    const good = session.commitSelectionChoice(opened.interaction.playerIndex, {
      stables: [stables[0]!],
    })
    expect(good.ok, good.error).toBe(true)
    expect(good.state.players[0]!.stableTiles).toHaveLength(1)
    expect(good.state.players[0]!.resources.wood).toBe(1)
  })
})
