import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import '../../shared/cards/A/A070_LiftingMachine'
import '../../shared/cards/B/B068_Beanfield'

const CARD_ID = 'A070_LiftingMachine'

const CARD_FIELD = 'B068_Beanfield'

const FILLER = '__test_placeholder__'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const purchaseSession = (fields: number) => {
  const session = new GameSession(6070, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 8
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
  })
  const owner = state.players[0]!
  owner.minorHand = [CARD_ID, FILLER]
  owner.resources.wood = 1
  owner.fields = Array.from({ length: fields }, (_, col) => ({ row: 0, col, stacks: [] }))
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (options(response).some((option) => option.value === CARD_ID)) return response
  const improvement = options(response).find((option) => option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const playCard = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const roundEndSession = ({
  round = 8, vegetables = 2, cardField = false,
}: {
  round?: number
  vegetables?: number
  cardField?: boolean
} = {}) => {
  const session = new GameSession(6070, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
  })
  const owner = state.players[0]!
  owner.minorPlayed = [CARD_ID]
  owner.resources.vegetable = 0
  if (cardField) {
    owner.minorPlayed.push(CARD_FIELD)
    owner.cardStates[CARD_FIELD] = {
      extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: vegetables }] },
    }
  } else {
    owner.fields = [{
      row: 0, col: 0,
      stacks: vegetables > 0 ? [{ kind: 'vegetable', remaining: vegetables }] : [],
    }]
  }
  session.loadState(state)
  return session
}

const resolveLiftingMachine = (
  session: GameSession,
  response: SessionResponse,
  position: { row: number; col: number },
) => {
  let current = response
  for (let safety = 0; safety < 4 && current.interaction.stateId === 'wait'; safety += 1) {
    if (current.interaction.request.kind === 'select-trigger') {
      const trigger = options(current).find((option) =>
        option.value === CARD_ID || option.sourceCard === CARD_ID,
      )
      expect(trigger).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, trigger!.value)
      continue
    }
    if (current.interaction.request.kind === 'choice') {
      const accept = options(current).find((option) => option.value !== '__skip__')
      expect(accept).toBeDefined()
      current = session.resolveChoice(current.interaction.playerIndex, accept!.value)
      continue
    }
    if (current.interaction.request.kind === 'selection') {
      current = session.commitSelectionChoice(current.interaction.playerIndex, { positions: [position] })
      break
    }
    break
  }
  return current
}

const declineLiftingMachine = (session: GameSession, response: SessionResponse) => {
  let current = response
  if (current.interaction.stateId === 'wait' && current.interaction.request.kind === 'select-trigger') {
    const trigger = options(current).find((option) =>
      option.value === CARD_ID || option.sourceCard === CARD_ID,
    )
    expect(trigger).toBeDefined()
    current = session.resolveChoice(current.interaction.playerIndex, trigger!.value)
  }
  expect(current.interaction.stateId).toBe('wait')
  if (current.interaction.stateId !== 'wait') return current
  if (current.interaction.request.kind === 'choice') {
    expect(options(current).some((option) => option.value === '__skip__')).toBe(true)
    return session.resolveChoice(current.interaction.playerIndex, '__skip__')
  }
  expect(current.interaction.request.kind).toBe('selection')
  return session.commitSelectionChoice(current.interaction.playerIndex, { cancel: true })
}

describe('A070 Lifting Machine parity', () => {
  it('A070 S1: three fields and one wood allow playing Lifting Machine', () => {
    const response = playCard(purchaseSession(3))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A070 S2: two fields keep Lifting Machine unavailable without payment', () => {
    const response = enterMinor(purchaseSession(2))

    expect(options(response).some((option) => option.value === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('A070 S3: at a non-harvest round end accepting moves one vegetable from an ordinary field to supply', () => {
    const session = roundEndSession()
    const response = resolveLiftingMachine(session, session.performRoundEnd(), { row: 0, col: 0 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('A070 S4: the non-harvest round-end move may be declined', () => {
    const session = roundEndSession()
    const response = declineLiftingMachine(session, session.performRoundEnd())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A070 S5: a harvest round offers no Lifting Machine move and only performs the normal field phase', () => {
    const session = roundEndSession({ round: 7 })
    const response = autoAdvanceRoundEnd(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(1)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('A070 S6: no vegetable field offers no Lifting Machine move', () => {
    const session = roundEndSession({ vegetables: 0 })
    const response = autoAdvanceRoundEnd(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(9)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('A070 S7: accepting at a non-harvest round end moves one vegetable from a card field to supply', () => {
    const session = roundEndSession({ cardField: true })
    const response = resolveLiftingMachine(session, session.performRoundEnd(), { row: -1, col: 2068 })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates[CARD_FIELD]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 1 },
    ])
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })
})
