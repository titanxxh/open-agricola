import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C171_YoungArtist'
import '../../shared/cards/A/A16_RammedClay'
import '../../shared/cards/C/C15_Trellis'
import '../../shared/cards/C/C23_JobContract'
import '../../shared/cards/C/C4_WritingBoards'

const CARD_ID = 'C171_YoungArtist'
const MINOR_ID = 'A16_RammedClay'
const DRAWN_MINORS = ['C15_Trellis', 'C23_JobContract'] as const

const setupSession = ({
  food = 1,
  minorHand = ['__test_placeholder__'],
  minorDeck = [...DRAWN_MINORS],
}: {
  food?: number
  minorHand?: string[]
  minorDeck?: string[]
} = {}) => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.round = 1
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.resources.food = 0
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    markAllWorkersUsed(state, player)
  })
  const owner = state.players[0]!
  owner.occupationPlayed.push(CARD_ID)
  owner.resources.food = food
  owner.minorHand = minorHand
  state.ordinaryCardDecks.minor = minorDeck
  session.loadState(state)
  return session
}

const resolveMinorIfPrompt = (
  session: GameSession,
  resp: ReturnType<GameSession['resolveChoice']>,
  cardId: string,
) => {
  if (resp.interaction.stateId !== 'wait') return resp
  const option = resp.interaction.options?.find((entry) => entry.value === `minor:${cardId}`)
  if (!option) return resp
  return session.resolveChoice(resp.interaction.playerIndex, option.value)
}

describe('C171_YoungArtist', () => {
  it('pays 1 food to draw 2 ordinary minor improvements directly into hand during returning home', () => {
    const session = setupSession()

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Young Artist choice')
    expect(JSON.stringify(resp.interaction.options)).not.toContain('actions.improvement.name')
    resp = resolveNonSkipChoice(session, resp)

    const owner = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(owner.resources.food).toBe(0)
    expect(owner.minorHand).toEqual(['__test_placeholder__', ...DRAWN_MINORS])
    expect(resp.state.ordinaryCardDecks.minor).toEqual([])
    expect(Object.values(resp.state.ordinaryCardDrawChoices)).toEqual([])
    expect(resp.privateEvents).toEqual([
      expect.objectContaining({
        type: 'private.handChanged',
        recipientPlayerId: owner.id,
        cardType: 'minor',
        cardIds: owner.minorHand,
        sourceCard: CARD_ID,
      }),
    ])
  })

  it('skips the optional returning-home choice without paying food or drawing cards', () => {
    const session = setupSession()

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveSkipChoice(session, resp)

    const owner = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(owner.resources.food).toBe(1)
    expect(owner.minorHand).toEqual(['__test_placeholder__'])
    expect(resp.state.ordinaryCardDecks.minor).toEqual([...DRAWN_MINORS])
    expect(resp.privateEvents).toBeUndefined()
  })

  it('pays 1 food to take a normal no-worker Minor Improvement action when the ordinary minor deck is empty', () => {
    const session = setupSession({ minorHand: [MINOR_ID], minorDeck: [] })

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected Young Artist choice')
    expect(JSON.stringify(resp.interaction.options)).not.toContain('draw-ordinary-cards')

    resp = resolveNonSkipChoice(session, resp)
    resp = resolveMinorIfPrompt(session, resp, MINOR_ID)

    const owner = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(owner.resources.food).toBe(0)
    expect(owner.resources.clay).toBe(1)
    expect(owner.minorHand).not.toContain(MINOR_ID)
    expect(owner.minorPlayed).toContain(MINOR_ID)
    expect(resp.state.ordinaryCardDecks.minor).toEqual([])
  })

  it('does not offer a Minor Improvement branch that becomes unaffordable after the Young Artist food fee', () => {
    const session = setupSession({ food: 1, minorHand: ['C4_WritingBoards'], minorDeck: [] })

    const resp = session.performRoundEnd()

    const owner = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).not.toBe('wait')
    expect(owner.resources.food).toBe(1)
    expect(owner.minorHand).toEqual(['C4_WritingBoards'])
    expect(owner.minorPlayed).not.toContain('C4_WritingBoards')
  })

  it('draws only the remaining ordinary minor when fewer than 2 cards are available', () => {
    const session = setupSession({ minorDeck: ['C15_Trellis'] })

    let resp = session.performRoundEnd()
    resp = resolveTriggerIfPresent(session, resp, CARD_ID)
    resp = resolveNonSkipChoice(session, resp)

    const owner = resp.state.players[0]!
    expect(owner.resources.food).toBe(0)
    expect(owner.minorHand).toEqual(['__test_placeholder__', 'C15_Trellis'])
    expect(resp.state.ordinaryCardDecks.minor).toEqual([])
  })

  it('does not trigger without food', () => {
    const session = setupSession({ food: 0 })

    const resp = session.performRoundEnd()

    const owner = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).not.toBe('wait')
    expect(owner.resources.food).toBe(0)
    expect(owner.minorHand).toEqual(['__test_placeholder__'])
    expect(resp.state.ordinaryCardDecks.minor).toEqual([...DRAWN_MINORS])
  })

  it('does not trigger when neither branch is possible', () => {
    const session = setupSession({ minorDeck: [] })

    const resp = session.performRoundEnd()

    const owner = resp.state.players[0]!
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).not.toBe('wait')
    expect(owner.resources.food).toBe(1)
    expect(owner.minorHand).toEqual(['__test_placeholder__'])
    expect(resp.state.ordinaryCardDecks.minor).toEqual([])
  })
})
