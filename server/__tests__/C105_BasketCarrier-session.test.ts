import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setNewbornCount } from '../../shared/domain/player'
import { C105_BasketCarrier } from '../../shared/cards/C/C105_BasketCarrier'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { PlayerState, Resource } from '../../shared/contract/types'
import { confirmNextPlayer } from './_helpers/legacy-confirms'

const CARD_ID = 'C105_BasketCarrier'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1', name: 'P1', color: 'red',
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
    vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  } as Resource,
  rooms: 2, houseType: 'wood', fields: [], fences: 0,
  roomTiles: [], stableTiles: [],
  improvements: [], minorHand: [], minorPlayed: [],
  occupationHand: [], occupationPlayed: [],
  houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
  pastures: [], fenceSegments: [],
  majorEffects: { wellRounds: 0 },
  startPlayer: false, activeModifiers: [], cardStates: {},
  ...overrides,
})

describe('C105_BasketCarrier — reverse trade metadata', () => {
  it('declares reverse trade (food:2 -> wood/reed/grain x1, max:1, harvest)', () => {
    const exchanges = C105_BasketCarrier.exchanges ?? []
    expect(exchanges).toHaveLength(1)
    const ex = exchanges[0]!
    expect(ex.from).toEqual({ food: 2 })
    expect(ex.to).toEqual({ wood: 1, reed: 1, grain: 1 })
    expect(ex.max).toBe(1)
    expect(ex.sourceId).toBe(CARD_ID)
    expect(ex.triggers).toEqual(['harvest'])
  })

  it('appears in harvest window', () => {
    const player = makePlayer({ occupationPlayed: [CARD_ID] })
    const trades = getExchangesInWindow(player, 'harvest')
    expect(trades).toHaveLength(1)
    expect(trades[0]!.from.food).toBe(2)
  })

  it('reverse trade applies bidirectionally via confirmHarvestFeed (food -2, wood/reed/grain +1)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 0)
    // family=2 → required = 4 food. Give the player 6 food so they can spend
    // 2 extra on the C105 reverse trade after the regular feeding.
    player.resources.food = 6
    player.occupationPlayed.push(CARD_ID)

    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)

    // Player 1 starts harvest with food=6, required=4 → useFood=4, remaining=0,
    // but feed-queue entry condition includes hasAnyHarvestExchange so we still
    // get a harvestFeed prompt. Player can spend 2 more food on reverse trade.
    let safety = 30
    let confirmedReverse = false
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.request.kind === 'feed') {
        if (resp.interaction.playerIndex === 0 && !confirmedReverse) {
          // Submit reverse trade selection: 1 invocation of C105 trade.
          resp = session.resolveChoice(0, 'confirm', { selections: [
            { sourceId: CARD_ID, exchangeIndex: 0, count: 1 },
          ] })
          confirmedReverse = true
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
        }
      } else if (resp.interaction.request.kind === 'animal-reorg') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.zones)
      } else if (resp.interaction.request.kind === 'confirm-next-player') {
        resp = confirmNextPlayer(session)
      } else {
        const skip = resp.interaction.options?.find((o) => o.value === '__skip__')
        if (skip) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.options![0]!.value)
        }
      }
    }

    const p1 = resp.state.players[0]!
    // Started 6 food → required 4 → 2 left → spent 2 on reverse trade → 0
    expect(p1.resources.food).toBe(0)
    expect(p1.resources.wood).toBe(1)
    expect(p1.resources.reed).toBe(1)
    expect(p1.resources.grain).toBe(1)
    expect(p1.resources.begging).toBe(0)
  })

  it('reverse trade declined: empty selections leaves food untouched (or pays begging if short)', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 4

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    setActiveWorkerCount(player, 2)
    setNewbornCount(player, 0)
    player.resources.food = 6
    player.occupationPlayed.push(CARD_ID)

    const player2 = state.players[1]!
    setActiveWorkerCount(player2, 2)
    setNewbornCount(player2, 0)
    player2.resources.food = 10

    session.loadState(state)

    let resp = session.performRoundEnd()
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.request.kind === 'feed') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
      } else if (resp.interaction.request.kind === 'animal-reorg') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.zones)
      } else if (resp.interaction.request.kind === 'confirm-next-player') {
        resp = confirmNextPlayer(session)
      } else {
        const skip = resp.interaction.options?.find((o) => o.value === '__skip__')
        resp = session.resolveChoice(
          resp.interaction.playerIndex ?? 0,
          skip ? '__skip__' : resp.interaction.options![0]!.value,
        )
      }
    }
    const p1 = resp.state.players[0]!
    expect(p1.resources.food).toBe(2) // 6 - 4 required
    expect(p1.resources.wood).toBe(0)
    expect(p1.resources.reed).toBe(0)
    expect(p1.resources.grain).toBe(0)
  })
})
