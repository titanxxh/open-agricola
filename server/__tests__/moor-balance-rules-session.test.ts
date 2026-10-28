import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../shared/contract/types'
import { getCardEffect } from '../../shared/cards/card-effects'
import { collectCardsAs } from '../../shared/cards/helpers/card-type'
import { getPlayerCookeryCards } from '../../shared/cards/helpers/cookery'
import { isBottomRowMajorImprovement } from '../../shared/cards/major/supply'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { getFarmyardTilePositions, positionKey } from '../../shared/domain/farmyard-geometry'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = (cardId: string, balance: boolean, configure: (player: PlayerState, state: GameState) => void = () => {}) => {
  const session = createWorkSession({ seed: cardId === 'B132_EstateMaster' ? 429132 : 429101,
    options: { playerCount: 2, enableFarmersOfTheMoor: true, enableMoorBalanceRules: balance },
    configure: state => {
      state.round = 4
      for (const player of state.players) {
        player.resources = { wood: 0, clay: 0, reed: 0, stone: 0, food: 4, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0, fuel: 2, horse: 0 }
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.farmTerrain = []
        player.farmyardExtensions = []
        player.fields = []
        player.stableTiles = []
        player.pastures = []
        player.fenceSegments = []
        setWorkersAtHome(state, player, 2)
      }
      for (const space of state.actionSpaces) space.takenBy = []
      const player = state.players[0]!
      if (['A031_DebtSecurity', 'A033_BigCountry', 'D030_ArtisanDistrict'].includes(cardId)) player.minorPlayed = [cardId]
      else player.occupationPlayed = [cardId]
      configure(player, state)
    },
  })
  sessions.push(session)
  return session
}

const bonus = (response: SessionResponse, cardId: string) => response.scores[0]!.categories
  .find(category => category.key === 'cardBonusVp')?.entries
  .find(entry => entry.type === 'bonus' && entry.cardId === cardId)?.score ?? 0

const restore = (session: GameSession) => {
  const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const restored = new GameSession(rehydrateState(snapshot))
  sessions.push(restored)
  expect(restored.getState().scores).toEqual(session.getState().scores)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  expect(restored.getState().state.enableMoorBalanceRules).toBe(session.state.enableMoorBalanceRules)
  return restored
}

const assertComputedBonus = (session: GameSession, cardId: string, expected: number) => {
  const before = session.getState()
  const effect = session.withCtx(() => getCardEffect(cardId)?.computeBonusScore)
  assert.ok(effect)
  expect(session.withCtx(() => effect(before.state, before.state.players[0]!))).toBe(expected)
  expect(bonus(before, cardId)).toBe(expected)
  expect(session.getState()).toEqual(before)
  expect(bonus(restore(session).getState(), cardId)).toBe(expected)
}

const finishHarvest = (session: GameSession, initial = session.performRoundEnd()) => {
  let response = initial
  for (let step = 0; step < 24 && response.state.round === 4; step++) {
    expect(response.ok, response.error).toBe(true)
    assert.equal(response.interaction.stateId, 'wait')
    const request = response.interaction.request
    const actor = response.interaction.playerIndex
    if (request.kind === 'feed') response = session.resolveChoice(actor, 'confirm', { selections: [] })
    else if (request.kind === 'heating') response = session.resolveChoice(actor, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
    else if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') response = session.resolveChoice(actor, 'confirm')
    else {
      const option = request.options?.find(option => option.value === '__skip__')
      assert.ok(option, JSON.stringify(response.interaction))
      response = session.resolveChoice(actor, option.value)
    }
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.round).toBe(5)
  return response
}

const confirmTurn = (session: GameSession, response = session.getState()) => {
  if (response.interaction.stateId === 'wait' && (response.interaction.request.kind === 'confirm-next-player'
    || response.interaction.request.kind === 'confirm-player-switch')) {
    const next = session.resolveChoice(response.interaction.playerIndex, 'confirm')
    expect(next.ok, next.error).toBe(true)
    return next
  }
  return response
}

const openMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait') {
    const branch = response.interaction.request.options?.find(option => option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(0, branch.value)
  }
  if (response.state.players[0]!.minorHand.includes(cardId)) response = session.resolveChoice(0, cardId)
  expect(response.ok, response.error).toBe(true)
  return response
}

describe('Moor optional balance rules', () => {
  it('preserves major, cookery and supply identity independently of the optional scoring counts', () => {
    for (const balance of [false, true]) {
      const session = setup('A031_DebtSecurity', balance, player => {
        player.minorPlayed.push('D025_WitchesDanceFloor')
        player.improvements = ['Major_Moor_Cookhouse1']
      })
      session.withCtx(() => {
        expect(collectCardsAs(session.state.players[0]!, 'major')).toEqual(['Major_Moor_Cookhouse1', 'D025_WitchesDanceFloor'])
        expect(getPlayerCookeryCards(session.state.players[0]!).map(card => card.id)).toEqual(['Major_Moor_Cookhouse1', 'D025_WitchesDanceFloor'])
        expect(isBottomRowMajorImprovement('Major_Moor_HeatingOven')).toBe(true)
      })
      assertComputedBonus(session, 'A031_DebtSecurity', balance ? 1 : 2)
      const mayor = setup('E124_MayorCandidate', balance, player => {
        player.resources.wood = 2
        player.resources.stone = 3
      })
      assertComputedBonus(mayor, 'E124_MayorCandidate', -5)
    }
  })

  it('Administration still exchanges one food for a bonus point for the dual-type Witches Dance Floor', () => {
    for (const balance of [false, true]) {
      const cardId = 'M074_Administration'
      const session = setup(cardId, balance, (player, state) => {
        player.occupationPlayed = []
        player.minorPlayed = [cardId, 'D025_WitchesDanceFloor']
        player.resources.food = 6
        state.round = 14
        for (const owner of state.players) markAllWorkersUsed(state, owner)
      })
      let response = session.performRoundEnd()
      expect(response.ok, response.error).toBe(true)
      assert.equal(response.interaction.stateId, 'wait')
      expect(response.interaction.sourceCard).toBe(cardId)
      const options = response.interaction.request.options?.filter(option => option.value !== '__skip__')
      expect(options).toHaveLength(1)
      expect(options?.[0]?.descriptionPreview).toMatchObject({ kind: 'action', effectPreview: { kind: 'resourceExchange', bonusVp: 1 } })
      restore(session)
      const chosen = options?.[0]
      assert.ok(chosen)
      response = session.resolveChoice(0, chosen.value)
      expect(response.ok, response.error).toBe(true)
      expect(bonus(response, cardId)).toBe(1)
      expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === cardId)).toHaveLength(1)
      restore(session)
    }
  })
  it.each(['B132_EstateMaster', 'M059_NaturesFertilizer'])('keeps the qualification when %s is selected first after clearing the last forest', first => {
    const session = setup('B132_EstateMaster', true, player => {
      player.minorPlayed = ['M059_NaturesFertilizer']
      player.resources.grain = 1
      const occupied = new Set([...player.roomTiles.map(positionKey), '0-4'])
      player.farmTerrain = [{ row: 0, col: 4, kind: 'forest' }]
      player.fields = getFarmyardTilePositions(player).filter(tile => !occupied.has(positionKey(tile)))
        .map(tile => ({ ...tile, stacks: [] }))
    })
    const card = session.state.farmersOfTheMoor?.specialActionCards.find(card => card.actions.includes('slash-and-burn'))
    assert.ok(card)
    let response = session.takeSpecialAction(0, card.id, 'slash-and-burn', { tile: { row: 0, col: 4 } })
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('select-trigger')
    const order = [first, first === 'B132_EstateMaster' ? 'M059_NaturesFertilizer' : 'B132_EstateMaster']
    for (const source of order) {
      assert.equal(response.interaction.stateId, 'wait')
      const option = response.interaction.request.options?.find(option => option.sourceCard === source)
      assert.ok(option, JSON.stringify(response.interaction))
      response = session.resolveChoice(0, option.value)
      expect(response.ok, response.error).toBe(true)
      if (source === 'M059_NaturesFertilizer') {
        response = session.resolveChoice(0, '__skip__')
        expect(response.ok, response.error).toBe(true)
      }
    }
    expect(response.state.players[0]!.cardStates.B132_EstateMaster?.extraData?.saturated).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(bonus(response, 'B132_EstateMaster')).toBe(0)
    restore(session)
  })
  it('records Estate Master qualification when the card is actually played onto a full farm', () => {
    for (const balance of [false, true]) {
      const cardId = 'B132_EstateMaster'
      let session = setup(cardId, balance, player => {
        player.occupationPlayed = []
        player.occupationHand = [cardId]
        player.minorHand = ['M050_FarmExtension']
        player.resources.clay = 1
        const occupied = new Set(player.roomTiles.map(positionKey))
        if (!balance) {
          player.farmTerrain = [{ row: 0, col: 4, kind: 'forest' }]
          occupied.add('0-4')
        }
        player.fields = getFarmyardTilePositions(player).filter(tile => !occupied.has(positionKey(tile)))
          .map(tile => ({ ...tile, stacks: [] }))
      })
      const before = session.getState()
      expect(before.state.players[0]!.cardStates[cardId]).toBeUndefined()
      const play = () => {
        let response = session.takeAction(0, 'lessons')
        if (response.state.players[0]!.occupationHand.includes(cardId)) response = session.resolveChoice(0, cardId)
        expect(response.ok, response.error).toBe(true)
        expect(response.state.players[0]!.cardStates[cardId]?.extraData?.saturated).toBe(true)
        return response
      }
      play()
      session = restore(session)
      expect(session.undoAction().ok).toBe(true)
      expect(session.getState().state.players[0]!.cardStates[cardId]?.extraData?.saturated).not.toBe(true)
      confirmTurn(session, play())
      confirmTurn(session, session.takeAction(1, 'forest'))
      openMinor(session, 'M050_FarmExtension')
      const response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 5 }, { row: 1, col: 5 }] })
      expect(response.ok, response.error).toBe(true)
      expect(response.scores[0]!.categories.find(category => category.key === 'empty')?.total).toBe(-2)
      expect(response.state.players[0]!.cardStates[cardId]?.extraData?.saturated).toBe(true)
      restore(session)
    }
  })
  it('Estate Master remembers the last forest conversion before a real extension and Harvest', () => {
    const cardId = 'B132_EstateMaster'
    let session = setup(cardId, true, player => {
      player.roomTiles = [{ row: 2, col: 0 }, { row: 1, col: 0 }]
      const occupied = new Set([...player.roomTiles.map(positionKey), '0-4'])
      player.farmTerrain = [{ row: 0, col: 4, kind: 'forest' }]
      player.fields = getFarmyardTilePositions(player).filter(tile => !occupied.has(positionKey(tile)))
        .map(tile => ({ ...tile, stacks: tile.row === 2 && tile.col === 1 ? [{ kind: 'vegetable', remaining: 2 }] : [] }))
      player.minorHand = ['M050_FarmExtension']
      player.resources.clay = 1
    })
    const specialCard = session.state.farmersOfTheMoor?.specialActionCards.find(card => card.actions.includes('slash-and-burn'))
    assert.ok(specialCard)
    const slash = () => session.takeSpecialAction(0, specialCard.id, 'slash-and-burn', { tile: { row: 0, col: 4 } })
    let response = slash()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toEqual([])
    expect(response.state.players[0]!.fields).toHaveLength(13)
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.saturated).toBe(true)
    expect(response.scores[0]!.categories.find(category => category.key === 'empty')?.total).toBe(0)
    session = restore(session)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmTerrain).toHaveLength(1)
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.saturated).not.toBe(true)
    response = slash()
    expect(response.ok, response.error).toBe(true)
    response = confirmTurn(session, response)
    expect(response.state.currentPlayerIndex).toBe(1)
    response = confirmTurn(session, session.takeAction(1, 'forest'))
    expect(response.state.currentPlayerIndex).toBe(0)

    response = openMinor(session, 'M050_FarmExtension')
    expect(response.interaction.stateId === 'wait' && response.interaction.request.selection?.kind).toBe('farm-position')
    session = restore(session)
    const commitExtension = () => session.commitSelectionChoice(0, { positions: [{ row: 0, col: 5 }, { row: 1, col: 5 }] })
    response = commitExtension()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.farmyardExtensions).toHaveLength(1)
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.saturated).toBe(true)
    expect(response.scores[0]!.categories.find(category => category.key === 'empty')).toMatchObject({ quantity: 2, total: -2 })
    session = restore(session)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.farmyardExtensions).toEqual([])
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.saturated).toBe(true)
    openMinor(session, 'M050_FarmExtension')
    response = commitExtension()
    expect(response.ok, response.error).toBe(true)
    confirmTurn(session, response)
    confirmTurn(session, session.takeAction(1, 'clay-pit'))
    response = session.takeAction(0, 'grain-seeds')
    response = finishHarvest(session, response)
    expect(bonus(response, cardId)).toBe(1)
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 0, fuel: 0, begging: 0 })
    expect(response.state.players[0]!.cardStates[cardId]?.extraData?.saturated).toBe(true)
    restore(session)
  })
  it('Estate Master does not qualify a terrain-covered full farm when balance is enabled', () => {
    for (const balance of [false, true]) {
      const cardId = 'B132_EstateMaster'
      const session = setup(cardId, balance, (player, state) => {
        const occupied = new Set([...player.roomTiles.map(positionKey), '0-4'])
        player.farmTerrain = [{ row: 0, col: 4, kind: 'forest' }]
        player.fields = getFarmyardTilePositions(player).filter(tile => !occupied.has(positionKey(tile)))
          .map(tile => ({ ...tile, stacks: tile.row === 2 && tile.col === 1 ? [{ kind: 'vegetable', remaining: 2 }] : [] }))
        for (const owner of state.players) markAllWorkersUsed(state, owner)
      })
      const before = session.getState()
      expect(before.state.players[0]!.cardStates[cardId]?.extraData?.saturated).toBeUndefined()
      expect(session.getState()).toEqual(before)
      const response = finishHarvest(session)
      expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 1, food: 0, fuel: 0, begging: 0 })
      expect(bonus(response, cardId)).toBe(balance ? 0 : 1)
      expect(bonus(restore(session).getState(), cardId)).toBe(balance ? 0 : 1)
    }
  })
  it('Big Country requires cleared terrain only with balance enabled, while both modes include unused extensions', () => {
    for (const balance of [false, true]) for (const terrain of ['forest', 'moor', 'none', 'unused-extension']) {
      const cardId = 'A033_BigCountry'
      const session = setup(cardId, balance, player => {
        player.minorPlayed = []
        player.minorHand = [cardId]
        const occupied = new Set(player.roomTiles.map(positionKey))
        if (terrain === 'forest' || terrain === 'moor') {
          player.farmTerrain = [{ row: 0, col: 4, kind: terrain }]
          occupied.add('0-4')
        }
        player.fields = getFarmyardTilePositions(player).filter(tile => !occupied.has(positionKey(tile)))
          .map(tile => ({ ...tile, stacks: [] }))
        if (terrain === 'unused-extension') player.farmyardExtensions = [{ id: 'extra', tiles: [{ row: 0, col: 5 }, { row: 1, col: 5 }] }]
      })
      const expected = terrain !== 'unused-extension' && (!balance || terrain === 'none')
      let response = session.takeAction(0, 'meeting-place')
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId === 'wait') {
        const branch = response.interaction.request.options?.find(option => option.value.startsWith('action-improvement-'))
        if (branch) response = session.resolveChoice(0, branch.value)
      }
      if (response.state.players[0]!.minorHand.includes(cardId)) {
        const before = session.getState()
        response = session.resolveChoice(0, cardId)
        if (!expected) expect(session.getState()).toEqual(before)
      }
      expect(response.ok, JSON.stringify({ balance, terrain, error: response.error, interaction: response.interaction })).toBe(expected)
      expect(response.state.players[0]!.minorPlayed.includes(cardId)).toBe(expected)
      expect(response.state.players[0]!.resources.food).toBe(expected ? 24 : 4)
      expect(bonus(response, cardId)).toBe(expected ? 10 : 0)
    }
  })
  it('Prodigy snapshots the chosen balance count when actually played as the first occupation', () => {
    for (const balance of [false, true]) {
      const cardId = 'E098_Prodigy'
      const session = setup(cardId, balance, player => {
        player.occupationPlayed = []
        player.occupationHand = [cardId]
        player.improvements = ['Major_Well', 'Major_Moor_HeatingOven']
      })
      let response = session.takeAction(0, 'lessons')
      expect(response.ok, response.error).toBe(true)
      if (response.state.players[0]!.occupationHand.includes(cardId)) response = session.resolveChoice(0, cardId)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(cardId)
      expect(bonus(response, cardId)).toBe(balance ? 1 : 2)
      expect(bonus(restore(session).getState(), cardId)).toBe(balance ? 1 : 2)
      expect(session.undoAction().ok).toBe(true)
      expect(bonus(session.getState(), cardId)).toBe(0)
    }
  })
  it('Artisan District excludes Moor bottom-row facilities only from its optional bonus', () => {
    for (const balance of [false, true]) {
      const session = setup('D030_ArtisanDistrict', balance, player => {
        player.improvements = ['Major_Moor_HeatingOven', 'Major_Moor_TiledOven', 'Major_Moor_FurnitureStall']
      })
      assertComputedBonus(session, 'D030_ArtisanDistrict', balance ? 0 : 2)
    }
  })
  it('Cookery Outfitter filters the Cookhouse only from its optional bonus', () => {
    for (const balance of [false, true]) {
      const session = setup('A101_CookeryOutfitter', balance, player => {
        player.improvements = ['Major_Moor_Cookhouse1']
      })
      assertComputedBonus(session, 'A101_CookeryOutfitter', balance ? 0 : 1)
    }
  })
  it('Debt Security filters Moor majors without changing the canonical unused-space cap', () => {
    for (const balance of [false, true]) {
      const session = setup('A031_DebtSecurity', balance, player => {
        player.improvements = ['Major_Moor_HeatingOven']
      })
      assertComputedBonus(session, 'A031_DebtSecurity', balance ? 0 : 1)
    }
  })
  it('Housemaster excludes only Moor majors from the optional printed-value count', () => {
    for (const balance of [false, true]) {
      const session = setup('B153_Housemaster', balance, player => {
        player.improvements = ['Major_Moor_MuseumOfTheMoors']
      })
      assertComputedBonus(session, 'B153_Housemaster', balance ? 0 : 1)
    }
  })
  it('Braggart counts Moor major improvements only with balance disabled', () => {
    for (const balance of [false, true]) {
      const session = setup('A133_Braggart', balance, player => {
        player.improvements = ['Major_Well', 'Major_ClayOven', 'Major_StoneOven', 'Major_Joinery', 'Major_Moor_HeatingOven']
      })
      assertComputedBonus(session, 'A133_Braggart', balance ? 0 : 2)
    }
  })
})
