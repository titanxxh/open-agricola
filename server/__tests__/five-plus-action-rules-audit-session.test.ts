import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { familySize, setWorkersAtHome } from '../../shared/domain/player'
import type { Resource } from '../../shared/contract/types'

const setup = (cardId: string, playerCount = 6) => {
  const session = new GameSession(5648, undefined, { playerCount })
  const state = session.getState().state
  state.round = 14
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources = { ...player.resources, food: 5, wood: 0, clay: 0, reed: 0, stone: 0 }
    setWorkersAtHome(state, player, 2)
  }
  state.players[0]!.occupationPlayed = [cardId]
  session.loadState(state)
  expect(session.getState().state.players).toHaveLength(playerCount)
  return session
}

const accept = (session: GameSession, response: ReturnType<GameSession['getState']>) => {
  expect(response.ok).toBe(true)
  expect(response.interaction.stateId).toBe('wait')
  const option = response.interaction.request.options?.find((entry) => entry.value !== '__skip__' && entry.value !== 'cancel')
  expect(option).toBeDefined()
  const next = session.resolveChoice(response.interaction.playerIndex, option!.value)
  expect(next.ok).toBe(true)
  return next
}

const actionRewards: Array<[string, string, Partial<Resource>, Partial<Resource>]> = [
  ['A175_HollowGardener', 'hollow-56', { clay: 2 }, { clay: 2, grain: 0, vegetable: 0 }],
  ['A175_HollowGardener', 'hollow-56', { clay: 3 }, { clay: 3, grain: 1, vegetable: 0 }],
  ['A175_HollowGardener', 'hollow-56', { clay: 5 }, { clay: 5, grain: 1, vegetable: 0 }],
  ['A175_HollowGardener', 'hollow-56', { clay: 6 }, { clay: 6, grain: 0, vegetable: 1 }],
  ['A175_HollowGardener', 'clay-pit', { clay: 6 }, { clay: 6, grain: 0, vegetable: 0 }],
  ['A179_MountainShepherd', 'western-quarry', { stone: 2 }, { stone: 2, sheep: 1 }],
  ['A179_MountainShepherd', 'eastern-quarry', { stone: 2 }, { stone: 2, sheep: 1 }],
  ['A179_MountainShepherd', 'resource-market-56', {}, { stone: 1, sheep: 0 }],
  ['B174_RiverbankGardener', 'riverbank-forest-56', { wood: 3 }, { wood: 3, reed: 1, vegetable: 1 }],
  ['B174_RiverbankGardener', 'forest', { wood: 3 }, { wood: 3, vegetable: 0 }],
  ['B180_GameTeaser', 'fishing', { food: 1 }, { food: 6, cattle: 1, boar: 0, sheep: 0 }],
  ['B180_GameTeaser', 'fishing', { food: 2 }, { food: 7, cattle: 0, boar: 1, sheep: 0 }],
  ['B180_GameTeaser', 'fishing', { food: 3 }, { food: 8, cattle: 0, boar: 0, sheep: 1 }],
  ['B180_GameTeaser', 'fishing', { food: 4 }, { food: 9, cattle: 0, boar: 0, sheep: 0 }],
  ['B180_GameTeaser', 'day-laborer', {}, { food: 7, cattle: 0, boar: 0, sheep: 0 }],
]

describe('Five-plus action printed-rule audit', () => {
  it.each(actionRewards)('%s on %s with %j produces %j', (cardId, spaceId, accumulated, expected) => {
    const session = setup(cardId)
    Object.assign(session.state.actionSpaces.find((space) => space.id === spaceId)!.resources, accumulated)
    const response = session.takeAction(0, spaceId)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject(expected)
    expect(response.state.actionSpaces.find((space) => space.id === spaceId)!.takenBy).toHaveLength(1)
    expect(response.state.log.some((entry) => entry.key === 'log.placeFarmer')).toBe(true)
  })

  it.each(['A175_HollowGardener', 'A179_MountainShepherd', 'B174_RiverbankGardener', 'B180_GameTeaser'])('%s does not reward the owner for an opponent action', (cardId) => {
    const session = setup(cardId)
    const spaces: Record<string, string> = { A175_HollowGardener: 'hollow-56', A179_MountainShepherd: 'western-quarry', B174_RiverbankGardener: 'riverbank-forest-56', B180_GameTeaser: 'fishing' }
    session.state.currentPlayerIndex = 1
    const before = structuredClone(session.state.players[0]!.resources)
    const response = session.takeAction(1, spaces[cardId]!)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toEqual(before)
  })

  it.each([
    [true, 12, [2, 3, 4, 1, 1], 15],
    [true, 12, [2, 3, 4, 1, 2], 12],
    [false, 12, [0, 0, 0, 0, 0], 12],
    [true, 16, [0, 0, 0, 0, 0], 16],
  ] as const)('A176 Wheelmaker resolves actual play with prior=%s wood=%i opponents=%j', (prior, wood, opponents, expected) => {
    const session = setup('A176_Wheelmaker')
    const player = session.state.players[0]!
    player.occupationPlayed = prior ? ['D172_PutcherMaker'] : []
    player.occupationHand = ['A176_Wheelmaker']
    player.resources.wood = wood
    opponents.forEach((amount, index) => { session.state.players[index + 1]!.resources.wood = amount })
    const response = session.takeAction(0, 'lessons')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A176_Wheelmaker')
    expect(response.state.players[0]!.resources.wood).toBe(expected)
    expect(response.state.players[0]!.resources.food).toBe(prior ? 4 : 5)
  })

  it.each([0, 1, 3])('D177 Graduate resolves its additional payment with %i food', (food) => {
    const session = setup('D177_Graduate')
    session.state.players[0]!.occupationPlayed = []
    session.state.players[0]!.occupationHand = ['D177_Graduate']
    session.state.players[0]!.resources.food = food
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait' && response.interaction.promptKey === 'prompt.selectPayment') response = accept(session, response)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('D177_Graduate')
    expect(response.state.players[0]!.resources).toMatchObject({ food: Math.max(0, food - 1), stone: food ? 2 : 0, reed: food ? 2 : 0 })
  })

  it('D172 Putcher Maker rejects another player and caps bulk exchanges at available reed', () => {
    const session = setup('D172_PutcherMaker')
    session.state.players[0]!.resources.reed = 3
    const offered = session.takeAnytimeAction(0, 'exchange')
    expect(offered.ok).toBe(true)
    expect(offered.interaction.stateId).toBe('wait')
    const index = offered.interaction.request.options.findIndex((option) => option.sourceCard === 'D172_PutcherMaker')
    expect(index).toBeGreaterThanOrEqual(0)
    const rejected = session.resolveChoice(1, `bulk:${index}=1`)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources).toMatchObject({ reed: 3, food: 5 })
    const result = session.resolveChoice(0, `bulk:${index}=4`)
    expect(result.ok).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ reed: 0, food: 11 })
    expect(result.state.actionSpaces.every((space) => space.takenBy.length === 0)).toBe(true)
  })

  it.each([
    ['C177_MountainHiker', 'hollow-56', 'stone'],
    ['D174_LoessGardener', 'clay-pit', 'vegetable'],
  ] as const)('%s supports accept, decline and insufficient-food branches on %s', (cardId, spaceId, resource) => {
    for (const mode of ['accept', 'decline', 'no-food']) {
      const session = setup(cardId)
      session.state.players[0]!.resources.food = mode === 'no-food' ? 0 : 1
      let response = session.takeAction(0, spaceId)
      expect(response.ok).toBe(true)
      if (mode === 'accept') response = accept(session, response)
      else if (mode === 'decline') response = session.resolveChoice(0, '__skip__')
      else expect(response.interaction.sourceCard).not.toBe(cardId)
      expect(response.ok).toBe(true)
      expect(response.state.players[0]!.resources[resource]).toBe(mode === 'accept' ? 1 : 0)
      expect(response.state.players[0]!.resources.food).toBe(mode === 'decline' ? 1 : 0)
    }
  })

  it.each([
    ['wood', 'clay-pit', 'clay', 3, true],
    ['clay', 'western-quarry', 'stone', 3, true],
    ['wood', 'western-quarry', 'stone', 3, false],
    ['wood', 'clay-pit', 'clay', 1, false],
    ['stone', 'clay-pit', 'clay', 3, false],
  ] as const)('C169 Fast Mason from %s using %s collecting %s=%i', (house, spaceId, material, amount, eligible) => {
    const session = setup('C169_FastMason')
    session.state.players[0]!.houseType = house
    session.state.players[0]!.resources.reed = 0
    session.state.actionSpaces.find((space) => space.id === spaceId)!.resources[material] = amount
    let response = session.takeAction(0, spaceId)
    expect(response.ok).toBe(true)
    if (eligible) response = accept(session, response)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.houseType).toBe(eligible ? material : house)
    expect(response.state.players[0]!.resources[material]).toBe(eligible ? amount - 2 : amount)
    expect(response.state.players[0]!.resources.reed).toBe(0)
  })

  it.each([8, 9])('A169 Off-Siter grants room capacity at printed total %i', (total) => {
    const session = setup('A169_OffSiter')
    session.state.players[0]!.improvements = total === 8
      ? ['Major_Well', 'Major_Joinery']
      : ['Major_Well', 'Major_CookingHearth2']
    session.loadState(session.state)
    const before = familySize(session.state.players[0]!)
    const response = session.takeAction(0, 'modest-wish-children-56')
    expect(response.ok).toBe(total === 9)
    expect(familySize(response.state.players[0]!)).toBe(before + (total === 9 ? 1 : 0))
    expect(response.state.players[0]!.cardStates.A169_OffSiter?.extraData?.thresholdReached ?? false).toBe(total === 9)
  })

  it.each([0, 1])('C173 Top-Outer collects linked food when player %i builds rooms', (actor) => {
    const session = setup('C173_TopOuter')
    session.state.currentPlayerIndex = actor
    session.state.players[actor]!.resources.wood = 5
    session.state.players[actor]!.resources.reed = 2
    session.state.actionSpaces.find((space) => space.id === 'traveling-players-56')!.resources.food = 4
    const offered = session.takeAction(actor, 'house-building-56')
    expect(offered.ok).toBe(true)
    const tile = offered.interaction.request.farm.selectableTiles[0]!
    let response = session.commitSelectionChoice(actor, { rooms: [tile] })
    if (response.interaction.request.kind === 'confirm-player-switch') response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(9)
    expect(response.state.actionSpaces.find((space) => space.id === 'traveling-players-56')!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'traveling-players-56')!.takenBy).toHaveLength(0)
  })

  it('B171 Greenhouse Builder gates its choices by revealed cards and owner access', () => {
    const session = setup('B171_GreenhouseBuilder')
    session.state.roundActionOrder = session.state.roundActionOrder.map(() => null)
    session.loadState(session.state)
    expect(session.takeAction(0, 'B171_GreenhouseBuilder').ok).toBe(false)
    session.state.roundActionOrder[0] = 'vegetable-seeds'
    session.state.currentPlayerIndex = 1
    session.loadState(session.state)
    expect(session.takeAction(1, 'B171_GreenhouseBuilder').ok).toBe(false)
    session.state.currentPlayerIndex = 0
    session.loadState(session.state)
    const response = session.takeAction(0, 'B171_GreenhouseBuilder')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'B171_GreenhouseBuilder')!.takenBy).toHaveLength(1)
  })

  it.each([true, false])('C170 Amateur Fencer offers its free one-space pasture with existing=%s', (existing) => {
    const session = setup('C170_AmateurFencer')
    session.state.players[0]!.occupationPlayed = []
    session.state.players[0]!.occupationHand = ['C170_AmateurFencer']
    if (existing) session.state.players[0]!.pastures = [{ id: 'existing', size: 1, tiles: [{ row: 1, col: 1 }], stables: 0, animalType: null, animalCount: 0 }]
    let response = session.takeAction(0, 'lessons')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('C170_AmateurFencer')
    if (existing) {
      expect(response.interaction.sourceCard).not.toBe('C170_AmateurFencer')
      expect(response.state.players[0]!.pastures).toHaveLength(1)
      return
    }
    response = accept(session, response)
    expect(response.interaction.request.farm.farmType).toBe('fence')
    const invalid = session.commitSelectionChoice(0, { edges: ['H-1-1'], extraWood: 0 })
    expect(invalid.ok).toBe(false)
    expect(invalid.state.players[0]!.pastures).toHaveLength(0)
    response = session.commitSelectionChoice(0, { edges: ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2'], extraWood: 0 })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures).toHaveLength(1)
    expect(response.state.players[0]!.pastures[0]!.size).toBe(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it.each([0, 1])('D170 Fold Builder transfers the fee before player %i fences and receives a sheep', (actor) => {
    const session = setup('D170_FoldBuilder')
    session.state.currentPlayerIndex = actor
    session.state.players[actor]!.resources.wood = 4
    session.loadState(session.state)
    const offered = session.takeAction(actor, 'D170_FoldBuilder')
    expect(offered.ok).toBe(true)
    expect(offered.state.players[0]!.resources.food).toBe(actor === 0 ? 5 : 6)
    expect(offered.state.players[actor]!.resources.food).toBe(actor === 0 ? 5 : 4)
    const response = session.commitSelectionChoice(actor, { edges: ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2'], extraWood: 0 })
    expect(response.ok).toBe(true)
    expect(response.state.players[actor]!.pastures).toHaveLength(1)
    expect(response.state.players[actor]!.resources).toMatchObject({ wood: 0, sheep: 1 })
  })

  it('D170 Fold Builder rejects an opponent who cannot pay the entry fee without placing a worker', () => {
    const session = setup('D170_FoldBuilder')
    session.state.currentPlayerIndex = 1
    session.state.players[1]!.resources.wood = 4
    session.state.players[1]!.resources.food = 0
    session.loadState(session.state)
    const response = session.takeAction(1, 'D170_FoldBuilder')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.food).toBe(5)
    expect(response.state.actionSpaces.find((space) => space.id === 'D170_FoldBuilder')!.takenBy).toHaveLength(0)
  })

  it.each([0, 1])('D175 Countryman offers exactly one crop field after player %i renovates', (actor) => {
    const session = setup('D175_Countryman')
    session.state.currentPlayerIndex = actor
    session.state.players[actor]!.resources.clay = 2
    session.state.players[actor]!.resources.reed = 1
    session.state.players[0]!.resources.grain = 2
    session.state.players[0]!.fields = [{ row: 1, col: 1, stacks: [] }, { row: 1, col: 2, stacks: [] }]
    let response = session.takeAction(actor, 'house-redevelopment')
    for (let step = 0; step < 8 && response.interaction.sourceCard !== 'D175_Countryman'; step += 1) {
      if (response.interaction.request.kind === 'confirm-player-switch') response = session.resolveChoice(response.interaction.request.fromPlayerIndex, 'confirm')
      else response = accept(session, response)
    }
    expect(response.interaction.sourceCard).toBe('D175_Countryman')
    response = accept(session, response)
    expect(response.interaction.request.farm.farmType).toBe('sow')
    const rejected = session.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'grain' }, { row: 1, col: 2, crop: 'grain' }] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]!.resources.grain).toBe(2)
    response = session.commitSelectionChoice(0, { crops: [{ row: 1, col: 1, crop: 'grain' }] })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.fields[1]!.stacks).toEqual([])
  })

  it('C179 Bovine Pioneer currently rewards subdividing an already fenced pasture', () => {
    const session = setup('C179_BovinePioneer')
    session.state.players[0]!.resources.wood = 1
    session.state.players[0]!.pastures = [{ id: 'existing', size: 2, tiles: [{ row: 1, col: 1 }, { row: 1, col: 2 }], stables: 0, animalType: null, animalCount: 0 }]
    session.state.players[0]!.fenceSegments = ['H-1-1', 'H-1-2', 'H-2-1', 'H-2-2', 'V-1-1', 'V-1-3'].map((edge) => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: session.state.players[0]!.id } }))
    session.loadState(session.state)
    const offered = session.takeAction(0, 'fencing')
    expect(offered.ok).toBe(true)
    const response = session.commitSelectionChoice(0, { edges: ['V-1-2'], extraWood: 0 })
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.pastures).toHaveLength(2)
    expect(response.state.players[0]!.resources.cattle).toBe(1)
  })

  it('A169 Off-Siter preserves extra capacity after the qualifying major is returned', () => {
    const session = setup('A169_OffSiter')
    session.state.players[0]!.improvements = ['Major_Well', 'Major_CookingHearth2']
    session.loadState(session.state)
    expect(session.getState().state.players[0]!.cardStates.A169_OffSiter?.extraData?.thresholdReached).toBe(true)
    session.state.players[0]!.improvements = ['Major_Well']
    session.loadState(session.state)
    const response = session.takeAction(0, 'modest-wish-children-56')
    expect(response.ok).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
  })

  it.each(['wood', 'clay', 'reed', 'stone'] as const)('D178 Substitute Teacher grants the chosen %s and consumes one worker', (resource) => {
    const session = setup('D178_SubstituteTeacher')
    for (const [index, id] of ['lessons', 'lessons-56-2f', 'lessons-56-variable'].entries()) {
      const player = session.state.players[index + 1]!
      session.state.actionSpaces.find((space) => space.id === id)!.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
    }
    session.loadState(session.state)
    const offered = session.takeAction(0, 'D178_SubstituteTeacher')
    expect(offered.ok).toBe(true)
    const option = offered.interaction.request.options.find((entry) => JSON.stringify(entry.effectPreview ?? {}).includes(`"${resource}":1`))!
    expect(option).toBeDefined()
    const response = session.resolveChoice(0, option.value)
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources[resource]).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'D178_SubstituteTeacher')!.takenBy).toHaveLength(1)
  })

  it.each([1, 2])('D179 Bullcatcher currently resolves differently with %i available workers', (workers) => {
    const session = setup('D179_Bullcatcher')
    for (const slot of [2, 5]) {
      const space = session.state.actionSpaces.find((entry) => entry.id === session.state.roundActionOrder[slot])!
      space.takenBy = [{ playerId: session.state.players[1]!.id, workerId: session.state.players[1]!.workers[slot === 2 ? 0 : 1]!.id }]
    }
    setWorkersAtHome(session.state, session.state.players[0]!, workers)
    session.loadState(session.state)
    const response = session.takeAction(0, 'D179_Bullcatcher')
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ cattle: workers === 1 ? 0 : 1, food: workers === 1 ? 5 : 7 })
    if (workers === 1) {
      expect(response.interaction.request.kind).toBe('engine-blocked')
      const undone = session.undoAction(0)
      expect(undone.ok).toBe(true)
      expect(undone.state.actionSpaces.find((space) => space.id === 'D179_Bullcatcher')!.takenBy).toHaveLength(0)
    }
  })
})
