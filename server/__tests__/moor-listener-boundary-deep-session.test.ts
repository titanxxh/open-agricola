import { describe, expect, it } from 'vitest'
import { setupMoorAudit, playMoorAuditMinor, startMoorAuditFeeding } from './_helpers/moor-rules-audit'

describe('Moor remaining listener clauses', () => {
  it.each([
    ['M116_MoorBirchTrees', 'cut-peat', 'moor', 'wood', 2],
    ['M122_WillowBank', 'fell-trees', 'forest', 'reed', 1],
  ] as const)('%s gives its printed bonus only on its named special action', (cardId, action, kind, resource, bonus) => {
    for (const trigger of [true, false]) {
      const session = setupMoorAudit()
      session.state.players[0]!.minorPlayed = [cardId]
      const tile = { row: 0, col: 2 }
      session.state.players[0]!.farmTerrain = [{ ...tile, kind }]
      session.loadState(session.state)
      const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes(action))!
      const response = trigger ? session.takeSpecialAction(0, card.id, action, { tile }) : session.takeAction(0, 'day-laborer')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[resource]).toBe(20 + (trigger ? bonus : 0))
      expect(response.state.players[1]!.resources[resource]).toBe(20)
    }
  })

  it.each(['food', 'fuel', 'decline'] as const)('M091 offers one %s reward per unused named craft building at feeding end', (resource) => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M091_RoutineWork']
    player.improvements = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']
    player.resources.wood = 0
    player.resources.clay = 0
    player.resources.reed = 0
    player.resources.food = 0
    player.resources.grain = 1
    let response = startMoorAuditFeeding(session)
    let offers = 0
    for (let step = 0; step < 30 && response.state.round === 4; step++) {
      const request = response.interaction.request
      if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else if (request.kind === 'heating') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
      else if (request.kind === 'choice' && response.interaction.sourceCard === 'M091_RoutineWork') {
        offers++
        const choice = resource === 'decline' ? '__skip__' : request.options.find((entry) => entry.effectPreview?.resourcesGained?.[resource] === 1)?.value
        expect(choice).toBeDefined()
        response = session.resolveChoice(0, choice!)
      } else if (request.kind === 'choice') response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
      else response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.round).toBe(5)
    expect(offers).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ food: resource === 'food' ? 3 : 0, fuel: resource === 'fuel' ? 21 : 18 })
  })

  it.each(['sheep', 'boar', 'cattle', 'horse'] as const)('M115 rewards each of two cooked %s only for its printed animal types', (animal) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = ['M115_OakBark']
    player.improvements = ['Major_Moor_Cookhouse1']
    player.resources[animal] = 2
    player.pastures = [{ id: 'animals', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: animal, animalCount: 2 }]
    session.loadState(session.state)
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    const choice = response.interaction.request.options.find((option) => option.sourceCard === 'Major_Moor_Cookhouse1' && (option.effectPreview?.resourcesPaid?.[animal] ?? 0) > 0)!
    expect(choice).toBeDefined()
    response = session.resolveChoice(0, `bulk:${choice.value.split(':')[1]}=2`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[animal]).toBe(0)
    expect(response.state.players[0]!.resources.wood).toBe(animal === 'sheep' ? 20 : 22)
    expect(response.state.players[1]!.resources.wood).toBe(20)
  })

  it.each(['sheep', 'boar', 'cattle', 'horse'] as const)('M101 converts exactly one owner %s at its printed rate', (animal) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.resources[animal] = 1
    player.houseAnimalType = animal
    player.houseAnimalCount = 1
    player.minorHand = ['M101_ButchersBlock']
    session.loadState(session.state)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, 'M101_ButchersBlock')
    expect(response.ok, response.error).toBe(true)
    const choice = response.interaction.request.options.find((option) => option.value !== '__skip__')!
    expect(choice).toBeDefined()
    response = session.resolveChoice(0, choice.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ [animal]: 0, food: 20 + { sheep: 1, boar: 2, cattle: 3, horse: 2 }[animal], wood: 19 })
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })

  it.each(['wood', 'clay', 'reed', 'stone'] as const)('M127 grants the chosen %s after Cut Peat and checks matching accumulation amounts', (resource) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M127_Wheelbarrow']
    const tile = { row: 0, col: 2 }
    session.state.players[0]!.farmTerrain = [{ ...tile, kind: 'moor' }]
    session.loadState(session.state)
    const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('cut-peat'))!
    let response = session.takeSpecialAction(0, card.id, 'cut-peat', { tile })
    expect(response.ok, response.error).toBe(true)
    const choice = response.interaction.request.options.find((option) => option.effectPreview?.resourcesGained?.[resource] === 1)!
    expect(choice).toBeDefined()
    response = session.resolveChoice(0, choice.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[resource]).toBe(21)
    expect(response.state.players[0]!.resources.fuel).toBe(23)
    for (const amount of [3, 4, 5]) {
      const accumulated = setupMoorAudit(2, 14)
      accumulated.state.players[0]!.minorPlayed = ['M127_Wheelbarrow']
      const space = { wood: 'forest', clay: 'clay-pit', reed: 'reed-bank', stone: 'western-quarry' }[resource]
      accumulated.state.actionSpaces.find((entry) => entry.id === space)!.resources[resource] = amount
      const collected = accumulated.takeAction(0, space)
      expect(collected.ok, collected.error).toBe(true)
      expect(collected.state.players[0]!.resources.fuel).toBe(amount >= 4 ? 21 : 20)
    }
  })

  it.each(['wood', 'reed'] as const)('M119 actually chooses its %s reward after Fell Trees', (resource) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M119_AlderSwamp']
    const tile = { row: 0, col: 2 }
    session.state.players[0]!.farmTerrain = [{ ...tile, kind: 'forest' }]
    session.loadState(session.state)
    const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('fell-trees'))!
    let response = session.takeSpecialAction(0, card.id, 'fell-trees', { tile })
    expect(response.ok, response.error).toBe(true)
    const choice = response.interaction.request.options.find((option) => option.effectPreview?.resourcesGained?.[resource] === 1)!
    expect(choice).toBeDefined()
    response = session.resolveChoice(0, choice.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: resource === 'wood' ? 23 : 22, reed: resource === 'reed' ? 21 : 20 })
  })

  it.each([3, 4, 5])('M118 offers one wood or a paid two-wood upgrade after collecting %i wood', (wood) => {
    for (const pay of [false, true]) {
      const session = setupMoorAudit()
      session.state.players[0]!.minorPlayed = ['M118_TimberMill']
      session.state.actionSpaces.find((entry) => entry.id === 'forest')!.resources.wood = wood
      let response = session.takeAction(0, 'forest')
      expect(response.ok, response.error).toBe(true)
      if (wood >= 4) {
        expect(response.interaction.sourceCard).toBe('M118_TimberMill')
        const choice = response.interaction.request.options.find((option) => option.effectPreview?.resourcesGained?.wood === (pay ? 2 : 1))!
        expect(choice).toBeDefined()
        response = session.resolveChoice(0, choice.value)
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 20 + wood + (wood >= 4 ? pay ? 2 : 1 : 0), fuel: wood >= 4 && pay ? 19 : 20 })
    }
  })

  it.each([0, 1, 2, 3, 4])('M114 caps Fishing wood at three for %i forest spaces', (forests) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M114_RiversideWoods']
    session.state.players[0]!.farmTerrain = [1, 2, 3, 4].slice(0, forests).map((col) => ({ row: 0, col, kind: 'forest', covered: 'moor' }))
    const response = session.takeAction(0, 'fishing')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(20 + Math.min(3, forests))
  })

  it('M098 can decline the Fishing conversion without spending fuel', () => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M098_FishSmokehouse']
    session.state.actionSpaces.find((entry) => entry.id === 'fishing')!.resources.food = 2
    let response = session.takeAction(0, 'fishing')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).toBe('M098_FishSmokehouse')
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 20, food: 22 })
  })

  it('M130 finishes the granted horse through placement and rejects an oversized house', () => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M130_Nosebag']
    let response = session.takeAction(0, 'grain-seeds')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, horse: 1 })
    expect(response.interaction.request.kind).toBe('animal-reorg')
    const before = JSON.stringify(response.state)
    response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 2 }] })
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
    response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseAnimalCount).toBe(1)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
  })

  it.each([
    ['M083_CoalSeam', { wood: 19, clay: 19, fuel: 21 }, 1],
    ['M099_HealingClay', { clay: 19, food: 21 }, 1],
    ['M104_WildHarvest', { food: 21 }, 0],
    ['M115_OakBark', { vegetable: 0, wood: 22 }, 0],
  ] as const)('%s pays for its actual immediate resource reward and publishes its printed score', (cardId, resources, score) => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    session.state.players[0]!.resources.vegetable = 1
    const response = playMoorAuditMinor(session, cardId)
    expect(response.state.players[0]!.resources).toMatchObject(resources)
    expect(response.scores![0]!.categories.find((category) => category.key === 'cards')?.entries.find((entry) => entry.cardId === cardId)?.score ?? 0).toBe(score)
  })

  it('M080 actually receives all eight printed goods, places its sheep, and scores negative four', () => {
    const session = setupMoorAudit()
    let response = playMoorAuditMinor(session, 'M080_AdvancePayment')
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 21, food: 21, wood: 21, clay: 21, reed: 21, stone: 21, sheep: 1, grain: 1, vegetable: 0 })
    expect(response.scores![0]!.categories.find((category) => category.key === 'cards')?.entries).toContainEqual(expect.objectContaining({ cardId: 'M080_AdvancePayment', score: -4 }))
    response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseAnimalType).toBe('sheep')
  })
})
