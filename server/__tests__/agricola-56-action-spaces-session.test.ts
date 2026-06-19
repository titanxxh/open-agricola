import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { SessionResponse } from '../../shared/contract/types'

const prepare = (playerCount: 5 | 6 = 5) => {
  const session = new GameSession(42, undefined, { playerCount })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  player.resources.food = 5
  player.occupationHand = ['A123_FrameBuilder']
  player.minorHand = ['__test_placeholder__']
  session.loadState(state)
  return session
}

const chooseFirst = (session: GameSession, playerIndex = 0) => {
  const interaction = session.getState().interaction
  if (interaction.stateId !== 'wait') throw new Error(`expected wait, got ${interaction.stateId}`)
  const option = interaction.options?.[0]
  if (!option) throw new Error('missing option')
  return session.resolveChoice(playerIndex, option.value)
}

const chooseFirstUntilDone = (
  session: GameSession,
  resp: SessionResponse,
  playerIndex = 0,
) => {
  while (resp.interaction.stateId === 'wait' && resp.interaction.options?.[0]) {
    resp = chooseFirst(session, playerIndex)
  }
  return resp
}

describe('5/6 expansion action spaces', () => {
  it('lessons-56-2f charges 2 food to play an occupation', () => {
    const session = prepare(5)

    let resp = session.takeAction(0, 'lessons-56-2f')
    expect(resp.ok).toBe(true)
    resp = chooseFirstUntilDone(session, resp)

    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
  })

  it('lessons-56-variable charges 1 food for the first two occupations', () => {
    const session = prepare(5)

    let resp = session.takeAction(0, 'lessons-56-variable')
    expect(resp.ok).toBe(true)
    resp = chooseFirstUntilDone(session, resp)

    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
  })

  it('lessons-56-variable charges 2 food from the third occupation onward', () => {
    const session = prepare(5)
    const state = session.getState().state
    state.players[0]!.occupationPlayed = ['A', 'B']
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons-56-variable')
    expect(resp.ok).toBe(true)
    resp = chooseFirstUntilDone(session, resp)

    expect(resp.state.players[0]!.resources.food).toBe(3)
    expect(resp.state.players[0]!.occupationPlayed).toContain('A123_FrameBuilder')
  })

  it('resource-market-56 grants reed, wood, and stone', () => {
    const session = prepare(5)

    const resp = session.takeAction(0, 'resource-market-56')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.reed).toBe(1)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })

  it('hollow-56 accumulates and grants 3 clay from round 1', () => {
    const session = prepare(5)

    const resp = session.takeAction(0, 'hollow-56')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(3)
    expect(resp.state.actionSpaces.find((space) => space.id === 'hollow-56')?.resources.clay).toBe(0)
  })

  it('resource-trade-6 grants food plus one rare and one common building resource', () => {
    const session = prepare(6)

    let resp = session.takeAction(0, 'resource-trade-6')
    expect(resp.ok).toBe(true)
    resp = chooseFirst(session)
    resp = chooseFirst(session)

    expect(resp.state.players[0]!.resources.food).toBe(6)
    expect(resp.state.players[0]!.resources.reed + resp.state.players[0]!.resources.stone).toBe(1)
    expect(resp.state.players[0]!.resources.wood + resp.state.players[0]!.resources.clay).toBe(1)
  })

  it('riverbank-forest-56 grants accumulated wood plus 1 reed', () => {
    const session = prepare(5)

    const resp = session.takeAction(0, 'riverbank-forest-56')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.reed).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'riverbank-forest-56')?.resources.wood).toBe(0)
  })

  it('animal-market-56 grants sheep and food before animal reorg', () => {
    const session = prepare(5)

    let resp = session.takeAction(0, 'animal-market-56')
    expect(resp.ok).toBe(true)
    const sheepOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.animal-market-56.option-sheep',
    )
    expect(sheepOption).toBeTruthy()
    resp = session.resolveChoice(0, sheepOption!.value)

    expect(resp.state.players[0]!.resources.food).toBe(6)
    expect(resp.state.players[0]!.resources.sheep).toBe(1)
    expect(resp.interaction.request.kind).toBe('animal-reorg')
  })

  it('animal-market-56 grants boar before animal reorg', () => {
    const session = prepare(5)

    let resp = session.takeAction(0, 'animal-market-56')
    expect(resp.ok).toBe(true)
    const boarOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.animal-market-56.option-boar',
    )
    expect(boarOption).toBeTruthy()
    resp = session.resolveChoice(0, boarOption!.value)

    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.interaction.request.kind).toBe('animal-reorg')
  })

  it('animal-market-56 paid cattle branch pays food and enters animal reorg', () => {
    const session = prepare(5)

    let resp = session.takeAction(0, 'animal-market-56')
    expect(resp.ok).toBe(true)
    const cattleOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.pay.name' &&
        JSON.stringify(option.descriptionPreview).includes('"cattle":1'),
    )
    expect(cattleOption).toBeTruthy()
    resp = session.resolveChoice(0, cattleOption!.value)

    expect(resp.state.players[0]!.resources.food).toBe(4)
    expect(resp.state.players[0]!.resources.cattle).toBe(1)
    expect(resp.interaction.request.kind).toBe('animal-reorg')
  })

  it('farm-supplies-6 can plow and buy grain in one action', () => {
    const session = prepare(6)
    const state = session.getState().state
    state.players[0]!.resources.food = 3
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-supplies-6')
    expect(resp.ok).toBe(true)
    const plowOption = resp.interaction.options?.find((option) =>
      JSON.stringify(option.descriptionPreview).includes('actions.plow.name'),
    )
    expect(plowOption).toBeTruthy()
    resp = session.resolveChoice(0, plowOption!.value)
    expect(resp.interaction.farm?.farmType).toBe('plow')
    const tile = resp.interaction.farm?.selectableTiles?.[0]
    expect(tile).toBeTruthy()
    resp = session.commitSelectionChoice(0, { tile })
    const grainOption = resp.interaction.options?.find((option) =>
      JSON.stringify(option.effectPreview).includes('"grain":1'),
    )
    expect(grainOption).toBeTruthy()
    resp = session.resolveChoice(0, grainOption!.value)

    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.fields).toHaveLength(1)
  })

  it('corral-6 grants the first missing animal by sheep, boar, cattle priority', () => {
    const session = prepare(6)
    let state = session.getState().state
    state.players[0]!.resources.sheep = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'corral-6')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.interaction.request.kind).toBe('animal-reorg')

    const full = prepare(6)
    state = full.getState().state
    state.players[0]!.resources.sheep = 1
    state.players[0]!.resources.boar = 1
    state.players[0]!.resources.cattle = 1
    full.loadState(state)
    resp = full.takeAction(0, 'corral-6')
    expect(resp.ok).toBe(false)
  })

  it('side-job-6 stable branch builds exactly one stable for 1 wood', () => {
    const session = prepare(6)
    const state = session.getState().state
    state.players[0]!.resources.wood = 2
    state.players[0]!.resources.grain = 0
    session.loadState(state)

    let resp = session.takeAction(0, 'side-job-6')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.farm?.farmType).toBe('stable')
    const stable = resp.interaction.farm?.selectableTiles?.[0]
    expect(stable).toBeTruthy()
    resp = session.commitSelectionChoice(0, { stables: [stable!] })

    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.stableTiles).toHaveLength(1)
  })

  it('side-job-6 bake-only branch bakes bread when stable is unavailable', () => {
    const session = prepare(6)
    const state = session.getState().state
    state.players[0]!.resources.wood = 0
    state.players[0]!.resources.grain = 1
    state.players[0]!.resources.food = 0
    state.players[0]!.improvements = ['Major_Fireplace1']
    session.loadState(state)

    const resp = session.takeAction(0, 'side-job-6')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
    expect(resp.state.players[0]!.stableTiles).toHaveLength(0)
  })

  it('side-job-6 can build a stable and bake bread in one action', () => {
    const session = prepare(6)
    const state = session.getState().state
    state.players[0]!.resources.wood = 2
    state.players[0]!.resources.grain = 1
    state.players[0]!.resources.food = 0
    state.players[0]!.improvements = ['Major_Fireplace1']
    session.loadState(state)

    let resp = session.takeAction(0, 'side-job-6')
    expect(resp.ok).toBe(true)
    const stableOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.stables.name',
    )
    expect(stableOption).toBeTruthy()
    resp = session.resolveChoice(0, stableOption!.value)
    expect(resp.interaction.farm?.farmType).toBe('stable')
    const stable = resp.interaction.farm?.selectableTiles?.[0]
    expect(stable).toBeTruthy()
    resp = session.commitSelectionChoice(0, { stables: [stable!] })
    const bakeOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.side-job-6.option-bake',
    )
    expect(bakeOption).toBeTruthy()
    resp = session.resolveChoice(0, bakeOption!.value)
    resp = chooseFirst(session)

    expect(resp.state.players[0]!.stableTiles).toHaveLength(1)
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(2)
  })

  it('house-building-56 opens room construction without a stable selection', () => {
    const session = prepare(5)
    const state = session.getState().state
    Object.assign(state.players[0]!.resources, { wood: 10, reed: 4 })
    session.loadState(state)

    const resp = session.takeAction(0, 'house-building-56')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.farm?.farmType).toBe('room')
    expect(resp.interaction.farm?.farmType).not.toBe('stable')
  })

  it('improvement-6 is minor-only before round 5 and major/minor from round 5', () => {
    const early = prepare(6)
    let state = early.getState().state
    state.round = 4
    Object.assign(state.players[0]!.resources, { wood: 20, clay: 20, reed: 20, stone: 20, food: 20 })
    state.players[0]!.minorHand = ['__test_placeholder__']
    early.loadState(state)
    expect(early.takeAction(0, 'improvement-6').ok).toBe(false)

    const late = prepare(6)
    state = late.getState().state
    state.round = 5
    Object.assign(state.players[0]!.resources, { wood: 20, clay: 20, reed: 20, stone: 20, food: 20 })
    state.players[0]!.minorHand = ['__test_placeholder__']
    late.loadState(state)
    const resp = late.takeAction(0, 'improvement-6')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.options?.some((option) => option.value.startsWith('major:'))).toBe(true)
  })
})
