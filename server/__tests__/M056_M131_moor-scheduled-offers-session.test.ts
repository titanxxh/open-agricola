import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { AnimalKey } from '../../shared/contract/animals'
import type { Resource, SessionResponse } from '../../shared/contract/types'
import { confirmNextPlayer } from './_helpers/pending-confirms'

const M056 = 'M056_PeatCuttingRights'
const M131 = 'M131_CattleStall'
const PLACEHOLDER = '__test_placeholder__'
const MOOR_A = { row: 2, col: 0, kind: 'moor' as const }
const MOOR_B = { row: 2, col: 1, kind: 'moor' as const }

const resources = (overrides: Partial<Resource> = {}): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  fuel: 0,
  horse: 0,
  ...overrides,
})

const setup = (cardId: string, round = 1, initialResources: Partial<Resource> = {}) => {
  const session = new GameSession(409, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player, index) => {
    player.resources = resources(index === 0 ? initialResources : {})
    player.minorHand = index === 0 ? [cardId] : [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.pastures = index === 0 && (initialResources.horse ?? 0) > 0
      ? [{
          id: 'horse-pasture',
          size: 1,
          tiles: [{ row: 0, col: 0 }],
          stables: 0,
          animalType: 'horse',
          animalCount: initialResources.horse!,
        }]
      : []
    player.stableTiles = []
    player.farmTerrain = [{ ...MOOR_A }, { ...MOOR_B }]
    setWorkersAtHome(state, player, index === 0 ? 3 : 0)
  })
  session.loadState(state)
  return session
}

const chooseFirstPayment = (session: GameSession, response: SessionResponse) => {
  let resp = response
  if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
    const payment = resp.interaction.options?.[0]
    expect(payment).toBeDefined()
    resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, payment!.value)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const playMinor = (
  session: GameSession,
  cardId: string,
  afterPayment?: (response: SessionResponse) => SessionResponse,
) => {
  let resp = session.takeAction(0, 'meeting-place')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp

  const improvementOption = resp.interaction.options?.find((option) =>
    option.value.startsWith('action-improvement-')
  )
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }

  resp = chooseFirstPayment(session, resp)
  if (afterPayment && resp.interaction.stateId === 'wait' && resp.interaction.sourceCard === cardId) {
    resp = afterPayment(resp)
  }
  if (resp.state.players[0]!.minorPlayed.includes(cardId)) {
    if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
      resp = confirmNextPlayer(session)
      expect(resp.ok).toBe(true)
    }
    return resp
  }

  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') return resp
  const cardOption = resp.interaction.options?.find((option) => option.value === cardId)
  expect(cardOption).toBeDefined()
  resp = session.resolveChoice(0, cardOption!.value)
  expect(resp.ok).toBe(true)
  resp = chooseFirstPayment(session, resp)
  if (afterPayment) resp = afterPayment(resp)
  if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
    resp = confirmNextPlayer(session)
    expect(resp.ok).toBe(true)
  }
  return resp
}

const startRound = (session: GameSession, round: number) => {
  const state = session.getState().state
  state.round = round
  state.roundPhase = 'preparation'
  state.currentPlayerIndex = 0
  session.loadState(state)
  return (session as unknown as { continueBeforeStartOfTurn: () => SessionResponse }).continueBeforeStartOfTurn()
}

const offerState = (session: GameSession, cardId: string) =>
  session.getState().state.players[0]!.cardStates?.[cardId]?.extraData?.scheduledOffers as
    | Array<Record<string, unknown>>
    | undefined

const chooseM131Animals = (
  session: GameSession,
  response: SessionResponse,
  animals: [AnimalKey, AnimalKey, AnimalKey, AnimalKey],
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  expect(response.interaction.sourceCard).toBe(M131)
  const option = response.interaction.options?.find((entry) =>
    entry.value === `animals:${animals.join(',')}`
  )
  expect(option).toBeDefined()
  const resp = session.resolveChoice(0, option!.value)
  expect(resp.ok).toBe(true)
  return resp
}

describe('M056/M131 scheduled offers', () => {
  it('M056 schedules Cut Peat offers, consumes the due token, and takes the special action card when accepted', () => {
    const session = setup(M056, 1, { horse: 1 })

    const played = playMinor(session, M056)
    expect(played.state.players[0]!.minorPlayed).toContain(M056)
    expect(offerState(session, M056)).toEqual([
      expect.objectContaining({ dueRound: 5, kind: 'moor-special-action', actionId: 'cut-peat', consumed: false }),
      expect.objectContaining({ dueRound: 8, kind: 'moor-special-action', actionId: 'cut-peat', consumed: false }),
    ])

    let resp = startRound(session, 5)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(M056)
    expect(resp.interaction.options?.some((option) => option.value === '__skip__')).toBe(true)
    const cutPeat = resp.interaction.options?.find((option) =>
      option.value.includes(':cut-peat:') && option.value.includes(':2:0')
    )
    expect(cutPeat).toBeDefined()

    resp = session.resolveChoice(0, cutPeat!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.fuel).toBe(3)
    expect(resp.state.players[0]!.farmTerrain).not.toContainEqual(MOOR_A)
    expect(resp.state.farmersOfTheMoor!.specialActionCards.find((card) => card.actions.includes('cut-peat'))!.location)
      .toEqual({ kind: 'playerFaceUp', playerId: 'p1' })
    expect(offerState(session, M056)?.find((offer) => offer.dueRound === 5)).toMatchObject({
      consumed: true,
      consumedRound: 5,
    })
  })

  it('M056 consumes due tokens even when skipped or when Cut Peat is unavailable', () => {
    const skipped = setup(M056, 1, { horse: 1 })
    playMinor(skipped, M056)
    let resp = startRound(skipped, 5)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    resp = skipped.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(offerState(skipped, M056)?.find((offer) => offer.dueRound === 5)).toMatchObject({
      consumed: true,
      consumedRound: 5,
    })

    const unavailable = setup(M056, 1, { horse: 1 })
    playMinor(unavailable, M056)
    const state = unavailable.getState().state
    state.players[0]!.farmTerrain = []
    unavailable.loadState(state)
    resp = startRound(unavailable, 5)
    expect(resp.interaction.stateId).toBe('idle')
    expect(offerState(unavailable, M056)?.find((offer) => offer.dueRound === 5)).toMatchObject({
      consumed: true,
      consumedRound: 5,
    })
  })

  it('does not schedule M056 offers beyond round 14', () => {
    const session = setup(M056, 11, { horse: 1 })

    playMinor(session, M056)

    expect(offerState(session, M056)).toBeUndefined()
  })

  it('M131 requires four different animals, schedules them, and buys the due animal for 1 food before reorg', () => {
    const session = setup(M131, 1, { wood: 2, clay: 2, food: 1 })

    const played = playMinor(session, M131, (resp) => {
      if (resp.interaction.stateId !== 'wait') return resp
      const rejected = session.resolveChoice(0, 'animals:sheep,sheep,boar,cattle')
      expect(rejected.ok).toBe(false)
      return chooseM131Animals(session, resp, ['sheep', 'boar', 'cattle', 'horse'])
    })
    expect(played.state.players[0]!.minorPlayed).toContain(M131)
    expect(offerState(session, M131)).toEqual([
      expect.objectContaining({ dueRound: 3, kind: 'animal-purchase', animal: 'sheep', consumed: false }),
      expect.objectContaining({ dueRound: 5, kind: 'animal-purchase', animal: 'boar', consumed: false }),
      expect.objectContaining({ dueRound: 7, kind: 'animal-purchase', animal: 'cattle', consumed: false }),
      expect.objectContaining({ dueRound: 9, kind: 'animal-purchase', animal: 'horse', consumed: false }),
    ])

    let resp = startRound(session, 3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.sourceCard).toBe(M131)
    const buySheep = resp.interaction.options?.find((option) => option.value === 'buy:sheep')
    expect(buySheep).toBeDefined()

    resp = session.resolveChoice(0, buySheep!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.sheep).toBe(1)
    expect(offerState(session, M131)?.find((offer) => offer.dueRound === 3)).toMatchObject({
      consumed: true,
      consumedRound: 3,
    })
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.request.kind).toBe('animal-reorg')
  })

  it('M131 skipped and unaffordable offers are consumed and do not persist', () => {
    const skipped = setup(M131, 1, { wood: 2, clay: 2, food: 1 })
    playMinor(skipped, M131, (resp) => chooseM131Animals(skipped, resp, ['sheep', 'boar', 'cattle', 'horse']))
    let resp = startRound(skipped, 3)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    resp = skipped.resolveChoice(0, '__skip__')
    expect(resp.ok).toBe(true)
    expect(skipped.getState().state.players[0]!.resources.sheep).toBe(0)
    expect(offerState(skipped, M131)?.find((offer) => offer.dueRound === 3)).toMatchObject({
      consumed: true,
      consumedRound: 3,
    })

    const unaffordable = setup(M131, 1, { wood: 2, clay: 2, food: 0 })
    playMinor(unaffordable, M131, (pending) => chooseM131Animals(unaffordable, pending, ['sheep', 'boar', 'cattle', 'horse']))
    resp = startRound(unaffordable, 3)
    expect(resp.interaction.stateId).toBe('idle')
    expect(offerState(unaffordable, M131)?.find((offer) => offer.dueRound === 3)).toMatchObject({
      consumed: true,
      consumedRound: 3,
    })
  })
})
