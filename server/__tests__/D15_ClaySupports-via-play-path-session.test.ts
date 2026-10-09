import { type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A143_Stonecutter } from '../../shared/cards/A/A143_Stonecutter'
import { D015_ClaySupports } from '../../shared/cards/D/D015_ClaySupports'
import { setWorkersAtHome } from '../../shared/domain/player'
import { computePaymentOptionsForTest } from '../../shared/actions/payment/__tests__/test-helpers'

// Keep side-effect imports referenced.
void A143_Stonecutter
void D015_ClaySupports

describe('D15 ClaySupports via play-path (with A143 Stonecutter co-played)', () => {
  it('D15 trade modifier is registered via play-path with scope:unit, surfaces in construct enumeration', () => {
    // Both cards register through their cards static fields and reach
    // `player.activeModifiers` via `rebuildActiveModifiers` during loadState.
    // D15 targets `construct`; A143 contributes a BonusModifier (`construct`,
    // stone -1) plus other listener paths. This test exercises the same
    // gameplay path used by the production server (no test-only injection
    // into `activeModifiers`).
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.players.forEach((p) => {
      ;(p as any).minorHand = ['__test_placeholder__']
      ;(p as any).occupationHand = ['__test_placeholder__']
    })
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.occupationPlayed = ['A143_Stonecutter']
    player.minorPlayed = ['D015_ClaySupports']
    player.houseType = 'clay'
    player.resources = {
      ...player.resources,
      wood: 3,
      clay: 5,
      reed: 3,
      stone: 0,
    }
    session.loadState(state)

    const after = session.getState().state.players[0]!
    expect(after.minorPlayed).toContain('D015_ClaySupports')
    expect(after.occupationPlayed).toContain('A143_Stonecutter')
    expect(after.houseType).toBe('clay')

    // D15 trade modifier must be present on activeModifiers after loadState
    // with scope:'unit' (T5.2 migration).
    expect(after.activeModifiers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'trade',
          cardId: 'D015_ClaySupports',
          appliesTo: ['construct'],
          scope: 'unit',
          from: { wood: 1 },
          to: { clay: 3, reed: 1 },
          conditions: { houseTypeClay: 1 },
        }),
      ]),
    )

    // Construct enumeration for 1 clay room surfaces both base and D15 swap.
    const sols = computePaymentOptionsForTest(
      after,
      { unitFee: { clay: 5, reed: 2 }, nb: 1 },
      'construct',
    )
    expect(sols.length).toBeGreaterThan(0)

    // Σ-times across solutions covers k∈{0,1} (single room, scope:unit budget = nb = 1).
    const swapCounts = new Set(
      sols.map((s) => s.tradesUsed.reduce((acc, t) => acc + t.times, 0)),
    )
    expect(swapCounts).toEqual(new Set([0, 1]))

    // Affordability with {wood:3, clay:5, reed:3}: both k=0 and k=1 affordable.
    const k0 = sols.find((s) => s.tradesUsed.every((t) => t.times === 0))
    expect(k0).toBeDefined()
    expect(k0!.resourcesPaid.clay).toBe(5)
    expect(k0!.resourcesPaid.reed).toBe(2)

    const k1 = sols.find((s) =>
      s.tradesUsed.some((t) => t.times === 1 && t.trade.from.wood === 1),
    )
    expect(k1).toBeDefined()
    // D15 swap: pays clay:2 + reed:1 + wood:1.
    expect(k1!.resourcesPaid.clay).toBe(2)
    expect(k1!.resourcesPaid.reed).toBe(1)
    expect(k1!.resourcesPaid.wood).toBe(1)
  })
})

describe('D015 Clay Supports parity', () => {
  const CARD_ID = 'D015_ClaySupports'

  const FILLER = '__test_placeholder__'

  type BuildingResources = Partial<Record<'wood' | 'clay' | 'reed' | 'stone', number>>

  const setup = ({
    played = true, houseType = 'clay', resources = {},
  }: {
    played?: boolean
    houseType?: 'wood' | 'clay'
    resources?: BuildingResources
  } = {}) => {
    const session = new GameSession(6015, undefined, { playerCount: 2 })
    const state = session.getState().state
    stabilizeRandomHands(state.players)
    state.currentPlayerIndex = 0
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.minorHand = played ? [FILLER] : [CARD_ID]
    owner.minorPlayed = played ? [CARD_ID] : []
    owner.houseType = houseType
    owner.rooms = 2
    owner.roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }]
    owner.resources = {
      ...owner.resources,
      wood: played ? 0 : 2,
      ...resources,
    }
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playMinor = (session: GameSession) => {
    let response = session.takeAction(0, 'meeting-place')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
    if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
    return response
  }

  const openRoomSelection = (session: GameSession) => {
    let response = session.takeAction(0, 'farm-expansion')
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.options?.some((option) =>
        option.labelKey === 'actions.construct.name')) {
      const construct = response.interaction.request.options.find((option) =>
        option.labelKey === 'actions.construct.name')!
      response = session.resolveChoice(response.interaction.playerIndex, construct.value)
    }
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    expect(response.interaction.request.kind).toBe('farm-select')
    expect(response.interaction.request.farm.farmType).toBe('room')
    return response
  }

  const choosePayment = (
    session: GameSession, response: SessionResponse, expected: BuildingResources,
  ) => {
    expect(response.interaction.stateId).toBe('wait')
    expect(response.interaction.promptKey).toBe('prompt.selectPayment')
    if (response.interaction.stateId !== 'wait') return response
    const payment = response.interaction.request.options?.find((option) => {
      const paid = option.labelParams?.resourcesPaid as BuildingResources | undefined
      return paid && Object.entries(expected).every(([resource, count]) =>
        paid[resource as keyof BuildingResources] === count)
        && ['wood', 'clay', 'reed', 'stone'].every((resource) =>
          Object.hasOwn(expected, resource) || (paid[resource as keyof BuildingResources] ?? 0) === 0)
    })
    expect(payment).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, payment!.value)
  }

  const buildRooms = (session: GameSession, count: number) => {
    const selection = openRoomSelection(session)
    if (selection.interaction.stateId !== 'wait'
      || selection.interaction.request.kind !== 'farm-select') return selection
    const rooms = selection.interaction.request.farm.selectableTiles.slice(0, count)
    expect(rooms).toHaveLength(count)
    return session.commitSelectionChoice(0, { rooms })
  }

  it('D015 S1: paying two wood plays Clay Supports', () => {
    const response = playMinor(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('D015 S2: one clay room may use the two-clay one-wood one-reed replacement cost', () => {
    const session = setup({ resources: { clay: 5, wood: 1, reed: 2 } })
    let response = buildRooms(session, 1)
    response = choosePayment(session, response, { clay: 2, wood: 1, reed: 1 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 3, resources: { clay: 3, wood: 0, reed: 1 },
    })
  })

  it('D015 S3: one clay room may still use the normal five-clay two-reed cost', () => {
    const session = setup({ resources: { clay: 5, wood: 1, reed: 2 } })
    let response = buildRooms(session, 1)
    response = choosePayment(session, response, { clay: 5, reed: 2 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 3, resources: { clay: 0, wood: 1, reed: 0 },
    })
  })

  it('D015 S4: two clay rooms may each use the replacement cost', () => {
    const session = setup({ resources: { clay: 4, wood: 2, reed: 2 } })

    const response = buildRooms(session, 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'clay', rooms: 4, resources: { clay: 0, wood: 0, reed: 0 },
    })
  })

  it('D015 S5: a wooden room keeps its normal five-wood two-reed cost', () => {
    const session = setup({ houseType: 'wood', resources: { wood: 5, reed: 2 } })

    const response = buildRooms(session, 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]).toMatchObject({
      houseType: 'wood', rooms: 3, resources: { wood: 0, reed: 0 },
    })
  })
})
