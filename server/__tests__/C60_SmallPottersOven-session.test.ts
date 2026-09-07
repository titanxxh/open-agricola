import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D106_WhiskyDistiller'
import '../../shared/cards/C/C060_SmallPottersOven'
import '../../shared/cards/D/D066_PotterCeramics'
import '../../shared/cards/__stubs__/STUB_BeforeBakeGainClay'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

const setupBakeViaC60 = (
  grain: number,
  overrides: {
    extraPlayedCards?: string[]
    improvements?: string[]
    clay?: number
    stone?: number
  } = {},
) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push('C060_SmallPottersOven', ...(overrides.extraPlayedCards ?? []))
  player.resources = {
    ...player.resources,
    grain,
    clay: overrides.clay ?? 3,
    stone: overrides.stone ?? 1,
    food: 0,
  }
  player.fields = []
  player.improvements = overrides.improvements ?? []
  player.minorHand = ['__test_placeholder__']
  player.occupationHand = ['__test_placeholder__']
  state.players[1]!.minorHand = ['__test_placeholder__']
  state.players[1]!.occupationHand = ['__test_placeholder__']
  state.availableMajorImprovements = ['Major_ClayOven']

  session.loadState(state)
  return session
}

describe('C060_SmallPottersOven server session', () => {
  it('returns the only oven from onBuy and logs separate cardEffectGain on play', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.clay = 2
    player.resources.food = 0
    player.minorHand = ['C060_SmallPottersOven']
    player.improvements = ['Major_ClayOven']

    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const c60Option = resp.interaction.request.options?.find(
      (option) => option.value === 'C060_SmallPottersOven',
    )
    expect(c60Option).toBeDefined()

    resp = session.resolveChoice(0, c60Option!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain('C060_SmallPottersOven')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(resp.state.availableMajorImprovements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)

    const playLog = resp.state.log.find(
      (entry) => entry.key === 'log.playMinorImprovement',
    )
    expect(playLog?.params?.improvements).toBe('C060_SmallPottersOven')
    expect(playLog?.params?.returnedCards).toBeUndefined()
    expect(playLog?.params?.costResources).toEqual({ clay: 2 })

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'C060_SmallPottersOven',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 5 })
  })

  it('asks which oven to return from onBuy when both ovens are owned', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.clay = 2
    player.resources.food = 0
    player.minorHand = ['C060_SmallPottersOven']
    player.improvements = ['Major_ClayOven', 'Major_StoneOven']

    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const c60Option = resp.interaction.request.options?.find(
      (option) => option.value === 'C060_SmallPottersOven',
    )
    expect(c60Option).toBeDefined()

    resp = session.resolveChoice(0, c60Option!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenReturn')
    expect(resp.interaction.request.options?.map((option) => option.labelKey)).toEqual([
      'improvements.Major_ClayOven.name',
      'improvements.Major_StoneOven.name',
    ])

    const returnStone = resp.interaction.request.options?.find(
      (option) => option.labelKey === 'improvements.Major_StoneOven.name',
    )
    expect(returnStone).toBeDefined()

    resp = session.resolveChoice(0, returnStone!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain('C060_SmallPottersOven')
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_StoneOven')
    expect(resp.state.availableMajorImprovements).toContain('Major_StoneOven')
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)
  })

  it('keeps Grain Utilization unavailable when the resulting mandatory bake has no option', () => {
    const session = setupBakeViaC60(0)

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources).toMatchObject({ grain: 0, clay: 3, stone: 1, food: 0 })
    expect(
      resp.state.actionSpaces
        .find((space) => space.id === 'grain-utilization')
        ?.takenBy.some((worker) => worker.playerId === resp.state.players[0]!.id),
    ).toBe(false)
  })

  it('does not build an oven when the original mandatory bake cannot complete', () => {
    const session = setupBakeViaC60(0, {
      clay: 4,
      stone: 4,
    })
    const state = session.getState().state
    state.availableMajorImprovements = ['Major_ClayOven', 'Major_StoneOven']
    session.loadState(state)

    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    const resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.improvements).toEqual([])
    expect(resp.state.availableMajorImprovements).toEqual(expect.arrayContaining([
      'Major_ClayOven',
      'Major_StoneOven',
    ]))
    expect(resp.state.players[0]!.resources).toMatchObject({ grain: 0, clay: 4, stone: 4, food: 0 })
  })

  it('rejects a C60 build choice if grain disappears before selection', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['D106_WhiskyDistiller'],
    })
    session.getState().state.players[0]!.resources.grain = 5

    let resp = session.takeAction(0, 'grain-utilization')
    resp = resolveTriggerIfPresent(session, resp, 'C060_SmallPottersOven')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const buildOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp.state.players[0]!.resources.grain = 0
    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(false)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources).toMatchObject({ grain: 0, clay: 3, stone: 1, food: 0 })
  })

  it('builds the C60 oven source before non-empty bake when it is the only bake source', () => {
    const session = setupBakeViaC60(1)

    let resp = session.takeAction(0, 'grain-utilization')
    resp = resolveTriggerIfPresent(session, resp, 'C060_SmallPottersOven')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    const bakeLog = resp.state.log.find((entry) => entry.key === 'log.bakeBread')
    expect(bakeLog?.params).toMatchObject({
      sourceActionId: 'grain-utilization',
    })
  })

  it('keeps C60 optional when D66 can unlock bake without buying an oven', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['D066_PotterCeramics'],
      improvements: ['Major_Fireplace1'],
      clay: 6,
    })

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources.clay).toBe(6)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    if (resp.interaction.promptKey === 'ui.interactionSmallPottersOvenBuild') {
      resp = session.resolveChoice(0, '__skip__')
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
    }

    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.request.options?.find((option) => option.value === 'D066_PotterCeramics')?.disabled).not.toBe(true)
  })

  it('allows C60 to create the oven source before D66 creates grain', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['D066_PotterCeramics'],
      clay: 6,
    })

    let resp = session.takeAction(0, 'grain-utilization')
    resp = resolveTriggerIfPresent(session, resp, 'C060_SmallPottersOven')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources.clay).toBe(3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven')
    const ovenBakeOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(ovenBakeOption).toBeDefined()

    resp = session.resolveChoice(0, ovenBakeOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.request.options?.find((option) => option.value === 'D066_PotterCeramics')?.disabled).not.toBe(true)

    resp = session.resolveChoice(0, 'D066_PotterCeramics')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === 'D066_PotterCeramics') {
      const d66Option = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
      expect(d66Option).toBeDefined()
      resp = session.resolveChoice(0, d66Option!.value)
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      resp = session.resolveChoice(0, 'Major_ClayOven')
    }
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('allows C60 plus STUB plus D66 to build oven, gain clay, gain grain, then bake', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['STUB_BeforeBakeGainClay', 'D066_PotterCeramics'],
      clay: 3,
    })

    let resp = session.takeAction(0, 'grain-utilization')
    resp = resolveTriggerIfPresent(session, resp, 'C060_SmallPottersOven')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven')
    const ovenBakeOption = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
    expect(ovenBakeOption).toBeDefined()

    resp = session.resolveChoice(0, ovenBakeOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.request.options?.find((option) => option.value === 'D066_PotterCeramics')?.disabled).toBe(true)
    expect(resp.interaction.request.options?.find((option) => option.value === 'STUB_BeforeBakeGainClay')?.disabled).not.toBe(true)

    resp = session.resolveChoice(0, 'STUB_BeforeBakeGainClay')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.request.options?.find((option) => option.value === 'D066_PotterCeramics')?.disabled).not.toBe(true)

    resp = session.resolveChoice(0, 'D066_PotterCeramics')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === 'D066_PotterCeramics') {
      const d66Option = resp.interaction.request.options?.find((option) => option.value !== '__skip__')
      expect(d66Option).toBeDefined()
      resp = session.resolveChoice(0, d66Option!.value)
    }
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      resp = session.resolveChoice(0, 'Major_ClayOven')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
  })
})
