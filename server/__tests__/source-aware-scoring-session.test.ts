import { afterEach, describe, expect, it } from 'vitest'
import assert from 'node:assert/strict'
import type { GameState, PlayerState } from '../../shared/contract/types'
import type { AnimalKey } from '../../shared/contract/animals'
import { emptyResources } from '../../shared/contract/state-constants'
import { addPublicCardMarker } from '../../shared/cards/helpers/public-card-markers'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import { confirmNext, getChoiceOptions } from './_helpers/session-assertions'

const sessions: GameSession[] = []
afterEach(() => { for (const session of sessions.splice(0)) session.dispose() })

const completeFarm = (player: PlayerState) => {
  player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
  player.rooms = 2
  player.houseType = 'wood'
  player.fields = [{ row: 2, col: 0, stacks: [] }, { row: 2, col: 1, stacks: [] }]
  player.stableTiles = []
  player.houseAnimals = {}
  player.stableAnimals = {}
  const animals = [
    { row: 0, col: 3, animal: 'sheep' }, { row: 0, col: 4, animal: 'boar' },
    { row: 1, col: 3, animal: 'cattle' }, { row: 1, col: 4, animal: 'horse' },
  ] satisfies { row: number; col: number; animal: AnimalKey }[]
  player.pastures = animals.map(({ row, col, animal }, index) => ({
    id: `pasture-${index}`, size: 1, tiles: [{ row, col }], stables: 0,
    animalType: animal,
    animalCount: 1,
  }))
  const edges = new Set(player.pastures.flatMap(pasture => pasture.tiles.flatMap(({ row, col }) => [
    `H-${row}-${col}`, `H-${row + 1}-${col}`, `V-${row}-${col}`, `V-${row}-${col + 1}`,
  ])))
  player.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence' }))
  player.fences = edges.size
  const used = new Set([...player.roomTiles, ...player.fields, ...player.pastures.flatMap(p => p.tiles)]
    .map(tile => `${tile.row}-${tile.col}`))
  player.farmTerrain = Array.from({ length: 15 }, (_, i) => ({ row: Math.floor(i / 5), col: i % 5 }))
    .filter(tile => !used.has(`${tile.row}-${tile.col}`))
    .map(tile => ({ ...tile, kind: 'forest' }))
  player.resources = { ...emptyResources, food: 20, fuel: 3, grain: 1, vegetable: 1,
    sheep: 1, boar: 1, cattle: 1, horse: 1 }
}

const setup = (configure?: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 428029,
    options: { playerCount: 2, enableFarmersOfTheMoor: true },
    configure(state) {
      state.round = 14
      for (const player of state.players) {
        completeFarm(player)
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
      }
      state.players[0]!.minorPlayed = ['C031_WritingChamber']
      state.players[1]!.occupationPlayed = ['C135_Constable']
      addPublicCardMarker(state.players[0]!, 'M027_GardenPath', {
        id: 'garden-path', label: 'Garden Path', labelKey: 'cardFaces.M027_GardenPath.name',
        score: -1, sourceCardId: 'M027_GardenPath', sourcePlayerId: state.players[1]!.id,
      })
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const bonus = (response: SessionResponse, playerIndex: number, cardId: string) =>
  response.scores[playerIndex]!.categories.flatMap(category => category.entries)
    .filter(entry => entry.type === 'bonus' && entry.cardId === cardId)
    .reduce((sum, entry) => sum + entry.score, 0)

const purchaseGardenPath = (session: GameSession, actor: number, space: 'meeting-place' | 'major-improvement') => {
  let response = session.takeAction(actor, space)
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 10 && response.interaction.stateId === 'wait'; step++) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    const options = getChoiceOptions(response)
    const option = response.interaction.promptKey === 'prompt.selectPayment' ? options[0]
      : options.find(option => option.value.startsWith('action-improvement-'))
        ?? options.find(option => option.value === 'M027_GardenPath')
    assert.ok(option, JSON.stringify(response.interaction))
    response = session.resolveChoice(actor, option.value)
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  return response
}

describe('source-aware scoring rules', () => {
  it('scores the Garden Path token without treating it as an ordinary negative score', () => {
    const response = setup().getState()
    expect(bonus(response, 0, 'C031_WritingChamber')).toBe(0)
    expect(bonus(response, 0, 'C135_Constable')).toBe(3)
    expect(response.scores[0]!.total).toBe(19)
    expect(response.scores[0]!.categories.find(category => category.key === 'cardBonusVp')?.entries)
      .toContainEqual(expect.objectContaining({ type: 'marker', markerId: 'garden-path',
        cardId: 'M027_GardenPath', holderPlayerId: 'p1', sourcePlayerId: 'p2', score: -1 }))
  })

  it.each([{ sick: 0, score: 4 }, { sick: 1, score: 2 }, { sick: 2, score: 0 }])(
    'applies Old Miser to the effective farmer score with $sick sick people', ({ sick, score }) => {
    const session = setup(state => {
      const player = state.players[0]!
      player.occupationPlayed = ['E159_OldMiser']
      player.sickWorkerIds = player.workers!.filter(worker => worker.isActive).slice(0, sick).map(worker => worker.id)
    })
    const before = JSON.stringify(session.state)
    const response = session.getState()
    expect(response.scores[0]!.categories.find(category => category.key === 'farmers'))
      .toMatchObject({ total: score, entries: [{ type: 'quantity', quantity: 2, score }] })
    expect(bonus(response, 0, 'E159_OldMiser')).toBe(0)
    expect(bonus(response, 0, 'C031_WritingChamber')).toBe(0)
    expect(bonus(response, 0, 'C135_Constable')).toBe(3)
    expect(session.getState().scores).toEqual(response.scores)
    expect(JSON.stringify(session.state)).toBe(before)
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(snapshot))
    sessions.push(restored)
    expect(restored.getState().scores).toEqual(response.scores)
  })

  it.each([{ begging: 1, compensation: 3 }, { begging: 3, compensation: 7 }])(
    'counts real begging penalties while ignoring the independent token ($begging)', ({ begging, compensation }) => {
    const response = setup(state => { state.players[0]!.resources.begging = begging }).getState()
    expect(bonus(response, 0, 'C031_WritingChamber')).toBe(compensation)
    expect(bonus(response, 0, 'C135_Constable')).toBe(0)
  })

  it('keeps a true negative printed contribution visible when positive cards offset the category', () => {
    const response = setup(state => {
      const player = state.players[0]!
      player.houseType = 'clay'
      player.minorPlayed.push('B033_Mantlepiece')
      player.improvements.push('Major_Well')
    }).getState()
    expect(response.scores[0]!.categories.find(category => category.key === 'cards')?.total).toBe(1)
    expect(bonus(response, 0, 'C031_WritingChamber')).toBe(3)
    expect(bonus(response, 0, 'C135_Constable')).toBe(0)
  })

  it('preserves marker identity and scoring rules through real purchases, transfer, undo and snapshot restoration', () => {
    const session = setup(state => {
      state.players[0]!.minorHand = ['M027_GardenPath']
      for (const player of state.players) {
        player.cardStates = {}
        player.resources.clay = 2
      }
    })
    const expectHolder = (response: SessionResponse, holder: number) => {
      expect(response.state.players.flatMap(player => player.minorPlayed)).not.toContain('M027_GardenPath')
      expect(response.scores.flatMap(summary => summary.categories.flatMap(category => category.entries))
        .filter(entry => entry.type === 'marker')).toEqual([
        expect.objectContaining({ markerId: 'garden-path', cardId: 'M027_GardenPath',
          holderPlayerId: response.state.players[holder]!.id,
          sourcePlayerId: response.state.players[1 - holder]!.id, score: -1 }),
      ])
      for (let index = 0; index < 2; index++) {
        expect(bonus(response, index, 'C031_WritingChamber')).toBe(0)
        expect(bonus(response, index, 'C135_Constable')).toBe(3)
      }
    }
    const first = purchaseGardenPath(session, 0, 'meeting-place')
    expectHolder(first, 1)
    expect(first.state.players[0]!.resources).toMatchObject({ clay: 1, wood: 3 })
    expect(first.state.events).toContainEqual(expect.objectContaining({ type: 'card.passed',
      cardId: 'M027_GardenPath', fromPlayerId: 'p1', toPlayerId: 'p2' }))
    expect(first.state.log).toContainEqual(expect.objectContaining({ key: 'log.cardPassed' }))
    confirmNext(session, first)
    const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(snapshot))
    sessions.push(restored)
    expectHolder(restored.getState(), 1)
    const second = purchaseGardenPath(restored, 1, 'major-improvement')
    expectHolder(second, 0)
    expect(second.state.players[1]!.resources).toMatchObject({ clay: 1, wood: 3 })
    const undone = restored.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expectHolder(undone, 1)
    expect(undone.state.players[1]!.resources).toMatchObject({ clay: 2, wood: 0 })
    expectHolder(purchaseGardenPath(restored, 1, 'major-improvement'), 0)
  })
})
