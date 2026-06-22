import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A97_Freshman'
import '../../shared/cards/B/B77_LoamPit'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'
type SeasonsState = {
  enableThroughTheSeasons?: boolean
  throughTheSeasons?: {
    startSeason: SeasonId
    currentSeason: SeasonId
  } | null
}

const summerActionId = 'season-summer-farmers-market'

const seasonsOf = (session: GameSession) => session.state as typeof session.state & SeasonsState

const setupSummer = () => {
  const session = new GameSession(352, undefined, {
    playerCount: 2,
    enableThroughTheSeasons: true,
  } as never)
  const state = seasonsOf(session)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.throughTheSeasons = { startSeason: 'summer', currentSeason: 'summer' }
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setActiveWorkerCount(player, 2)
  setWorkersAtHome(state, player, 2)
  session.loadState(state)
  return session
}

const availableIds = (session: GameSession, playerIndex = 0) =>
  session.getAvailableActions(playerIndex).map((action) => action.spaceId)

const fillFarmyardWithFields = (session: GameSession) => {
  session.state.players[0]!.fields = Array.from({ length: 3 }).flatMap((_, row) =>
    Array.from({ length: 5 }).map((__, col) => ({ row, col, stacks: [] })),
  )
}

const chooseByLabel = (
  session: GameSession,
  resp: SessionResponse,
  labelKey: string,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected choice prompt')
  const option = resp.interaction.options?.find((entry) => entry.labelKey === labelKey)
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

describe('Through the Seasons Summer rules', () => {
  it('offers Farmer\'s Market plowing plus a bake-or-sell branch', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    player.resources.grain = 1
    player.improvements = ['Major_Fireplace1']

    let resp = session.takeAction(0, summerActionId)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Farmer\'s Market choice')
    expect(resp.interaction.options?.map((option) => option.labelKey)).toEqual(
      expect.arrayContaining([
        'actions.plow.name',
        'actions.season-summer-farmers-market.option-bread-or-sell',
      ]),
    )

    resp = chooseByLabel(
      session,
      resp,
      'actions.season-summer-farmers-market.option-bread-or-sell',
    )

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected bake-or-sell choice')
    expect(resp.interaction.options?.map((option) => option.labelKey)).toEqual(
      expect.arrayContaining([
        'actions.bake-bread.name',
        'actions.season-summer-farmers-market.option-sell-grain',
      ]),
    )
  })

  it('keeps Farmer\'s Market unavailable when none of its branches can happen', () => {
    const session = setupSummer()
    fillFarmyardWithFields(session)
    session.state.players[0]!.resources.grain = 0

    expect(availableIds(session)).not.toContain(summerActionId)
    expect(session.takeAction(0, summerActionId)).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
  })

  it('can plow then sell grain and hides selling when grain is unaffordable', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    player.resources.grain = 1
    const foodBefore = player.resources.food

    let resp = chooseByLabel(
      session,
      session.takeAction(0, summerActionId),
      'actions.plow.name',
    )

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected plow prompt')
    expect(resp.interaction.farm.farmType).toBe('plow')
    const tile = resp.interaction.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { tile })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected remaining Farmer\'s Market choice')
    expect(resp.interaction.options?.some((option) => option.labelKey === 'ui.interactionFlowDone')).toBe(true)

    resp = chooseByLabel(
      session,
      resp,
      'actions.season-summer-farmers-market.option-sell-grain',
    )

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 4)

    const noGrain = setupSummer()
    noGrain.state.players[0]!.resources.grain = 0
    const noGrainResp = noGrain.takeAction(0, summerActionId)
    expect(noGrainResp.ok).toBe(true)
    expect(noGrainResp.interaction.stateId).toBe('wait')
    if (noGrainResp.interaction.stateId !== 'wait') throw new Error('expected Farmer\'s Market choice')
    expect(noGrainResp.interaction.options?.map((option) => option.labelKey)).not.toContain(
      'actions.season-summer-farmers-market.option-sell-grain',
    )
    expect(noGrainResp.interaction.options?.map((option) => option.labelKey)).not.toContain(
      'actions.season-summer-farmers-market.option-bread-or-sell',
    )
  })

  it('uses hook-dispatched bake doability when building the Farmer\'s Market bread branch', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    fillFarmyardWithFields(session)
    player.occupationPlayed.push('A97_Freshman')
    player.occupationHand = ['A114_SeasonalWorker']
    player.resources.grain = 0

    expect(availableIds(session)).toContain(summerActionId)
    let resp = session.takeAction(0, summerActionId)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Farmer\'s Market choice')
    expect(resp.interaction.options?.map((option) => option.labelKey)).toContain('ui.interactionFreshmanOccupation')

    resp = chooseByLabel(session, resp, 'ui.interactionFreshmanOccupation')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Freshman prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionFreshmanOccupation')
  })

  it('adds one grain to Day Laborer in Summer', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    const grainBefore = player.resources.grain
    const foodBefore = player.resources.food

    const resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 2)
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('adds Summer Day Laborer grain only once when card gain leaves run under the space', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    player.minorPlayed.push('B77_LoamPit')
    const grainBefore = player.resources.grain
    const foodBefore = player.resources.food
    const clayBefore = player.resources.clay

    const resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 2)
    expect(resp.state.players[0]!.resources.clay).toBe(clayBefore + 3)
    expect(resp.state.players[0]!.resources.grain).toBe(grainBefore + 1)
  })

  it('offers one free ordinary stable per room built in Summer', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    Object.assign(player.resources, { wood: 10, reed: 4 })
    player.minorPlayed.push('B85_FarmHand')

    let resp = session.takeAction(0, 'farm-expansion')
    resp = chooseByLabel(session, resp, 'actions.construct.name')

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected room prompt')
    expect(resp.interaction.farm.farmType).toBe('room')
    const rooms = resp.interaction.farm.selectableTiles.slice(0, 2)
    expect(rooms).toHaveLength(2)
    resp = session.commitSelectionChoice(0, { rooms })

    resp = chooseByLabel(session, resp, 'actions.stables.name')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected stable prompt')
    expect(resp.interaction.farm.farmType).toBe('stable')
    expect(resp.interaction.farm.maxSelections).toBe(2)
    expect('farmHandPositions' in resp.interaction.farm).toBe(false)
    const stables = resp.interaction.farm.selectableTiles.slice(0, 2)
    expect(stables).toHaveLength(2)
    resp = session.commitSelectionChoice(0, { stables })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(4)
    expect(resp.state.players[0]!.stableTiles).toEqual(expect.arrayContaining(stables))
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })

  it('lets the player skip Summer free stables after building rooms', () => {
    const session = setupSummer()
    const player = session.state.players[0]!
    Object.assign(player.resources, { wood: 5, reed: 2 })

    let resp = session.takeAction(0, 'farm-expansion')
    resp = chooseByLabel(session, resp, 'actions.construct.name')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected room prompt')
    const room = resp.interaction.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [room] })

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional stable prompt')
    expect(resp.interaction.options?.some((option) => option.value === '__skip__')).toBe(true)
    resp = session.resolveChoice(0, '__skip__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(resp.state.players[0]!.stableTiles).toHaveLength(0)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })
})
