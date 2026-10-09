import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A075_LumberMill } from '../../shared/cards/A/A075_LumberMill'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A057_MilkingParlor'

const CARD_ID = 'A075_LumberMill'
const DISCOUNTED_MINOR_ID = 'A057_MilkingParlor'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = [
  'A116_WoodCutter',
  'B116_Shoreforester',
  'C109_SchnappsDistiller',
  'D116_TreeInspector',
]

// Touch the import so the listener side-effect remains referenced.
void A075_LumberMill

describe('A075_LumberMill session', () => {
  const setup = (resources: Partial<Record<string, number>>) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      ...resources,
    }
    state.availableMajorImprovements = ['Major_Joinery']
    // Placeholder hands keep improvement option counts deterministic
    // (see CLAUDE.md Common Pitfalls).
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)
    return session
  }

  const setupPurchase = (occupations: number) => {
    const session = new GameSession(5075, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = [FILLER]
    player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    player.resources.stone = 2
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.minorHand = [FILLER]
    opponent.occupationHand = [FILLER]
    session.loadState(state)
    return session
  }

  const enterImprovementChoice = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
    return response
  }

  const playMinor = (session: GameSession, cardId: string) => {
    const response = enterImprovementChoice(session)
    if (!response.state.players[0]!.minorHand.includes(cardId)) return response
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
    if (!option) return response
    return session.resolveChoice(0, option.value)
  }

  it('A075 S1: exactly three occupations allow paying two stone for Lumber Mill', () => {
    const response = playMinor(setupPurchase(3), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })

  it('A075 S2: four occupations keep Lumber Mill unavailable without payment', () => {
    const response = enterImprovementChoice(setupPurchase(4))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(2)
  })

  // Mandatory closure transform (ADR 0004): the printed {wood:2, stone:2}
  // row is never offered — Mandatory Saturation hides it, the player can
  // only pay the discounted {wood:1, stone:2}.
  it('A075 S3: discounts a major improvement by one wood and never offers the printed cost', () => {
    const session = setup({ wood: 2, stone: 2 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
      const options = resp.interaction.request.options ?? []
      const printed = options.find((entry) =>
        (entry.labelParams?.resourcesPaid as Record<string, number>)?.wood === 2,
      )
      expect(printed).toBeUndefined()
      const discounted = options.find((entry) =>
        (entry.labelParams?.resourcesPaid as Record<string, number>)?.wood === 1,
      )
      expect(discounted).toBeDefined()
      resp = session.resolveChoice(0, discounted!.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Joinery')
    expect(after.resources.wood).toBe(1)
    expect(after.resources.stone).toBe(0)
  })

  // With exactly the discounted cost on hand the purchase resolves without
  // a payment wait: the closure leaves a single affordable candidate.
  it('auto-resolves payment when only the discounted candidate is affordable', () => {
    const session = setup({ wood: 1, stone: 2 })
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Joinery')
    expect(after.resources.wood).toBe(0)
    expect(after.resources.stone).toBe(0)
    expect(readCardResourceStats(after, CARD_ID)?.saved).toEqual({ wood: 1 })
  })

  it('A075 S4: discounts a minor improvement by one wood', () => {
    const session = new GameSession(6075, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed = [CARD_ID]
    player.minorHand = [DISCOUNTED_MINOR_ID]
    player.occupationHand = [FILLER]
    player.resources.wood = 1
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.minorHand = [FILLER]
    opponent.occupationHand = [FILLER]
    session.loadState(state)

    const response = playMinor(session, DISCOUNTED_MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(DISCOUNTED_MINOR_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})
