import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { emptyResources } from '../../shared/session/state-bootstrap'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'

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
  const option = resp.interaction.request.options?.find((entry) => entry.labelKey === labelKey)
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

const expectChoiceLabelValue = (
  resp: SessionResponse,
  labelKey: string,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected choice prompt')
  const option = resp.interaction.request.options?.find((entry) => entry.labelKey === labelKey)
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
  const option = resp.interaction.request.options?.find((candidate) => hasPaidResources(candidate, expected))
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const auditClone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const auditAutumn = () => {
  const session = setupAutumn()
  session.state.round = 7
  for (const player of session.state.players) player.resources = { ...emptyResources, food: 50 }
  return session
}
const auditRestore = (session: GameSession) => {
  const restored = new GameSession(353, undefined, { playerCount: 2 })
  const response = restored.loadState(rehydrateState(auditClone(serializeSessionSnapshot(session.state, session))))
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toEqual(session.getState().interaction)
  return restored
}
const auditDone = (session: GameSession) => {
  const response = session.getState()
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    const option = response.interaction.request.options.find((entry) => entry.value === '__done__' || entry.value === '__skip__')
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    expect(session.resolveChoice(0, option!.value).ok).toBe(true)
  }
}

describe('Seasons batch 3 autumn audit', () => {
  it.each(['reap', 'vegetable', 'reap-vegetable', 'vegetable-reap'] as const)('Thanksgiving %s is private, one-time, and survives intermediate restore', (order) => {
    let session = auditAutumn()
    for (const player of session.state.players) {
      player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 1 }] }, { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] }, { row: 0, col: 2, stacks: [] }]
      player.resources.sheep = 2
      player.pastures = [{ id: 'pen', size: 2, tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], stables: 0, animalType: 'sheep', animalCount: 2 }]
      player.fenceSegments = ['H-0-3', 'H-0-4', 'H-1-3', 'H-1-4', 'V-0-3', 'V-0-5'].map((edge) => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } }))
    }
    const before = auditClone(session.state)
    expect(session.takeAction(0, autumnActionId).ok).toBe(true)
    for (const action of order.split('-')) {
      session = auditRestore(session)
      const response = session.getState()
      const label = action === 'reap' ? 'actions.reap.name' : 'actions.season-autumn-thanksgiving.option-vegetable'
      const option = response.interaction.request.options.find((entry) => entry.labelKey === label)!
      expect(option).toBeDefined()
      const waiting = auditClone(session.state)
      expect(session.resolveChoice(1, option.value).ok).toBe(false)
      expect(session.resolveChoice(0, 'invalid-autumn').ok).toBe(false)
      expect(auditClone(session.state)).toEqual(waiting)
      expect(session.resolveChoice(0, option.value).ok).toBe(true)
    }
    auditDone(session)
    const player = session.state.players[0]!
    expect(player.resources).toEqual({ ...before.players[0]!.resources, grain: order.includes('reap') ? 1 : 0, vegetable: (order.includes('reap') ? 1 : 0) + (order.includes('vegetable') ? 1 : 0) })
    expect(player.fields[0]!.stacks).toEqual(order.includes('reap') ? [] : [{ kind: 'grain', remaining: 1 }])
    expect(player.fields[1]!.stacks).toEqual([{ kind: 'vegetable', remaining: order.includes('reap') ? 1 : 2 }])
    expect(session.state.players[1]).toEqual(before.players[1])
    expect(session.state.harvestReapSummary).toBeUndefined()
    expect(session.state.harvestBreedSummary).toBeUndefined()
    expect(session.state.events.some((event) => event.type === 'farm.animalBred')).toBe(false)
    expect(session.state.log.length).toBeGreaterThan(before.log.length)
    session = auditRestore(session)
    expect(session.state.players[0]!.resources).toEqual(player.resources)
  })

  it.each([0, 2])('Thanksgiving with %i empty fields still grants one vegetable', (fields) => {
    const session = auditAutumn()
    session.state.players[0]!.fields = Array.from({ length: fields }, (_, col) => ({ row: 0, col, stacks: [] }))
    const response = session.takeAction(0, autumnActionId)
    expect(response.ok, response.error).toBe(true)
    auditDone(session)
    expect(session.state.players[0]!.resources).toEqual({ ...emptyResources, food: 50, vegetable: 1 })
    expect(session.state.players[0]!.fields).toHaveLength(fields)
    expect(session.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
  })

  it.each([
    { major: 'Major_Fireplace1', supply: { clay: 1 }, paid: { clay: 1 } },
    { major: 'Major_CookingHearth1', supply: { clay: 3 }, paid: { clay: 3 } },
    { major: 'Major_Joinery', supply: { wood: 2, stone: 2 }, paid: { wood: 1, stone: 2 } },
    { major: 'Major_Joinery', supply: { wood: 2, stone: 2 }, paid: { wood: 2, stone: 1 } },
    { major: 'Major_Pottery', supply: { clay: 2, stone: 2 }, paid: { clay: 1, stone: 2 } },
  ].flatMap((row) => ['major-improvement', 'house-redevelopment'].map((action) => ({ ...row, action }))))(
    '$action buys $major with exactly the chosen one-resource discount $paid', ({ major, supply, paid, action }) => {
      let session = auditAutumn()
      const player = session.state.players[0]!
      Object.assign(player.resources, supply)
      if (action === 'house-redevelopment') { player.resources.clay += 2; player.resources.reed += 1 }
      stateAvailableMajors(session, [major])
      const before = auditClone(session.state)
      let response = session.takeAction(0, action)
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice' && response.interaction.promptKey !== 'prompt.selectPayment') {
        const option = response.interaction.request.options.find((entry) => entry.value !== '__skip__')!
        expect(option).toBeDefined()
        response = session.resolveChoice(0, option.value)
      }
      if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') {
        session = auditRestore(session)
        const waiting = auditClone(session.state)
        const option = session.getState().interaction.request.options.find((entry) => hasPaidResources(entry, paid))!
        expect(option).toBeDefined()
        expect(session.resolveChoice(1, option.value).ok).toBe(false)
        expect(session.resolveChoice(0, 'invalid-payment').ok).toBe(false)
        expect(auditClone(session.state)).toEqual(waiting)
        response = session.resolveChoice(0, option.value)
        expect(response.ok, response.error).toBe(true)
      }
      auditDone(session)
      const expected = { ...before.players[0]!.resources }
      for (const resource of ['wood', 'clay', 'reed', 'stone'] as const) expected[resource] -= (paid as Partial<typeof expected>)[resource] ?? 0
      if (action === 'house-redevelopment') { expected.clay -= 2; expected.reed -= 1 }
      expect(session.state.players[0]!.resources).toEqual(expected)
      expect(session.state.players[0]!.improvements).toContain(major)
      expect(session.state.availableMajorImprovements).not.toContain(major)
      expect(session.state.players[1]).toEqual(before.players[1])
      session = auditRestore(session)
      expect(session.state.players[0]!.improvements.filter((id) => id === major)).toHaveLength(1)
      session.state.round = 14
      session.state.players.forEach((entry) => markAllWorkersUsed(session.state, entry))
      expect(session.loadState(session.state).ok).toBe(true)
      let final = session.performRoundEnd()
      for (let step = 0; !final.state.gameOver && step < 20; step++) {
        expect(final.ok, final.error).toBe(true)
        const request = final.interaction.request
        if (request.kind === 'feed') final = session.resolveChoice(final.interaction.playerIndex, 'confirm', { selections: [] })
        else if (request.kind === 'choice' && request.options.some((option) => option.value === '__skip__')) final = session.resolveChoice(final.interaction.playerIndex, '__skip__')
        else throw new Error(JSON.stringify(final.interaction))
      }
      expect(final.ok, final.error).toBe(true)
      expect(final.state.gameOver).toBe(true)
      const vp = major === 'Major_Fireplace1' || major === 'Major_CookingHearth1' ? 1 : 2
      expect(final.scores![0]!.categories.find((category) => category.key === 'cards')).toMatchObject({ total: vp, entries: [{ type: 'card', cardId: major, cardType: 'major', score: vp }] })
      expect(final.scores!.every((score) => Number.isInteger(score.total))).toBe(true)
      for (const viewer of ['p1', 'p2', null]) expect(session.buildSyncPayload(final, viewer).scores).toEqual(final.scores)
    },
  )

  it('autumn discount cannot buy a Fireplace for no clay', () => {
    const session = auditAutumn()
    stateAvailableMajors(session, ['Major_Fireplace1'])
    const before = auditClone(session.state)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
  })

  it('autumn does not discount an ordinary minor improvement building cost', () => {
    const session = auditAutumn()
    session.state.players[0]!.minorHand = ['A067_CornScoop']
    session.state.players[0]!.resources.wood = 1
    stateAvailableMajors(session, [])
    const before = auditClone(session.state)
    const response = session.takeAction(0, 'major-improvement')
    expect(response.ok, response.error).toBe(true)
    auditDone(session)
    expect(session.state.players[0]!.resources.wood).toBe(0)
    expect(session.state.players[0]!.minorPlayed).toContain('A067_CornScoop')
    expect(session.state.players[1]!.resources).toEqual(before.players[1]!.resources)
  })

  it('autumn major purchase cannot bypass a missing second building material', () => {
    const session = auditAutumn()
    session.state.players[0]!.resources.wood = 2
    session.state.players[0]!.resources.stone = 0
    stateAvailableMajors(session, ['Major_Joinery'])
    const before = auditClone(session.state)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(false)
    expect(auditClone(session.state)).toEqual(before)
  })

  it('autumn final harvest follows Thanksgiving normally and publishes integer scores', () => {
    const session = auditAutumn()
    session.state.players[0]!.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }]
    const response = session.takeAction(0, autumnActionId)
    expect(chooseByLabel(session, response, 'actions.reap.name').ok).toBe(true)
    auditDone(session)
    session.state.round = 14
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))
    expect(session.loadState(session.state).ok).toBe(true)
    let final = session.performRoundEnd()
    for (let step = 0; !final.state.gameOver && step < 20; step++) {
      expect(final.ok, final.error).toBe(true)
      const request = final.interaction.request
      if (request.kind === 'feed') final = session.resolveChoice(final.interaction.playerIndex, 'confirm', { selections: [] })
      else throw new Error(JSON.stringify(final.interaction))
    }
    expect(final.state.gameOver).toBe(true)
    expect(final.state.players[0]!.resources.grain).toBe(2)
    expect(final.state.players[0]!.fields[0]!.stacks).toEqual([])
    expect(final.scores![0]!.categories.find((category) => category.key === 'grains')).toMatchObject({ quantity: 2, total: 1 })
    expect(final.scores!.every((score) => Number.isInteger(score.total))).toBe(true)
    expect(session.buildSyncPayload(final, null).scores).toEqual(final.scores)
  })
})

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
    expect(resp.interaction.request.options?.some((option) => option.value === '__done__')).toBe(true)
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
    expect(resp.interaction.request.options?.some((option) => hasPaidResources(option, { wood: 2, stone: 2 }))).toBe(false)
    expect(resp.interaction.request.options?.some((option) => hasPaidResources(option, { wood: 1, stone: 2 }))).toBe(true)
    expect(resp.interaction.request.options?.some((option) => hasPaidResources(option, { wood: 2, stone: 1 }))).toBe(true)

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
    player.minorHand = ['D060_LargePottery']
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
    expect(resp.state.players[0]!.minorPlayed).toContain('D060_LargePottery')
    expect(resp.state.players[0]!.resources.clay).toBe(0)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
  })
})

const stateAvailableMajors = (session: GameSession, ids: string[]) => {
  session.state.availableMajorImprovements = [...ids]
  session.state.majorImprovementSupply = undefined
}
