import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/D/D154_ChimneySweep'
import '../../shared/cards/A/A087_Conservator'
import { D154_ChimneySweep } from '../../shared/cards/D/D154_ChimneySweep'

const CARD_ID = 'D154_ChimneySweep'

type SetupOptions = {
  houseType?: 'wood' | 'clay' | 'stone'
  rooms?: number
  resources?: Partial<Record<string, number>>
  occupationsP1?: string[]
  p2HouseType?: 'wood' | 'clay' | 'stone'
  round?: number
}

const setup = (options: SetupOptions = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options.round ?? 5

  const p1 = state.players[0]!
  p1.occupationPlayed = options.occupationsP1 ?? [CARD_ID]
  p1.houseType = options.houseType ?? 'clay'
  p1.rooms = options.rooms ?? 2
  if (options.resources) {
    Object.assign(p1.resources, options.resources)
  }
  setWorkersAtHome(state, p1, 2)

  const p2 = state.players[1]!
  p2.houseType = options.p2HouseType ?? 'wood'

  // Placeholder hands: random minors dealt by `new GameSession()` are
  // non-deterministic. Some random cards can hook into renovation flow
  // (compute-cost / compute-choice-candidates) and shift the choice/auto
  // path between runs. Placeholder ids resolve to undefined in card
  // lookups and never participate.
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }

  const space = state.actionSpaces.find((s) => s.id === 'house-redevelopment')
  if (space) {
    space.roundAvailable = 1
    space.takenBy = []
  }

  session.loadState(state)
  return session
}

describe('D154_ChimneySweep card definition', () => {
  it('has players: 4+ (parity)', () => {
    expect(D154_ChimneySweep.players).toBe('4+')
  })
})

describe('D154_ChimneySweep renovation cost hook', () => {
  it('UC1: clay→stone costs 2 stone less (only 2 stone for 2 rooms → 0 charged)', () => {
    const session = setup({
      houseType: 'clay',
      rooms: 2,
      resources: { stone: 3, reed: 1 },
    })

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    expect(p1.houseType).toBe('stone')
    // rooms=2, base cost 2 stone, D154 -2 → 0 stone charged
    expect(p1.resources.stone).toBe(3)
    expect(p1.resources.reed).toBe(0)
  })

  it('UC2: without D154 the discount does not apply', () => {
    const session = setup({
      houseType: 'clay',
      rooms: 2,
      resources: { stone: 3, reed: 1 },
      occupationsP1: [],
    })

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    expect(p1.houseType).toBe('stone')
    // rooms=2, base cost 2 stone, no discount
    expect(p1.resources.stone).toBe(1)
  })

  it('UC3: wood→stone (A87 Conservator direct-upgrade) also gets 2 stone discount', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1, clay: 0 },
      occupationsP1: [CARD_ID, 'A087_Conservator'],
    })

    // With placeholder hands the renovation path has a single affordable
    // candidate (clay tier is not affordable — clay=0; stone tier IS
    // affordable: D154 gives -2 stone, A87 enables wood→stone direct).
    // The engine auto-resolves the single option, so takeAction completes
    // without surfacing a choice.
    let resp = session.takeAction(0, 'house-redevelopment')
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'choice') {
      resp = session.resolveChoice(0, 'stone')
    }

    expect(resp.ok).toBe(true)
    const p1 = resp.state.players[0]!
    expect(p1.houseType).toBe('stone')
    // rooms=2, base cost 2 stone, D154 -2 → 0 stone charged
    expect(p1.resources.stone).toBe(2)
    expect(p1.resources.reed).toBe(0)
  })

  it('UC4: wood→clay is unaffected (no stone in base cost, clamp keeps it at 0)', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { clay: 3, reed: 1, stone: 0 },
    })

    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)

    const p1 = resp.state.players[0]!
    expect(p1.houseType).toBe('clay')
    expect(p1.resources.clay).toBe(1)
    expect(p1.resources.stone).toBe(0)
    expect(p1.resources.reed).toBe(0)
  })
})

describe('D154_ChimneySweep bonus scoring', () => {
  const scoreContext = { reserved: {} }

  it('UC5a: +1 per other player living in stone house', () => {
    const session = setup({ p2HouseType: 'stone' })
    const state = session.getState().state
    const p1 = state.players[0]!

    const effect = getCardEffect(CARD_ID)
    expect(effect?.computeBonusScore).toBeDefined()
    const score = effect!.computeBonusScore!(state, p1, scoreContext)
    expect(score).toBe(1)
  })

  it('UC5b: 0 when other player is not in stone house', () => {
    const session = setup({ p2HouseType: 'clay' })
    const state = session.getState().state
    const p1 = state.players[0]!

    const score = getCardEffect(CARD_ID)!.computeBonusScore!(state, p1, scoreContext)
    expect(score).toBe(0)
  })

  it('UC5c: owner living in stone house does not count themselves', () => {
    const session = setup({ houseType: 'stone', p2HouseType: 'wood' })
    const state = session.getState().state
    const p1 = state.players[0]!

    const score = getCardEffect(CARD_ID)!.computeBonusScore!(state, p1, scoreContext)
    expect(score).toBe(0)
  })

})
