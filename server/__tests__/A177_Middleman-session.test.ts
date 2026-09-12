import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import '../../shared/cards/A/A177_Middleman'

const CARD_ID = 'A177_Middleman'
const ATTACHMENTS_KEY = 'actionSpaceAttachments'
const expectedAttachments = () =>
  ['lessons-56-2f', 'copse-56', 'lessons-56-variable', 'modest-wish-children-56', 'house-building-56', 'traveling-players-56'].map((spaceId) => ({
    spaceId,
    resources: { stone: 1, food: 1 },
  }))

const setup = () => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['A177_Middleman']
    player.resources.food = 5
  })
  session.loadState(state)
  return session
}

const setupWithAttachments = (currentPlayerIndex = 0) => {
  const session = setup()
  const state = session.getState().state
  state.currentPlayerIndex = currentPlayerIndex
  state.players.forEach((player) => {
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 0
    player.resources.stone = 0
  })
  const owner = state.players[0]!
  owner.occupationPlayed = [CARD_ID]
  owner.cardStates ??= {}
  owner.cardStates[CARD_ID] = {
    extraData: {
      [ATTACHMENTS_KEY]: expectedAttachments(),
    },
  }
  session.loadState(state)
  return session
}

const attachments = (session: GameSession) =>
  session.getState().state.players[0]!.cardStates?.[CARD_ID]?.extraData?.[ATTACHMENTS_KEY] as
    | Array<{ spaceId: string; resources: { stone: number; food: number } }>
    | undefined

describe('A177 Middleman', () => {
  it('creates one stone and one food attachment on each current meeple-symbol extension space when played', () => {
    const session = setup()

    const resp = session.takeAction(0, 'lessons-56-2f')

    expect(resp.ok).toBe(true)
    const attachments = resp.state.players[0]!.cardStates?.[CARD_ID]?.extraData?.[ATTACHMENTS_KEY]
    expect(attachments).toEqual(expectedAttachments())
  })

  it('lets the owner collect and clear only the exact attached action space', () => {
    const session = setupWithAttachments()

    const resp = session.takeAction(0, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.stone).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(attachments(session)?.some((entry) => entry.spaceId === 'copse-56')).toBe(false)
    expect(attachments(session)?.some((entry) => entry.spaceId === 'lessons-56-2f')).toBe(true)
  })

  it('does not let non-owners collect or consume an attached action space', () => {
    const session = setupWithAttachments(1)

    const resp = session.takeAction(1, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.resources.stone).toBe(0)
    expect(resp.state.players[1]!.resources.food).toBe(0)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(0)
    expect(attachments(session)?.some((entry) => entry.spaceId === 'copse-56')).toBe(true)
  })

  it('does not implicitly collect the linked partner action space', () => {
    const session = setupWithAttachments()

    const resp = session.takeAction(0, 'copse-56')

    expect(resp.ok).toBe(true)
    expect(attachments(session)?.some((entry) => entry.spaceId === 'copse-56')).toBe(false)
    expect(attachments(session)?.some((entry) => entry.spaceId === 'lessons-56-2f')).toBe(true)
  })
})
