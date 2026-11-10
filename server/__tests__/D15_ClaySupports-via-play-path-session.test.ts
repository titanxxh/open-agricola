import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createWorkSession } from './_helpers/session-fixtures'

describe('Clay Supports with Stonecutter', () => {
  it('uses the complete clay-room price after loading both played cards', () => {
    const session = createWorkSession({ seed: 1636, configure(state) {
      const player = state.players[0]!
      player.houseType = 'clay'
      player.occupationPlayed = ['A143_Stonecutter']
      player.minorPlayed = ['D015_ClaySupports']
      Object.assign(player.resources, { wood: 3, clay: 5, reed: 3, stone: 0 })
    } })
    try {
      let response = session.takeAction(0, 'farm-expansion')
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
        const branch = response.interaction.request.options.find(option => option.labelKey === 'actions.construct.name')
        if (branch) response = session.resolveChoice(0, branch.value)
      }
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
      response = session.commitSelectionChoice(0, { rooms: [{ row: 1, col: 1 }] })
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected room payment')
      const options = response.interaction.request.options
      const prices = options.map(option => option.effectPreview?.kind === 'payment'
        ? Object.fromEntries(Object.entries(option.effectPreview.resourcesPaid).filter(([, amount]) => amount > 0)) : undefined)
      expect(prices).toHaveLength(2)
      expect(prices).toEqual(expect.arrayContaining([{ clay: 5, reed: 2 }, { clay: 2, reed: 1, wood: 1 }]))
      const alternative = options.find(option => option.effectPreview?.kind === 'payment' && option.effectPreview.resourcesPaid.wood === 1)
      if (!alternative) throw new Error('Missing Supports payment')
      const logs = response.state.log.length
      const score = response.scores[0]!.total
      response = session.resolveChoice(0, alternative.value)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!).toMatchObject({ rooms: 3, resources: { wood: 2, clay: 3, reed: 2, stone: 0 } })
      expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid', resources: { clay: 2, reed: 1, wood: 1 } }))
      expect(response.state.log.length).toBeGreaterThan(logs)
      expect(response.scores[0]!.total).toBe(score + 2)
    } finally { session.dispose() }
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
