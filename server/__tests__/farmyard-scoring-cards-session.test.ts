import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { FarmTilePosition, PlayerState } from '../../shared/contract/types'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getFarmyardTilePositions, positionKey } from '../../shared/domain/farmyard-geometry'
import { setWorkersAtHome } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = (cardId: string, configure: (player: PlayerState) => void) => {
  const session = createWorkSession({
    seed: { A031_DebtSecurity: 429001, B031_PotteryYard: 429002, D033_SummerHouse: 429003, E034_LandRegister: 429004 }[cardId] ?? 429001,
    options: { playerCount: 2, enableFarmersOfTheMoor: true },
    configure: state => {
      state.round = 2
      for (const player of state.players) {
        player.resources = { wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0, fuel: 20, horse: 0 }
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.fields = []
        player.farmTerrain = []
        player.farmyardSpaceStates = []
        player.farmyardExtensions = []
        player.pastures = []
        player.fenceSegments = []
        player.stableTiles = []
        player.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
        setWorkersAtHome(state, player, 2)
      }
      const player = state.players[0]!
      player.minorPlayed = [cardId]
      configure(player)
    },
  })
  sessions.push(session)
  return session
}

const fillOtherSpaces = (player: PlayerState, unused: FarmTilePosition[] = []) => {
  const excluded = new Set([
    ...player.roomTiles.map(positionKey),
    ...unused.map(positionKey),
    ...(player.farmTerrain ?? []).map(positionKey),
    ...(player.farmyardSpaceStates ?? []).map(space => space.spaceKey),
  ])
  player.fields = getFarmyardTilePositions(player)
    .filter(tile => !excluded.has(positionKey(tile)))
    .map(tile => ({ ...tile, stacks: [] }))
}

const extension = [{ row: 0, col: 5 }, { row: 1, col: 5 }]

const assertBonus = (session: GameSession, cardId: string, expected: number, empty: number) => {
  const before = session.getState()
  const state = before.state
  const effect = session.withCtx(() => getCardEffect(cardId)?.computeBonusScore)
  assert.ok(effect)
  expect(session.withCtx(() => effect(state, state.players[0]!))).toBe(expected)
  const score = before.scores[0]!
  expect(score.categories.find(category => category.key === 'cardBonusVp')?.entries
    .find(entry => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0).toBe(expected)
  expect(score.categories.find(category => category.key === 'empty')).toMatchObject({ quantity: empty, total: empty === 0 ? 0 : -empty })
  expect(session.getState()).toEqual(before)
  const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const restored = new GameSession(rehydrateState(snapshot))
  sessions.push(restored)
  expect(restored.getState().scores).toEqual(before.scores)
  expect(restored.getState().state.players[0]).toEqual(state.players[0])
}

describe('farmyard scoring cards share canonical used spaces', () => {
  it('Debt Security includes unused extension spaces and never produces a negative full-farm bonus', () => {
    for (const full of [false, true]) {
      const session = setup('A031_DebtSecurity', player => {
        player.improvements = ['Major_Well', 'Major_Pottery']
        player.farmyardExtensions = [{ id: 'extension', tiles: extension }]
        fillOtherSpaces(player, full ? [] : extension)
      })
      assertBonus(session, 'A031_DebtSecurity', full ? 0 : 2, full ? 0 : 2)
    }
  })

  it('Pottery Yard recognizes adjacent unused extension spaces but not terrain or blocked spaces', () => {
    for (const occupied of ['empty', 'forest', 'moor', 'blocked']) {
      const session = setup('B031_PotteryYard', player => {
        player.improvements = ['Major_Pottery']
        player.farmyardExtensions = [{ id: 'extension', tiles: extension }]
        if (occupied === 'forest' || occupied === 'moor') {
          player.farmTerrain = extension.map(tile => ({ ...tile, kind: occupied }))
        } else if (occupied === 'blocked') {
          player.farmyardSpaceStates = extension.map(tile => ({
            spaceKey: positionKey(tile), sourceCardId: 'M070_RidingStables', kind: 'blocked-farmyard-space', blocksPlacement: true,
          }))
        }
        fillOtherSpaces(player, extension)
      })
      assertBonus(session, 'B031_PotteryYard', occupied === 'empty' ? 2 : 0, occupied === 'empty' ? 2 : 0)
    }
  })

  it('Summer House counts each unused extension space adjacent to the house once', () => {
    for (const occupied of [false, true]) {
      const session = setup('D033_SummerHouse', player => {
        player.houseType = 'stone'
        player.roomTiles = [{ row: 0, col: 4 }, { row: 1, col: 4 }]
        player.farmyardExtensions = [{ id: 'extension', tiles: extension }]
        if (occupied) {
          player.farmTerrain = [{ ...extension[0]!, kind: 'forest' }]
          player.farmyardSpaceStates = [{
            spaceKey: '1-5', sourceCardId: 'M070_RidingStables', kind: 'blocked-farmyard-space', blocksPlacement: true,
          }]
        }
        fillOtherSpaces(player, extension)
      })
      assertBonus(session, 'D033_SummerHouse', occupied ? 0 : 4, occupied ? 0 : 2)
    }
  })

  it('Land Register requires every extension space used and accepts terrain and blocked spaces', () => {
    for (const coverage of ['unused-extension', 'full-fields', 'full-mixed']) {
      const session = setup('E034_LandRegister', player => {
        player.farmyardExtensions = [{ id: 'extension', tiles: extension }]
        if (coverage === 'full-mixed') {
          player.farmTerrain = [{ ...extension[0]!, kind: 'forest' }, { row: 0, col: 1, kind: 'moor' }]
          player.farmyardSpaceStates = [{
            spaceKey: '1-5', sourceCardId: 'M070_RidingStables', kind: 'blocked-farmyard-space', blocksPlacement: true,
          }]
        }
        fillOtherSpaces(player, coverage === 'unused-extension' ? extension : [])
      })
      assertBonus(session, 'E034_LandRegister', coverage === 'unused-extension' ? 0 : 2, coverage === 'unused-extension' ? 2 : 0)
    }
  })

  it('Pottery Yard excludes a lone unused space and diagonally separated extension spaces', () => {
    for (const unused of [[extension[0]!], [{ row: 0, col: 5 }, { row: 1, col: 6 }]]) {
      const session = setup('B031_PotteryYard', player => {
        player.improvements = ['Major_Pottery']
        player.farmyardExtensions = [{ id: 'extension', tiles: [...extension, { row: 1, col: 6 }] }]
        fillOtherSpaces(player, unused)
      })
      assertBonus(session, 'B031_PotteryYard', 0, unused.length)
    }
  })

  it('Summer House does not multiply one unused space adjacent to three rooms', () => {
    const session = setup('D033_SummerHouse', player => {
      player.houseType = 'stone'
      player.rooms = 3
      player.roomTiles = [{ row: 0, col: 1 }, { row: 1, col: 0 }, { row: 2, col: 1 }]
      fillOtherSpaces(player, [{ row: 1, col: 1 }])
    })
    assertBonus(session, 'D033_SummerHouse', 2, 1)
  })

  it('Debt Security counts terrain and blocked extension spaces as occupied', () => {
    const session = setup('A031_DebtSecurity', player => {
      player.improvements = ['Major_Well', 'Major_Pottery']
      player.farmyardExtensions = [{ id: 'extension', tiles: extension }]
      player.farmTerrain = [{ ...extension[0]!, kind: 'forest' }, { row: 0, col: 1, kind: 'moor' }]
      player.farmyardSpaceStates = [{
        spaceKey: '1-5', sourceCardId: 'M070_RidingStables', kind: 'blocked-farmyard-space', blocksPlacement: true,
      }]
      fillOtherSpaces(player)
    })
    assertBonus(session, 'A031_DebtSecurity', 0, 0)
  })

  it.each(['A031_DebtSecurity', 'B031_PotteryYard', 'D033_SummerHouse', 'E034_LandRegister'])(
    '%s recognizes a derived fenced pasture without double counting its stable', cardId => {
      for (const withStable of [false, true]) {
        const session = setup(cardId, player => {
          player.improvements = ['Major_Well', 'Major_Pottery']
          player.houseType = 'stone'
          fillOtherSpaces(player, [{ row: 2, col: 4 }])
          player.stableTiles = withStable ? [{ row: 2, col: 4 }] : []
          player.fenceSegments = ['H-2-4', 'H-3-4', 'V-2-4', 'V-2-5'].map(edge => ({ edge, type: 'fence' }))
          player.pastures = [{ id: 'derived', tiles: [], animalType: null, animalCount: 0 }]
        })
        assertBonus(session, cardId, cardId === 'E034_LandRegister' ? 2 : 0, 0)
      }
    },
  )

  it.each(['A031_DebtSecurity', 'B031_PotteryYard', 'D033_SummerHouse', 'E034_LandRegister'])(
    '%s contributes no scoring entry while only in hand', cardId => {
      const session = setup(cardId, player => {
        player.minorPlayed = []
        player.minorHand = [cardId]
        player.improvements = ['Major_Well', 'Major_Pottery']
        player.houseType = 'stone'
        fillOtherSpaces(player)
      })
      const response = session.getState()
      expect(response.scores[0]!.categories.flatMap(category => category.entries)
        .some(entry => 'cardId' in entry && entry.cardId === cardId)).toBe(false)
      expect(session.getState()).toEqual(response)
    },
  )
})
