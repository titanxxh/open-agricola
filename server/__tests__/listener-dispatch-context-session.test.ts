import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import { setWorkersAtHome } from '../../shared/domain/player'

const CARD_ID = 'TEST_ContextOwner'

describe('lazy listener dispatch context', () => {
  it('executes opponent listener with trigger player and owner player separated', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'

    const trigger = state.players[0]!
    const owner = state.players[1]!
    setWorkersAtHome(state, trigger, 1)
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    owner.minorPlayed.push(CARD_ID)
    owner.cardStates = owner.cardStates ?? {}

    const listener: CardListenerRegistration = {
      id: 'test-context-owner-after-forest',
      cardIds: [CARD_ID],
      scope: 'opponent',
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'forest') return
        const ownerPlayer = ctx.ownerPlayer ?? owner
        ownerPlayer.cardStates = ownerPlayer.cardStates ?? {}
        ownerPlayer.cardStates[CARD_ID] = {
          extraData: {
            triggerPlayerId: ctx.triggerPlayer?.id,
            ownerPlayerId: ctx.ownerPlayer?.id,
            playerId: ctx.player.id,
          },
        }
      },
    }

    requireActiveCardRegistry('lazy-listener-context').registerListener(listener)
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.resources.wood = 1
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[1]!.cardStates?.[CARD_ID]?.extraData).toEqual({
      triggerPlayerId: trigger.id,
      ownerPlayerId: owner.id,
      playerId: trigger.id,
    })
  })
})
