import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, Resource } from '../../shared/contract/types'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import '../../shared/cards/C/C125_Nightworker'
import '../../shared/cards/E/E124_MayorCandidate'

const sessions: GameSession[] = []
afterEach(() => { sessions.splice(0).forEach((session) => session.dispose()) })

const supply = (resources: Partial<Resource>) => resources

function sessionFor(configure: (state: GameState) => void = () => {}) {
  const session = createWorkSession({
    seed: 1465,
    configure(state) {
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.fields = []
        Object.assign(player.resources, {
          wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
          food: 0, sheep: 2, boar: 1, cattle: 1, begging: 1,
        })
      }
      configure(state)
    },
  })
  sessions.push(session)
  return session
}

function discardAction(response: SessionResponse) {
  return response.interaction.anytimeActions.find((action) => action.id === 'discard-goods')
}

function quantityRequest(response: SessionResponse) {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('expected a waiting interaction')
  expect(response.interaction.request.kind).toBe('resource-quantity-select')
  if (response.interaction.request.kind !== 'resource-quantity-select') throw new Error('expected quantity select')
  return response.interaction.request
}

describe('discard goods to the general supply', () => {
  it('offers supply goods and returns the chosen amounts to the supply', () => {
    const session = sessionFor((state) => {
      const player = state.players[0]!
      Object.assign(player.resources, { wood: 3, clay: 1, reed: 0, stone: 2, grain: 4, vegetable: 1, food: 5 })
      player.fields = [{ row: 2, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }]
    })
    const before = session.getState()
    const fences = JSON.stringify(before.state.players[0]!.fenceSegments)
    const workers = before.state.players[0]!.workers.map((worker) => worker.id)
    expect(discardAction(before)?.labelKey).toBe('actions.discard-goods.name')

    const pending = session.takeAnytimeAction(0, 'discard-goods')
    const request = quantityRequest(pending)
    expect(request.availableByResource).toEqual({ wood: 3, clay: 1, stone: 2, grain: 4, vegetable: 1, food: 5 })
    expect(request.promptKey).toBe('ui.interactionDiscardGoods')
    expect(request.requireAtLeastOne).toBe(true)
    expect(request.anytimeWindow).toEqual({ allowed: false })

    const over = session.commitSelectionChoice(0, { resourceCounts: { wood: 4 } })
    expect(over.ok).toBe(false)
    expect(session.getState().state.players[0]!.resources.wood).toBe(3)

    const animals = session.commitSelectionChoice(0, { resourceCounts: { sheep: 1, wood: 1 } })
    expect(animals.ok).toBe(false)
    expect(session.getState().state.players[0]!.resources).toMatchObject({ wood: 3, sheep: 2 })

    const empty = session.commitSelectionChoice(0, { resourceCounts: {} })
    expect(empty.ok).toBe(false)

    const discarded = session.commitSelectionChoice(0, { resourceCounts: { wood: 2, grain: 4, food: 1 } })
    expect(discarded.ok, discarded.error).toBe(true)
    expect(discarded.state.players[0]!.resources).toMatchObject({
      wood: 1, clay: 1, reed: 0, stone: 2, grain: 0, vegetable: 1, food: 4,
      sheep: 2, boar: 1, cattle: 1, begging: 1,
    })
    expect(discarded.state.players[0]!.fields).toEqual([{ row: 2, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] }])
    expect(JSON.stringify(discarded.state.players[0]!.fenceSegments)).toBe(fences)
    expect(discarded.state.players[0]!.workers.map((worker) => worker.id)).toEqual(workers)
    expect(discarded.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved',
      resources: { wood: 2, grain: 4, food: 1 },
      from: { kind: 'player', playerId: discarded.state.players[0]!.id },
      to: { kind: 'supply' },
      reason: 'discard',
    }))
    expect(discarded.state.log.some((entry) => entry.key === 'log.discardGoods')).toBe(true)

    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.wood).toBe(3)
    expect(undone.state.players[0]!.resources.grain).toBe(4)
    expect(undone.state.players[0]!.resources.food).toBe(5)
  })

  it('hides the action when the supply has no discardable goods', () => {
    const session = sessionFor()
    expect(discardAction(session.getState())).toBeUndefined()
    const rejected = session.takeAnytimeAction(0, 'discard-goods')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources.sheep).toBe(2)
  })

  it('refuses another player discarding on your turn', () => {
    const session = sessionFor((state) => {
      state.players[0]!.resources.wood = 1
      state.players[1]!.resources.clay = 1
    })
    const rejected = session.takeAnytimeAction(1, 'discard-goods')
    expect(rejected.ok).toBe(false)
    expect(session.getState().state.players[1]!.resources.clay).toBe(1)
  })

  it('keeps wood and stone when Mayor Candidate forbids discarding them', () => {
    const session = sessionFor((state) => {
      const player = state.players[0]!
      player.occupationPlayed = ['E124_MayorCandidate']
      Object.assign(player.resources, supply({ wood: 2, clay: 3, reed: 0, stone: 4, food: 1 }))
    })
    const pending = session.takeAnytimeAction(0, 'discard-goods')
    const request = quantityRequest(pending)
    expect(request.availableByResource).toEqual({ clay: 3, food: 1 })

    const wood = session.commitSelectionChoice(0, { resourceCounts: { wood: 1 } })
    expect(wood.ok).toBe(false)
    expect(session.getState().state.players[0]!.resources).toMatchObject({ wood: 2, stone: 4, clay: 3 })

    const clay = session.commitSelectionChoice(0, { resourceCounts: { clay: 2 } })
    expect(clay.ok, clay.error).toBe(true)
    expect(clay.state.players[0]!.resources).toMatchObject({ wood: 2, stone: 4, clay: 1, food: 1 })
  })

  it('lets Nightworker place after the last wood is discarded before work', () => {
    const session = sessionFor((state) => {
      state.round = 5
      const player = state.players[0]!
      player.occupationPlayed = ['C125_Nightworker']
      Object.assign(player.resources, supply({ wood: 1, clay: 1, reed: 1, stone: 1, food: 4, sheep: 0, boar: 0, cattle: 0, begging: 0 }))
      for (const occupant of state.players) {
        Object.assign(occupant.resources, { sheep: 0, boar: 0, cattle: 0, begging: 0 })
        markAllWorkersUsed(state, occupant)
      }
      const forest = state.actionSpaces.find((space) => space.id === 'forest')
      if (!forest) throw new Error('missing forest')
      forest.resources.wood = 2
      forest.takenBy = []
    })

    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected the discard offer')
    expect(response.interaction.request.kind).toBe('choice')
    if (response.interaction.request.kind !== 'choice') throw new Error('expected a choice')
    const discard = response.interaction.request.options.find((option) => option.labelKey === 'actions.discard-goods.name' && option.value !== '__skip__')
    expect(discard).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, discard!.value)
    const request = quantityRequest(response)
    expect(request.availableByResource.wood).toBeGreaterThan(0)
    response = session.commitSelectionChoice(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0, { resourceCounts: { wood: 1 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)

    const placed = acceptNightworker(session, response)
    expect(placed.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toEqual([
      expect.objectContaining({ playerId: placed.state.players[0]!.id }),
    ])
    expect(placed.state.players[0]!.resources.wood).toBeGreaterThan(0)
  })

  it('offers discard before work when the only current Nightworker space is blocked', () => {
    const session = sessionFor((state) => {
      state.round = 5
      const player = state.players[0]!
      player.occupationPlayed = ['C125_Nightworker']
      Object.assign(player.resources, supply({
        wood: 0, clay: 1, reed: 1, stone: 1, food: 4, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }))
      for (const occupant of state.players) {
        Object.assign(occupant.resources, { sheep: 0, boar: 0, cattle: 0, begging: 0 })
        markAllWorkersUsed(state, occupant)
      }
    })
    const block = { playerId: session.state.players[1]!.id, workerId: '1', sourceSpaceId: 'copse' }
    session.state.players[0]!.minorPlayed.push('TEST_BlockWoodSpaces')
    session.withCtx(() => requireActiveCardRegistry('discard blocked nightworker space').setEffect({
      id: 'TEST_BlockWoodSpaces',
      onEndPreparation: (state) => {
        for (const space of state.actionSpaces) {
          if ((space.gainPerRound.wood ?? 0) <= 0) continue
          space.resources.wood = Math.max(space.resources.wood ?? 0, 3)
          space.blockedBy = [block]
        }
        const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')
        if (clayPit) {
          clayPit.resources.clay = Math.max(clayPit.resources.clay ?? 0, 2)
          clayPit.blockedBy = []
        }
      },
    }))
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
      throw new Error(`expected discard offer, got ${JSON.stringify(response.interaction)}`)
    }
    const discard = response.interaction.request.options.find((option) => option.labelKey === 'actions.discard-goods.name')
    expect(discard, JSON.stringify(response.interaction.request)).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, discard!.value)
    response = session.commitSelectionChoice(response.interaction.stateId === 'wait' ? response.interaction.playerIndex : 0, {
      resourceCounts: { clay: 1 },
    })
    expect(response.ok, response.error).toBe(true)
    const placed = acceptNightworker(session, response, 'clay-pit')
    expect(placed.state.actionSpaces.find((space) => space.id === 'clay-pit')!.takenBy).toEqual([
      expect.objectContaining({ playerId: placed.state.players[0]!.id }),
    ])
    expect(placed.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toEqual([])
  })

  it('does not let Nightworker take a resource that is still in supply', () => {
    const session = sessionFor((state) => {
      state.round = 5
      const player = state.players[0]!
      player.occupationPlayed = ['C125_Nightworker']
      Object.assign(player.resources, supply({ wood: 1, clay: 1, reed: 1, stone: 1, food: 4, sheep: 0, boar: 0, cattle: 0, begging: 0 }))
      for (const occupant of state.players) {
        Object.assign(occupant.resources, { sheep: 0, boar: 0, cattle: 0, begging: 0 })
        markAllWorkersUsed(state, occupant)
      }
    })
    let response = session.performRoundEnd()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
      throw new Error(`expected discard offer, got ${JSON.stringify(response.interaction)}`)
    }
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(JSON.stringify(response.interaction)).not.toContain('C125_Nightworker')
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toEqual([])
    expect(response.state.players[0]!.resources.wood).toBeGreaterThan(0)
  })
})

function acceptNightworker(session: GameSession, response: SessionResponse, spaceId = 'forest'): SessionResponse {
  let current = response
  for (let step = 0; step < 8; step += 1) {
    const taken = current.state.actionSpaces.find((space) => space.id === spaceId)?.takenBy.length ?? 0
    if (taken > 0) return current
    if (current.interaction.stateId !== 'wait') break
    const interaction = current.interaction
    if (interaction.request.kind === 'confirm-player-switch') {
      current = session.resolveChoice(interaction.request.fromPlayerIndex, 'confirm')
      continue
    }
    if (interaction.request.kind !== 'choice' && interaction.request.kind !== 'select-trigger') break
    const target = interaction.request.options.find((option) => option.value === spaceId)
    if (target) return session.resolveChoice(interaction.playerIndex, target.value)
    const nightworker = interaction.request.options.find((option) =>
      option.value !== '__skip__' && option.value !== '__pass__' && (
        option.sourceCard === 'C125_Nightworker' || interaction.sourceCard === 'C125_Nightworker'
      ))
    expect(nightworker, JSON.stringify(interaction)).toBeDefined()
    current = session.resolveChoice(interaction.playerIndex, nightworker!.value)
  }
  throw new Error(`Nightworker placement was not offered: ${JSON.stringify(current.interaction)}`)
}
