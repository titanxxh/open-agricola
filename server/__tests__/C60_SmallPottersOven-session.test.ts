import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D106_WhiskyDistiller'
import '../../shared/cards/C/C60_SmallPottersOven'
import '../../shared/cards/D/D66_PotterCeramics'
import '../../shared/cards/__stubs__/STUB_BeforeBakeGainClay'

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
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorPlayed.push('C60_SmallPottersOven', ...(overrides.extraPlayedCards ?? []))
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

describe('C60_SmallPottersOven server session', () => {
  it('returns the only oven from onBuy and logs separate cardEffectGain on play', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.clay = 2
    player.resources.food = 0
    player.minorHand = ['C60_SmallPottersOven']
    player.improvements = ['Major_ClayOven']

    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const c60Option = resp.interaction.options?.find(
      (option) => option.value === 'minor:C60_SmallPottersOven',
    )
    expect(c60Option).toBeDefined()

    resp = session.resolveChoice(0, c60Option!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain('C60_SmallPottersOven')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(resp.state.availableMajorImprovements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)

    const playLog = resp.state.log.find(
      (entry) => entry.key === 'log.playMinorImprovement',
    )
    expect(playLog?.params?.improvements).toBe('C60_SmallPottersOven')
    expect(playLog?.params?.returnedCards).toBeUndefined()
    expect(playLog?.params?.costResources).toEqual({ clay: 2 })

    const gainLog = resp.state.log.find(
      (entry) =>
        entry.key === 'log.cardEffectGain' &&
        entry.params?.cardId === 'C60_SmallPottersOven',
    )
    expect(gainLog?.params?.gain).toEqual({ food: 5 })
  })

  it('asks which oven to return from onBuy when both ovens are owned', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.clay = 2
    player.resources.food = 0
    player.minorHand = ['C60_SmallPottersOven']
    player.improvements = ['Major_ClayOven', 'Major_StoneOven']

    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const c60Option = resp.interaction.options?.find(
      (option) => option.value === 'minor:C60_SmallPottersOven',
    )
    expect(c60Option).toBeDefined()

    resp = session.resolveChoice(0, c60Option!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenReturn')
    expect(resp.interaction.options?.map((option) => option.labelKey)).toEqual([
      'improvements.Major_ClayOven.name',
      'improvements.Major_StoneOven.name',
    ])

    const returnStone = resp.interaction.options?.find(
      (option) => option.labelKey === 'improvements.Major_StoneOven.name',
    )
    expect(returnStone).toBeDefined()

    resp = session.resolveChoice(0, returnStone!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain('C60_SmallPottersOven')
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.improvements).not.toContain('Major_StoneOven')
    expect(resp.state.availableMajorImprovements).toContain('Major_StoneOven')
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)
  })

  it('blocks on mandatory bake after C60 builds an oven but no grain is available', () => {
    const session = setupBakeViaC60(0)

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    expect(resp.interaction.allowedCommands).toEqual(['undoStep', 'undoAction'])
    expect(resp.interaction.anytimeActions).toEqual([])
    expect(resp.interaction.promptKey).toBe('ui.interactionEngineBlocked')

    const invalidResolve = session.resolveChoice(0, 'confirm')
    expect(invalidResolve.ok).toBe(false)

    const undoResp = session.undoStep()
    expect(undoResp.ok).toBe(true)
    expect(undoResp.interaction.stateId).toBe('wait')
    if (undoResp.interaction.stateId !== 'wait') return
    expect(undoResp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    expect(undoResp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
  })

  it('rejects direct anytime commands while C60 mandatory bake is blocked', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['D106_WhiskyDistiller'],
    })
    session.getState().state.players[0]!.resources.grain = 5

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const buildOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp.state.players[0]!.resources.grain = 0
    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('engine-blocked')
    const anytimeResp = session.takeAnytimeAction(0, 'D106-whisky-distiller-anytime')
    expect(anytimeResp.ok).toBe(false)
    expect(anytimeResp.error).toContain('anytime blocked: engine-blocked')
    expect(anytimeResp.interaction.stateId).toBe('wait')
    if (anytimeResp.interaction.stateId !== 'wait') return
    expect(anytimeResp.interaction.request.kind).toBe('engine-blocked')
  })

  it('undoAction restores the action after C60 reaches mandatory bake blocked', () => {
    const session = setupBakeViaC60(0)

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const buildOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('engine-blocked')

    const undoResp = session.undoAction()
    expect(undoResp.ok).toBe(true)
    expect(undoResp.state.players[0]!.improvements).not.toContain('Major_ClayOven')
    expect(
      undoResp.state.actionSpaces
        .find((space) => space.id === 'grain-utilization')
        ?.takenBy.some((worker) => worker.playerId === undoResp.state.players[0]!.id),
    ).toBe(false)
    if (undoResp.interaction.stateId === 'wait') {
      expect(undoResp.interaction.request.kind).not.toBe('engine-blocked')
    }
  })

  it('builds the C60 oven source before non-empty bake when it is the only bake source', () => {
    const session = setupBakeViaC60(1)

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven')
    const ovenBakeOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(ovenBakeOption).toBeDefined()

    resp = session.resolveChoice(0, ovenBakeOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
  })

  it('keeps C60 optional when D66 can unlock bake without buying an oven', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['D66_PotterCeramics'],
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
    expect(resp.interaction.options?.find((option) => option.value === 'D66_PotterCeramics')?.disabled).not.toBe(true)
  })

  it('allows C60 to create the oven source before D66 creates grain', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['D66_PotterCeramics'],
      clay: 6,
    })

    let resp = session.takeAction(0, 'grain-utilization')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain('Major_ClayOven')
    expect(resp.state.players[0]!.resources.clay).toBe(3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven')
    const ovenBakeOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(ovenBakeOption).toBeDefined()

    resp = session.resolveChoice(0, ovenBakeOption!.value)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.options?.find((option) => option.value === 'D66_PotterCeramics')?.disabled).not.toBe(true)

    resp = session.resolveChoice(0, 'D66_PotterCeramics')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      resp = session.resolveChoice(0, 'Major_ClayOven')
    }
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
  })

  it('allows C60 plus STUB plus D66 to build oven, gain clay, gain grain, then bake', () => {
    const session = setupBakeViaC60(0, {
      extraPlayedCards: ['STUB_BeforeBakeGainClay', 'D66_PotterCeramics'],
      clay: 3,
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSmallPottersOvenBuild')
    const buildOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    resp = session.resolveChoice(0, buildOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionOptionalAction')
    expect(resp.interaction.sourceCard).toBe('Major_ClayOven')
    const ovenBakeOption = resp.interaction.options?.find((option) => option.value !== '__skip__')
    expect(ovenBakeOption).toBeDefined()

    resp = session.resolveChoice(0, ovenBakeOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.options?.find((option) => option.value === 'D66_PotterCeramics')?.disabled).toBe(true)
    expect(resp.interaction.options?.find((option) => option.value === 'STUB_BeforeBakeGainClay')?.disabled).not.toBe(true)

    resp = session.resolveChoice(0, 'STUB_BeforeBakeGainClay')
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionSelectTrigger')
    expect(resp.interaction.options?.find((option) => option.value === 'D66_PotterCeramics')?.disabled).not.toBe(true)

    resp = session.resolveChoice(0, 'D66_PotterCeramics')
    expect(resp.ok).toBe(true)
    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionBakeBreadChoice') {
      resp = session.resolveChoice(0, 'Major_ClayOven')
    }

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(5)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.clay).toBe(0)
  })
})
