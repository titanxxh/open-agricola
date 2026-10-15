import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import type { ChoiceDescriptionPreview, ChoiceEffectPreview, PlayerState, Resource } from '../../shared/contract/types'
import '../../shared/cards/register-all'

const MASTER = 'E087_MasterRenovator'
const TROWEL = 'D013_Trowel'
const TROWEL_ANYTIME = 'D13-trowel-anytime'
const sessions = new Set<GameSession>()
afterEach(() => {
  for (const session of sessions) session.dispose()
  sessions.clear()
})

const ok = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.activeModifiers.some(modifier => modifier.cardId === MASTER)).toBe(false)
  return response
}

const wait = (response: SessionResponse) => {
  ok(response)
  assert.equal(response.interaction.stateId, 'wait')
  return response.interaction
}

const setup = ({ nested = false, stone = 2, round = 7, houseType = 'wood', rooms = 2, played = true, resources = {}, minors = [], occupations = [] }: {
  nested?: boolean
  stone?: number
  round?: number
  houseType?: PlayerState['houseType']
  rooms?: 2 | 3
  played?: boolean
  resources?: Partial<Resource>
  minors?: string[]
  occupations?: string[]
} = {}) => {
  const session = createWorkSession({
    seed: 1189, options: { playerCount: nested ? 4 : 2 },
    configure(state) {
      state.round = round
      state.currentPlayerIndex = 0
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.resources = {
          wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
          grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
        }
      }
      const spaces = state.actionSpaces.filter(space => space.roundAvailable === 1)
      let placement = 0
      for (const player of state.players) {
        for (const worker of player.workers.filter(worker => worker.isActive)) {
          const space = spaces[placement++]
          assert.ok(space, 'Every active worker needs a real revealed action space for snapshot restoration')
          space.takenBy.push({ playerId: player.id, workerId: worker.id })
        }
      }
      const player = state.players[0]!
      player.occupationPlayed = [...(played ? [MASTER] : []), ...occupations, ...(nested ? ['B168_PastureMaster'] : [])]
      player.minorPlayed = [...minors, ...(nested ? [TROWEL] : [])]
      player.houseType = houseType
      player.rooms = rooms
      if (rooms === 3) player.roomTiles.push({ row: 0, col: 0 })
      Object.assign(player.resources, { clay: 2, reed: 1, stone }, resources)
      if (nested) {
        player.resources.sheep = 1
        player.pastures = [{ id: 'stable-pasture', tiles: [{ row: 0, col: 2 }], animalType: 'sheep', animalCount: 1 }]
        player.stableTiles = [{ row: 0, col: 2 }]
        player.fenceSegments = ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'].map(edge => ({
          edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id },
        }))
      }
    },
  })
  sessions.add(session)
  return session
}

const beginPayment = (session: GameSession) => {
  let response = ok(session.performRoundEnd())
  for (let step = 0; step < 5; step++) {
    const interaction = wait(response)
    if (interaction.promptKey === 'prompt.selectPayment') return response
    const options = interaction.request.options ?? []
    const option = options.find(option => option.sourceCard === MASTER)
      ?? options.find(option => option.value === 'clay')
      ?? options.find(option => option.value !== '__skip__')
    assert.ok(option, JSON.stringify(interaction))
    response = ok(session.resolveChoice(interaction.playerIndex, option.value))
  }
  assert.fail('Expected E087 payment choice')
}

const choosePayment = (session: GameSession, response: SessionResponse, paid: Partial<Resource>) => {
  const interaction = wait(response)
  expect(interaction.promptKey).toBe('prompt.selectPayment')
  const option = interaction.request.options?.find(option => option.effectPreview?.kind === 'payment'
    && Object.entries(paid).every(([key, amount]) => option.effectPreview?.kind === 'payment'
      && option.effectPreview.resourcesPaid?.[key] === amount))
  assert.ok(option, JSON.stringify(interaction))
  return ok(session.resolveChoice(interaction.playerIndex, option.value))
}

const payments = (description?: ChoiceDescriptionPreview): Extract<ChoiceEffectPreview, { kind: 'payment' }>[] => {
  if (!description) return []
  if (description.kind === 'group') return description.parts.flatMap(payments)
  if (description.kind === 'conditional') return payments(description.body)
  const effect = description.effectPreview
  if (effect?.kind === 'payment') return [effect]
  return effect?.kind === 'rule' ? payments(effect.description) : []
}

const paidEvents = (response: SessionResponse) => response.state.events
  .filter(event => event.type === 'resource.paid' && event.paymentFor === 'renovation')

const restore = (session: GameSession) => {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.add(restored)
  return restored
}

const finishAnimals = (session: GameSession, response: SessionResponse) => {
  let current = response
  for (let step = 0; step < 5 && current.interaction.stateId === 'wait'; step++) {
    const pending = wait(current)
    assert.equal(pending.request.kind, 'animal-reorg')
    current = ok(session.resolveChoice(pending.playerIndex, 'confirm', { zones: pending.request.zones }))
  }
  expect(current.interaction.stateId).toBe('idle')
  return current
}

describe('E087 renovation discount ownership', () => {
  it('keeps a nested Trowel renovation at its own two-stone cost during Pasture Master animal reorganization', () => {
    const session = setup({ nested: true })
    const outer = choosePayment(session, beginPayment(session), { clay: 2, reed: 0 })
    const interaction = wait(outer)
    expect(interaction.request.kind).toBe('animal-reorg')
    expect(outer.state.players[0]).toMatchObject({ houseType: 'clay', resources: { stone: 2, reed: 1, food: 22, sheep: 2 } })
    expect(paidEvents(outer)).toMatchObject([{ resources: { clay: 2 }, bonusSources: [MASTER] }])
    const trowel = interaction.anytimeActions.find(action => action.id === TROWEL_ANYTIME)
    assert.ok(trowel, 'Trowel must remain legal inside animal-reorg')
    expect(payments(trowel.descriptionPreview)).toMatchObject([{ resourcesPaid: { stone: 2, reed: 0 }, sourceCards: [TROWEL] }])

    const response = ok(session.takeAnytimeAction(0, TROWEL_ANYTIME))
    expect(wait(response).request.kind).toBe('animal-reorg')
    expect(response.state.players[0]).toMatchObject({ houseType: 'stone', resources: { stone: 0, reed: 1, food: 24, sheep: 3 } })
    expect(paidEvents(response)).toMatchObject([
      { resources: { clay: 2 }, bonusSources: [MASTER] },
      { resources: { stone: 2 }, bonusSources: [TROWEL] },
    ])
    expect(response.state.events.filter(event => event.type === 'farm.renovated')).toHaveLength(2)
    expect(response.state.players[0]!.activeModifiers.some(modifier => modifier.cardId === MASTER)).toBe(false)
    const final = finishAnimals(session, response)
    expect(final.state.round).toBe(8)
    expect(final.state.players[0]!.resources).toMatchObject({ stone: 0, food: 20, sheep: 4 })
    expect(paidEvents(final)).toHaveLength(2)
  })

  it('rejects a one-stone Trowel attempt while retaining the outer animal pending', () => {
    const session = setup({ nested: true, stone: 1 })
    const outer = choosePayment(session, beginPayment(session), { clay: 2, reed: 0 })
    expect(wait(outer).request.kind).toBe('animal-reorg')
    expect(outer.interaction.anytimeActions.some(action => action.id === TROWEL_ANYTIME)).toBe(false)
    const before = JSON.stringify(outer.state)
    const rejected = session.takeAnytimeAction(0, TROWEL_ANYTIME)
    expect(rejected.ok).toBe(false)
    expect(JSON.stringify(rejected.state)).toBe(before)
    expect(rejected.interaction).toEqual(outer.interaction)
    const final = finishAnimals(session, ok(session.getState()))
    expect(final.state.round).toBe(8)
    expect(final.state.players[0]).toMatchObject({ houseType: 'clay', resources: { stone: 1 } })
    expect(paidEvents(final)).toHaveLength(1)
  })

  it('charges the same two stones for an independent round-eight Trowel renovation', () => {
    const session = setup({ round: 8, houseType: 'clay', minors: [TROWEL] })
    const response = ok(session.takeAnytimeAction(0, TROWEL_ANYTIME))
    expect(response.state.players[0]).toMatchObject({ houseType: 'stone', resources: { stone: 0, reed: 1 } })
    expect(paidEvents(response)).toMatchObject([{ resources: { stone: 2 }, bonusSources: [TROWEL] }])
  })

  it.each([
    { rooms: 2, discount: 'clay', paid: { clay: 1, reed: 1 }, remaining: { clay: 1, reed: 0 } },
    { rooms: 2, discount: 'reed', paid: { clay: 2, reed: 0 }, remaining: { clay: 0, reed: 1 } },
    { rooms: 3, discount: 'clay', paid: { clay: 2, reed: 1 }, remaining: { clay: 1, reed: 0 } },
    { rooms: 3, discount: 'reed', paid: { clay: 3, reed: 0 }, remaining: { clay: 0, reed: 1 } },
  ] as const)('restores $rooms-room payment and chooses only the $discount discount after an invalid choice', ({ rooms, paid, remaining }) => {
    const original = setup({ rooms, resources: { clay: rooms } })
    const pending = beginPayment(original)
    expect(pending.state.players[0]).toMatchObject({ houseType: 'wood', resources: { clay: rooms, reed: 1 } })
    const paymentOptions = wait(pending).request.options
    expect(paymentOptions).toHaveLength(2)
    const session = restore(original)
    const restored = ok(session.getState())
    expect(wait(restored).request.options).toEqual(paymentOptions)
    const before = JSON.stringify(restored.state)
    const invalid = session.resolveChoice(0, 'not-a-payment-option')
    expect(invalid.ok).toBe(false)
    expect(JSON.stringify(invalid.state)).toBe(before)
    expect(invalid.interaction).toEqual(restored.interaction)
    const response = choosePayment(session, ok(session.getState()), paid)
    expect(response.state.players[0]).toMatchObject({ houseType: 'clay', resources: remaining })
    const expectedPaid = paid.reed ? { clay: paid.clay, reed: 1 } : { clay: paid.clay }
    expect(paidEvents(response)).toMatchObject([{ resources: expectedPaid, bonusSources: [MASTER] }])
    expect(paidEvents(response)).toHaveLength(1)
  })

  it('combines a timed action bonus with Roof Ladder computeCosts at admission and payment', () => {
    const session = setup({ minors: ['D081_RoofLadder'], resources: { clay: 1, reed: 0, stone: 0 } })
    let response = ok(session.performRoundEnd())
    for (let step = 0; step < 5 && response.state.players[0]!.houseType !== 'clay'; step++) {
      const interaction = wait(response)
      const option = interaction.request.options?.find(option => option.value !== '__skip__')
      assert.ok(option, JSON.stringify(interaction))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    }
    expect(response.state.players[0]).toMatchObject({ houseType: 'clay', resources: { clay: 0, reed: 0, stone: 1 } })
    expect(paidEvents(response)).toMatchObject([{ resources: { clay: 1 }, bonusSources: [MASTER, 'D081_RoofLadder'] }])
  })

  it('restores both animal pending layers without replaying the parent payment or rewards', () => {
    const original = setup({ nested: true })
    const outer = choosePayment(original, beginPayment(original), { clay: 2, reed: 0 })
    expect(wait(outer).request.kind).toBe('animal-reorg')
    const session = restore(original)
    const nested = ok(session.takeAnytimeAction(0, TROWEL_ANYTIME))
    expect(wait(nested).request.kind).toBe('animal-reorg')
    expect(nested.state.players[0]!.resources.stone).toBe(0)
    expect(nested.interaction.allowedCommands).toContain('undoStep')
    const final = finishAnimals(restore(session), nested)
    expect(final.state.round).toBe(8)
    expect(final.state.players[0]!.resources).toMatchObject({ food: 20, sheep: 4, stone: 0 })
    expect(final.state.events.filter(event => event.type === 'farm.renovated')).toHaveLength(2)
    expect(paidEvents(final)).toMatchObject([
      { resources: { clay: 2 }, bonusSources: [MASTER] },
      { resources: { stone: 2 }, bonusSources: [TROWEL] },
    ])
    expect(final.state.log.filter(entry => entry.key === 'log.actionDetail'
      && JSON.stringify(entry.params?.detailParts).includes('renovate'))).toHaveLength(2)
  })

  it('restores a different discount choice when undo returns from nested Trowel through the parent payment', () => {
    const original = setup({ nested: true })
    choosePayment(original, beginPayment(original), { clay: 2, reed: 0 })
    const session = restore(original)
    const nested = ok(session.takeAnytimeAction(0, TROWEL_ANYTIME))
    expect(wait(nested).request.kind).toBe('animal-reorg')
    const innerRestored = restore(session)
    const undone = ok(innerRestored.undoStep())
    expect(wait(undone).request.kind).toBe('animal-reorg')
    expect(undone.state.players[0]).toMatchObject({ houseType: 'clay', resources: { stone: 2, food: 22, sheep: 2 } })
    expect(paidEvents(undone)).toHaveLength(1)
    const redone = ok(innerRestored.takeAnytimeAction(0, TROWEL_ANYTIME))
    expect(redone.state.players[0]).toMatchObject({ houseType: 'stone', resources: { stone: 0, food: 24, sheep: 3 } })
    expect(paidEvents(redone)).toMatchObject([
      { resources: { clay: 2 }, bonusSources: [MASTER] },
      { resources: { stone: 2 }, bonusSources: [TROWEL] },
    ])
    const backToOuter = ok(innerRestored.undoStep())
    expect(wait(backToOuter).request.kind).toBe('animal-reorg')
    const backToPayment = ok(innerRestored.undoStep())
    expect(wait(backToPayment).promptKey).toBe('prompt.selectPayment')
    expect(backToPayment.state.players[0]).toMatchObject({ houseType: 'wood', resources: { clay: 2, reed: 1, stone: 2, food: 20, sheep: 1 } })
    expect(paidEvents(backToPayment)).toHaveLength(0)
    const differentDiscount = choosePayment(innerRestored, backToPayment, { clay: 1, reed: 1 })
    expect(differentDiscount.state.players[0]).toMatchObject({ houseType: 'clay', resources: { clay: 1, reed: 0, stone: 2, food: 22, sheep: 2 } })
    const secondTrowel = ok(innerRestored.takeAnytimeAction(0, TROWEL_ANYTIME))
    const final = finishAnimals(innerRestored, secondTrowel)
    expect(final.state.round).toBe(8)
    expect(final.state.events.filter(event => event.type === 'farm.renovated')).toHaveLength(2)
    expect(paidEvents(final)).toMatchObject([
      { resources: { clay: 1, reed: 1 }, bonusSources: [MASTER] },
      { resources: { stone: 2 }, bonusSources: [TROWEL] },
    ])
  })

  it.each([
    { round: 7, houseType: 'wood', played: true, resources: { clay: 1, reed: 0 } },
    { round: 7, houseType: 'wood', played: false, resources: { clay: 2, reed: 1 } },
    { round: 8, houseType: 'wood', played: true, resources: { clay: 2, reed: 1 } },
    { round: 7, houseType: 'stone', played: true, resources: { clay: 2, reed: 1 } },
  ] as const)('offers no renovation for $houseType house in round $round with played=$played and resources=$resources', fixture => {
    const response = ok(setup(fixture).performRoundEnd())
    expect(response.state.players[0]).toMatchObject({ houseType: fixture.houseType, resources: fixture.resources })
    expect(paidEvents(response)).toHaveLength(0)
    expect(response.state.events.filter(event => event.type === 'farm.renovated')).toHaveLength(0)
    expect(response.interaction.stateId).toBe('idle')
  })

  it('can undo a skipped timed renovation while a second same-player stage offer remains', () => {
    const session = setup({ occupations: ['D107_Bellfounder'] })
    let response = ok(session.performRoundEnd())
    if (wait(response).request.kind === 'select-trigger') {
      const interaction = wait(response)
      const option = interaction.request.options?.find(option => option.sourceCard === MASTER)
      assert.ok(option)
      response = ok(session.resolveChoice(0, option.value))
    }
    const offer = wait(response)
    expect(offer.request.options?.some(option => option.value === '__skip__')).toBe(true)
    response = ok(session.resolveChoice(0, '__skip__'))
    expect(response.state.players[0]).toMatchObject({ houseType: 'wood', resources: { clay: 2, reed: 1 } })
    expect(wait(response).sourceCard).toBe('D107_Bellfounder')
    expect(response.interaction.allowedCommands).toContain('undoStep')
    const undone = ok(session.undoStep())
    expect(wait(undone).request.options?.some(option => option.value === '__skip__')).toBe(true)
    const restored = restore(session)
    const skipAgain = ok(restored.resolveChoice(0, '__skip__'))
    expect(wait(skipAgain).sourceCard).toBe('D107_Bellfounder')
    const final = ok(restored.resolveChoice(0, '__skip__'))
    expect(final.state.round).toBe(8)
    expect(final.state.players[0]!.houseType).toBe('wood')
    expect(paidEvents(final)).toHaveLength(0)
  })

  it('uses the live third room built by Hammer Crusher before the timed renovation payment', () => {
    const session = setup({ round: 9, houseType: 'clay', minors: ['D014_HammerCrusher'], resources: { clay: 3, reed: 2, stone: 3 } })
    let response = ok(session.performRoundEnd())
    for (let step = 0; step < 6 && (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select'); step++) {
      const interaction = wait(response)
      const option = interaction.request.options?.find(option => option.value !== '__skip__')
      assert.ok(option, JSON.stringify(interaction))
      response = ok(session.resolveChoice(interaction.playerIndex, option.value))
    }
    expect(wait(response).request.kind).toBe('farm-select')
    response = ok(session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] }))
    expect(response.state.players[0]!.rooms).toBe(3)
    response = choosePayment(session, response, { stone: 2, reed: 1 })
    expect(response.state.players[0]).toMatchObject({ houseType: 'stone', rooms: 3, resources: { clay: 0, reed: 0, stone: 1 } })
    expect(paidEvents(response)).toMatchObject([{ resources: { stone: 2, reed: 1 }, bonusSources: [MASTER] }])
  })
})
