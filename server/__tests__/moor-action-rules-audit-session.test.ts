import { describe, expect, it } from 'vitest'
import { setupMoorAudit, playMoorAuditMinor, acceptMoorAuditChoice, advanceMoorAuditToRound } from './_helpers/moor-rules-audit'
import { workersAvailable } from '../../shared/domain/player'

describe('Moor action printed-rule native audit', () => {
  it.each([
    ['forest', 'wood', 3], ['clay-pit', 'clay', 3], ['reed-bank', 'reed', 2], ['western-quarry', 'stone', 2],
  ] as const)('M061 offers paid Renovation after the %s boundary of %s %i without another worker', (spaceId, resource, threshold) => {
    for (const amount of [threshold - 1, threshold, threshold + 1]) {
      for (const accept of [true, false]) {
        const session = setupMoorAudit(2, 14)
        session.state.players[0]!.minorPlayed = ['M061_HayWagon']
        session.state.actionSpaces.find((space) => space.id === spaceId)!.resources[resource] = amount
        const opponent = structuredClone(session.state.players[1])
        let response = session.takeAction(0, spaceId)
        expect(response.ok, response.error).toBe(true)
        const collected = { ...response.state.players[0]!.resources }
        if (amount >= threshold) {
          expect(response.interaction.sourceCard).toBe('M061_HayWagon')
          const renovation = response.interaction.request.options.find((option) => option.labelKey === 'actions.renovate-house.name')!
          expect(renovation).toBeDefined()
          response = session.resolveChoice(0, accept ? renovation.value : '__skip__')
        } else expect(response.interaction.sourceCard).not.toBe('M061_HayWagon')
        expect(response.ok, response.error).toBe(true)
        const renovated = accept && amount >= threshold
        expect(response.state.players[0]!.houseType).toBe(renovated ? 'clay' : 'wood')
        expect(response.state.players[0]!.resources).toEqual({ ...collected, clay: collected.clay - (renovated ? 2 : 0), reed: collected.reed - (renovated ? 1 : 0) })
        expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
        expect(response.state.players[1]).toEqual(opponent)
        expect(response.state.actionSpaces.filter((space) => space.takenBy.some((worker) => worker.playerId === 'p1')).map((space) => space.id)).toEqual([spaceId])
      }
    }
  })

  it.each(['farmland', 'cultivation'])('M041 offers exactly one optional extra field after %s only with cattle', (spaceId) => {
    for (const mode of ['accept', 'decline', 'no-cattle']) {
      const session = setupMoorAudit(2, 14)
      const player = session.state.players[0]!
      player.minorPlayed = ['M041_CattleCollar']
      player.resources.cattle = mode === 'no-cattle' ? 0 : 1
      player.houseAnimalType = mode === 'no-cattle' ? null : 'cattle'
      player.houseAnimalCount = player.resources.cattle
      let response = session.takeAction(0, spaceId)
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.request.kind === 'choice') response = acceptMoorAuditChoice(session, response)
      expect(response.interaction.request.farm.farmType).toBe('plow')
      response = session.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.fields).toHaveLength(1)
      if (mode === 'no-cattle') expect(response.interaction.sourceCard).not.toBe('M041_CattleCollar')
      else {
        expect(response.interaction.sourceCard).toBe('M041_CattleCollar')
        if (mode === 'decline') response = session.resolveChoice(0, '__skip__')
        else {
          response = acceptMoorAuditChoice(session, response)
          expect(response.interaction.request.farm.farmType).toBe('plow')
          response = session.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
        }
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.fields).toHaveLength(mode === 'accept' ? 2 : 1)
      expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
      expect(response.interaction.sourceCard).not.toBe('M041_CattleCollar')
    }
  })

  it.each([[1, 1, true], [0, 2, false], [2, 0, true]] as const)(
    'M093 buys a Fireplace with %i clay and %i fuel, replacing at most one building resource', (clay, fuel, allowed) => {
      const session = setupMoorAudit()
      session.state.players[0]!.minorPlayed = ['M093_FarmhandsQuarters']
      session.state.players[0]!.resources.clay = clay
      session.state.players[0]!.resources.fuel = fuel
      const offered = session.takeAction(0, 'major-improvement')
      expect(offered.ok, offered.error).toBe(true)
      expect(offered.interaction.request.options.some((option) => option.value === 'Major_Fireplace1')).toBe(allowed)
      const before = structuredClone(offered.state.players[0])
      const response = session.resolveChoice(0, 'Major_Fireplace1')
      expect(response.ok).toBe(allowed)
      if (allowed) {
        expect(response.state.players[0]!.improvements).toContain('Major_Fireplace1')
        expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, fuel: 0 })
      } else expect(response.state.players[0]).toEqual(before)
    },
  )

  it.each([
    ['forest', 'wood', 5], ['clay-pit', 'clay', 4], ['reed-bank', 'reed', 3], ['western-quarry', 'stone', 2],
  ] as const)('M110 checks the actual %s collection boundary of %s %i', (spaceId, resource, threshold) => {
    for (const amount of [threshold - 1, threshold, threshold + 1]) {
      const session = setupMoorAudit(2, 14)
      session.state.players[0]!.minorPlayed = ['M110_FarmCart']
      session.state.actionSpaces.find((space) => space.id === spaceId)!.resources[resource] = amount
      const response = session.takeAction(0, spaceId)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[resource]).toBe(20 + amount)
      expect(response.state.players[0]!.resources.grain).toBe(amount >= threshold ? 1 : 0)
      expect(response.state.players[1]!.resources.grain).toBe(0)
    }
  })

  it.each([2, 3, 4, 5])('M117 validates %i collected wood, a horse, payment, and decline in the native action', (wood) => {
    for (const mode of ['accept', 'decline', 'no-horse', 'no-food']) {
      const session = setupMoorAudit()
      const player = session.state.players[0]!
      player.minorPlayed = ['M117_DraughtHorses']
      player.resources.horse = mode === 'no-horse' ? 0 : 1
      player.houseAnimalType = mode === 'no-horse' ? null : 'horse'
      player.houseAnimalCount = mode === 'no-horse' ? 0 : 1
      player.resources.food = mode === 'no-food' ? 0 : 1
      session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = wood
      let response = session.takeAction(0, 'forest')
      expect(response.ok, response.error).toBe(true)
      if (wood >= 3 && (mode === 'accept' || mode === 'decline')) {
        expect(response.interaction.sourceCard).toBe('M117_DraughtHorses')
        response = mode === 'accept' ? acceptMoorAuditChoice(session, response) : session.resolveChoice(0, '__skip__')
      } else expect(response.interaction.sourceCard).not.toBe('M117_DraughtHorses')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBe(20 + wood + (mode === 'accept' && wood >= 3 ? wood === 3 ? 1 : 2 : 0))
      expect(response.state.players[0]!.resources.food).toBe(mode === 'no-food' || (mode === 'accept' && wood >= 3) ? 0 : 1)
    }
  })

  it.each([2, 3, 5, 6])('M123 buys and exhausts the printed stone supply with %i players', (playerCount) => {
    const session = setupMoorAudit(playerCount)
    session.state.players[0]!.resources.vegetable = 3
    let response = playMoorAuditMinor(session, 'M123_StoneQuarry')
    const count = playerCount === 3 ? 3 : 5
    expect(response.state.players[0]!.cardStates.M123_StoneQuarry?.counters?.usage).toBe(count)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    for (let used = 1; used <= count + 1; used++) {
      advanceMoorAuditToRound(session, 5 + used)
      const card = session.state.farmersOfTheMoor!.specialActionCards.find((entry) => entry.actions.includes('hiring-fair'))!
      response = session.takeSpecialAction(0, card.id, 'hiring-fair')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.stone).toBe(20 + Math.min(used, count))
      expect(response.state.players[0]!.cardStates.M123_StoneQuarry?.counters?.usage).toBe(Math.max(0, count - used))
    }
  })

  it.each(['farmland', 'cultivation'])('M129 buys at most one horse after completing %s and allows declining', (spaceId) => {
    for (const mode of ['accept', 'decline', 'no-food']) {
      const session = setupMoorAudit(2, 14)
      session.state.players[0]!.minorPlayed = ['M129_PlowhorseMarket']
      session.state.players[0]!.resources.food = mode === 'no-food' ? 0 : 1
      let response = session.takeAction(0, spaceId)
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.request.kind === 'choice') response = acceptMoorAuditChoice(session, response)
      expect(response.interaction.request.farm.farmType).toBe('plow')
      const tile = response.interaction.request.farm.selectableTiles[0]!
      response = session.commitSelectionChoice(0, { tile })
      expect(response.ok, response.error).toBe(true)
      if (mode === 'no-food') expect(response.interaction.sourceCard).not.toBe('M129_PlowhorseMarket')
      else {
        expect(response.interaction.sourceCard).toBe('M129_PlowhorseMarket')
        response = mode === 'accept' ? acceptMoorAuditChoice(session, response) : session.resolveChoice(0, '__skip__')
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.horse).toBe(mode === 'accept' ? 1 : 0)
      expect(response.state.players[0]!.resources.food).toBe(mode === 'decline' ? 1 : 0)
      expect(response.state.players[0]!.fields).toContainEqual({ ...tile, stacks: [] })
      if (mode === 'accept') {
        expect(response.interaction.request.kind).toBe('animal-reorg')
        const placed = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house', zoneType: 'house', animalType: 'horse', animalCount: 1 }] })
        expect(placed.ok, placed.error).toBe(true)
        expect(placed.state.players[0]!.houseAnimalCount).toBe(1)
      }
    }
  })

  it.each([
    ['M062_HearthBrush', 'Major_Moor_TiledOven'],
    ['M063_PastoralLetter', 'Major_Moor_VillageChurch'],
  ])('%s offers its moved-up major %s after a person action starting next round', (cardId, major) => {
    const session = setupMoorAudit()
    session.state.players[0]!.improvements = ['Major_Fireplace1', 'Major_Fireplace2']
    session.state.players[0]!.minorHand = [cardId!]
    expect(session.takeAction(0, 'major-improvement').ok).toBe(true)
    const offered = session.resolveChoice(0, cardId!)
    const bought = acceptMoorAuditChoice(session, offered)
    expect(bought.state.availableMajorImprovements).toContain(major)
    expect(bought.state.players[0]!.improvements).not.toContain(major)
    advanceMoorAuditToRound(session, 6)
    let response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.sourceCard).toBe(cardId)
    for (let step = 0; step < 4 && !response.state.players[0]!.improvements.includes(major!); step++) {
      response = acceptMoorAuditChoice(session, response)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.improvements).toContain(major)
    expect(response.state.availableMajorImprovements).not.toContain(major)
    expect(response.state.actionSpaces.filter((space) => space.takenBy.some((worker) => worker.playerId === 'p1')).map((space) => space.id)).toEqual(['forest'])
  })
})
