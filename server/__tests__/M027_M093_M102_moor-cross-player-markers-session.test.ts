import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { ActionFlow, GameState, Resource, SessionResponse } from '../../shared/contract/types'
import type { DraftGameEvent } from '../../shared/contract/events'
import { Scoring } from '../../shared/domain/scoring'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { resolveCardCostDetailedForTest } from '../../shared/actions/payment/__tests__/test-helpers'
import { runCardListeners } from '../../shared/cards/card-listeners'
import { passMinorCardToLeftAction } from '../../shared/actions/effects/internal/pass-minor-card-to-left'
import { getCardEffect } from '../../shared/cards/card-effects'

import '../../shared/cards/B/B004_WoodPile'
import '../../shared/cards/M/M027_GardenPath'
import '../../shared/cards/M/M093_FarmhandsQuarters'
import '../../shared/cards/M/M102_SavingsDeposit'
import '../../shared/cards/M/M104_WildHarvest'

const M027 = 'M027_GardenPath'
const M093 = 'M093_FarmhandsQuarters'
const M102 = 'M102_SavingsDeposit'
const M104 = 'M104_WildHarvest'
const PASSING_MINOR = 'B004_WoodPile'
const PLACEHOLDER = '__test_placeholder__'

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

const setup = (playerCount = 3) => {
  const session = new GameSession(411, undefined, {
    playerCount,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.resources = resources({ food: 20, wood: 10, clay: 10, reed: 10, fuel: 10 })
    player.minorHand = [PLACEHOLDER]
    player.occupationHand = [PLACEHOLDER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.farmTerrain = [{ row: 0, col: 0, kind: 'forest' }]
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
  })
  session.loadState(state)
  return session
}

const chooseFirstPayment = (session: GameSession, response: SessionResponse) => {
  if (response.interaction.stateId !== 'wait') return response
  if (response.interaction.promptKey !== 'prompt.selectPayment') return response
  const option = response.interaction.options?.[0]
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex ?? 0, option!.value)
}

const driveMinorPurchase = (
  session: GameSession,
  playerIndex: number,
  cardId: string,
) => {
  let resp = session.takeAction(playerIndex, 'meeting-place')
  expect(resp.ok).toBe(true)
  for (let step = 0; step < 8 && resp.interaction.stateId === 'wait'; step += 1) {
    const paid = chooseFirstPayment(session, resp)
    if (paid !== resp) {
      resp = paid
      continue
    }
    const options = resp.interaction.options ?? []
    const improvement = options.find((option) => option.value.startsWith('action-improvement-'))
    if (improvement) {
      resp = session.resolveChoice(playerIndex, improvement.value)
      expect(resp.ok).toBe(true)
      continue
    }
    const card = options.find((option) => option.value === cardId)
    if (card) {
      resp = session.resolveChoice(playerIndex, card.value)
      expect(resp.ok).toBe(true)
      continue
    }
    break
  }
  return resp
}

const cardBonusVp = (state: GameState, playerIndex: number) =>
  Scoring.breakdown(state, playerIndex).categories.find((category) => category.key === 'cardBonusVp')

const nonZeroResources = (value: unknown) => {
  const resources = value as Partial<Resource>
  return Object.fromEntries(
    Object.entries(resources).filter(([, amount]) => typeof amount === 'number' && amount > 0),
  )
}

const actionIds = (flow: ActionFlow | undefined): string[] => {
  if (!flow) return []
  if (flow.type === 'leaf') return [flow.actionId]
  return flow.children.flatMap(actionIds)
}

const cardPassed = (
  fromPlayerId: string,
  toPlayerId: string,
  cardId = PASSING_MINOR,
): DraftGameEvent<'card.passed'> => ({
  type: 'card.passed',
  fromPlayerId,
  toPlayerId,
  cardId,
})

describe('FoM M027/M093/M102 cross-player markers and transfers', () => {
  it('M027 gives the owner 3 wood, marks the left player publicly, and scores that marker -1 VP', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.minorHand = [M027]
    state.players[0]!.resources = resources({ clay: 1 })
    session.loadState(state)

    const resp = driveMinorPurchase(session, 0, M027)
    const owner = resp.state.players[0]!
    const left = resp.state.players[1]!

    expect(owner.resources.wood).toBe(3)
    expect(left.minorHand).toContain(M027)
    expect(left.cardStates?.[M027]?.extraData?.publicCardMarkers).toEqual([
      {
        id: 'garden-path',
        label: 'Garden Path',
        score: -1,
        sourceCardId: M027,
        sourcePlayerId: owner.id,
      },
    ])
    expect(cardBonusVp(resp.state, 1)).toEqual(expect.objectContaining({
      total: -1,
      entries: [expect.objectContaining({ cardId: M027, score: -1 })],
    }))
  })

  it('M027 does not mark the owner as their own left player in solo', () => {
    const session = setup(1)
    const state = session.getState().state
    const owner = state.players[0]!

    const flow = getCardEffect(M027)?.onBuy?.(state, owner)

    expect(actionIds(flow)).toEqual(['gain'])
    expect(owner.cardStates?.[M027]?.extraData?.publicCardMarkers).toBeUndefined()
  })

  it('M093 derives exactly-one building-resource-to-fuel candidates for major improvements', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = [M093]

    const result = resolveCardCostDetailedForTest(
      state,
      player,
      'improvement',
      'Major_Fireplace1',
      { clay: 2 },
      'improvement',
    )
    const fees = 'fees' in result.cost ? result.cost.fees ?? [] : [result.cost]

    expect(fees.map(nonZeroResources)).toEqual([
      { clay: 2 },
      { clay: 1, fuel: 1 },
    ])
    expect(result.candidateMetadataByFeeIndex?.[1]?.sources).toEqual([M093])
  })

  it('M093 gains 1 food only for an improvement passed from the player to the right', () => {
    const rightSession = setup()
    const rightState = rightSession.getState().state
    rightState.players[0]!.minorPlayed = [M093]
    rightState.players[2]!.minorHand = [PASSING_MINOR]
    rightState.currentPlayerIndex = 2
    rightSession.loadState(rightState)

    const rightResp = driveMinorPurchase(rightSession, 2, PASSING_MINOR)
    expect(rightResp.state.players[0]!.minorHand).toContain(PASSING_MINOR)
    expect(rightResp.state.players[0]!.resources.food).toBe(21)

    const nonRightSession = setup()
    const nonRightState = nonRightSession.getState().state
    const owner = nonRightState.players[0]!
    const source = nonRightState.players[1]!
    owner.minorPlayed = [M093]
    const result = runCardListeners({
      state: nonRightState,
      player: source,
      actionId: 'improvement',
      phase: 'after',
      transactionEvents: [cardPassed(source.id, owner.id)],
    })
    expect(result.flatMap((entry) => actionIds(entry.flow))).toEqual([])

    const soloSession = setup(1)
    const soloState = soloSession.getState().state
    const solo = soloState.players[0]!
    solo.minorPlayed = [M093]
    const soloResult = runCardListeners({
      state: soloState,
      player: solo,
      actionId: 'pass-minor-card-to-left',
      phase: 'after',
      transactionEvents: [cardPassed(solo.id, solo.id)],
    })
    expect(soloResult.flatMap((entry) => actionIds(entry.flow))).toEqual([])
  })

  it('M102 rewards the current holder, passes left at harvest start, and moves ownership on later harvests', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 4
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      player.resources = resources({ food: 20, clay: 99, fuel: 99 })
      player.minorHand = [PLACEHOLDER]
      setActiveWorkerCount(player, 1)
      markAllWorkersUsed(state, player)
    })
    state.players[0]!.minorPlayed = [M102]
    state.players[0]!.cardStates = { [M102]: { extraData: { stale: true } } }
    session.loadState(state)

    const first = session.performRoundEnd()
    expect(first.state.players[0]!.minorPlayed).not.toContain(M102)
    expect(first.state.players[0]!.cardStates?.[M102]).toBeUndefined()
    expect(first.state.players[1]!.minorHand).toContain(M102)
    expect(first.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        actorPlayerId: first.state.players[0]!.id,
        sourceCardId: M102,
        resources: { food: 6 },
      }),
    ]))
    expect(first.privateEvents).toEqual([
      expect.objectContaining({
        type: 'private.handChanged',
        recipientPlayerId: first.state.players[1]!.id,
        cardIds: [M102],
        cardType: 'minor',
        sourceCard: M102,
      }),
    ])

    const secondState = first.state
    secondState.round = 7
    secondState.roundPhase = 'work'
    secondState.players.forEach((player) => {
      player.resources = resources({ food: 20, clay: 99, fuel: 99 })
      player.minorHand = player.minorHand.filter((cardId) => cardId !== M102)
      player.minorPlayed = player.minorPlayed.filter((cardId) => cardId !== M102)
      setActiveWorkerCount(player, 1)
      markAllWorkersUsed(secondState, player)
    })
    secondState.players[1]!.minorPlayed = [M102]
    secondState.players[1]!.cardStates = { [M102]: { extraData: { stale: true } } }
    session.loadState(secondState)

    const second = session.performRoundEnd()
    expect(second.state.players[1]!.minorPlayed).not.toContain(M102)
    expect(second.state.players[1]!.cardStates?.[M102]).toBeUndefined()
    expect(second.state.players[2]!.minorHand).toContain(M102)
  })

  it('M102 does not skip later harvest-start hooks after passing itself left', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 4
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      player.resources = resources({ food: 20, clay: 99, fuel: 99 })
      player.minorHand = [PLACEHOLDER]
      player.farmTerrain = Array.from({ length: 14 }, (_, index) => ({ row: 0, col: index, kind: 'forest' as const }))
      setActiveWorkerCount(player, 1)
      markAllWorkersUsed(state, player)
    })
    state.players[0]!.minorPlayed = [M102, M104]
    session.loadState(state)

    const resp = session.performRoundEnd()
    const gainedSources = resp.state.events
      .filter((event) => event.type === 'resource.moved' && event.actorPlayerId === resp.state.players[0]!.id)
      .map((event) => event.sourceCardId)
    expect(gainedSources).toEqual(expect.arrayContaining([M102, M104]))
    expect(resp.state.players[1]!.minorHand).toContain(M102)
  })

  it('M102 removes itself without failing when there is no left player', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    state.players = [player]
    player.minorPlayed = [M102]
    player.minorHand = [PLACEHOLDER]
    player.cardStates = { [M102]: { extraData: { stale: true } } }

    const result = passMinorCardToLeftAction.execute({
      state,
      player,
      params: { cardId: M102 },
      sourceCard: M102,
    } as never)
    expect(result).toEqual({ type: 'ok' })
    expect(player.minorPlayed).not.toContain(M102)
    expect(player.minorHand).not.toContain(M102)
    expect(player.cardStates?.[M102]).toBeUndefined()
  })
})
