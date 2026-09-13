import { describe, expect, it } from 'vitest'
import { setupMoorAudit, playMoorAuditMinor, startMoorAuditFeeding, advanceMoorAuditToRound, acceptMoorAuditChoice } from './_helpers/moor-rules-audit'
import { moveMajorImprovementToSupplyTop } from '../../shared/cards/major/supply'
import { setWorkersAtHome, workersAvailable } from '../../shared/domain/player'

describe('Moor exchange printed-rule native audit', () => {
  it.each([
    ['Major_Joinery', 'wood', 'Major_Moor_FurnitureStall'],
    ['Major_Pottery', 'clay', 'Major_Moor_CeramicsStall'],
    ['Major_Basket', 'reed', 'Major_Moor_BasketStall'],
  ] as const)('M018 actually buys %s for two %s and one stone while preserving its passed-card follow-up', (target, resource, revealed) => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_ClayOven']
    session.loadState(session.state)
    const offered = playMoorAuditMinor(session, 'M018_RegisterOfCraftsmen')
    expect(offered.interaction.request.options.map((option) => option.value)).toEqual(expect.arrayContaining(['Major_Joinery', 'Major_Pottery', 'Major_Basket']))
    expect(offered.state.players[1]!.minorHand).toContain('M018_RegisterOfCraftsmen')
    const before = { ...offered.state.players[0]!.resources }
    const bought = session.resolveChoice(0, target)
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.players[0]!.resources).toEqual({ ...before, [resource]: before[resource] - 2, stone: before.stone - 1 })
    expect(bought.state.players[0]!.improvements).toContain(target)
    expect(bought.state.availableMajorImprovements).toContain(revealed)
    expect(bought.state.players[0]!.minorPlayed).not.toContain('M018_RegisterOfCraftsmen')
    expect(bought.state.players[1]!.minorHand).toContain('M018_RegisterOfCraftsmen')
    expect(workersAvailable(bought.state, bought.state.players[0]!)).toBe(1)
    advanceMoorAuditToRound(session, 6)
    const nextTarget = target === 'Major_Joinery' ? 'Major_Pottery' : 'Major_Joinery'
    const stone = session.state.players[0]!.resources.stone
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    const next = session.resolveChoice(0, nextTarget)
    expect(next.ok, next.error).toBe(true)
    expect(next.state.players[0]!.resources.stone).toBe(stone - 2)
  })

  it.each([1, 2, 4])('M030 exchanges exactly two of %i sheep and finishes placement with the card passed left', (sheep) => {
    for (const accept of [false, true]) {
      const session = setupMoorAudit()
      const player = session.state.players[0]!
      player.resources.sheep = sheep
      player.pastures = [
        { id: 'sheep', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], stables: 0, animalType: 'sheep', animalCount: sheep },
        { id: 'horse', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: null, animalCount: 0 },
      ]
      player.minorHand = ['M030_FarmAnimalMarket']
      session.loadState(session.state)
      let response = session.takeAction(0, 'major-improvement')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.request.options.some((option) => option.value === 'M030_FarmAnimalMarket')).toBe(true)
      response = session.resolveChoice(0, 'M030_FarmAnimalMarket')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.food).toBe(19)
      if (sheep >= 2) {
        expect(response.interaction.sourceCard).toBe('M030_FarmAnimalMarket')
        response = accept ? acceptMoorAuditChoice(session, response) : session.resolveChoice(0, '__skip__')
      }
      if (sheep >= 2 && accept) {
        expect(response.interaction.request.kind).toBe('animal-reorg')
        expect(response.state.players[0]!.resources).toMatchObject({ sheep: sheep - 2, cattle: 1, horse: 1 })
        expect(response.state.players[1]!.minorHand).toContain('M030_FarmAnimalMarket')
        const before = structuredClone(response.state.players[0])
        const rejected = session.resolveChoice(0, 'confirm', { zones: [
          { id: 'house', zoneType: 'house', animalType: 'cattle', animalCount: 2 },
        ] })
        expect(rejected.ok).toBe(false)
        expect(rejected.state.players[0]).toEqual(before)
        response = session.resolveChoice(0, 'confirm', { zones: [
          { id: 'house', zoneType: 'house', animalType: 'cattle', animalCount: 1 },
          { id: 'sheep', zoneType: 'pasture', animalType: sheep === 2 ? null : 'sheep', animalCount: sheep - 2 },
          { id: 'horse', zoneType: 'pasture', animalType: 'horse', animalCount: 1 },
        ] })
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ sheep: sheep - (accept && sheep >= 2 ? 2 : 0), cattle: accept && sheep >= 2 ? 1 : 0, horse: accept && sheep >= 2 ? 1 : 0 })
      expect(response.state.players[0]!.minorPlayed).not.toContain('M030_FarmAnimalMarket')
      expect(response.state.players[1]!.minorHand).toContain('M030_FarmAnimalMarket')
      expect(response.state.log.some((entry) => JSON.stringify(entry.params ?? {}).includes('M030_FarmAnimalMarket'))).toBe(true)
    }
  })

  it.each([
    ['Major_Moor_FurnitureStall', 'wood', 'clay'],
    ['Major_Moor_CeramicsStall', 'clay', 'wood'],
    ['Major_Moor_BasketStall', 'reed', 'wood'],
    ['Major_Moor_BasketStall', 'reed', 'clay'],
    ['Major_Moor_BasketStall', 'reed', 'stone'],
  ] as const)('%s exchanges %s for %s and caps the requested quantity at the available resource', (cardId, from, to) => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = [cardId]
    session.state.players[0]!.resources[from] = 1
    session.loadState(session.state)
    const offered = session.takeAnytimeAction(0, 'exchange')
    expect(offered.ok, offered.error).toBe(true)
    const option = offered.interaction.request.options.find((entry) => entry.sourceCard === cardId && entry.effectPreview?.resourcesGained?.[to] === 1)!
    expect(option).toBeDefined()
    const index = option.value.split(':')[1]!
    const before = structuredClone(offered.state.players)
    const rejected = session.resolveChoice(1, `bulk:${index}=2`)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players).toEqual(before)
    const traded = session.resolveChoice(0, `bulk:${index}=2`)
    expect(traded.ok, traded.error).toBe(true)
    expect(traded.state.players[0]!.resources).toEqual({ ...before[0]!.resources, [from]: 0, [to]: before[0]!.resources[to] + 1 })
    expect(traded.state.players[1]).toEqual(before[1])
  })

  it.each([
    ['Major_Moor_MuseumOfTheMoors', 'Major_Well', [1, 0, 0, 2]],
    ['Major_Moor_MuseumOfTheMoors', 'Major_Joinery', [1, 0, 0, 2]],
    ['Major_Moor_MuseumOfTheMoors', 'Major_Pottery', [0, 1, 0, 2]],
    ['Major_Moor_MuseumOfTheMoors', 'Major_Basket', [0, 0, 1, 2]],
    ['Major_Moor_MuseumOfTheMoors', 'Major_ClayOven', [0, 2, 0, 1]],
    ['Major_Moor_MuseumOfTheMoors', 'Major_StoneOven', [0, 1, 0, 2]],
    ['Major_Moor_MuseumOfTheMoors', 'Major_Moor_ForestersLodge', [1, 1, 0, 0]],
    ['Major_Moor_MuseumOfTheMoors', 'Major_Fireplace1', [0, 2, 0, 0]],
    ['M113_LivingHistoryMuseum', 'Major_Moor_HeatingOven', [0, 0, 0, 1]],
    ['M113_LivingHistoryMuseum', 'Major_Moor_TiledOven', [0, 2, 0, 0]],
    ['M113_LivingHistoryMuseum', 'Major_Moor_RidingStables', [1, 1, 1, 0]],
    ['M113_LivingHistoryMuseum', 'Major_Moor_VillageChurch', [2, 0, 0, 3]],
    ['M113_LivingHistoryMuseum', 'Major_Moor_FurnitureStall', [0, 0, 0, 1]],
    ['M113_LivingHistoryMuseum', 'Major_Moor_BasketStall', [0, 0, 0, 1]],
    ['M113_LivingHistoryMuseum', 'Major_Moor_CeramicsStall', [0, 0, 0, 1]],
    ['M113_LivingHistoryMuseum', 'Major_Well', [1, 0, 0, 3]],
  ] as const)('%s pays the printed discounted cost of %s through a real purchase', (museum, target, cost) => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = ['Major_Moor_MuseumOfTheMoors']
    session.state.players[1]!.improvements = ['Major_Moor_PeatCharcoalKiln']
    session.loadState(session.state)
    if (museum === 'M113_LivingHistoryMuseum') {
      session.state.players[0]!.houseType = 'clay'
      const upgraded = playMoorAuditMinor(session, museum)
      expect(upgraded.state.players[0]!.minorPlayed).toContain(museum)
      expect(upgraded.state.players[0]!.improvements).not.toContain('Major_Moor_MuseumOfTheMoors')
      expect(upgraded.state.availableMajorImprovements).toContain('Major_Moor_MuseumOfTheMoors')
      advanceMoorAuditToRound(session, 6)
    }
    moveMajorImprovementToSupplyTop(session.state, target)
    const before = { ...session.state.players[0]!.resources }
    let response = session.takeAction(0, 'major-improvement')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request.options.map((option) => option.value)).toContain(target)
    response = session.resolveChoice(0, target)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(target)
    expect(response.state.availableMajorImprovements).not.toContain(target)
    expect((['wood', 'clay', 'reed', 'stone'] as const).map((resource) =>
      before[resource] - response.state.players[0]!.resources[resource],
    )).toEqual(cost)
    expect(response.state.log.some((entry) => JSON.stringify(entry.params ?? {}).includes(target))).toBe(true)
  })

  it.each([
    ['Major_Moor_MuseumOfTheMoors', 'Major_Well', 'stone', 1],
    ['M113_LivingHistoryMuseum', 'Major_Moor_VillageChurch', 'stone', 2],
  ] as const)('%s cannot discount a second resource when buying %s', (museum, target, resource, amount) => {
    const session = setupMoorAudit()
    if (museum.startsWith('Major_')) session.state.players[0]!.improvements = [museum]
    else session.state.players[0]!.minorPlayed = [museum]
    session.state.players[0]!.resources[resource] = amount
    moveMajorImprovementToSupplyTop(session.state, target)
    const offered = session.takeAction(0, 'major-improvement')
    expect(offered.ok, offered.error).toBe(true)
    expect(offered.interaction.request.options.map((option) => option.value)).not.toContain(target)
    const before = structuredClone(offered.state.players)
    const rejected = session.resolveChoice(0, target)
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players).toEqual(before)
    expect(rejected.interaction.request.options).toEqual(offered.interaction.request.options)
  })

  it.each([[3, 2, 2], [3, 0, 1], [5, 2, 3]])('M108 publicly scores %i fuel and %i grain without reusing fuel for the Peat-charcoal Kiln', (fuel, grain, expected) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = ['M108_GrainDistillery']
    player.improvements = ['Major_Moor_PeatCharcoalKiln']
    player.resources.fuel = fuel!
    player.resources.grain = grain!
    session.loadState(session.state)
    const response = session.takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(expected)
    expect(response.state.players[0]!.resources).toMatchObject({ fuel, grain })
  })

  it.each(['Major_Moor_Cookhouse1', 'Major_Moor_Cookhouse2', 'Major_ClayOven'])(
    'M026 uses the printed baking rate of %s for its purchase reward', (oven) => {
      const session = setupMoorAudit()
      session.state.players[0]!.improvements = [oven]
      const response = playMoorAuditMinor(session, 'M026_ChimneyHood')
      expect(response.state.players[0]!.resources).toMatchObject({ clay: 19, food: oven === 'Major_ClayOven' ? 25 : 23 })
      expect(response.state.players[1]!.minorHand).toContain('M026_ChimneyHood')
    },
  )

  it.each([2, 3])('M069 rewards each cattle cooked through native anytime exchange only with at least three horses: %i', (horses) => {
    const session = setupMoorAudit()
    const player = session.state.players[0]!
    player.minorPlayed = ['M069_LeatherSaddle']
    player.improvements = ['Major_Fireplace1']
    player.resources.cattle = 1
    player.resources.horse = horses
    player.houseAnimalType = 'cattle'
    player.houseAnimalCount = 1
    player.pastures = [{ id: 'horses', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], stables: 0, animalType: 'horse', animalCount: horses }]
    session.loadState(session.state)
    const pending = session.takeAnytimeAction(0, 'exchange')
    expect(pending.ok, pending.error).toBe(true)
    const option = pending.interaction.request.options.find((entry) => entry.effectPreview?.kind === 'resourceExchange' && entry.effectPreview.resourcesPaid?.cattle === 1)!
    expect(option).toBeDefined()
    const response = session.resolveChoice(0, `bulk:${option.value.split(':')[1]}=1`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ cattle: 0, food: 23 })
    expect(response.state.players[0]!.cardStates.M069_LeatherSaddle?.counters?.bonusVp ?? 0).toBe(horses === 3 ? 1 : 0)
  })

  it.each([
    ['M081_PeatBoat', [['fuel', 3, 'wood', 2], ['fuel', 3, 'clay', 2], ['fuel', 4, 'reed', 2], ['fuel', 4, 'stone', 2], ['fuel', 2, 'sheep', 1], ['fuel', 3, 'food', 1]]],
    ['M105_OpenGrill', [['vegetable', 1, 'food', 2], ['sheep', 1, 'food', 2], ['boar', 1, 'food', 3], ['cattle', 1, 'food', 3], ['horse', 1, 'food', 2]]],
    ['M106_HorseButchery', [['sheep', 1, 'food', 1], ['boar', 1, 'food', 2], ['cattle', 1, 'food', 3], ['horse', 1, 'food', 2], ['horse', 2, 'food', 5]]],
    ['Major_Moor_HorseSlaughterhouse1', [['sheep', 1, 'food', 1], ['boar', 1, 'food', 1], ['cattle', 1, 'food', 2], ['horse', 1, 'food', 2]]],
    ['Major_Moor_HorseSlaughterhouse2', [['sheep', 1, 'food', 1], ['boar', 1, 'food', 1], ['cattle', 1, 'food', 2], ['horse', 1, 'food', 2]]],
    ['Major_Moor_Cookhouse1', [['sheep', 1, 'food', 2], ['boar', 1, 'food', 3], ['cattle', 1, 'food', 4], ['horse', 1, 'food', 2], ['vegetable', 1, 'food', 3]]],
    ['Major_Moor_Cookhouse2', [['sheep', 1, 'food', 2], ['boar', 1, 'food', 3], ['cattle', 1, 'food', 4], ['horse', 1, 'food', 2], ['vegetable', 1, 'food', 3]]],
  ] as const)('%s executes every printed anytime rate through the public exchange request', (cardId, rates) => {
    for (let index = 0; index < rates.length; index++) {
      const [from, paid, to, gained] = rates[index]!
      const session = setupMoorAudit()
      const player = session.state.players[0]!
      if (cardId.startsWith('Major_')) player.improvements = [cardId]
      else player.minorPlayed = [cardId]
      player.resources[from] = paid
      if (from === 'sheep' || from === 'boar' || from === 'cattle' || from === 'horse') {
        player.pastures = [{ id: 'animal', size: 1, tiles: [{ row: 0, col: 0 }], stables: 0, animalType: from, animalCount: paid }]
      }
      const before = { ...player.resources }
      session.loadState(session.state)
      const response = session.takeAnytimeAction(0, 'exchange')
      expect(response.ok, response.error).toBe(true)
      const option = response.interaction.request.options.find((option) => {
        const preview = option.effectPreview
        return option.sourceCard === cardId && preview?.kind === 'resourceExchange' &&
          (preview.resourcesPaid?.[from] ?? 0) > 0 &&
          (preview.resourcesGained?.[to] ?? 0) * paid === preview.resourcesPaid![from]! * gained
      })
      expect(option).toBeDefined()
      const choice = `bulk:${option!.value.split(':')[1]}=1`
      expect(session.resolveChoice(1, choice).ok).toBe(false)
      expect(session.state.players[0]!.resources).toEqual(before)
      let traded = session.resolveChoice(0, choice)
      expect(traded.ok, traded.error).toBe(true)
      expect(traded.state.players[0]!.resources[from]).toBe(0)
      expect(traded.state.players[0]!.resources[to]).toBe((before[to] ?? 0) + gained)
      if (to === 'sheep') {
        expect(traded.interaction.request.kind).toBe('animal-reorg')
        traded = session.resolveChoice(0, 'confirm', { zones: [
          { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
        ] })
        expect(traded.ok, traded.error).toBe(true)
      }
      expect(traded.state.events).toContainEqual(expect.objectContaining({ type: 'resource.exchanged', exchangeSource: cardId, paid: { [from]: paid }, gained: { [to]: gained } }))
      expect(traded.state.actionSpaces.every((space) => space.takenBy.length === 0)).toBe(true)
    }
  })

  it.each([['M105_OpenGrill', 2]] as const)(
    '%s converts grain only through a Bake Bread action for %i food each', (cardId, food) => {
      const session = setupMoorAudit(2, 14)
      const player = session.state.players[0]!
      if (cardId.startsWith('Major_')) player.improvements = [cardId]
      else player.minorPlayed = [cardId]
      player.resources.grain = 2
      session.loadState(session.state)
      const response = session.takeAction(0, 'grain-utilization')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.promptKey).toBe('ui.interactionBakeBreadCount')
      const baked = session.resolveChoice(0, `bulk:${cardId}=2`)
      expect(baked.ok, baked.error).toBe(true)
      expect(baked.state.players[0]!.resources).toMatchObject({ grain: 0, food: 20 + 2 * food })
      expect(baked.state.log).toContainEqual(expect.objectContaining({ key: 'log.bakeBread', params: expect.objectContaining({ count: 2, food: 2 * food }) }))
    },
  )

  it.each(['Major_Moor_Cookhouse1', 'Major_Moor_Cookhouse2'])(
    '%s bakes bread at its printed rate after its real purchase', (cardId) => {
      const session = setupMoorAudit(2, 14)
      moveMajorImprovementToSupplyTop(session.state, cardId)
      let response = session.takeAction(0, 'major-improvement')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.request.options.map((option) => option.value)).toContain(cardId)
      response = session.resolveChoice(0, cardId)
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.promptKey === 'prompt.selectPayment') {
        response = session.resolveChoice(0, response.interaction.request.options.find((option) => option.value !== 'cancel')!.value)
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.improvements).toContain(cardId)
      expect(response.state.players[0]!.resources.clay).toBe(14)
      if (response.interaction.request.kind === 'confirm-next-player') expect(session.resolveChoice(response.interaction.playerIndex, 'confirm').ok).toBe(true)
      session.state.currentPlayerIndex = 0
      session.state.players[0]!.resources.grain = 2
      setWorkersAtHome(session.state, session.state.players[0]!, 2)
      session.loadState(session.state)
      const offered = session.takeAction(0, 'grain-utilization')
      expect(offered.ok, offered.error).toBe(true)
      const before = structuredClone(offered.state.players[0])
      const rejected = session.resolveChoice(0, `bulk:${cardId}=3`)
      expect(rejected.ok).toBe(false)
      expect(rejected.state.players[0]).toEqual(before)
      const baked = session.resolveChoice(0, `bulk:${cardId}=2`)
      expect(baked.ok, baked.error).toBe(true)
      expect(baked.state.players[0]!.resources).toMatchObject({ grain: 0, food: 26 })
    },
  )

  it.each([
    ['M105_OpenGrill', 'Major_Fireplace1'],
    ['M106_HorseButchery', 'Major_Moor_HorseSlaughterhouse1'],
    ['M085_OvenInstallation', 'Major_Moor_HeatingOven'],
  ] as const)('%s returns its printed upgrade card %s during a real purchase', (cardId, returned) => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = [returned]
    const before = { ...session.state.players[0]!.resources }
    const response = playMoorAuditMinor(session, cardId)
    expect(response.state.players[0]!.minorPlayed).toContain(cardId)
    expect(response.state.players[0]!.improvements).not.toContain(returned)
    expect(response.state.players[0]!.resources).toEqual(before)
    expect(response.state.majorImprovementSupply!.some((stack) => stack.cardIds.includes(returned))).toBe(true)
  })

  it.each(['Major_Fireplace1', 'Major_CookingHearth1', 'Major_Moor_Cookhouse1'])(
    'M107 enables horse cooking with the named cookery family: %s', (cookery) => {
      const session = setupMoorAudit()
      const player = session.state.players[0]!
      player.minorPlayed = ['M107_PotRoastRecipe']
      player.improvements = [cookery]
      player.resources.horse = 1
      player.houseAnimalType = 'horse'
      player.houseAnimalCount = 1
      session.loadState(session.state)
      const response = session.takeAnytimeAction(0, 'exchange')
      expect(response.ok, response.error).toBe(true)
      const option = response.interaction.request.options.find((option) => option.sourceCard === 'M107_PotRoastRecipe')
      expect(option).toBeDefined()
      const traded = session.resolveChoice(0, `bulk:${option!.value.split(':')[1]}=1`)
      expect(traded.ok, traded.error).toBe(true)
      expect(traded.state.players[0]!.resources).toMatchObject({ horse: 0, food: 22 })
    },
  )

  it.each([2, 3])('M069 checks %i horses before cattle are cooked through harvest feeding', (horses) => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M069_LeatherSaddle']
    player.improvements = ['Major_Fireplace1']
    player.resources.cattle = 1
    player.resources.horse = horses
    player.houseAnimalType = 'cattle'
    player.houseAnimalCount = 1
    player.pastures = [{ id: 'horses', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], stables: 0, animalType: 'horse', animalCount: horses }]
    startMoorAuditFeeding(session)
    const response = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'Major_Fireplace1', exchangeIndex: 2, count: 1, sourceName: 'Fireplace' },
    ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.cattle).toBe(0)
    expect(response.state.players[0]!.cardStates.M069_LeatherSaddle?.counters?.bonusVp ?? 0).toBe(horses === 3 ? 1 : 0)
  })

  it('M108 rejects a second harvest conversion, then accepts one fuel-grain pair for five food', () => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M108_GrainDistillery']
    player.resources.grain = 2
    player.resources.food = 0
    const pending = startMoorAuditFeeding(session)
    const before = structuredClone(pending.state.players[0])
    const selection = { sourceId: 'M108_GrainDistillery', exchangeIndex: 0, count: 2, sourceName: 'Grain Distillery' }
    const rejected = session.resolveChoice(0, 'confirm', { selections: [selection] })
    expect(rejected.ok).toBe(false)
    expect(rejected.state.players[0]).toEqual(before)
    expect(rejected.interaction.request.kind).toBe('feed')
    const response = session.resolveChoice(0, 'confirm', { selections: [{ ...selection, count: 1 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 19, grain: 1, food: 1, begging: 0 })
  })
})
