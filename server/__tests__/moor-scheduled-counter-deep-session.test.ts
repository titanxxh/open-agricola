import { describe, expect, it } from 'vitest'
import { setupMoorAudit, playMoorAuditMinor, advanceMoorAuditToRound } from './_helpers/moor-rules-audit'
import { markAllWorkersUsed, workersAvailable } from '../../shared/domain/player'

const HARVESTS = [4, 7, 9, 11, 13]

describe('Moor scheduled and counter clause audit', () => {
  it('M125 pays its cost and exhausts all three actual counters while preserving nonempty stocks', () => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    let response = playMoorAuditMinor(session, 'M125_HardwareStore')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 18, reed: 19 })
    expect(response.state.players[0]!.cardStates.M125_HardwareStore?.counters?.usage).toBe(3)
    for (let count = 0; count < 3; count++) {
      const player = session.state.players[0]!
      player.resources.wood = 0
      player.resources.clay = count
      player.resources.reed = 0
      player.resources.stone = 0
      response = session.takeAnytimeAction(0, 'M125-hardware-store-anytime')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: Math.max(1, count), reed: 1, stone: 1 })
      expect(response.state.players[0]!.cardStates.M125_HardwareStore?.counters?.usage).toBe(2 - count)
    }
    session.state.players[0]!.resources.wood = 0
    const before = JSON.stringify(session.state)
    response = session.takeAnytimeAction(0, 'M125-hardware-store-anytime')
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
  })

  it('M126 pays its cost and exhausts all four actual counters without offering stone or same-resource trades', () => {
    const session = setupMoorAudit()
    let response = playMoorAuditMinor(session, 'M126_CooperativeStore')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 18, clay: 19 })
    expect(response.state.players[0]!.cardStates.M126_CooperativeStore?.counters?.usage).toBe(4)
    for (let count = 0; count < 4; count++) {
      response = session.takeAnytimeAction(0, 'M126-cooperative-store-anytime')
      expect(response.ok, response.error).toBe(true)
      const options = response.interaction.request.options
      expect(options.some((option) => option.effectPreview?.resourcesGained?.stone)).toBe(false)
      expect(options.some((option) => (['wood', 'clay', 'reed'] as const).some((resource) => option.effectPreview?.resourcesPaid?.[resource] && option.effectPreview?.resourcesGained?.[resource]))).toBe(false)
      const choice = options.find((option) => option.effectPreview?.resourcesPaid?.stone === 1 && option.effectPreview.resourcesGained?.wood === 1)!
      expect(choice).toBeDefined()
      response = session.resolveChoice(0, choice.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 19 + count, stone: 19 - count })
      expect(response.state.players[0]!.cardStates.M126_CooperativeStore?.counters?.usage).toBe(3 - count)
    }
    expect(session.takeAnytimeAction(0, 'M126-cooperative-store-anytime').ok).toBe(false)
  })

  it('M057 restores its no-worker extra turn at the next native round boundary', () => {
    const session = setupMoorAudit()
    session.state.players[0]!.minorPlayed = ['M057_Taps']
    for (const round of [5, 6]) {
      if (round === 6) {
        const advanced = advanceMoorAuditToRound(session, round)
        expect(advanced.state.players[0]!.cardStates.M057_Taps?.extraData?.usedThisRound).toBe(false)
      }
      session.state.currentPlayerIndex = 1
      markAllWorkersUsed(session.state, session.state.players[0]!)
      session.loadState(session.state)
      expect(session.takeAction(1, 'day-laborer').ok).toBe(true)
      let response = session.resolveChoice(1, 'confirm')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.sourceCard).toBe('M057_Taps')
      const choice = response.interaction.request.options.find((option) => option.labelKey === 'moor.specialActions.hiring-fair')!
      expect(choice).toBeDefined()
      const food = response.state.players[0]!.resources.food
      response = session.resolveChoice(0, choice.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.food).toBe(food + 1)
      expect(response.state.players[0]!.cardStates.M057_Taps?.extraData?.usedThisRound).toBe(true)
      expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
      response = session.resolveChoice(0, 'confirm')
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.sourceCard).not.toBe('M057_Taps')
    }
  })

  it.each([11, 13, 14])('M131 excludes offers after round fourteen when bought in round %i', (round) => {
    const session = setupMoorAudit(2, round)
    session.state.players[0]!.minorHand = ['M131_CattleStall']
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, 'M131_CattleStall')
    expect(response.ok, response.error).toBe(true)
    if (round === 11) response = session.resolveChoice(0, 'animals:sheep,boar,cattle,horse')
    expect(response.ok, response.error).toBe(true)
    const offers = response.state.players[0]!.cardStates.M131_CattleStall?.extraData?.scheduledOffers ?? []
    expect(offers).toEqual(round === 11 ? [expect.objectContaining({ dueRound: 13, animal: 'sheep' })] : [])
    expect(response.interaction.sourceCard).not.toBe('M131_CattleStall')
  })

  it('M056 executes both actual scheduled Cut Peat offers and discards their fuel markers', () => {
    const session = setupMoorAudit(2, 1)
    const player = session.state.players[0]!
    player.resources.horse = 1
    player.houseAnimalType = 'horse'
    player.houseAnimalCount = 1
    player.farmTerrain = [{ row: 0, col: 2, kind: 'moor' }, { row: 0, col: 3, kind: 'moor' }]
    playMoorAuditMinor(session, 'M056_PeatCuttingRights')
    for (const [index, round] of [5, 8].entries()) {
      const fuel = session.state.players[0]!.resources.fuel!
      let response = advanceMoorAuditToRound(session, round)
      expect(response.interaction.sourceCard).toBe('M056_PeatCuttingRights')
      const option = response.interaction.request.options.find((entry) => entry.value.endsWith(`:cut-peat:0:${index + 2}`))!
      expect(option).toBeDefined()
      const card = response.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('cut-peat'))!
      response = session.resolveChoice(0, option.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.fuel).toBe(fuel - 2 + 3)
      expect(response.state.players[0]!.farmTerrain).toHaveLength(1 - index)
      expect(response.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.id === card.id)!.location).toEqual({ kind: 'playerFaceUp', playerId: player.id })
      expect(response.state.players[0]!.cardStates.M056_PeatCuttingRights?.extraData?.scheduledOffers).toContainEqual(expect.objectContaining({ dueRound: round, consumed: true, consumedRound: round }))
    }
  })

  it('M131 buys every actually scheduled animal and completes all four placements', () => {
    const session = setupMoorAudit(2, 1)
    session.state.players[0]!.minorHand = ['M131_CattleStall']
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    let response = session.resolveChoice(0, 'M131_CattleStall')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 18, clay: 18 })
    response = session.resolveChoice(0, 'animals:sheep,boar,cattle,horse')
    expect(response.ok, response.error).toBe(true)
    const animals = ['sheep', 'boar', 'cattle', 'horse'] as const
    for (const [index, animal] of animals.entries()) {
      session.state.players.forEach((player) => { player.resources.food = 20; player.resources.fuel = 20 })
      const round = 3 + index * 2
      response = advanceMoorAuditToRound(session, round)
      expect(response.interaction.sourceCard).toBe('M131_CattleStall')
      expect(response.interaction.request.options.map((entry) => entry.value)).toEqual([`buy:${animal}`, '__skip__'])
      const before = JSON.stringify(response.state)
      response = session.resolveChoice(0, `buy:${animals[(index + 1) % 4]}`)
      expect(response.ok).toBe(false)
      expect(JSON.stringify(response.state)).toBe(before)
      const food = response.state.players[0]!.resources.food
      response = session.resolveChoice(0, `buy:${animal}`)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.food).toBe(food - 1)
      expect(response.interaction.request.kind).toBe('animal-reorg')
      response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house', zoneType: 'house', animalType: animal, animalCount: 1 }] })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.houseAnimalType).toBe(animal)
      expect(response.state.players[0]!.resources[animal]).toBe(1)
      expect(response.state.players[0]!.cardStates.M131_CattleStall?.extraData?.scheduledOffers).toContainEqual(expect.objectContaining({ animal, dueRound: round, consumed: true }))
    }
  })

  it.each([
    ['M075_FuelStorage', [[2, 'wood'], [4, 'fuel'], [6, 'wood'], [8, 'fuel'], [10, 'wood'], [12, 'fuel']]],
    ['M076_Flatboat', [[2, 'fuel'], [3, 'horse'], [4, 'fuel'], [5, 'horse'], [6, 'fuel'], [7, 'horse'], [8, 'fuel']]],
    ['M078_Barge', [[2, 'fuel'], [3, 'food'], [4, 'fuel'], [5, 'food'], [6, 'fuel'], [7, 'food'], [8, 'fuel'], [9, 'food'], [10, 'fuel'], [11, 'food'], [12, 'fuel'], [13, 'food'], [14, 'fuel']]],
  ] as const)('%s actually delivers its complete early-purchase schedule in order', (cardId, entries) => {
    const session = setupMoorAudit(2, 1)
    session.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    let response = playMoorAuditMinor(session, cardId)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === cardId).map((entry) => [entry.round, Object.keys(entry.resources)[0]])).toEqual(entries)
    for (const [round, resource] of entries) {
      session.state.players.forEach((player) => { player.resources.food = 20; player.resources.fuel = 20 })
      const previous = session.state.players[0]!.resources[resource]!
      response = advanceMoorAuditToRound(session, round)
      const harvestUse = HARVESTS.includes(round - 1) ? resource === 'fuel' ? 2 : resource === 'food' ? 4 : 0 : 0
      expect(response.state.players[0]!.resources[resource]).toBe(previous - harvestUse + 1)
      expect(response.state.futureMeeples.some((entry) => entry.cardId === cardId && entry.round === round)).toBe(false)
      if (resource === 'horse') {
        expect(response.interaction.request.kind).toBe('animal-reorg')
        response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 1 }] })
        expect(response.ok, response.error).toBe(true)
        expect(response.state.players[0]!.resources.horse).toBe(1)
      }
    }
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === cardId)).toEqual([])
  })

  it('M090 buys three counters, tops each missing stock up to two, and rejects a fourth activation', () => {
    const session = setupMoorAudit()
    let response = playMoorAuditMinor(session, 'M090_WinterStorehouse')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 19, clay: 18 })
    expect(response.state.players[0]!.cardStates.M090_WinterStorehouse?.counters?.usage).toBe(3)
    for (const [index, [food, fuel]] of [[0, 0], [1, 3], [3, 1]].entries()) {
      session.state.players[0]!.resources.food = food!
      session.state.players[0]!.resources.fuel = fuel!
      response = session.takeAnytimeAction(0, 'M090-winter-storehouse-anytime')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources).toMatchObject({ food: Math.max(2, food!), fuel: Math.max(2, fuel!) })
      expect(response.state.players[0]!.cardStates.M090_WinterStorehouse?.counters?.usage).toBe(2 - index)
    }
    session.state.players[0]!.resources.food = 0
    const before = JSON.stringify(session.state)
    response = session.takeAnytimeAction(0, 'M090-winter-storehouse-anytime')
    expect(response.ok).toBe(false)
    expect(JSON.stringify(response.state)).toBe(before)
  })
})
