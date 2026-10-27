import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)
const source = { head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), node: process.version }
const harvests = [4, 7, 9, 11, 13, 14]
const baseCategories = {
  fields: -1, pastures: -1, grains: -1, vegetables: -1, sheeps: -1, boars: -1, cattles: -1,
  empty: -13, stables: 0, clayRooms: 0, stoneRooms: 0, farmers: 6, cards: 0, beggings: 0,
}
const baseResources = {
  wood: 0, clay: 0, reed: 0, stone: 0, food: 6, grain: 0, vegetable: 0,
  sheep: 0, boar: 0, cattle: 0, begging: 0,
}

function playGame(moor = false, parents?: 'random' | 'draft'): SessionResponse {
  const seed = moor ? 24 : parents ? 3 : 42
  const options = {
    playerCount: 1, soloHandMode: moor ? 'choose-7' : 'random', ordinaryCardDeckSeed: 42,
    enableFarmersOfTheMoor: moor,
    enableThroughTheSeasons: Boolean(parents), enableParentCards: Boolean(parents),
    draftParents: parents === 'draft', parentSelectionSeed: 11,
  } satisfies NonNullable<ConstructorParameters<typeof GameSession>[2]>
  const session = evidence.track(new GameSession(seed, undefined, options))
  let response = session.getState()
  const trace: unknown[] = [{ command: 'constructor', seed, options, interaction: response.interaction }]
  const issue = (command: unknown, run: () => SessionResponse) => {
    const eventStart = response.state.events.length
    const logStart = response.state.log.length
    response = run()
    trace.push({ command, round: response.state.round, phase: response.state.roundPhase,
      interaction: structuredClone(response.interaction), resources: { ...response.state.players[0]!.resources },
      events: structuredClone(response.state.events.slice(eventStart)),
      log: structuredClone(response.state.log.slice(0, Math.max(0, response.state.log.length - logStart))) })
    expect(response.ok, JSON.stringify({ command, error: response.error, interaction: response.interaction })).toBe(true)
  }
  let cutPeat = 0
  let fellTrees = 0
  const desiredAction = () => {
    const current = response.state.farmersOfTheMoor?.specialActionCards.find(card => card.location.kind === 'solo-current')
    const terrain = response.state.players[0]!.farmTerrain ?? []
    if (cutPeat < 3 && current?.actions.includes('cut-peat')) {
      const tile = terrain.find(tile => tile.kind === 'moor')
      if (tile) return { cardId: current.id, actionId: 'cut-peat' as const, tile }
    }
    if (fellTrees < 2 && current?.actions.includes('fell-trees')) {
      const tile = terrain.find(tile => tile.kind === 'forest')
      if (tile) return { cardId: current.id, actionId: 'fell-trees' as const, tile }
    }
    return undefined
  }
  const settlePreparationAndHarvest = () => {
    for (let step = 0; step < 20 && response.interaction.stateId === 'wait'; step++) {
      const request = response.interaction.request
      if (request.kind === 'confirm-next-player') return
      if (request.kind === 'choice' && request.moorSolo?.window === 'preparation') {
        const value = desiredAction() ? 'keep' : 'replace'
        issue({ type: 'choice', value }, () => session.resolveChoice(0, value))
      } else if (request.kind === 'heating') {
        const resources = response.state.players[0]!.resources
        const woodToFuel = Math.min(resources.wood, Math.max(0, request.required - (resources.fuel ?? 0)))
        const fuelUsed = Math.min(request.required, (resources.fuel ?? 0) + woodToFuel)
        const wood = request.exchangeCatalog.find(entry => entry.from.wood === 1 && entry.to.fuel === 1)
        if (woodToFuel && !wood) throw new Error('Missing offered wood-to-fuel conversion')
        const selections = woodToFuel && wood ? [{ sourceId: wood.sourceId, exchangeIndex: wood.exchangeIndex, count: woodToFuel }] : []
        issue({ type: 'heating', fuelUsed, selections }, () => session.resolveChoice(0, 'confirm', { fuelUsed, selections }))
      } else if (request.kind === 'feed') {
        issue({ type: 'feed', selections: [] }, () => session.resolveChoice(0, 'confirm', { selections: [] }))
      } else if (request.kind === 'choice' && response.interaction.spaceId === '__subflow:post-reap-anytime') {
        expect(request.options.map(option => option.value)).toEqual(['__skip__'])
        issue({ type: 'post-reap-anytime', value: '__skip__' }, () => session.resolveChoice(0, '__skip__'))
      } else throw new Error(`Unknown preparation or harvest: ${JSON.stringify(response.interaction)}`)
    }
  }
  try {
    if (response.state.phase === 'solo-hand-selection') {
      const groups = response.state.soloHandSelection!.groups.map(group => ({ kind: group.kind, cardIds: group.cardIds.slice(0, group.keepCount) }))
      issue({ type: 'solo-hand', groups }, () => session.submitSoloHandSelection(0, { groups }))
    }
    if (response.state.phase === 'parent-selection') {
      expect(response.state.parentSelection!.candidates.p1).toEqual({ mother: ['PR08', 'PR10'], father: ['PS11', 'PS01'] })
      issue({ type: 'parents', mother: 'PR08', father: 'PS11' }, () => session.submitParentSelection(0, { mother: 'PR08', father: 'PS11' }))
    }
    const initialHands = structuredClone({ minor: response.state.players[0]!.minorHand, occupation: response.state.players[0]!.occupationHand })
    const initialRooms = structuredClone(response.state.players[0]!.roomTiles)
    expect(initialHands.minor).toHaveLength(7)
    expect(initialHands.occupation).toHaveLength(7)
    for (let round = 1; round <= 14; round++) {
      expect(response.state.round).toBe(round)
      const secondSpace = parents && round === 1 ? 'season-autumn-thanksgiving'
        : parents && [2, 6, 10].includes(round) ? 'grain-seeds' : 'fishing'
      for (const spaceId of ['day-laborer', secondSpace]) {
        expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('idle')
        issue({ type: 'action', spaceId }, () => session.takeAction(0, spaceId))
        if (spaceId === 'season-autumn-thanksgiving' && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
          const vegetable = response.interaction.request.options.find(option => option.labelKey === 'actions.season-autumn-thanksgiving.option-vegetable')
          if (!vegetable) throw new Error(`Unknown autumn action: ${JSON.stringify(response.interaction)}`)
          issue({ type: 'autumn-vegetable', value: vegetable.value }, () => session.resolveChoice(0, vegetable.value))
        }
        expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player', nextPlayerIndex: 0 } })
        issue({ type: 'choice', value: 'confirm' }, () => session.resolveChoice(0, 'confirm'))
        settlePreparationAndHarvest()
        if (moor && spaceId === 'day-laborer') {
          for (let use = 0; use < 2; use++) {
            const target = desiredAction()
            if (!target) break
            const { cardId, actionId, tile } = target
            issue({ type: 'special-action', cardId, actionId, tile }, () => session.takeSpecialAction(0, cardId, actionId, { tile }))
            if (actionId === 'cut-peat') cutPeat++
            else fellTrees++
            if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice' && response.interaction.request.moorSolo?.window === 'retention') {
              const value = round === 1 && use === 0 ? 'retain' : 'discard'
              issue({ type: 'choice', value }, () => session.resolveChoice(0, value))
            }
            expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player', nextPlayerIndex: 0 } })
            issue({ type: 'choice', value: 'confirm' }, () => session.resolveChoice(0, 'confirm'))
          }
        }
      }
      expect(response.state.players[0]!.resources.food).toBe((parents
        ? moor ? [0, 2, 7, 5, 8, 10, 8, 12, 9, 11, 9, 13, 10, 7] : [2, 4, 9, 7, 10, 12, 10, 14, 11, 13, 11, 15, 12, 9]
        : moor
        ? [1, 4, 7, 4, 7, 10, 7, 10, 7, 10, 7, 10, 7, 4]
        : [3, 6, 9, 6, 9, 12, 9, 12, 9, 12, 9, 12, 9, 6])[round - 1])
    }
    expect({ minor: response.state.players[0]!.minorHand, occupation: response.state.players[0]!.occupationHand }).toEqual(initialHands)
    expect(response.state.gameOver).toBe(true)
    expect(response.interaction.stateId).toBe('gameover')
    expect(response.state.players[0]!.minorPlayed).toEqual([])
    expect(response.state.players[0]!.occupationPlayed).toEqual([])
    expect(response.state.players[0]!.improvements).toEqual([])
    expect(response.state.players[0]!.roomTiles).toEqual(initialRooms)
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.players[0]!.pastures).toEqual([])
    expect(response.state.players[0]!.stableTiles).toEqual([])
    expect(response.state.events.filter(event => event.type === 'worker.placed')).toHaveLength(28)
    expect(response.state.events.filter(event => event.type === 'round.started').map(event => event.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
    expect(response.state.events.filter(event => event.type === 'harvest.started').map(event => event.round)).toEqual(harvests)
    expect(response.state.events.filter(event => event.type === 'harvest.phaseStarted' && event.harvestPhase === 'field').map(event => event.round)).toEqual(harvests)
    expect(response.state.events.flatMap(event => event.type === 'resource.paid' && event.paymentFor === 'feeding' ? [{ round: event.round, food: event.resources.food }] : []))
      .toEqual(harvests.map(round => ({ round, food: 6 })))
    if (parents) {
      expect(response.state.events.filter(event => event.type === 'worker.placed' && event.spaceId === 'season-autumn-thanksgiving')).toHaveLength(1)
      expect(response.state.events.filter(event => event.type === 'futureMeeple.resolved' && event.cardId === 'PR08')).toHaveLength(1)
      expect(response.state.log.filter(entry => entry.key === 'log.parentMotherScheduled')).toHaveLength(1)
    }
    if (moor) {
      expect(cutPeat).toBe(3)
      expect(fellTrees).toBe(2)
      expect(response.state.events.flatMap(event => event.type === 'resource.paid' && event.paymentFor === 'moor-retention' ? [event.resources] : [])).toEqual([{ food: 2 }])
      const heat = response.state.events.filter(event => event.type === 'harvest.heated')
      expect(heat.map(event => event.round)).toEqual(harvests)
      expect(heat.flatMap(event => event.type === 'harvest.heated' ? event.sickWorkerIds : [])).toEqual([])
      expect(heat.map(event => event.type === 'harvest.heated' ? event.required : null)).toEqual(parents ? [0, 2, 2, 2, 2, 2] : [2, 2, 2, 2, 2, 2])
    } else if (!parents) expect(trace).toHaveLength(57)
    return response
  } finally {
    evidence.record('source', source)
    evidence.record('commands-and-ledger', trace)
  }
}

describe('standard solo complete games from setup', () => {
  it('completes the base random game against the independent food and score ledger', () => {
    evidence.record('independent-ledger', { foodGained: 42, feeding: 36, foodRemaining: 6,
      missingFarmingCategories: -7, unusedSpaces: -13, people: 6, score: -14 })
    const response = playGame()
    expect(response.state.gameOver).toBe(true)
    expect(response.interaction.stateId).toBe('gameover')
    expect(response.state.round).toBe(14)
    // Fourteen rounds gain 2+1 food; six harvests feed two adults for 6 each.
    expect(response.state.players[0]!.resources).toEqual(baseResources)
    expect(response.state.events.filter(event => event.type === 'harvest.started').map(event => event.round)).toEqual(harvests)
    // Seven missing farming categories -7, thirteen unused spaces -13, two people +6.
    expect(Object.fromEntries(response.scores![0]!.categories.map(category => [category.key, category.total === 0 ? 0 : category.total]))).toEqual(baseCategories)
    expect(response.scores![0]!.total).toBe(-14)
  })

  it('completes Moor choose-7 with real peat cutting, retention and heating', () => {
    evidence.record('independent-ledger', { foodGained: 42, feeding: 36, retention: 2, foodRemaining: 4,
      peatFuel: 9, felledWood: 4, heating: 12, convertedWood: 3, woodRemaining: 1,
      missingFarmingCategories: -7, horses: -1, unusedSpaces: -10, people: 6, score: -12 })
    const response = playGame(true)
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...baseResources, food: 4, wood: 1, fuel: 0, horse: 0 })
    expect(response.state.players[0]!.farmTerrain).toEqual([
      { row: 1, col: 1, kind: 'forest' }, { row: 2, col: 1, kind: 'forest' }, { row: 2, col: 2, kind: 'forest' },
    ])
    // Five cleared terrain spaces leave three forests and two rooms: ten unused spaces.
    expect(Object.fromEntries(response.scores![0]!.categories.map(category => [category.key, category.total === 0 ? 0 : category.total])))
      .toEqual({ ...baseCategories, empty: -10, horses: -1 })
    expect(response.scores![0]!.total).toBe(-12)
  })

  it('completes Seasons and random Parents with a real season action and fractional mother score', () => {
    evidence.record('independent-ledger', { dayLaborerFood: 28, fishingFood: 17, feeding: 36, foodRemaining: 9,
      summerGrain: 3, winterGrain: 3, autumnVegetable: 1, motherStone: 1,
      grains: 3, vegetables: 1, otherMissingCategories: -5, unusedSpaces: -13, people: 6, mother: 0.5, score: -7.5 })
    const response = playGame(false, 'random')
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.parentCards).toEqual({ mother: 'PR08', father: 'PS11' })
    // Three summer Day Laborers and three early-winter Grain Seeds give six grain.
    // Fishing eventually collects 17; Day Laborer gains 28; six harvests cost 36.
    expect(response.state.players[0]!.resources).toEqual({ ...baseResources, food: 9, grain: 6, vegetable: 1, stone: 1 })
    expect(Object.fromEntries(response.scores![0]!.categories.map(category => [category.key, category.total === 0 ? 0 : category.total])))
      .toEqual({ ...baseCategories, grains: 3, vegetables: 1, parentCards: 0.5 })
    expect(response.scores![0]!.total).toBe(-7.5)
  })

  it('completes all three expansions with choose-7 and an explicit parent submission', () => {
    evidence.record('independent-ledger', { dayLaborerFood: 28, fishingFood: 17, feeding: 36, retention: 2, foodRemaining: 7,
      peatFuel: 9, felledWood: 4, heating: 10, convertedWood: 1, woodRemaining: 3,
      summerGrain: 3, winterGrain: 3, autumnVegetable: 1, motherStone: 1,
      grains: 3, vegetables: 1, otherMissingCategories: -5, horses: -1, unusedSpaces: -10, people: 6, mother: 0.5, score: -5.5 })
    const response = playGame(true, 'draft')
    expect(response.state.gameOver).toBe(true)
    expect(response.state.players[0]!.parentCards).toEqual({ mother: 'PR08', father: 'PS11' })
    // The seasonal ledger gains 45 food and spends 36 feeding plus 2 retention.
    // Nine peat fuel covers nine of ten heat; one of four felled wood becomes fuel.
    expect(response.state.players[0]!.resources).toEqual({ ...baseResources, food: 7, grain: 6, vegetable: 1, stone: 1, wood: 3, fuel: 0, horse: 0 })
    expect(Object.fromEntries(response.scores![0]!.categories.map(category => [category.key, category.total === 0 ? 0 : category.total])))
      .toEqual({ ...baseCategories, empty: -10, horses: -1, grains: 3, vegetables: 1, parentCards: 0.5 })
    expect(response.scores![0]!.total).toBe(-5.5)
  })
})
