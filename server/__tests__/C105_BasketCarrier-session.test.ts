import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { markAllWorkersUsed, setActiveWorkerCount, setNewbornCount } from '../../shared/domain/player'
import { C105_BasketCarrier } from '../../shared/cards/C/C105_BasketCarrier'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { PlayerState, Resource } from '../../shared/contract/types'
import { confirmNextPlayer } from './_helpers/pending-confirms'

const CARD_ID = 'C105_BasketCarrier'
const HOME_BREWER = 'C110_HomeBrewer'
const FIXED_HANDS = [
  { occupation: '__c105_occupation_p1__', minor: '__c105_minor_p1__' },
  { occupation: '__c105_occupation_p2__', minor: '__c105_minor_p2__' },
  { occupation: '__c105_occupation_p3__', minor: '__c105_minor_p3__' },
  { occupation: '__c105_occupation_p4__', minor: '__c105_minor_p4__' },
]

const makeFourPlayerSession = () => {
  const session = new GameSession(105, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players.forEach((player, index) => {
    player.occupationHand = [FIXED_HANDS[index]!.occupation]
    player.minorHand = [FIXED_HANDS[index]!.minor]
  })
  return { session, state }
}

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

  it('C105 S3: is absent in the work phase and unavailable in harvest with only one food', () => {
    const outside = makeFourPlayerSession()
    outside.state.round = 3
    outside.state.roundPhase = 'work'
    outside.state.currentPlayerIndex = 0
    outside.state.players[0]!.occupationPlayed = [CARD_ID]
    outside.state.players[0]!.resources.food = 2
    outside.session.loadState(outside.state)

    const workResponse = outside.session.takeAction(0, 'day-laborer')

    expect(workResponse.ok, workResponse.error).toBe(true)
    expect(workResponse.interaction.anytimeActions.some((action) => action.sourceCard === CARD_ID)).toBe(false)
    expect(workResponse.state.events.some((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === CARD_ID,
    )).toBe(false)
    expect(workResponse.state.players[0]!.resources).toMatchObject({
      food: 4,
      wood: 0,
      reed: 0,
      grain: 0,
    })

    const insufficient = makeFourPlayerSession()
    insufficient.state.round = 4
    insufficient.state.roundPhase = 'work'
    insufficient.state.players.forEach((player) => {
      markAllWorkersUsed(insufficient.state, player)
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 0)
      player.resources.food = 10
    })
    insufficient.state.players[0]!.resources.food = 1
    insufficient.state.players[0]!.occupationPlayed = [CARD_ID]
    insufficient.session.loadState(insufficient.state)

    const harvestResponse = insufficient.session.performRoundEnd()

    expect(harvestResponse.ok, harvestResponse.error).toBe(true)
    expect(harvestResponse.interaction.stateId).toBe('idle')
    expect(harvestResponse.state.players[0]!.resources).toMatchObject({
      food: 0,
      wood: 0,
      reed: 0,
      grain: 0,
      begging: 3,
    })
    expect(harvestResponse.state.events.some((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === CARD_ID,
    )).toBe(false)
  })

  it('C105 S4: prepares grain before Home Brewer resolves at the end of the field phase', () => {
    const { session, state } = makeFourPlayerSession()
    state.round = 4
    state.roundPhase = 'work'

    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 0)
      player.resources.food = 10
      player.resources.grain = 0
      player.fields = []
      player.improvements = []
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
    })

    const player = state.players[0]!
    player.resources.food = 6
    player.occupationPlayed = [CARD_ID, HOME_BREWER]
    session.loadState(state)

    let resp = session.performRoundEnd()
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected harvest preparation exchange')
    expect(resp.interaction.promptKey).toBe('ui.interactionExchangeChoice')
    expect(resp.state.events.some((event) => event.type === 'harvest.phaseStarted')).toBe(false)
    const basketCarrier = resp.interaction.request.options?.find((option) => option.sourceCard === CARD_ID)
    expect(basketCarrier).toBeDefined()

    resp = session.resolveChoice(0, basketCarrier!.value)
    expect(resp.state.players[0]!.resources).toMatchObject({ food: 4, wood: 1, reed: 1, grain: 1 })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Home Brewer choice')
    const homeBrewer = resp.interaction.request.options?.find((option) =>
      option.value !== '__skip__' && option.sourceCard === HOME_BREWER,
    )
    expect(homeBrewer).toBeDefined()

    resp = session.resolveChoice(0, homeBrewer!.value)
    expect(resp.state.players[0]!.resources).toMatchObject({ food: 3, wood: 1, reed: 1, grain: 0 })
    expect(resp.state.events.filter((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === CARD_ID,
    )).toHaveLength(1)
    expect(resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'feed'
      && resp.interaction.playerIndex === 0).toBe(false)
  })

  it.each([
    ['already has the wanted good', { food: 6, grain: 1, fields: [], homeBrewer: true }],
    ['will reap the wanted good', { food: 6, grain: 0, fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain' as const, remaining: 2 }] }], homeBrewer: true }],
    ['has no pre-field consumer', { food: 6, grain: 0, fields: [], homeBrewer: false }],
  ])('does not open harvest preparation when the player %s', (_name, setup) => {
    const { session, state } = makeFourPlayerSession()
    state.round = 4
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 2)
      setNewbornCount(player, 0)
      player.resources.food = 10
      player.resources.grain = 0
      player.fields = []
      player.improvements = []
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
    })
    const player = state.players[0]!
    player.resources.food = setup.food
    player.resources.grain = setup.grain
    player.fields = setup.fields
    player.occupationPlayed = setup.homeBrewer ? [CARD_ID, HOME_BREWER] : [CARD_ID]
    session.loadState(state)

    const resp = session.performRoundEnd()

    if (resp.interaction.stateId === 'wait') {
      expect(resp.interaction.promptKey).not.toBe('ui.interactionExchangeChoice')
    }
  })

  it('C105 S1: accepts the harvest trade once and caps a submitted count of two', () => {
    const { session, state } = makeFourPlayerSession()
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
          resp = session.resolveChoice(0, 'confirm', { selections: [
            { sourceId: CARD_ID, exchangeIndex: 0, count: 2 },
          ] })
          confirmedReverse = true
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', { selections: [] })
        }
      } else if (resp.interaction.request.kind === 'animal-reorg') {
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
      } else if (resp.interaction.request.kind === 'confirm-next-player') {
        resp = confirmNextPlayer(session)
      } else {
        const skip = resp.interaction.request.options?.find((o) => o.value === '__skip__')
        if (skip) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options![0]!.value)
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

  it('C105 S2: declining the harvest trade preserves the two food left after feeding', () => {
    const { session, state } = makeFourPlayerSession()
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
        resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', resp.interaction.request.zones)
      } else if (resp.interaction.request.kind === 'confirm-next-player') {
        resp = confirmNextPlayer(session)
      } else {
        const skip = resp.interaction.request.options?.find((o) => o.value === '__skip__')
        resp = session.resolveChoice(
          resp.interaction.playerIndex ?? 0,
          skip ? '__skip__' : resp.interaction.request.options![0]!.value,
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
