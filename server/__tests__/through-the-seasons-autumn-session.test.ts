import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'
type SeasonsState = {
  enableThroughTheSeasons?: boolean
  throughTheSeasons?: {
    startSeason: SeasonId
    currentSeason: SeasonId
  } | null
}

const autumnActionId = 'season-autumn-thanksgiving'

const seasonsOf = (session: GameSession) => session.state as typeof session.state & SeasonsState

const setupAutumn = () => {
  const session = new GameSession(353, undefined, {
    playerCount: 2,
    enableThroughTheSeasons: true,
  } as never)
  const state = seasonsOf(session)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.throughTheSeasons = { startSeason: 'autumn', currentSeason: 'autumn' }
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

const expectChoiceLabelValue = (
  resp: SessionResponse,
  labelKey: string,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected choice prompt')
  const option = resp.interaction.options?.find((entry) => entry.labelKey === labelKey)
  expect(option).toBeDefined()
  return option!.value
}

const hasPaidResources = (
  option: { labelParams?: Record<string, unknown> },
  expected: Record<string, number>,
) => {
  const actual = (option.labelParams?.resourcesPaid ?? {}) as Record<string, number>
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)])
  return [...keys].every((key) => (actual[key] ?? 0) === (expected[key] ?? 0))
}

const choosePaymentByResources = (
  session: GameSession,
  resp: SessionResponse,
  expected: Record<string, number>,
) => {
  expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
  const option = resp.interaction.options?.find((candidate) => hasPaidResources(candidate, expected))
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

describe('Through the Seasons Autumn rules', () => {
  it('lets Thanksgiving reap private fields and stop without taking the vegetable branch', () => {
    const session = setupAutumn()
    const player = session.state.players[0]!
    const opponent = session.state.players[1]!
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    opponent.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    const vegetableBefore = player.resources.vegetable
    const start = session.takeAction(0, autumnActionId)
    expectChoiceLabelValue(start, 'actions.reap.name')

    let resp = chooseByLabel(session, start, 'actions.reap.name')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(1)
    expect(resp.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(resp.state.players[1]!.resources.grain).toBe(0)
    expect(resp.state.players[1]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(resp.state.harvestReapSummary).toBeUndefined()

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected remaining Thanksgiving choice')
    expect(resp.interaction.options?.some((option) => option.value === '__done__')).toBe(true)
    resp = session.resolveChoice(0, '__done__')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(vegetableBefore)
  })

  it('lets Thanksgiving gain vegetable before the private field phase', () => {
    const session = setupAutumn()
    const player = session.state.players[0]!
    player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 2 }] }]

    let resp = chooseByLabel(
      session,
      session.takeAction(0, autumnActionId),
      'actions.season-autumn-thanksgiving.option-vegetable',
    )

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')

    resp = chooseByLabel(session, resp, 'actions.reap.name')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.vegetable).toBe(2)
    expect(resp.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
  })

  it('makes the Autumn major-improvement building-resource discount mandatory', () => {
    const session = setupAutumn()
    const player = session.state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 2,
      stone: 2,
      clay: 0,
      reed: 0,
      food: 0,
    }
    stateAvailableMajors(session, ['Major_Joinery'])

    let resp = session.takeAction(0, 'major-improvement')

    expect(resp.ok).toBe(true)
    expect(resp.interaction.promptKey).toBe('prompt.selectPayment')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected payment choice')
    expect(resp.interaction.options?.some((option) => hasPaidResources(option, { wood: 2, stone: 2 }))).toBe(false)
    expect(resp.interaction.options?.some((option) => hasPaidResources(option, { wood: 1, stone: 2 }))).toBe(true)
    expect(resp.interaction.options?.some((option) => hasPaidResources(option, { wood: 2, stone: 1 }))).toBe(true)

    resp = choosePaymentByResources(session, resp, { wood: 1, stone: 2 })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.improvements).toContain('Major_Joinery')
    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
  })

  it('does not apply the Autumn major-improvement discount to major-identity minors', () => {
    const session = setupAutumn()
    const player = session.state.players[0]!
    player.improvements = ['Major_Pottery']
    player.minorHand = ['D60_LargePottery']
    player.resources = {
      ...player.resources,
      clay: 1,
      stone: 1,
      wood: 0,
      reed: 0,
      food: 0,
    }
    stateAvailableMajors(session, [])

    const resp = session.takeAction(0, 'major-improvement')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.minorPlayed).toContain('D60_LargePottery')
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
  })
})

const stateAvailableMajors = (session: GameSession, ids: string[]) => {
  session.state.availableMajorImprovements = [...ids]
  session.state.majorImprovementSupply = undefined
}
