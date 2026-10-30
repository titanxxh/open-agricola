import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { ActionChoiceOption, GameState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { assertRejectedUnchanged } from './_helpers/session-assertions'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { markAllWorkersUsed } from '../../shared/domain/player'

const CARD_ID = 'D180_PartTimeWorker'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Five players satisfy D180's printed 5+ requirement. Fresh round-1 work game,
// placeholder hands, P0 to act, no goods or animals in P0's supply.
function setup(forest: Partial<Resource>, configure?: (state: GameState) => void) {
  const session = createWorkSession({ options: { playerCount: 5 }, configure: state => {
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID]
    Object.assign(player.resources, { wood: 0, clay: 0, stone: 0, food: 0, sheep: 0, boar: 0, cattle: 0 })
    const space = state.actionSpaces.find(candidate => candidate.id === 'forest')!
    space.resources = { ...space.resources, wood: 0, ...forest }
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const options = (response: SessionResponse): ActionChoiceOption[] =>
  response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []

const spaceResources = (response: SessionResponse, spaceId: string) =>
  response.state.actionSpaces.find(space => space.id === spaceId)!.resources

/** Keeps the proposed housing when the new animal opens a reorganization. */
const settleAnimals = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'animal-reorg') return response
  const zones = response.interaction.request.zones.map(({ id, zoneType, animalType, animalCount }) =>
    ({ id, zoneType, animalType, animalCount }))
  const next = session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones })
  assert.equal(next.ok, true, next.error)
  return next
}

const choose = (session: GameSession, response: SessionResponse, option: ActionChoiceOption | undefined) => {
  assert.ok(option, JSON.stringify(response.interaction))
  const next = session.resolveChoice(response.interaction.playerIndex, option.value)
  assert.equal(next.ok, true, next.error)
  return settleAnimals(session, next)
}

const chooseCard = (session: GameSession, response: SessionResponse) =>
  acceptCard(session, response, CARD_ID)

const chooseOriginal = (session: GameSession, response: SessionResponse) =>
  choose(session, response, options(response).find(option => option.value === '__skip__'))

const isWait = (response: SessionResponse, kind: string) =>
  response.interaction.stateId === 'wait' && response.interaction.request.kind === kind

const finishSwitches = (session: GameSession, response: SessionResponse) => {
  for (let step = 0; step < 4 && isWait(response, 'confirm-player-switch'); step += 1) {
    response = confirmPlayerSwitch(session)
    assert.equal(response.ok, true, response.error)
  }
  return response
}

/** Take a card's offer through an optional select-trigger and its own optional prompt. */
const acceptCard = (session: GameSession, response: SessionResponse, cardId: string) => {
  for (let step = 0; step < 3; step += 1) {
    const option = options(response).find(candidate => candidate.sourceCard === cardId && !candidate.value.startsWith('__'))
      ?? options(response).find(candidate => candidate.value === cardId)
    if (!option) return response
    response = choose(session, response, option)
  }
  return response
}

const collectEvents = (response: SessionResponse, spaceId = 'forest') => response.state.events.filter(event =>
  event.type === 'resource.moved' && event.reason === 'collect'
  && event.from.kind === 'actionSpace' && event.from.spaceId === spaceId)

const returnEvents = (response: SessionResponse) => response.state.events.filter(event =>
  event.type === 'resource.moved' && event.reason === 'return')

describe('D180 Part-Time Worker session', () => {
  it('records the full collect before offering to return half for an animal', () => {
    const session = setup({ wood: 6 }, state => { state.players[0]!.resources.food = 2 })
    const before = session.getState().scores!.find(score => score.playerId === 'p1')!

    const offered = session.takeAction(0, 'forest')

    expect(offered.ok, offered.error).toBe(true)
    expect(offered.state.players[0]!.resources.wood).toBe(6)
    expect(spaceResources(offered, 'forest').wood).toBe(0)
    expect(offered.state.players[0]!.stats.resourcesFromBoard.wood).toBe(6)
    expect(options(offered).some(option => option.sourceCard === CARD_ID)).toBe(true)

    const returned = chooseCard(session, offered)
    expect(returned.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1, food: 2 })
    expect(spaceResources(returned, 'forest').wood).toBe(3)
    expect(returned.state.players[0]!.stats.resourcesFromBoard.wood).toBe(6)
    expect(collectEvents(returned)).toEqual([expect.objectContaining({ resources: { wood: 6 } })])
    expect(returnEvents(returned))
      .toEqual([expect.objectContaining({ resources: { wood: 3 }, to: { kind: 'actionSpace', spaceId: 'forest' } })])
    expect(returned.state.events.filter(event => event.type === 'resource.moved').map(event => [event.reason, event.resources]))
      .toEqual([['collect', { wood: 6 }], ['return', { wood: 3 }], ['cardEffect', { cattle: 1 }]])
    expect(returned.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail', params: expect.objectContaining({ detailParts: { gains: { wood: 6 } } }),
    }))
    expect(returned.state.log).toContainEqual(expect.objectContaining({
      key: 'log.cardEffectGain', params: expect.objectContaining({ cardId: CARD_ID, gain: { cattle: 1 } }),
    }))
    const score = returned.scores!.find(entry => entry.playerId === 'p1')!
    expect(score.categories.find(category => category.key === 'cattles')).toMatchObject({ quantity: 1, total: 1 })
    expect(score.total).toBe(before.total + 2)
  })

  it.each([[2, 'sheep'], [4, 'boar'], [6, 'cattle']] as const)(
    'collects all %i wood before returning half and gaining 1 %s',
    (total, animal) => {
      const session = setup({ wood: total })

      let response = session.takeAction(0, 'forest')
      expect(response.ok, response.error).toBe(true)
      expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(true)
      expect(spaceResources(response, 'forest').wood).toBe(0)
      expect(response.state.players[0]!.resources.wood).toBe(total)

      response = chooseCard(session, response)

      const player = response.state.players[0]!
      expect(player.resources.wood).toBe(total / 2)
      expect(player.resources[animal]).toBe(1)
      expect(spaceResources(response, 'forest').wood).toBe(total / 2)
      expect(collectEvents(response)).toEqual([
        expect.objectContaining({ resources: { wood: total }, to: { kind: 'player', playerId: player.id } }),
      ])
      expect(returnEvents(response)).toEqual([expect.objectContaining({ resources: { wood: total / 2 } })])
      expect(player.stats.resourcesFromBoard.wood).toBe(total)
    },
  )

  it('keeps the original collect when the owner declines', () => {
    const session = setup({ wood: 2 })

    const response = chooseOriginal(session, session.takeAction(0, 'forest'))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, sheep: 0, boar: 0, cattle: 0 })
    expect(spaceResources(response, 'forest').wood).toBe(0)
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 2 } })])
    expect(returnEvents(response)).toEqual([])
  })

  it('undo restores the goods and offers the same choice again', () => {
    const session = setup({ wood: 6 })
    const first = chooseCard(session, session.takeAction(0, 'forest'))
    expect(first.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1 })

    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 0, cattle: 0 })
    expect(spaceResources(undone, 'forest').wood).toBe(6)

    const retried = chooseCard(session, session.takeAction(0, 'forest'))
    expect(retried.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1 })
    expect(spaceResources(retried, 'forest').wood).toBe(3)
    expect(retried.state.players[0]!.stats.resourcesFromBoard.wood).toBe(6)
    expect(collectEvents(retried)).toEqual([expect.objectContaining({ resources: { wood: 6 } })])
    expect(returnEvents(retried)).toEqual([expect.objectContaining({ resources: { wood: 3 } })])
  })

  it('undoStep restores the return offer without collecting the pile again', () => {
    const session = setup({ wood: 6 })
    const offered = session.takeAction(0, 'forest')
    const accept = options(offered).find(option => option.sourceCard === CARD_ID)!
    const accepted = session.resolveChoice(0, accept.value)
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1 })

    const undone = session.undoStep(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 6, cattle: 0 })
    expect(spaceResources(undone, 'forest').wood).toBe(0)
    expect(undone.state.players[0]!.stats.resourcesFromBoard.wood).toBe(6)
    const retried = chooseCard(session, undone)
    expect(retried.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1 })
    expect(collectEvents(retried)).toEqual([expect.objectContaining({ resources: { wood: 6 } })])
    expect(returnEvents(retried)).toEqual([expect.objectContaining({ resources: { wood: 3 } })])
  })

  it('restores a mixed return choice and rejects invalid or repeated submissions atomically', () => {
    const original = setup({ wood: 2, clay: 2 })
    const offered = original.takeAction(0, 'forest')
    const session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(original.state, original)))))
    sessions.push(session)
    const restored = session.getState()
    expect(restored.interaction).toEqual(offered.interaction)
    expect(restored.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 2, boar: 0 })
    assertRejectedUnchanged(session, () => session.resolveChoice(1, '__skip__'))
    assertRejectedUnchanged(session, () => session.resolveChoice(0, '__invalid_d180__'))
    const mixed = options(restored).filter(option => !option.value.startsWith('__'))[1]!
    const response = choose(session, restored, mixed)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, boar: 1 })
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 2, clay: 2 } })])
    expect(returnEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 1, clay: 1 } })])
    assertRejectedUnchanged(session, () => session.resolveChoice(0, mixed.value))
  })

  it('restores animal housing without repeating collection, return or reward', () => {
    const original = setup({ wood: 6 })
    const offered = original.takeAction(0, 'forest')
    const accept = options(offered).find(option => option.sourceCard === CARD_ID)!
    const housing = original.resolveChoice(0, accept.value)
    expect(housing.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    const session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(original.state, original)))))
    sessions.push(session)
    const response = settleAnimals(session, session.getState())
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1 })
    expect(spaceResources(response, 'forest').wood).toBe(3)
    expect(response.state.events.filter(event => event.type === 'resource.moved').map(event => [event.reason, event.resources]))
      .toEqual([['collect', { wood: 6 }], ['return', { wood: 3 }], ['cardEffect', { cattle: 1 }]])
  })

  it('counts only the original pile when a before reward adds another wood', () => {
    const session = setup({ wood: 6 }, state => {
      state.players[0]!.occupationPlayed = [CARD_ID, 'A116_WoodCutter']
    })
    const offered = session.takeAction(0, 'forest')
    expect(offered.state.players[0]!.resources.wood).toBe(7)
    const response = chooseCard(session, offered)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, cattle: 1 })
    expect(response.state.players[0]!.stats.resourcesFromBoard.wood).toBe(6)
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 6 } })])
    expect(returnEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 3 } })])
  })

  it('keeps the two-goods condition after an immediate return and skips unaffordable return maps', () => {
    const session = setup({ wood: 1, clay: 1 }, state => {
      state.players[0]!.occupationPlayed.push('A108_MushroomCollector')
    })
    const immediate = acceptCard(session, session.takeAction(0, 'forest'), 'A108_MushroomCollector')
    expect(immediate.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1, food: 2 })
    const available = options(immediate).filter(option => !option.value.startsWith('__'))
    expect(available).toHaveLength(1)
    const response = chooseCard(session, immediate)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 2, sheep: 1 })
    expect(spaceResources(response, 'forest')).toMatchObject({ wood: 1, clay: 1 })
    expect(returnEvents(response).map(event => event.resources)).toEqual([{ wood: 1 }, { clay: 1 }])
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 1, clay: 1 } })])
  })

  it('offers no animal when an earlier return leaves no goods available for D180', () => {
    const session = setup({ wood: 2 }, state => { state.players[0]!.minorPlayed = ['A056_Basket'] })
    const response = acceptCard(session, session.takeAction(0, 'forest'), 'A056_Basket')
    expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 3, sheep: 0 })
    expect(spaceResources(response, 'forest').wood).toBe(2)
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 2 } })])
    expect(returnEvents(response)).toEqual([expect.objectContaining({ sourceCardId: 'A056_Basket', resources: { wood: 2 } })])
  })

  it.each(['hand', 'opponent'])('does not apply a D180 in the %s to the acting player', zone => {
    const session = setup({ wood: 6 }, state => {
      state.players[0]!.occupationPlayed = []
      if (zone === 'hand') state.players[0]!.occupationHand = [CARD_ID]
      else state.players[1]!.occupationPlayed = [CARD_ID]
    })
    const response = session.takeAction(0, 'forest')
    expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 6, cattle: 0 })
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 6 } })])
    expect(returnEvents(response)).toEqual([])
  })

  it.each([
    { branch: 0, returned: { clay: 2 }, remaining: { wood: 2, clay: 0 } },
    { branch: 1, returned: { wood: 1, clay: 1 }, remaining: { wood: 1, clay: 1 } },
    { branch: 2, returned: { wood: 2 }, remaining: { wood: 0, clay: 2 } },
  ])('offers all mixed-goods returns and resolves branch $branch', ({ branch, returned, remaining }) => {
    const session = setup({ wood: 2, clay: 2 })

    let response = session.takeAction(0, 'forest')
    const branches = options(response).filter(option => !option.value.startsWith('__'))
    expect(branches).toHaveLength(3)
    expect(spaceResources(response, 'forest')).toMatchObject({ wood: 0, clay: 0 })
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 2, boar: 0 })

    response = choose(session, response, branches[branch])

    expect(response.state.players[0]!.resources).toMatchObject({ ...remaining, boar: 1 })
    expect(spaceResources(response, 'forest')).toMatchObject(returned)
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 2, clay: 2 } })])
    expect(returnEvents(response)).toEqual([expect.objectContaining({ resources: returned })])
    expect(response.state.players[0]!.stats.resourcesFromBoard).toEqual({ wood: 2, clay: 2 })
  })

  it.each([[CARD_ID, 'D140_Loudmouth'], ['D140_Loudmouth', CARD_ID]])(
    'preserves Loudmouth eligibility when resolving %s before %s', (first, second) => {
      const session = setup({ wood: 6 }, state => {
        state.players[0]!.occupationPlayed = [CARD_ID, 'D140_Loudmouth']
      })
      let response = session.takeAction(0, 'forest')
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
      expect(options(response).map(option => option.sourceCard)).toEqual(expect.arrayContaining([CARD_ID, 'D140_Loudmouth']))

      response = acceptCard(session, response, first!)
      response = acceptCard(session, response, second!)

      expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1, food: 1 })
      expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 6 } })])
      expect(returnEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 3 } })])
    },
  )

  it('pays Forest Guardian before the full collect and offers Plowsmith after returning wood', () => {
    const session = setup({ wood: 6 }, state => {
      state.players[0]!.resources.food = 2
      state.players[1]!.occupationPlayed = ['B138_ForestGuardian', 'D169_Plowsmith']
      state.players[1]!.resources.food = 1
    })
    let response = finishSwitches(session, session.takeAction(0, 'forest'))
    response = chooseCard(session, response)
    response = finishSwitches(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 1, food: 1 })
    expect(response.state.players[1]!.resources.food).toBe(2)
    expect(options(response).some(option => option.sourceCard === 'D169_Plowsmith')).toBe(true)

    response = acceptCard(session, response, 'D169_Plowsmith')
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'farm-select' } })
    response = session.commitSelectionChoice(1, { tile: { row: 0, col: 0 } })
    expect(response.ok, response.error).toBe(true)
    response = finishSwitches(session, response)
    expect(response.state.players[1]!.resources.food).toBe(1)
    expect(response.state.players[1]!.fields).toEqual([expect.objectContaining({ row: 0, col: 0 })])
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 6 } })])
    const tax = response.state.events.find(event => event.type === 'resource.moved'
      && event.sourceCardId === 'B138_ForestGuardian')!
    expect(tax.seq).toBeLessThan(collectEvents(response)[0]!.seq)
  })

  it.each([[6, 3, 1], [4, 2, 1]] as const)(
    'Corf counts the full %i stone before returning %i',
    (onSpace, taken, corfStone) => {
      const session = setup({}, state => {
        state.round = 3
        state.roundActionOrder = state.roundActionOrder.map(() => null)
        state.roundActionOrder[0] = 'western-quarry'
        state.players[0]!.minorPlayed = ['B079_Corf']
        state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone = onSpace
      })

      const response = chooseCard(session, session.takeAction(0, 'western-quarry'))

      const finished = acceptCard(session, response, 'B079_Corf')
      expect(collectEvents(finished, 'western-quarry')).toEqual([expect.objectContaining({ resources: { stone: onSpace } })])
      expect(finished.state.players[0]!.resources.stone).toBe(taken + corfStone)
      expect(spaceResources(finished, 'western-quarry').stone).toBe(onSpace - taken)
    },
  )

  it('does not offer the card for other totals, non-accumulation spaces or a card partial take', () => {
    const three = setup({ wood: 3 })
    const collected = three.takeAction(0, 'forest')
    expect(options(collected).some(option => option.sourceCard === CARD_ID)).toBe(false)
    expect(collected.state.players[0]!.resources.wood).toBe(3)

    const partial = setup({ wood: 4 }, state => { state.players[0]!.minorPlayed = ['A082_WorkCertificate'] })
    let response = partial.takeAction(0, 'day-laborer')
    expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    for (let step = 0; step < 3; step += 1) {
      const take = options(response).find(option => option.labelKey === 'ui.interactionTakeFromSpace'
        && option.labelParams?.spaceId === 'forest' && option.labelParams?.resource === 'wood')
      response = choose(partial, response, take ?? options(response).find(option => option.sourceCard === 'A082_WorkCertificate'))
      if (take) break
    }
    expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(spaceResources(response, 'forest').wood).toBe(3)
  })

  it('does not turn Transactor type-limited collection into a use of the source space', () => {
    const session = setup({ wood: 6 }, state => {
      state.round = 14
      state.players[0]!.occupationPlayed = [CARD_ID, 'D098_Transactor']
      for (const player of state.players) {
        player.resources.food = 20
        markAllWorkersUsed(state, player)
      }
      for (const space of state.actionSpaces) {
        space.resources.wood = 0
        space.resources.clay = 0
        space.resources.reed = 0
        space.resources.stone = 0
      }
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 6
    })
    const offered = session.performRoundEnd()
    const response = acceptCard(session, offered, 'D098_Transactor')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 6, cattle: 0 })
    expect(spaceResources(response, 'forest').wood).toBe(0)
    expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    expect(returnEvents(response)).toEqual([])
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 6 } })])
  })

  it('offers the card at the collect of a space reached through a card placement', () => {
    const session = setup({}, state => {
      state.round = 3
      state.roundActionOrder = state.roundActionOrder.map(() => null)
      state.roundActionOrder[0] = 'western-quarry'
      state.roundActionOrder[1] = 'eastern-quarry'
      const player = state.players[0]!
      player.occupationPlayed = ['A171_Sidekick', CARD_ID]
      player.resources.food = 2
      state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone = 2
      state.actionSpaces.find(space => space.id === 'eastern-quarry')!.resources.stone = 1
    })

    let response = acceptCard(session, session.takeAction(0, 'eastern-quarry'), 'A171_Sidekick')
    expect(spaceResources(response, 'western-quarry').stone).toBe(0)
    response = chooseCard(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, sheep: 1, food: 1 })
    expect(spaceResources(response, 'western-quarry').stone).toBe(1)
    expect(spaceResources(response, 'eastern-quarry').stone).toBe(0)
    expect(collectEvents(response, 'western-quarry')).toEqual([expect.objectContaining({ resources: { stone: 2 } })])
  })

  it.each([
    ['A108_MushroomCollector', 'A056_Basket'], ['A056_Basket', 'A108_MushroomCollector'],
  ])('settles immediate %s and %s before the D180 return', (first, second) => {
    const session = setup({ wood: 6 }, state => {
      const player = state.players[0]!
      player.occupationPlayed = ['A108_MushroomCollector', CARD_ID]
      player.minorPlayed = ['A056_Basket']
    })

    let response = session.takeAction(0, 'forest')
    expect(options(response).some(option => option.sourceCard === CARD_ID)).toBe(false)
    response = acceptCard(session, response, first!)
    response = acceptCard(session, response, second!)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, cattle: 0, food: 5 })
    response = chooseCard(session, response)

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 5, cattle: 1 })
    expect(spaceResources(response, 'forest').wood).toBe(6)
    expect(collectEvents(response)).toEqual([expect.objectContaining({ resources: { wood: 6 } })])
    expect(returnEvents(response).map(event => event.resources.wood)).toEqual(first === 'A056_Basket' ? [2, 1, 3] : [1, 2, 3])
    expect(response.state.players[0]!.stats.resourcesFromBoard.wood).toBe(6)
  })
})
