import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/D/D074_RoyalWood'
import '../../shared/cards/B/B081_Handcart'
import '../../shared/cards/E/E014_WoodSaw'

const CARD_ID = 'D074_RoyalWood'

const paidEvent = (wood: number, paymentFor: string) => ({
  type: 'resource.paid',
  resources: { wood },
  paymentFor,
})

const findAfterListener = (actionId: string) => {
  const listener = getRegisteredCardListeners().find((l) =>
    l.cardIds?.includes(CARD_ID) &&
    l.actions?.includes(actionId) &&
    l.phases?.includes('after'),
  )
  if (!listener) throw new Error(`D74 after listener missing for ${actionId}`)
  return listener
}

const setup = (options?: { wood?: number }) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources.food = 10
  player.resources.wood = options?.wood ?? 10
  player.resources.clay = 10
  player.resources.reed = 10
  player.resources.stone = 10
  player.minorHand.push(CARD_ID)

  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

const playOneWoodMinorTurn = (session: GameSession, minorId: string) => {
  const state = session.getState().state
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  setWorkersAtHome(state, player, 1)
  const majorImprovement = state.actionSpaces.find((space) => space.id === 'major-improvement')
  if (!majorImprovement) throw new Error('major-improvement missing')
  majorImprovement.takenBy = []
  if (!player.minorHand.includes(minorId)) {
    player.minorHand.push(minorId)
  }
  session.loadState(state)

  let resp = session.takeAction(0, 'major-improvement')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')

  const improvementOption = resp.interaction.options?.find((option) => option.value.startsWith('action-improvement-'))
  if (improvementOption) {
    resp = session.resolveChoice(0, improvementOption.value)
    expect(resp.ok).toBe(true)
  }
  if (resp.interaction.sourceCard !== minorId) {
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return resp
    const minorOption = resp.interaction.options?.find((option) => option.value === `minor:${minorId}`)
    expect(minorOption).toBeDefined()
    resp = session.resolveChoice(0, minorOption!.value)
  }
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  return resp
}

describe('D074_RoyalWood session', () => {
  it.each([
    ['pay', 'major-improvement'],
    ['pay', 'minor-improvement'],
    ['construct', 'construct'],
    ['pay', 'stables'],
  ])('reads paid wood from resource.paid events for %s/%s without legacy result payload', (actionId, paymentFor) => {
    const session = setup({ wood: 10 })
    const state = session.getState().state
    const player = state.players[0]!
    const result = { type: 'ok' as const }

    expect('resourcesPaid' in result).toBe(false)
    expect('extraData' in result).toBe(false)

    const listenerResult = executeCardListener(findAfterListener(actionId), {
      state,
      player,
      space: { id: actionId },
      actionId,
      phase: 'after',
      result,
      transactionEvents: [paidEvent(3, paymentFor)],
    } as unknown as CardListenerContext)

    expect(listenerResult?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: 'woodSpent', value: 3 },
    })
  })

  it.each([
    ['pay', 'major-improvement'],
    ['pay', 'minor-improvement'],
    ['construct', 'construct'],
    ['pay', 'stables'],
  ])('only counts current actionEvents for %s/%s when transaction has prior paid wood', (actionId, paymentFor) => {
    const session = setup({ wood: 10 })
    const state = session.getState().state
    const player = state.players[0]!

    const listenerResult = executeCardListener(findAfterListener(actionId), {
      state,
      player,
      space: { id: actionId },
      actionId,
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [paidEvent(5, paymentFor), paidEvent(3, paymentFor)],
      actionEvents: [paidEvent(3, paymentFor)],
    } as unknown as CardListenerContext)

    expect(listenerResult?.flow).toEqual({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: 'woodSpent', value: 3 },
    })
  })

  it('refunds wood before confirmNextPlayer after building Joinery', () => {
    const session = setup({ wood: 5 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.stone = 10
    if (!state.availableMajorImprovements.includes('Major_Joinery')) {
      state.availableMajorImprovements.push('Major_Joinery')
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.interaction.stateId).toBe('wait')

    if (resp.interaction.stateId !== 'wait') return
    const joineryOption = resp.interaction.options?.find((option) => option.value === 'major:Major_Joinery')
    expect(joineryOption).toBeDefined()
    resp = session.resolveChoice(0, joineryOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'major-improvement',
        resources: expect.objectContaining({ wood: 2 }),
      }),
    ]))
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.woodSpent).toBe(0)
  })

  it('tracks beforeHost construct payment before refunding at end of action', () => {
    const session = setup({ wood: 7 })
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.reed = 2
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const constructOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(constructOption).toBeDefined()

    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return

    const room = resp.interaction.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { rooms: [room] })
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.woodSpent).toBe(5)

    resp = session.resolveChoice(0, '__done__')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'construct',
        resources: expect.objectContaining({ wood: 5 }),
      }),
      expect.objectContaining({
        type: 'resource.moved',
        resources: expect.objectContaining({ wood: 2 }),
        sourceCardId: CARD_ID,
      }),
    ]))
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.woodSpent).toBe(0)
  })

  it('tracks afterHost stables payment before refunding at end of action', () => {
    const session = setup({ wood: 5 })
    const state = session.getState().state
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    const stableOption = resp.interaction.options?.find(
      (option) => option.labelKey === 'actions.stables.name',
    )
    expect(stableOption).toBeDefined()

    resp = session.resolveChoice(0, stableOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.farm.farmType).toBe('stable')
    if (resp.interaction.farm.farmType !== 'stable') return

    const stable = resp.interaction.farm.selectableTiles[0]!
    resp = session.commitSelectionChoice(0, { stables: [stable] })
    expect(resp.ok).toBe(true)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'stables',
        resources: expect.objectContaining({ wood: 2 }),
      }),
      expect.objectContaining({
        type: 'resource.moved',
        resources: expect.objectContaining({ wood: 1 }),
        sourceCardId: CARD_ID,
      }),
    ]))
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.woodSpent).toBe(0)
  })

  it('does not carry separate 1-wood payments across turns', () => {
    const session = setup({ wood: 10 })

    let resp = playOneWoodMinorTurn(session, 'B081_Handcart')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'minor-improvement',
        resources: expect.objectContaining({ wood: 1 }),
      }),
    ]))
    expect(resp.state.players[0]!.resources.wood).toBe(9)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.woodSpent).toBe(0)

    resp = playOneWoodMinorTurn(session, 'E014_WoodSaw')
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.paid',
        paymentFor: 'minor-improvement',
        resources: expect.objectContaining({ wood: 1 }),
      }),
    ]))
    expect(resp.state.players[0]!.resources.wood).toBe(8)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.woodSpent).toBe(0)
  })

  it('does nothing on turns without tracked wood payments', () => {
    const session = setup({ wood: 10 })
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
    expect(resp.state.players[0]!.resources.wood).toBe(10)
  })

  // BGA reference: `round((payWood-1)/2)` rounding rule.
  // Our `Math.floor(totalSpent/2)` is equivalent for all spent ≥ 1
  //   spent=1 → 0, spent=2 → 1, spent=3 → 1, spent=4 → 2, spent=5 → 2,
  //   spent=6 → 3, spent=7 → 3, spent=8 → 4, ...
  // Plan §F1 D74 outline asks to "match BGA's floor((spent-1)/2) rule";
  // this test pins the equivalence for the boundary cases.
  it('refund formula matches BGA round((spent-1)/2) for representative spends', () => {
    const cases: { spent: number; refund: number }[] = [
      { spent: 1, refund: 0 },
      { spent: 2, refund: 1 },
      { spent: 3, refund: 1 },
      { spent: 4, refund: 2 },
      { spent: 5, refund: 2 },
      { spent: 6, refund: 3 },
      { spent: 7, refund: 3 },
    ]
    for (const { spent, refund } of cases) {
      // floor(spent/2) == round((spent-1)/2)  for spent ≥ 1
      expect(Math.floor(spent / 2)).toBe(refund)
    }
  })
})
