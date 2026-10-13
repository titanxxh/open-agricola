import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { createWorkSession } from './_helpers/session-fixtures'

const FORESTER = 'A115_ChiefForester'
const HOE = 'A079_GardenHoe'
const PELLETS = 'A065_SeedPellets'
const PUBLICAN = 'A132_Publican'
const WOOD_FIELD = 'D075_WoodField'
type RewardCard = typeof HOE | typeof PELLETS | typeof PUBLICAN
const REWARDS: RewardCard[] = [PELLETS, HOE, PUBLICAN]
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

// Confirmed Session seam (#1134): a new work game uses Forest's before Sow,
// rejects two Logical Fields atomically, then completes one field and collects.
const setup = (reward: RewardCard = HOE, configure?: (state: GameState) => void) => {
  const session = createWorkSession({ options: { playerCount: reward === PUBLICAN ? 4 : 2 }, configure: (state) => {
    state.round = 5
    const player = state.players[0]!
    player.occupationPlayed = [FORESTER]
    player.minorPlayed = reward === PUBLICAN ? [] : [reward]
    if (reward === PUBLICAN) {
      state.players[1]!.occupationPlayed = [PUBLICAN]
      state.players[1]!.resources.grain = 1
    }
    Object.assign(player.resources, { wood: 0, grain: 2, vegetable: 1, food: 20 })
    player.fields = [{ row: 0, col: 2, stacks: [] }, { row: 0, col: 3, stacks: [] }]
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    state.roundActionOrder[0] = 'grain-utilization'
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const waiting = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected pending interaction')
  return response.interaction
}

const startForesterSow = (session: GameSession) => {
  let response = session.takeAction(0, 'forest')
  for (let step = 0; step < 4 && waiting(response).request.kind !== 'farm-select'; step++) {
    const request = waiting(response).request
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') throw new Error('Expected optional Sow choice')
    const accept = request.options.find((option) => option.value !== '__skip__')
    if (!accept) throw new Error('Expected optional Sow acceptance')
    response = session.resolveChoice(0, accept.value)
  }
  const request = waiting(response).request
  expect(request.kind).toBe('farm-select')
  if (request.kind !== 'farm-select' || request.farm.farmType !== 'sow') throw new Error('Expected Sow selection')
  return response
}

const farmSelection = (response: SessionResponse) => {
  const request = waiting(response).request
  if (request.kind !== 'farm-select' || request.farm.farmType !== 'sow') throw new Error('Expected Sow selection')
  return request.farm
}

const startNormalSow = (session: GameSession, reward: RewardCard) => {
  let response = session.takeAction(0, 'grain-utilization')
  for (let step = 0; step < 8 && waiting(response).request.kind !== 'farm-select'; step++) {
    const interaction = waiting(response)
    const request = interaction.request
    if (request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
      continue
    }
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') throw new Error('Expected normal Sow or reward choice')
    const accept = request.options.find((option) => option.labelKey === 'actions.sow.name')
      ?? request.options.find((option) => option.value !== '__skip__' && option.value !== '__done__')
    if (!accept) throw new Error('Expected normal Sow acceptance')
    if (reward === PUBLICAN && interaction.sourceCard === PUBLICAN) expect(interaction.playerIndex).toBe(1)
    response = session.resolveChoice(interaction.playerIndex, accept.value)
  }
  expect(farmSelection(response).maxSelections).toBeUndefined()
  return response
}

const expectNoReward = (response: SessionResponse, reward: RewardCard) => {
  expect(response.state.events.some((event) => event.type === 'resource.moved' && event.sourceCardId === reward)).toBe(false)
  expect(response.state.log.some((entry) => entry.key === 'log.cardTriggered' && entry.params?.cardId === reward)).toBe(false)
  if (reward === PUBLICAN) {
    expect(response.state.players[1]!.resources.grain).toBe(1)
    expect(response.state.players[1]!.cardStates[PUBLICAN]?.counters?.bonusVp ?? 0).toBe(0)
    expect(response.scores?.[1]?.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
  }
}

describe('A115 Chief Forester limited Sow', () => {
  it('rejects two fields and lets a one-field vegetable Sow finish without Garden Hoe rewards', () => {
    const session = setup()
    const before = startForesterSow(session)
    const rejected = session.commitSelectionChoice(0, { crops: [
      { row: 0, col: 2, crop: 'vegetable' }, { row: 0, col: 3, crop: 'grain' },
    ] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    expect(rejected.scores).toEqual(before.scores)
    const request = waiting(before).request
    if (request.kind !== 'farm-select') throw new Error('Expected Sow selection')
    expect(farmSelection(before).maxSelections).toBe(1)
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'vegetable' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 2, vegetable: 0, clay: 0, stone: 0 })
    expect(response.state.players[0]!.fields).toEqual([
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] }, { row: 0, col: 3, stacks: [] },
    ])
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    expect(response.state.events.some((event) => event.type === 'card.triggered' && event.sourceCardId === HOE)).toBe(false)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(2)
  })
  it.each(REWARDS)('does not trigger %s from the restricted one-field Sow', (reward) => {
    const session = setup(reward)
    const before = startForesterSow(session)
    expect(farmSelection(before).maxSelections).toBe(1)
    expectNoReward(before, reward)
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: reward === HOE ? 'vegetable' : 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject(reward === HOE
      ? { wood: 3, grain: 2, vegetable: 0, clay: 0, stone: 0 }
      : { wood: 3, grain: 1, vegetable: 1, clay: 0, stone: 0 })
    expect(waiting(response).request.kind).toBe('confirm-next-player')
    expectNoReward(response, reward)
    expect(response.scores).toHaveLength(reward === PUBLICAN ? 4 : 2)
  })

  it.each(REWARDS)('keeps %s working when unrestricted Sow plants only one field', (reward) => {
    const session = setup(reward)
    startNormalSow(session, reward)
    let response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: reward === HOE ? 'vegetable' : 'grain' }] })
    while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
      response = confirmPlayerSwitch(session)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[1]!.stacks).toEqual([])
    expect(response.state.players[0]!.resources).toMatchObject(reward === HOE
      ? { wood: 0, grain: 2, vegetable: 0, clay: 1, stone: 1 }
      : { wood: 0, grain: 2, vegetable: 1, clay: 0, stone: 0 })
    expect(response.state.events.some((event) => event.type === 'resource.moved' && event.sourceCardId === reward)).toBe(true)
    expect(response.state.log.some((entry) => entry.key === 'log.cardTriggered' && entry.params?.cardId === reward)).toBe(true)
    if (reward === PUBLICAN) {
      expect(response.state.players[1]!.resources.grain).toBe(0)
      expect(response.state.players[1]!.cardStates[PUBLICAN]?.counters?.bonusVp).toBe(1)
      expect(response.scores?.[1]?.categories.find((category) => category.key === 'cardBonusVp')?.total).toBe(1)
    }
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it.each(REWARDS)('can decline the optional Sow without triggering %s', (reward) => {
    const session = setup(reward)
    let response = session.takeAction(0, 'forest')
    const request = waiting(response).request
    if (request.kind !== 'choice' && request.kind !== 'select-trigger') throw new Error('Expected optional Sow')
    expect(request.options.some((option) => option.value === '__skip__')).toBe(true)
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 2, vegetable: 1 })
    expect(response.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
    expectNoReward(response, reward)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it('counts both slots on Wood Field as one Logical Field and rejects mixing it with another field', () => {
    const session = setup(PELLETS, (state) => {
      const player = state.players[0]!
      player.minorPlayed.push(WOOD_FIELD)
      player.cardStates[WOOD_FIELD] = { extraData: { cardFieldStacks: [null, null] } }
      Object.assign(player.resources, { wood: 2, grain: 1, vegetable: 0 })
    })
    const before = startForesterSow(session)
    const cardSlots = farmSelection(before).selectableFields.filter((field) => field.sourceCard === WOOD_FIELD)
    expect(cardSlots).toHaveLength(2)
    expect(cardSlots.map((field) => field.groupKey)).toEqual([WOOD_FIELD, WOOD_FIELD])
    const crops = cardSlots.map((field) => ({ ...field.tile, crop: 'wood' as const }))
    const rejected = session.commitSelectionChoice(0, { crops: [...crops, { row: 0, col: 2, crop: 'grain' }] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    const response = session.commitSelectionChoice(0, { crops })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[WOOD_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 3 }, { crop: 'wood', remaining: 3 },
    ])
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1 })
    expectNoReward(response, PELLETS)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it('rejects insufficient seeds across two slots of the same Logical Field', () => {
    const session = setup(PELLETS, (state) => {
      const player = state.players[0]!
      player.minorPlayed.push(WOOD_FIELD)
      player.fields = []
      player.cardStates[WOOD_FIELD] = { extraData: { cardFieldStacks: [null, null] } }
      Object.assign(player.resources, { wood: 1, grain: 0, vegetable: 0 })
    })
    const before = startForesterSow(session)
    const cardSlots = farmSelection(before).selectableFields.filter((field) => field.sourceCard === WOOD_FIELD)
    const rejected = session.commitSelectionChoice(0, { crops: cardSlots.map((field) => ({ ...field.tile, crop: 'wood' })) })
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('NOT_ENOUGH_SEEDS')
    expect(rejected.state).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    const response = session.commitSelectionChoice(0, { crops: [{ ...cardSlots[0]!.tile, crop: 'wood' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.cardStates[WOOD_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'wood', remaining: 3 }, null,
    ])
  })

  it.each(['no-seeds', 'no-fields', 'opponent-forester'] as const)('collects normally without a Sow when %s', (control) => {
    const session = setup(PELLETS, (state) => {
      const player = state.players[0]!
      if (control === 'no-seeds') Object.assign(player.resources, { grain: 0, vegetable: 0 })
      if (control === 'no-fields') player.fields = []
      if (control === 'opponent-forester') {
        player.occupationPlayed = []
        state.players[1]!.occupationPlayed = [FORESTER]
      }
    })
    const response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.events.some((event) => event.type === 'farm.sown')).toBe(false)
    expectNoReward(response, PELLETS)
    expect(waiting(response).request.kind).toBe('confirm-next-player')
  })

  it.each([PELLETS, HOE] as const)("does not reward an opponent holding %s for the active player's ordinary Sow", (reward) => {
    const session = setup(reward, (state) => {
      state.players[0]!.minorPlayed = []
      state.players[1]!.minorPlayed = [reward]
    })
    startNormalSow(session, reward)
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: reward === HOE ? 'vegetable' : 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject(reward === HOE
      ? { grain: 2, vegetable: 0, clay: 0, stone: 0 }
      : { grain: 1, vegetable: 1, clay: 0, stone: 0 })
    expect(response.state.players[1]!.resources).toMatchObject({ grain: 0, clay: 0, stone: 0 })
    expectNoReward(response, reward)
  })

  it("does not let Publican reward its owner's ordinary Sow", () => {
    const session = setup(PUBLICAN, (state) => {
      state.players[0]!.occupationPlayed.push(PUBLICAN)
      state.players[1]!.occupationPlayed = []
    })
    startNormalSow(session, PUBLICAN)
    const response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.cardStates[PUBLICAN]?.counters?.bonusVp ?? 0).toBe(0)
    expectNoReward(response, PUBLICAN)
  })

  it('restores the restricted selection and collected wood through undo and a legal retry', () => {
    const session = setup(PELLETS)
    startForesterSow(session)
    let response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1 })
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 2 })
    expect(farmSelection(response).maxSelections).toBe(1)
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 3, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, grain: 1 })
    expectNoReward(response, PELLETS)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, grain: 2 })
    expect(response.state.players[0]!.fields.every((field) => field.stacks.length === 0)).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toHaveLength(0)
  })

})
