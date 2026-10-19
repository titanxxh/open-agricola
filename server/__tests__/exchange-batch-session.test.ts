import { describe, expect, it } from 'vitest'
import type { GameState, ResourceKey } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { bonusScore, restoreSession } from './_helpers/card-play-lifecycle'

// Shared Exchange mechanism: ordered payments and retryable input cross the
// authoritative Session boundary, rather than calling individual listeners.
const createSession = (configure?: (state: GameState) => void, moor = false) =>
  createWorkSession({
    seed: 42,
    options: { playerCount: 2, enableFarmersOfTheMoor: moor },
    configure: (state) => {
      state.round = 4
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.resources.food = 0
        player.farmTerrain = []
      }
      const player = state.players[0]!
      player.improvements = ['Major_Fireplace1']
      player.resources.sheep = 1
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
      configure?.(state)
    },
  })

const exchangeIndex = (response: SessionResponse, sourceId: string, resource: ResourceKey): number => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('Expected an exchange choice')
  }
  const option = response.interaction.request.options.find((entry) =>
    entry.sourceCard === sourceId && (entry.effectPreview?.resourcesPaid?.[resource] ?? 0) > 0,
  )
  if (!option) throw new Error(`Missing ${sourceId} exchange paying ${resource}: ${JSON.stringify(response.interaction)}`)
  return Number(option.value.split(':')[1])
}

const assertRejectedUnchanged = (session: GameSession, choice: string, playerIndex = 0) => {
  const beforeResponse = session.getState()
  const before = {
    state: captureStateWithHistory(beforeResponse.state),
    interaction: structuredClone(beforeResponse.interaction),
    scores: structuredClone(beforeResponse.scores),
    historyLength: beforeResponse.historyLength,
    hasActionStartSnapshot: beforeResponse.hasActionStartSnapshot,
  }
  const response = session.resolveChoice(playerIndex, choice)
  expect(response.ok).toBe(false)
  expect(captureStateWithHistory(response.state)).toEqual(before.state)
  expect(response.interaction).toEqual(before.interaction)
  expect(response.scores).toEqual(before.scores)
  expect(response.historyLength).toBe(before.historyLength)
  expect(response.hasActionStartSnapshot).toBe(before.hasActionStartSnapshot)
  expect(captureStateWithHistory(session.getState().state)).toEqual(before.state)
}

describe('authoritative Exchange Batch', () => {
  it('rejects an overdrawn batch without consuming the choice, then settles the exact legal retry', () => {
    const session = createSession()
    const pending = session.takeAnytimeAction(0, 'exchange')
    const index = exchangeIndex(pending, 'Major_Fireplace1', 'sheep')
    assertRejectedUnchanged(session, `bulk:${index}=2`)
    assertRejectedUnchanged(session, `trade:${index}:2`)

    const settled = session.resolveChoice(0, `bulk:${index}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 2 })
    expect(Object.values(settled.state.players[0]!.houseAnimals)).not.toContain('sheep')
    const exchanged = settled.state.events.filter((event) => event.type === 'resource.exchanged')
    expect(exchanged).toMatchObject([{ paid: { sheep: 1 }, gained: { food: 2 }, times: 1 }])
    expect(settled.state.log.filter((entry) => entry.key === 'log.actionDetail')).toHaveLength(1)
    expect(settled.interaction.stateId).toBe('idle')
    expect(settled.scores).toBeDefined()
    session.dispose()
  })

  it('counts repeated recipe entries against the same acquisition allowance', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.occupationPlayed = ['B104_SheepWalker']
      player.minorPlayed = ['E053_BoarSpear']
      player.resources.boar = 1
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'boar' }
      player.pastures = [{
        id: 'sheep', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
        animalType: 'sheep', animalCount: 1,
      }]
    })
    const pending = session.takeAnytimeAction(0, 'exchange')
    const walker = exchangeIndex(pending, 'B104_SheepWalker', 'sheep')
    const reaction = session.resolveChoice(0, `trade:${walker}:1`)
    if (reaction.interaction.stateId !== 'wait' || reaction.interaction.request.kind !== 'choice') {
      throw new Error('Expected the optional Boar Spear reaction')
    }
    const useSpear = reaction.interaction.request.options.find((entry) => entry.value !== '__skip__')
    if (!useSpear) throw new Error('Expected Boar Spear to offer its exchange')
    const spearPending = session.resolveChoice(0, useSpear.value)
    const spear = exchangeIndex(spearPending, 'E053_BoarSpear', 'boar')
    assertRejectedUnchanged(session, 'bulk:1=1') // Fireplace is not this reaction's source.
    assertRejectedUnchanged(session, `bulk:${spear}=1,${spear}=1`)
    let settled = session.resolveChoice(0, `bulk:${spear}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1, food: 4 })
    expect(settled.interaction.stateId).toBe('wait')
    if (settled.interaction.stateId !== 'wait' || settled.interaction.request.kind !== 'animal-reorg') {
      throw new Error('Expected remaining boar placement')
    }
    settled = session.resolveChoice(0, 'confirm', { zones: settled.interaction.request.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.events.filter((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === 'E053_BoarSpear',
    )).toMatchObject([{ paid: { boar: 1 }, gained: { food: 4 }, times: 1 }])
    session.dispose()
  })

  it('uses earlier recipe goods for later recipes, but rejects the reverse order atomically', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['M081_PeatBoat']
      player.resources.sheep = 0
      player.resources.fuel = 2
      player.houseAnimals = {}
    }, true)
    const pending = session.takeAnytimeAction(0, 'exchange')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') {
      throw new Error('Expected Peat Boat exchange')
    }
    const peat = pending.interaction.request.options.find((entry) =>
      entry.sourceCard === 'M081_PeatBoat' && entry.effectPreview?.resourcesGained?.sheep === 1,
    )
    if (!peat) throw new Error('Expected the fuel-to-sheep recipe')
    const peatIndex = Number(peat.value.split(':')[1])
    // Fireplace is the first owned source; its sheep recipe precedes Peat Boat.
    const sheepRecipeIndex = 0
    assertRejectedUnchanged(session, `bulk:${sheepRecipeIndex}=1,${peatIndex}=1`)
    assertRejectedUnchanged(session, `bulk:${peatIndex}=1,${sheepRecipeIndex}=2`)
    assertRejectedUnchanged(session, `bulk:${peatIndex}=1,999=1`)
    assertRejectedUnchanged(session, `bulk:${peatIndex}=1`, 1)

    const settled = session.resolveChoice(0, `bulk:${peatIndex}=1,${sheepRecipeIndex}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ fuel: 0, sheep: 0, food: 2 })
    expect(settled.interaction.stateId).toBe('idle')
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged')).toMatchObject([
      { exchangeSource: 'M081_PeatBoat', paid: { fuel: 2 }, gained: { sheep: 1 }, times: 1 },
      { exchangeSource: 'Major_Fireplace1', paid: { sheep: 1 }, gained: { food: 2 }, times: 1 },
    ])
    expect(settled.state.players[0]!.stats?.resourcesConverted).toMatchObject({ fuel: 2, sheep: 1 })
    session.dispose()
  })

  it('does not turn newly acquired unplaced animals into a farmyard payment', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['M081_PeatBoat']
      player.occupationPlayed = ['B104_SheepWalker']
      player.resources.fuel = 2
    }, true)
    const pending = session.takeAnytimeAction(0, 'exchange')
    const sheep = exchangeIndex(pending, 'Major_Fireplace1', 'sheep')
    const walker = exchangeIndex(pending, 'B104_SheepWalker', 'sheep')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') {
      throw new Error('Expected exchange choice')
    }
    const peat = pending.interaction.request.options.find((entry) =>
      entry.sourceCard === 'M081_PeatBoat' && entry.effectPreview?.resourcesGained?.sheep === 1,
    )
    if (!peat) throw new Error('Missing Peat Boat sheep recipe')
    const peatIndex = Number(peat.value.split(':')[1])
    assertRejectedUnchanged(session, `bulk:${peatIndex}=1,${sheep}=1,${walker}=1`)
    const settled = session.resolveChoice(0, `bulk:${peatIndex}=1,${sheep}=2`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ fuel: 0, sheep: 0, food: 4, boar: 0 })
    expect(Object.values(settled.state.players[0]!.houseAnimals)).not.toContain('sheep')
    expect(settled.interaction.stateId).toBe('idle')
    session.dispose()
  })

  it('cannot prepay a later recipe with an unclaimed batch reaction reward', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements.push('Major_Moor_FurnitureStall')
      player.minorPlayed = ['M115_OakBark']
      player.resources.sheep = 0
      player.resources.boar = 1
      player.resources.wood = 0
      player.resources.clay = 0
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'boar' }
    }, true)
    const pending = session.takeAnytimeAction(0, 'exchange')
    const boar = exchangeIndex(pending, 'Major_Fireplace1', 'boar')
    // The owned Furniture Stall follows Fireplace's four anytime recipes.
    const furniture = 4
    assertRejectedUnchanged(session, `bulk:${boar}=1,${furniture}=1`)
    const cooked = session.resolveChoice(0, `bulk:${boar}=1`)
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[0]!.resources).toMatchObject({ boar: 0, food: 2, wood: 1, clay: 0 })
    expect(cooked.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === 'M115_OakBark',
    )).toHaveLength(1)

    const next = session.takeAnytimeAction(0, 'exchange')
    const wood = exchangeIndex(next, 'Major_Moor_FurnitureStall', 'wood')
    const settled = session.resolveChoice(0, `bulk:${wood}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0, clay: 1 })
    expect(settled.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === 'M115_OakBark',
    )).toHaveLength(1)
    session.dispose()
  })

  it('restores the same pending batch and closes cooking reactions once after undo and retry', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['C053_GypsysCrock']
      player.resources.sheep = 2
      player.houseAnimals = {}
      player.pastures = [{
        id: 'sheep', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
        animalType: 'sheep', animalCount: 2,
      }]
    })
    const pending = session.takeAnytimeAction(0, 'exchange')
    const sheep = exchangeIndex(pending, 'Major_Fireplace1', 'sheep')
    const restored = restoreSession(session)
    expect(restored.getState().interaction).toEqual(pending.interaction)
    const expected = session.resolveChoice(0, `bulk:${sheep}=2`)
    const resumed = restored.resolveChoice(0, `bulk:${sheep}=2`)
    expect(expected.ok, expected.error).toBe(true)
    expect(resumed.ok, resumed.error).toBe(true)
    expect(resumed.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 5 })
    expect(resumed.state.players[0]!.resources).toEqual(expected.state.players[0]!.resources)
    expect(resumed.scores).toEqual(expected.scores)
    expect(resumed.state.players[0]!.cardStates.C053_GypsysCrock?.extraData?.cookedCount).toBe(0)

    const undone = restored.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ sheep: 2, food: 0 })
    expect(undone.interaction).toEqual(pending.interaction)
    const retried = restored.resolveChoice(0, `bulk:${sheep}=2`)
    expect(retried.ok, retried.error).toBe(true)
    expect(retried.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 5 })
    expect(retried.state.events.filter((event) => event.type === 'resource.exchanged')).toHaveLength(1)
    expect(retried.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === 'C053_GypsysCrock',
    )).toHaveLength(1)
    expect(retried.state.players[0]!.cardStates.C053_GypsysCrock?.extraData?.cookedCount).toBe(0)
    restored.dispose()
    session.dispose()
  })

  it.each([
    { horseFirst: false, bonus: 1 },
    { horseFirst: true, bonus: 0 },
  ])('uses each recipe\'s pre-payment horses for Leather Saddle ($horseFirst)', ({ horseFirst, bonus }) => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = ['Major_Moor_Cookhouse1']
      player.minorPlayed = ['M069_LeatherSaddle']
      player.resources.sheep = 0
      player.resources.horse = 3
      player.resources.cattle = 1
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'cattle' }
      player.pastures = [{
        id: 'horses', size: 2, tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], stables: 0,
        animalType: 'horse', animalCount: 3,
      }]
    }, true)
    const pending = session.takeAnytimeAction(0, 'exchange')
    const cattle = exchangeIndex(pending, 'Major_Moor_Cookhouse1', 'cattle')
    const horse = exchangeIndex(pending, 'Major_Moor_Cookhouse1', 'horse')
    const sequence = horseFirst ? `${horse}=1,${cattle}=1` : `${cattle}=1,${horse}=1`
    const settled = session.resolveChoice(0, `bulk:${sequence}`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ horse: 2, cattle: 0, food: 6 })
    expect(settled.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    expect(bonusScore(settled, 'M069_LeatherSaddle')).toBe(bonus)
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged')).toHaveLength(2)
    session.dispose()
  })

  it('records every paid resource of a compound recipe and synchronizes its animal zones', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['C050_StableYard']
      player.resources.boar = 1
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'boar' }
      player.pastures = [{
        id: 'sheep', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
        animalType: 'sheep', animalCount: 1,
      }]
    })
    const pending = session.takeAnytimeAction(0, 'exchange')
    const index = exchangeIndex(pending, 'C050_StableYard', 'sheep')
    let settled = session.resolveChoice(0, `bulk:${index}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 1, food: 0 })
    expect(settled.state.players[0]!.stats?.resourcesConverted).toMatchObject({ sheep: 1, boar: 1 })
    if (settled.interaction.stateId !== 'wait' || settled.interaction.request.kind !== 'animal-reorg') {
      throw new Error('Expected new cattle placement')
    }
    settled = session.resolveChoice(0, 'confirm', { zones: settled.interaction.request.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'cattle', animalCount: 1 })
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged')).toMatchObject([
      { exchangeSource: 'C050_StableYard', paid: { sheep: 1, boar: 1 }, gained: { cattle: 1 }, times: 1 },
    ])
    session.dispose()
  })
})
