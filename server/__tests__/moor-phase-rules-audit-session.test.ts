import { describe, expect, it } from 'vitest'
import { setupMoorAudit, playMoorAuditMinor, advanceMoorAuditToRound, startMoorAuditFeeding, acceptMoorAuditChoice } from './_helpers/moor-rules-audit'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'

describe('Moor delayed and harvest printed-rule audit', () => {
  it.each([0, 9])('M102 draws once with %i clay and passes left even when no food is earned', (clay) => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M102_SavingsDeposit']
    player.resources.clay = clay
    player.resources.food = 0
    player.resources.grain = 1
    for (const entry of session.state.players) markAllWorkersUsed(session.state, entry)
    session.loadState(session.state)
    const beforeTick = session.state.rngTick ?? 0
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.rngTick).toBe(beforeTick + 1)
    expect(response.state.events.filter((event) => event.type === 'resource.moved' && event.sourceCardId === 'M102_SavingsDeposit'))
      .toEqual(clay === 0 ? [] : [expect.objectContaining({ actorPlayerId: 'p1', resources: { food: 6 } })])
    expect(response.state.players[0]!.minorPlayed).not.toContain('M102_SavingsDeposit')
    expect(response.state.players[1]!.minorHand).toContain('M102_SavingsDeposit')
    expect(response.state.players[0]!.cardStates.M102_SavingsDeposit).toBeUndefined()
    expect(response.privateEvents).toContainEqual(expect.objectContaining({ type: 'private.handChanged', recipientPlayerId: 'p2', cardIds: ['M102_SavingsDeposit'] }))
    const rejected = session.takeAction(0, 'forest')
    expect(rejected.ok).toBe(false)
    expect(rejected.state.rngTick).toBe(beforeTick + 1)
    expect(rejected.state.players).toEqual(response.state.players)
  })

  it.each(['accept', 'decline'])('M048 delivers its actually scheduled forest four rounds after Cut Peat: %s', (mode) => {
    const session = setupMoorAudit(2, 5)
    session.state.players[0]!.minorPlayed = ['M048_ForestSwamp']
    session.state.players[0]!.farmTerrain = [{ row: 2, col: 3, kind: 'moor' }]
    const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('cut-peat'))!
    let response = session.takeSpecialAction(0, card.id, 'cut-peat', { tile: { row: 2, col: 3 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toEqual([])
    expect(response.state.futureMeeples).toEqual([expect.objectContaining({ cardId: 'M048_ForestSwamp', round: 9, resources: { forest: 1 } })])
    response = advanceMoorAuditToRound(session, 9)
    expect(response.interaction.sourceCard).toBe('M048_ForestSwamp')
    if (mode === 'decline') response = session.resolveChoice(0, '__skip__')
    else {
      response = acceptMoorAuditChoice(session, response)
      expect(response.interaction.request.selection?.kind).toBe('farm-position')
      const before = structuredClone(response.state.players[0])
      const rejected = session.commitSelectionChoice(0, { positions: [response.state.players[0]!.roomTiles[0]!] })
      expect(rejected.ok).toBe(false)
      expect(rejected.state.players[0]).toEqual(before)
      response = session.commitSelectionChoice(0, { positions: [{ row: 2, col: 3 }] })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toEqual(mode === 'accept' ? [{ row: 2, col: 3, kind: 'forest' }] : [])
    expect(response.state.futureMeeples.some((entry) => entry.cardId === 'M048_ForestSwamp')).toBe(false)
    const delivered = structuredClone(response.state.players[0]!.farmTerrain)
    response = advanceMoorAuditToRound(session, 10)
    expect(response.state.players[0]!.farmTerrain).toEqual(delivered)
    expect(response.interaction.sourceCard).not.toBe('M048_ForestSwamp')
  })

  it('M084 lying horses score one half each, cannot form a breeding pair, and remain cookable during feeding', () => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M084_BogPony']
    player.improvements = ['Major_Moor_HorseSlaughterhouse1']
    player.resources.horse = 2
    player.pastures = [{ id: 'horses', size: 2, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }], stables: 0, animalType: 'horse', animalCount: 2 }]
    session.loadState(session.state)
    const lying = session.takeAnytimeAction(0, 'M084-bog-pony-anytime')
    expect(lying.ok, lying.error).toBe(true)
    expect(lying.state.players[0]!.resources).toMatchObject({ horse: 2, fuel: 22 })
    expect(lying.scores![0]!.categories.find((category) => category.key === 'horses')?.total).toBe(1.5)
    const feeding = startMoorAuditFeeding(session)
    expect(feeding.state.players[0]!.resources.horse).toBe(2)
    const cooked = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'Major_Moor_HorseSlaughterhouse1', exchangeIndex: 3, count: 2, sourceName: 'Horse Slaughterhouse' },
    ] })
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[0]!.resources).toMatchObject({ horse: 0, food: 20 })
    expect(cooked.state.players[0]!.cardStates.M084_BogPony?.extraData?.lyingHorseCount ?? 0).toBe(0)
    expect(cooked.scores![0]!.categories.find((category) => category.key === 'horses')?.total).toBe(-1)
  })

  it('M077 delivers the fuel queued by a real Cut Peat action three rounds later', () => {
    const session = setupMoorAudit(2, 8)
    session.state.players[0]!.minorPlayed = ['M077_DryingField']
    session.state.players[0]!.farmTerrain = [{ row: 0, col: 0, kind: 'moor' }]
    const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('cut-peat'))!
    const cut = session.takeSpecialAction(0, card.id, 'cut-peat', { tile: { row: 0, col: 0 } })
    expect(cut.ok, cut.error).toBe(true)
    expect(cut.state.players[0]!.resources.fuel).toBe(23)
    expect(cut.state.futureMeeples).toContainEqual(expect.objectContaining({ cardId: 'M077_DryingField', round: 11, resources: { fuel: 2 } }))
    const delivered = advanceMoorAuditToRound(session, 11)
    expect(delivered.state.players[0]!.resources.fuel).toBe(25)
    expect(delivered.state.futureMeeples.some((entry) => entry.cardId === 'M077_DryingField')).toBe(false)
  })

  it.each([0, 1, 3])('M094 queues and delivers food for %i visible moors after Infirmary, excluding covered moors', (moors) => {
    const session = setupMoorAudit(2, 5)
    session.state.players[0]!.minorPlayed = ['M094_PeatBath']
    session.state.players[0]!.farmTerrain = [
      ...Array.from({ length: moors }, (_, col) => ({ row: 0, col, kind: 'moor' as const })),
      { row: 2, col: 4, kind: 'forest', covered: 'moor' },
    ]
    const action = session.takeAction(0, 'moor-infirmary')
    expect(action.ok, action.error).toBe(true)
    expect(action.state.futureMeeples.filter((entry) => entry.cardId === 'M094_PeatBath').map((entry) => entry.round)).toEqual(Array.from({ length: moors }, (_, index) => 6 + index))
    const before = action.state.players[0]!.resources.food
    const delivered = advanceMoorAuditToRound(session, 6)
    expect(delivered.state.players[0]!.resources.food).toBe(before + (moors ? 1 : 0))
    expect(delivered.state.futureMeeples.some((entry) => entry.cardId === 'M094_PeatBath' && entry.round === 6)).toBe(false)
  })

  it.each(['Major_Moor_MuseumOfTheMoors', 'M113_LivingHistoryMuseum', 'Major_Well'])(
    'M071 awards its shared public score only to the owner of a named museum: %s', (museum) => {
      const session = setupMoorAudit()
      session.state.players[0]!.farmTerrain = [{ row: 0, col: 0, kind: 'moor' }]
      if (museum.startsWith('Major_')) session.state.players[1]!.improvements = [museum]
      else session.state.players[1]!.minorPlayed = [museum]
      const response = playMoorAuditMinor(session, 'M071_BogBody')
      expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(0)
      expect(response.scores![1]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(museum === 'Major_Well' ? 0 : 1)
    },
  )

  it.each([2, 6])('M073 scores the post-payment complete animal sets, capped at three, with %i players', (playerCount) => {
    for (const sets of [0, 1, 2, 3, 4]) {
      const session = setupMoorAudit(playerCount)
      const player = session.state.players[0]!
      player.pastures = (['sheep', 'boar', 'cattle', 'horse'] as const).map((animalType, index) => ({
        id: animalType, size: 2, tiles: [{ row: 0, col: index + 1 }, { row: 1, col: index + 1 }],
        stables: index === 0 ? 1 : 0, animalType, animalCount: sets + (index === 0 ? 1 : 0),
      }))
      player.stableTiles = [{ row: 0, col: 1 }]
      for (const pasture of player.pastures) player.resources[pasture.animalType!] = pasture.animalCount
      const occupied = [...player.roomTiles, ...player.pastures.flatMap((pasture) => pasture.tiles)]
      player.farmTerrain = getAllTilePositions().filter((tile) => !occupied.some((entry) => entry.row === tile.row && entry.col === tile.col)).map((tile) => ({ ...tile, kind: 'forest' }))
      const response = playMoorAuditMinor(session, 'M073_StockBreedingPrize')
      expect(response.state.players[0]!.resources.sheep).toBe(sets)
      expect(response.scores![0]!.categories.find((category) => category.key === 'cardBonusVp')?.total ?? 0).toBe(Math.min(sets, 3) * (playerCount - 1))
    }
  })

  it.each([
    ['M032_PeatHut', 3],
    ['M085_OvenInstallation', 0],
    ['Major_Moor_HeatingOven', 1],
    ['Major_Moor_TiledOven', 1],
  ] as const)('%s applies its heating rule in a real harvest: %i fuel for two wooden rooms', (cardId, required) => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    if (cardId.startsWith('Major_')) player.improvements = [cardId]
    else player.minorPlayed = [cardId]
    for (const entry of session.state.players) markAllWorkersUsed(session.state, entry)
    session.loadState(session.state)
    let response = session.performRoundEnd()
    for (let step = 0; step < 8 && response.interaction.request.kind === 'choice'; step++) {
      expect(response.interaction.request.options.map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    expect(response.ok, response.error).toBe(true)
    if (required > 0) {
      expect(response.interaction.playerIndex).toBe(0)
      expect(response.interaction.request).toMatchObject({ kind: 'heating', required })
      response = session.resolveChoice(0, 'confirm', { fuelUsed: required, woodToFuel: 0 })
    } else {
      expect(response.interaction.playerIndex).toBe(1)
      expect(response.interaction.request.kind).toBe('heating')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(20 - required)
    expect(response.state.players[0]!.sickWorkerIds ?? []).toEqual([])
  })

  it.each([0, 1])('M082 buys fuel and discounts native heating only when %i wood is converted', (woodToFuel) => {
    const session = setupMoorAudit(2, 4)
    session.state.players[0]!.improvements = ['Major_Well']
    let response = playMoorAuditMinor(session, 'M082_Firewood')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 19, fuel: 21 })
    if (response.interaction.request.kind === 'confirm-next-player') expect(session.resolveChoice(response.interaction.playerIndex, 'confirm').ok).toBe(true)
    for (const entry of session.state.players) markAllWorkersUsed(session.state, entry)
    session.loadState(session.state)
    response = session.performRoundEnd()
    for (let step = 0; step < 8 && response.interaction.request.kind === 'choice'; step++) {
      expect(response.interaction.request.options.map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.request).toMatchObject({ kind: 'heating', required: 2 })
    response = session.resolveChoice(0, 'confirm', { fuelUsed: 2 - woodToFuel, woodToFuel })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 19 - woodToFuel, fuel: 19 + woodToFuel * 2 })
    expect(response.state.players[0]!.sickWorkerIds ?? []).toEqual([])
  })

  it.each([
    ['M068_Church', 3],
    ['Major_Moor_VillageChurch', 4],
  ] as const)('%s exchanges one fuel for one point once in its printed phase', (cardId, round) => {
    for (const accept of [false, true]) {
      const session = setupMoorAudit(2, round)
      const player = session.state.players[0]!
      if (cardId.startsWith('Major_')) player.improvements = [cardId]
      else player.minorPlayed = [cardId]
      for (const entry of session.state.players) markAllWorkersUsed(session.state, entry)
      session.loadState(session.state)
      let response = session.performRoundEnd()
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.sourceCard).toBe(cardId)
      expect(response.interaction.request.options.map((option) => option.value)).toContain('__skip__')
      response = accept ? acceptMoorAuditChoice(session, response) : session.resolveChoice(0, '__skip__')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.fuel).toBe(accept ? 19 : 20)
      expect(response.state.players[0]!.cardStates[cardId]?.counters?.bonusVp ?? 0).toBe(accept ? 1 : 0)
      expect(response.interaction.sourceCard).not.toBe(cardId)
    }
  })

  it.each([13, 14])('M074 offers its capped food-to-point exchange only in round 14: round %i', (round) => {
    const session = setupMoorAudit(2, round)
    const player = session.state.players[0]!
    player.minorPlayed = ['M074_Administration']
    player.improvements = ['Major_Well', 'Major_Moor_HeatingOven']
    for (const entry of session.state.players) markAllWorkersUsed(session.state, entry)
    session.loadState(session.state)
    let response = session.performRoundEnd()
    for (let step = 0; step < 8 && response.interaction.request.kind === 'choice' && response.interaction.sourceCard !== 'M074_Administration'; step++) {
      expect(response.interaction.request.options.map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    }
    expect(response.ok, response.error).toBe(true)
    if (round === 14) {
      expect(response.interaction.sourceCard).toBe('M074_Administration')
      const options = response.interaction.request.options.filter((option) => option.value !== '__skip__')
      expect(options).toHaveLength(2)
      response = session.resolveChoice(0, options[1]!.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.cardStates.M074_Administration?.counters?.bonusVp).toBe(2)
      expect(response.state.players[0]!.resources.food).toBe(14)
    } else {
      expect(response.interaction.sourceCard).not.toBe('M074_Administration')
      expect(response.state.players[0]!.cardStates.M074_Administration?.counters?.bonusVp ?? 0).toBe(0)
      expect(response.state.players[0]!.resources.food).toBe(16)
    }
  })

  it.each([
    ['M075_FuelStorage', [[11, { wood: 1 }], [13, { fuel: 1 }]], 'wood'],
    ['M076_Flatboat', [[11, { fuel: 1 }], [12, { horse: 1 }], [13, { fuel: 1 }], [14, { horse: 1 }]], 'fuel'],
    ['M078_Barge', [[11, { fuel: 1 }], [12, { food: 1 }], [13, { fuel: 1 }], [14, { food: 1 }]], 'fuel'],
  ] as const)('%s buys, queues only rounds through 14, and receives its first scheduled good once', (cardId, expected, resource) => {
    const session = setupMoorAudit(2, 10)
    session.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    const bought = playMoorAuditMinor(session, cardId)
    expect(bought.state.futureMeeples.filter((entry) => entry.cardId === cardId).map((entry) => [entry.round, entry.resources])).toEqual(expected)
    const before = bought.state.players[0]!.resources[resource]!
    const advanced = advanceMoorAuditToRound(session, 11)
    expect(advanced.state.players[0]!.resources[resource]).toBe(before + 1)
    expect(advanced.state.futureMeeples.some((entry) => entry.cardId === cardId && entry.round === 11)).toBe(false)
    expect(advanced.state.log.some((entry) => JSON.stringify(entry.params ?? {}).includes(cardId))).toBe(true)
    const late = setupMoorAudit(2, 14)
    late.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    expect(playMoorAuditMinor(late, cardId).state.futureMeeples.some((entry) => entry.cardId === cardId)).toBe(false)
  })

  it('M076 delivers its second scheduled good as a horse through native animal placement', () => {
    const session = setupMoorAudit(2, 8)
    playMoorAuditMinor(session, 'M076_Flatboat')
    const response = advanceMoorAuditToRound(session, 10)
    expect(response.state.players[0]!.resources.horse).toBe(1)
    expect(response.interaction.request.kind).toBe('animal-reorg')
    const placed = session.resolveChoice(0, 'confirm', { zones: [
      { id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 1 },
    ] })
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.players[0]!.houseAnimalType).toBe('horse')
    expect(placed.state.players[0]!.houseAnimalCount).toBe(1)
  })

  it.each([[0, 7, 3], [1, 9, 4], [2, 12, 5]])('M079 choice %i delivers %i round fuel and excludes the round-15 option', (index, round, fuel) => {
    const session = setupMoorAudit()
    let response = playMoorAuditMinor(session, 'M079_PeatSled')
    expect(response.interaction.request.options).toHaveLength(3)
    const option = response.interaction.request.options[index!]!
    response = session.resolveChoice(0, option.value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'M079_PeatSled')).toEqual([
      expect.objectContaining({ round, resources: { fuel } }),
    ])
    const before = response.state.players[0]!.resources.fuel!
    response = advanceMoorAuditToRound(session, round!)
    const heating = [4, 7, 9, 11, 13, 14].includes(round! - 1) ? 2 : 0
    expect(response.state.players[0]!.resources.fuel).toBe(before - heating + fuel!)
    expect(response.state.futureMeeples.some((entry) => entry.cardId === 'M079_PeatSled')).toBe(false)
  })

  it.each([1, 2, 3, 4, 6])('M086 snapshots %i sheep before feeding and keeps the heating reduction after cooking them', (sheep) => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M086_SpinningMill']
    player.improvements = ['Major_Fireplace1']
    player.resources.sheep = sheep
    player.pastures = [{ id: 'sheep', size: 3, tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }], stables: 0, animalType: 'sheep', animalCount: sheep }]
    let response = startMoorAuditFeeding(session)
    expect(response.state.players[0]!.cardStates.M086_SpinningMill?.extraData?.heatingRoomDiscount).toBe(Math.floor(sheep / 2))
    response = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: 'Major_Fireplace1', exchangeIndex: 0, count: sheep, sourceName: 'Fireplace' },
    ] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    const required = Math.max(0, 2 - Math.floor(sheep / 2))
    if (required > 0) {
      expect(response.interaction.playerIndex).toBe(0)
      expect(response.interaction.request).toMatchObject({ kind: 'heating', required })
      response = session.resolveChoice(0, 'confirm', { fuelUsed: required, woodToFuel: 0 })
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(20 - required)
    expect(response.state.players[0]!.sickWorkerIds ?? []).toEqual([])
  })

  it.each([0, 1, 2, 3])('M088 counts %i visible moors at harvest start and excludes covered moors', (count) => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M088_PeatIron']
    player.farmTerrain = [
      ...Array.from({ length: count }, (_, col) => ({ row: 0, col, kind: 'moor' as const })),
      { row: 2, col: 4, kind: 'forest', covered: 'moor' },
    ]
    for (const entry of session.state.players) markAllWorkersUsed(session.state, entry)
    session.loadState(session.state)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.fuel).toBe(count >= 2 ? 21 : 20)
    expect(response.interaction.stateId).toBe('wait')
  })

  it.each([11, 12, 13, 14])('M128 gives its printed goods only in the final two field phases: round %i', (round) => {
    const session = setupMoorAudit(2, round)
    session.state.players[0]!.minorPlayed = ['M128_Workbench']
    for (const entry of session.state.players) markAllWorkersUsed(session.state, entry)
    session.loadState(session.state)
    const response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject(round >= 13 ? { wood: 23, clay: 22, reed: 21 } : { wood: 20, clay: 20, reed: 20 })
  })

  it.each([0, 9])('M104 rolls once at harvest with %i visible forests and preserves the observation on repeated commands', (forests) => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M104_WildHarvest']
    player.resources.food = 0
    player.resources.grain = 1
    player.farmTerrain = getAllTilePositions().filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col)).slice(0, forests).map((tile) => ({ ...tile, kind: 'forest' }))
    const beforeTick = session.state.rngTick ?? 0
    const response = startMoorAuditFeeding(session)
    expect(response.interaction.request.remaining).toBe(forests === 9 ? 3 : 4)
    expect(response.interaction.request.foodUsed).toBe(forests === 9 ? 1 : 0)
    expect(response.state.rngTick).toBe(beforeTick + 1)
    const pick = response.state.players[0]!.cardStates.M104_WildHarvest?.extraData?.['harvest-4']
    expect(pick).toMatch(/^moor-start-[1-9]$/)
    const rejected = session.performRoundEnd()
    expect(rejected.ok).toBe(false)
    expect(rejected.state.rngTick).toBe(beforeTick + 1)
    expect(rejected.state.players[0]!.cardStates.M104_WildHarvest?.extraData?.['harvest-4']).toBe(pick)
  })

  it('M111 harvests its non-field crops once and removes the exhausted crop space', () => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M111_NoTillFarming']
    player.resources.food = 0
    player.farmyardSpaceStates = [
      { spaceKey: '0-0', sourceCardId: 'M111_NoTillFarming', kind: 'non-field-crop-space', crop: { kind: 'grain', remaining: 2 } },
      { spaceKey: '0-1', sourceCardId: 'M111_NoTillFarming', kind: 'non-field-crop-space', crop: { kind: 'vegetable', remaining: 1 } },
    ]
    const response = startMoorAuditFeeding(session)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.players[0]!.farmyardSpaceStates).toEqual([
      { spaceKey: '0-0', sourceCardId: 'M111_NoTillFarming', kind: 'non-field-crop-space', crop: { kind: 'grain', remaining: 1 } },
    ])
    expect(session.performRoundEnd().ok).toBe(false)
    expect(session.state.players[0]!.resources).toMatchObject({ grain: 1, vegetable: 1 })
  })

  it.each([0, 1])('M091 currently cannot decline Joinery conversion with %i wood to choose the Routine Work reward', (wood) => {
    const session = setupMoorAudit(2, 4)
    const player = session.state.players[0]!
    player.minorPlayed = ['M091_RoutineWork']
    player.resources.food = 0
    player.improvements = ['Major_Joinery']
    player.resources.wood = wood
    player.resources.grain = 1
    let response = startMoorAuditFeeding(session)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.interaction.request.foodUsed).toBe(wood * 2)
    expect(response.interaction.request.remaining).toBe(4 - wood * 2)
    expect(response.state.players[0]!.cardStates.M091_RoutineWork?.extraData?.usedCraftBuildingIds).toEqual(wood ? ['Major_Joinery'] : [])
    let offers = 0
    for (let step = 0; step < 30 && response.state.round === 4; step++) {
      expect(response.ok, response.error).toBe(true)
      const request = response.interaction.request
      if (request.kind === 'feed') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else if (request.kind === 'heating') response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
      else if (request.kind === 'choice' && response.interaction.sourceCard === 'M091_RoutineWork') {
        offers++
        const option = request.options.find((entry) => entry.effectPreview?.kind === 'resourceExchange' && entry.effectPreview.resourcesGained?.fuel === 1)!
        expect(option).toBeDefined()
        response = session.resolveChoice(0, option.value)
      } else if (request.kind === 'choice') response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
      else response = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(5)
    expect(offers).toBe(wood ? 0 : 1)
    expect(response.state.players[0]!.resources.fuel).toBe(wood ? 18 : 19)
  })
})
