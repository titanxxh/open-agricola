import { describe, expect, it } from 'vitest'
import { setupMoorAudit, playMoorAuditMinor, acceptMoorAuditChoice, advanceMoorAuditToRound } from './_helpers/moor-rules-audit'
import { moveMajorImprovementToSupplyTop } from '../../shared/cards/major/supply'
import { workersAvailable } from '../../shared/domain/player'

describe('Moor major purchase clause audit', () => {
  it.each([
    ['Major_Moor_PeatCharcoalKiln', 'cut-peat', 'moor', 'fuel', 3],
    ['Major_Moor_ForestersLodge', 'fell-trees', 'forest', 'wood', 2],
  ] as const)('%s adds one good without horses and two with a horse on its named special action', (cardId, action, kind, resource, base) => {
    for (const horses of [0, 1]) {
      const session = setupMoorAudit()
      const player = session.state.players[0]!
      player.improvements = [cardId]
      player.resources.horse = horses
      player.houseAnimalType = horses ? 'horse' : null
      player.houseAnimalCount = horses
      const tile = { row: 0, col: 2 }
      player.farmTerrain = [{ ...tile, kind }]
      session.loadState(session.state)
      const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes(action))!
      const response = session.takeSpecialAction(0, card.id, action, { tile })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[resource]).toBe(20 + base + 1 + horses)
      expect(response.state.players[1]!.resources[resource]).toBe(20)
    }
  })

  it.each([
    ['Major_Well', 'wood', 1], ['Major_Fireplace1', 'clay', 2], ['Major_Basket', 'reed', 2], ['Major_Moor_PeatCharcoalKiln', 'stone', 1],
  ] as const)('M093 replaces exactly one %s %s resource with fuel in a native purchase', (major, resource, required) => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M093_FarmhandsQuarters']
    session.state.players[0]!.resources[resource] = required - 1
    session.state.players[0]!.resources.fuel = 1
    session.loadState(session.state)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, major)
    if (response.interaction.promptKey === 'prompt.selectPayment') response = acceptMoorAuditChoice(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(major)
    expect(response.state.players[0]!.resources[resource]).toBe(0)
    expect(response.state.players[0]!.resources.fuel).toBe(0)
  })

  it.each([1, 2])('M093 awards the recipient only when a real passing minor comes from their right: owner %i', (owner) => {
    const session = setupMoorAudit(3)
    session.state.players[owner]!.minorPlayed = ['M093_FarmhandsQuarters']
    const response = playMoorAuditMinor(session, 'M024_BasicSupplies')
    expect(response.state.players[1]!.minorHand).toContain('M024_BasicSupplies')
    expect(response.state.players[owner]!.resources.food).toBe(owner === 1 ? 21 : 20)
  })

  it.each([
    ['Major_Moor_HorseSlaughterhouse1', [0, 1, 0, 1], 2],
    ['Major_Moor_HorseSlaughterhouse2', [0, 1, 0, 1], 2],
    ['Major_Moor_Cookhouse1', [0, 6, 0, 0], 2],
    ['Major_Moor_Cookhouse2', [0, 6, 0, 0], 2],
    ['Major_Moor_PeatCharcoalKiln', [0, 0, 0, 1], 1],
    ['Major_Moor_ForestersLodge', [1, 2, 0, 0], 1],
    ['Major_Moor_RidingStables', [2, 1, 1, 0], 3],
    ['Major_Moor_MuseumOfTheMoors', [0, 1, 1, 1], 3],
    ['Major_Moor_HeatingOven', [0, 1, 0, 1], 1],
    ['Major_Moor_TiledOven', [0, 2, 0, 1], 1],
    ['Major_Moor_VillageChurch', [2, 0, 0, 4], 4],
    ['Major_Moor_FurnitureStall', [1, 0, 0, 1], 2],
    ['Major_Moor_CeramicsStall', [0, 1, 0, 1], 2],
    ['Major_Moor_BasketStall', [0, 0, 1, 1], 2],
  ] as const)('%s pays its printed cost, leaves supply, and publishes its printed points', (cardId, cost, points) => {
    const session = setupMoorAudit(2, 14)
    moveMajorImprovementToSupplyTop(session.state, cardId)
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, cardId)
    if (response.interaction.promptKey === 'prompt.selectPayment') response = acceptMoorAuditChoice(session, response)
    expect(response.ok, response.error).toBe(true)
    expect((['wood', 'clay', 'reed', 'stone'] as const).map((resource) => 20 - response.state.players[0]!.resources[resource])).toEqual(cost)
    expect(response.state.players[0]!.resources.food).toBe(cardId === 'Major_Moor_VillageChurch' ? 22 : 20)
    expect(response.state.players[0]!.resources.fuel).toBe(cardId === 'Major_Moor_HeatingOven' ? 22 : 20)
    expect(response.state.players[0]!.improvements).toContain(cardId)
    expect(response.state.availableMajorImprovements).not.toContain(cardId)
    expect(response.scores![0]!.categories.find((category) => category.key === 'cards')?.entries).toContainEqual(expect.objectContaining({ cardId, score: points }))
    expect(response.state.log.some((entry) => JSON.stringify(entry.params ?? {}).includes(cardId))).toBe(true)
    expect(response.state.futureMeeples).toEqual([])
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
  })

  it.each(['Major_Moor_Cookhouse1', 'Major_Moor_Cookhouse2'])('%s upgrades each Fireplace or Hearth without paying clay', (cardId) => {
    for (const returned of ['Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2']) {
      const session = setupMoorAudit()
      session.state.players[0]!.improvements = [returned]
      session.state.players[0]!.resources.clay = 0
      session.loadState(session.state)
      moveMajorImprovementToSupplyTop(session.state, cardId)
      expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
      let response = session.resolveChoice(0, cardId)
      if (response.interaction.promptKey === 'prompt.selectPayment') response = acceptMoorAuditChoice(session, response)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.improvements).toEqual([cardId])
      expect(response.state.players[0]!.resources.clay).toBe(0)
      expect(response.state.availableMajorImprovements).toContain(returned)
    }
  })

  it.each([0, 1, 2])('Major_Moor_RidingStables checks %i horses at delivery of its actual purchase queue', (horses) => {
    const session = setupMoorAudit(2, 2)
    moveMajorImprovementToSupplyTop(session.state, 'Major_Moor_RidingStables')
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, 'Major_Moor_RidingStables')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'Major_Moor_RidingStables').map((entry) => entry.round)).toEqual(Array.from({ length: 12 }, (_, index) => index + 3))
    const player = session.state.players[0]!
    player.resources.horse = horses
    player.pastures = [{ id: 'horses', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0, animalType: horses ? 'horse' : null, animalCount: horses }]
    response = advanceMoorAuditToRound(session, 3)
    expect(response.state.players[0]!.resources.food).toBe(horses === 2 ? 21 : 20)
    expect(response.state.futureMeeples.some((entry) => entry.round === 3 && entry.cardId === 'Major_Moor_RidingStables')).toBe(false)
  })

  it.each([
    ['M062_HearthBrush', 'Major_Moor_TiledOven'],
    ['M063_PastoralLetter', 'Major_Moor_VillageChurch'],
  ] as const)('%s separately offers moving up its major and the later purchase', (cardId, major) => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    expect(session.state.availableMajorImprovements).not.toContain(major)
    session.state.players[0]!.minorHand = [cardId]
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, cardId)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.availableMajorImprovements).not.toContain(major)
    expect(response.interaction.sourceCard).toBe(cardId)
    const move = response.interaction.request.options.find((option) => option.value !== '__skip__')!
    expect(move).toBeDefined()
    response = session.resolveChoice(0, move.value)
    expect(response.state.availableMajorImprovements).toContain(major)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.state.players[0]!.resources.reed).toBe(cardId === 'M062_HearthBrush' ? 19 : 20)
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).not.toBe(cardId)
    response = advanceMoorAuditToRound(session, 6)
    const special = response.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('hiring-fair'))!
    response = session.takeSpecialAction(0, special.id, 'hiring-fair')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).not.toBe(cardId)
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
    expect(session.resolveChoice(1, 'confirm').ok).toBe(true)
    response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).toBe(cardId)
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).not.toContain(major)
    expect(response.state.availableMajorImprovements).toContain(major)
  })

  it.each([
    ['M062_HearthBrush', 'Major_Moor_TiledOven'],
    ['M063_PastoralLetter', 'Major_Moor_VillageChurch'],
  ] as const)('%s may decline moving up without losing later purchase eligibility', (cardId, major) => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    session.state.players[0]!.minorHand = [cardId]
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, cardId)
    expect(response.ok).toBe(true)
    expect(response.interaction.sourceCard).toBe(cardId)
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok).toBe(true)
    expect(response.state.availableMajorImprovements).not.toContain(major)
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.playedRound).toBe(5)
    advanceMoorAuditToRound(session, 6)
    moveMajorImprovementToSupplyTop(session.state, major)
    response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).toBe(cardId)
    const buy = response.interaction.request.options.find((option) => option.value !== '__skip__')!
    response = session.resolveChoice(0, buy.value)
    if (response.interaction.request.kind === 'choice' && response.interaction.request.options.some((option) => option.value === major)) {
      response = session.resolveChoice(0, major)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(major)
  })

  it.each([
    ['M062_HearthBrush', 'Major_Moor_TiledOven'],
    ['M063_PastoralLetter', 'Major_Moor_VillageChurch'],
    ['M063_PastoralLetter', 'M068_Church'],
  ] as const)('%s publicly scores one extra point for its owner of %s', (cardId, building) => {
    for (const owner of [0, 1]) {
      const session = setupMoorAudit()
      session.state.players[0]!.minorPlayed = [cardId]
      if (building.startsWith('Major_')) session.state.players[owner]!.improvements = [building]
      else session.state.players[owner]!.minorPlayed.push(building)
      session.loadState(session.state)
      const response = session.takeAction(0, 'day-laborer')
      expect(response.ok, response.error).toBe(true)
      expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(owner === 0 ? 1 : 0)
      expect(response.scores![1]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
    }
  })
})
