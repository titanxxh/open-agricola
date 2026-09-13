import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { getAllTilePositions } from '../../shared/domain/farm'
import { computeScores } from '../../shared/domain/scoring'
import type { PlayerState, Resource } from '../../shared/contract/types'
import type { FatherParentCardId, MotherParentCardId } from '../../shared/parents/types'

const setup = (mother: MotherParentCardId = 'PR12', father: FatherParentCardId = 'PS12') => {
  const session = new GameSession(56124, undefined, { playerCount: 2, enableParentCards: true })
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 100
  }
  session.state.parentSelection!.candidates.p1 = { mother: [mother, 'PR01'], father: [father, 'PS01'] }
  session.state.parentSelection!.candidates.p2 = { mother: ['PR10', 'PR02'], father: ['PS02', 'PS03'] }
  session.loadState(session.state)
  expect(session.submitParentSelection(0, { mother, father }).ok).toBe(true)
  const response = session.submitParentSelection(1, { mother: 'PR10', father: 'PS02' })
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players).toHaveLength(2)
  expect(response.state.players[0]!.parentCards).toEqual({ mother, father })
  return session
}

const nextRound = (session: GameSession, round: number) => {
  session.state.round = round - 1
  for (const player of session.state.players) markAllWorkersUsed(session.state, player)
  session.loadState(session.state)
  let response = session.performRoundEnd()
  for (let step = 0; step < 20 && response.state.round < round; step++) {
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.request.kind === 'feed') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
    } else if (response.interaction.request.kind === 'choice') {
      expect(response.interaction.request.options.map((option) => option.value)).toContain('__skip__')
      response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    } else {
      response = session.performRoundEnd()
    }
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.round).toBe(round)
  return response
}

const houseAnimal = (session: GameSession, animal: 'sheep' | 'boar' | 'cattle') => {
  const response = session.getState()
  expect(response.interaction.request.kind).toBe('animal-reorg')
  const placed = session.resolveChoice(0, 'confirm', { zones: [
    { id: 'house', zoneType: 'house', animalType: animal, animalCount: 1 },
  ] })
  expect(placed.ok, placed.error).toBe(true)
  expect(placed.state.players[0]!.houseAnimalCount).toBe(1)
  return placed
}

const motherRows = [
  ['PR03', 8, 'cattle', 0], ['PR04', 7, 'boar', 0.1], ['PR05', 4, 'sheep', 0.2],
  ['PR06', 7, 'vegetable', 0.3], ['PR07', 4, 'grain', 0.4], ['PR08', 3, 'stone', 0.5],
  ['PR09', 5, 'reed', 0.6], ['PR10', 1, 'wood', 0.7], ['PR11', 1, 'food', 0.8], ['PR12', 1, 'clay', 0.9],
] as const

const addPasture = (player: PlayerState, col: number, size = 1, animalType: 'sheep' | 'boar' | 'cattle' | null = null, animalCount = 0) => {
  const tiles = Array.from({ length: size }, (_, offset) => ({ row: 0, col: col + offset }))
  player.pastures.push({ id: `pasture-${col}`, size, tiles, stables: 0, animalType, animalCount })
  const edges = [...tiles.flatMap((tile) => [`H-0-${tile.col}`, `H-1-${tile.col}`]), `V-0-${col}`, `V-0-${col + size}`]
  for (const edge of edges) {
    if (!player.fenceSegments.some((segment) => segment.edge === edge)) player.fenceSegments.push({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id } })
  }
  if (animalType) player.resources[animalType] += animalCount
}

const complete = (session: GameSession, father: FatherParentCardId, tier: number, suffix = '') => {
  let response = session.takeAnytimeAction(0, 'complete-parent-father')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') response = session.resolveChoice(0, `${father}:${tier}${suffix}`)
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('Parent printed-rule native audit', () => {
  it.each(motherRows)('%s receives its reward at round %i and scores its printed fraction', (cardId, round, resource, score) => {
    const session = setup(cardId)
    if (round > 1) {
      expect(session.state.players[0]!.resources[resource]).toBe(0)
      expect(session.state.futureMeeples).toContainEqual(expect.objectContaining({ cardId, round, resources: { [resource]: 1 } }))
      nextRound(session, round)
    }
    expect(session.state.players[0]!.resources[resource]).toBe(resource === 'food' ? 101 : 1)
    if (resource === 'sheep' || resource === 'boar' || resource === 'cattle') houseAnimal(session, resource)
    expect(session.state.futureMeeples.some((entry) => entry.cardId === cardId && entry.round === round)).toBe(false)
    expect(computeScores(session.getState().state)[0]!.categories.find((category) => category.key === 'parentCards')?.total ?? 0).toBe(score)
    const before = { ...session.state.players[0]!.resources }
    const acted = session.takeAction(0, 'day-laborer')
    expect(acted.ok, acted.error).toBe(true)
    expect(acted.state.players[0]!.resources[resource]).toBe(before[resource] + (resource === 'food' ? 2 : 0))
  })

  it.each([['PR01', 2, 'stable', -0.75], ['PR02', 12, 'plow', -0.25]] as const)(
    '%s offers its free farm placement only at round %i and rejects an occupied tile', (cardId, round, farmType, score) => {
      const session = setup(cardId)
      let response = nextRound(session, round)
      const accept = response.interaction.request.options.find((option) => option.value !== '__skip__')!
      response = session.resolveChoice(0, accept.value)
      expect(response.interaction.request.farm.farmType).toBe(farmType)
      const tile = response.interaction.request.farm.selectableTiles[0]!
      const occupied = response.state.players[0]!.roomTiles[0]!
      const before = structuredClone(response.state.players[0])
      const invalid = session.commitSelectionChoice(0, farmType === 'stable' ? { stables: [occupied] } : { tile: occupied })
      expect(invalid.ok).toBe(false)
      expect(invalid.state.players[0]).toEqual(before)
      response = session.commitSelectionChoice(0, farmType === 'stable' ? { stables: [tile] } : { tile })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources.wood).toBe(0)
      expect(farmType === 'stable' ? response.state.players[0]!.stableTiles : response.state.players[0]!.fields).toContainEqual(expect.objectContaining(tile))
      expect(computeScores(response.state)[0]!.categories.find((category) => category.key === 'parentCards')?.total).toBe(score)
      expect(response.state.futureMeeples.some((entry) => entry.cardId === cardId)).toBe(false)
    },
  )

  it.each([
    ['PS01', [2, 3, 5], [{ stone: 1 }, { stone: 2 }, { stone: 3 }]],
    ['PS05', [1, 2, 3], [{ wood: 1 }, { clay: 2 }, { reed: 3 }]],
    ['PS06', [6, 8, 10], [{ food: 1 }, { food: 3 }, { food: 5 }]],
    ['PS08', [7, 5, 3], [{ grain: 1 }, { vegetable: 1 }, { grain: 1, vegetable: 1 }]],
    ['PS11', [3, 4, 5], [{ clay: 1 }, { clay: 2 }, { clay: 3 }]],
    ['PS12', [2, 3, 4], [{ food: 2 }, { food: 3 }, { food: 4 }]],
  ] as const)('%s enforces each printed threshold and grants exactly one chosen reward once', (cardId, thresholds, rewards) => {
    for (const tier of [1, 2, 3] as const) {
      let session = setup('PR12', cardId)
      const setCount = (count: number) => {
        const player = session.state.players[0]!
        if (cardId === 'PS01') player.fields = getAllTilePositions().filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col)).slice(0, count).map((tile) => ({ ...tile, stacks: [] }))
        if (cardId === 'PS05') player.improvements = ['Major_Fireplace1', 'Major_Fireplace2', 'Major_Joinery'].slice(0, count)
        if (cardId === 'PS06') player.minorPlayed = Array.from({ length: count - 2 }, (_, index) => `__played_${index}__`)
        if (cardId === 'PS08') player.fields = getAllTilePositions().filter((tile) => !player.roomTiles.some((room) => room.row === tile.row && room.col === tile.col)).slice(0, 13 - count).map((tile) => ({ ...tile, stacks: [] }))
        if (cardId === 'PS11') player.resources.grain = count
        if (cardId === 'PS12') player.resources.vegetable = count
      }
      const threshold = thresholds[tier - 1]!
      setCount(threshold + (cardId === 'PS08' ? 1 : -1))
      let response = session.takeAnytimeAction(0, 'complete-parent-father')
      if (tier === 1) expect(response.ok).toBe(false)
      else {
        if (response.interaction.stateId === 'wait') {
          expect(response.interaction.request.options.map((option) => option.value)).not.toContain(`${cardId}:${tier}`)
          expect(session.resolveChoice(0, `${cardId}:${tier}`).ok).toBe(false)
        } else {
          expect(response.state.players[0]!.cardStates[cardId]?.extraData?.fatherCompletedTier).toBeLessThan(tier)
        }
      }
      session = setup('PR12', cardId)
      setCount(threshold)
      const before = { ...session.state.players[0]!.resources }
      response = session.takeAnytimeAction(0, 'complete-parent-father')
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId === 'wait') response = session.resolveChoice(0, `${cardId}:${tier}`)
      expect(response.ok, response.error).toBe(true)
      const expected: Resource = { ...before }
      for (const [resource, amount] of Object.entries(rewards[tier - 1]!)) expected[resource as keyof Resource] = (expected[resource as keyof Resource] ?? 0) + amount
      expect(response.state.players[0]!.resources).toEqual(expected)
      expect(response.state.players[0]!.cardStates[cardId]?.extraData?.fatherCompletedTier).toBe(tier)
      expect(response.state.players[0]!.cardStates[cardId]?.infobox).toBe('Completed')
      expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
      expect(session.state.players[0]!.resources).toEqual(expected)
    }
  })

  it.each(['wood', 'clay', 'stone'] as const)('PS02 gives the current %s house material at all pasture thresholds', (houseType) => {
    for (const tier of [1, 2, 3]) {
      const session = setup('PR12', 'PS02')
      const player = session.state.players[0]!
      player.houseType = houseType
      for (let col = 0; col < tier; col++) addPasture(player, col)
      const before = player.resources[houseType]
      const response = complete(session, 'PS02', tier)
      expect(response.state.players[0]!.resources[houseType]).toBe(before + tier)
      expect(response.state.players[0]!.cardStates.PS02?.extraData?.fatherCompletedTier).toBe(tier)
      expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
    }
  })

  it.each([1, 2, 3])('PS03 tier %i draws three of the eligible types, keeps one each, and blocks reentry', (tier) => {
    const session = setup('PR12', 'PS03')
    const animals = ['sheep', 'boar', 'cattle'] as const
    for (let col = 0; col < tier; col++) addPasture(session.state.players[0]!, col, 1, animals[col]!, 1)
    session.state.ordinaryCardDecks = { minor: ['A001_Shelter', 'A002_ShiftingCultivation', 'A003_PaperKnife'], occupation: ['A099_FellowGrazer', 'A100_Curator', 'A101_CookeryOutfitter'] }
    const response = complete(session, 'PS03', tier)
    const choices = Object.values(response.state.ordinaryCardDrawChoices)
    expect(choices.map((choice) => choice.cardType).sort()).toEqual(tier === 3 ? ['minor', 'occupation'] : [tier === 1 ? 'minor' : 'occupation'])
    expect(session.takeAction(0, 'forest').ok).toBe(false)
    for (const choice of choices) {
      expect(choice.candidates).toHaveLength(3)
      expect(session.resolveOrdinaryCardDrawChoice(1, choice.id, choice.candidates[0]!).ok).toBe(false)
      const selected = session.resolveOrdinaryCardDrawChoice(0, choice.id, choice.candidates[1]!)
      expect(selected.ok, selected.error).toBe(true)
      const hand = choice.cardType === 'minor' ? selected.state.players[0]!.minorHand : selected.state.players[0]!.occupationHand
      expect(hand).toContain(choice.candidates[1])
      expect(hand).not.toContain(choice.candidates[0])
      expect(hand).not.toContain(choice.candidates[2])
    }
    expect(Object.values(session.state.ordinaryCardDrawChoices)).toEqual([])
    expect(session.state.players[0]!.cardStates.PS03?.extraData?.fatherCompletedTier).toBe(tier)
    expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
  })

  it.each([[1, 3], [2, 4], [3, 6]])('PS04 tier %i requires %i same-type animals and gains distinct resources', (tier, animals) => {
    const session = setup('PR12', 'PS04')
    addPasture(session.state.players[0]!, 0, 3, 'sheep', animals!)
    const before = { ...session.state.players[0]!.resources }
    const requested = ['wood', 'reed', 'stone'].slice(0, tier)
    const prompt = session.takeAnytimeAction(0, 'complete-parent-father')
    expect(prompt.ok, prompt.error).toBe(true)
    expect(session.resolveChoice(0, 'PS04:2:wood,wood').ok).toBe(false)
    const response = session.resolveChoice(0, `PS04:${tier}:${requested.join(',')}`)
    expect(response.ok, response.error).toBe(true)
    for (const resource of ['wood', 'clay', 'reed', 'stone'] as const) expect(response.state.players[0]!.resources[resource]).toBe(before[resource] + (requested.includes(resource) ? 1 : 0))
    expect(response.state.players[0]!.resources.sheep).toBe(animals)
    expect(response.state.players[0]!.cardStates.PS04?.extraData?.fatherCompletedTier).toBe(tier)
  })

  it.each([1, 2, 3])('PS07 tier %i limits one real sow selection and preserves the pending request after an invalid selection', (tier) => {
    const session = setup('PR12', 'PS07')
    const player = session.state.players[0]!
    player.occupationPlayed = ['A099_Servant', 'A100_Tutor', 'A101_Conservator', 'A103_Turner'].slice(0, tier + 1)
    player.fields = Array.from({ length: 4 }, (_, col) => ({ row: 0, col, stacks: [] }))
    player.resources.grain = 4
    const response = complete(session, 'PS07', tier)
    expect(response.interaction.request.farm.farmType).toBe('sow')
    const crops = player.fields.map((tile) => ({ row: tile.row, col: tile.col, crop: 'grain' as const }))
    const before = structuredClone(response.state.players[0])
    const invalid = session.commitSelectionChoice(0, { crops: crops.slice(0, tier + 1) })
    expect(invalid.ok).toBe(false)
    expect(invalid.state.players[0]).toEqual(before)
    const sown = session.commitSelectionChoice(0, { crops: crops.slice(0, tier) })
    expect(sown.ok, sown.error).toBe(true)
    expect(sown.state.players[0]!.fields.filter((field) => field.stacks.length > 0)).toHaveLength(tier)
    expect(sown.state.players[0]!.fields.slice(0, tier).map((field) => field.stacks)).toEqual(Array.from({ length: tier }, () => [{ kind: 'grain', remaining: 3 }]))
    expect(sown.state.players[0]!.resources.grain).toBe(4 - tier)
    expect(sown.state.players[0]!.cardStates.PS07?.extraData?.fatherCompletedTier).toBe(tier)
    expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
  })

  it.each(['PS09', 'PS10'] as const)('%s completes each animal-reward tier through placement before locking the card', (cardId) => {
    for (const tier of [1, 2, 3]) {
      const session = setup('PR12', cardId)
      const player = session.state.players[0]!
      if (cardId === 'PS09') {
        player.stableTiles = Array.from({ length: tier + 1 }, (_, col) => ({ row: 2, col }))
      } else {
        addPasture(player, 0, 2)
        for (let col = 2; col <= tier; col++) addPasture(player, col)
        expect(player.fenceSegments).toHaveLength([6, 9, 12][tier - 1]!)
      }
      const animal = cardId === 'PS09' ? 'sheep' : 'boar'
      let response = complete(session, cardId, tier)
      expect(response.state.players[0]!.resources[animal]).toBe(tier)
      expect(response.interaction.request.kind).toBe('animal-reorg')
      let remaining = tier
      const zones = response.interaction.request.zones.map((zone) => {
        const count = Math.min(remaining, zone.capacity)
        remaining -= count
        return { id: zone.id, zoneType: zone.zoneType, animalType: count ? animal : null, animalCount: count }
      })
      expect(remaining).toBe(0)
      response = session.resolveChoice(0, 'confirm', { zones })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.resources[animal]).toBe(tier)
      expect(response.state.players[0]!.cardStates[cardId]?.extraData?.fatherCompletedTier).toBe(tier)
      expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
    }
  })

  it.each(['PS01', 'PS05', 'PS07'] as const)('%s counts the corresponding field, major, or occupation supplied by D025', (cardId) => {
    const session = setup('PR12', cardId)
    const player = session.state.players[0]!
    player.minorHand = ['D025_WitchesDanceFloor']
    if (cardId === 'PS01' || cardId === 'PS07') player.fields = [{ row: 0, col: 0, stacks: [] }]
    if (cardId === 'PS07') {
      player.occupationPlayed = ['A099_Servant']
      player.resources.grain = 1
    }
    let response = session.takeAction(0, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    const improvement = response.interaction.request.options.find((option) => option.value.startsWith('action-improvement-'))!
    response = session.resolveChoice(0, improvement.value)
    expect(response.ok, response.error).toBe(true)
    if (!response.state.players[0]!.minorPlayed.includes('D025_WitchesDanceFloor')) response = session.resolveChoice(0, 'D025_WitchesDanceFloor')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain('D025_WitchesDanceFloor')
    expect(session.resolveChoice(response.interaction.playerIndex, 'confirm').ok).toBe(true)
    session.state.currentPlayerIndex = 0
    session.loadState(session.state)
    const before = { ...session.state.players[0]!.resources }
    response = session.takeAnytimeAction(0, 'complete-parent-father')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      response = session.resolveChoice(0, `${cardId}:1`)
      expect(response.ok, response.error).toBe(true)
    }
    if (cardId === 'PS07') {
      expect(response.interaction.request.kind).toBe('farm-select')
      response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    } else {
      const resource = cardId === 'PS01' ? 'stone' : 'wood'
      expect(response.state.players[0]!.resources[resource]).toBe(before[resource] + 1)
    }
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.fatherCompletedTier).toBe(1)
    expect(session.takeAnytimeAction(0, 'complete-parent-father').ok).toBe(false)
  })
})
