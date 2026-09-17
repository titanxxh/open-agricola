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

    // Listeners are state-pure, so the dispatch context is observed through a
    // closure and the owner-targeted effect is a returned special-effect leaf.
    const observed: Array<{ triggerPlayerId?: string; ownerPlayerId?: string; playerId: string }> = []
    const listener: CardListenerRegistration = {
      id: 'test-context-owner-after-forest',
      cardIds: [CARD_ID],
      scope: 'opponent',
      phases: ['after'],
      actions: ['place-farmer'],
      handler: (ctx) => {
        if (ctx.space?.id !== 'forest') return
        observed.push({
          triggerPlayerId: ctx.triggerPlayer?.id,
          ownerPlayerId: ctx.ownerPlayer?.id,
          playerId: ctx.player.id,
        })
        return {
          flow: {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: 'seenForest', value: true },
          },
          sourceCard: CARD_ID,
        }
      },
    }

    requireActiveCardRegistry('lazy-listener-context').registerListener(listener)
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.resources.wood = 1
    session.loadState(state)

    const resp = session.takeAction(0, 'forest')

    expect(resp.ok).toBe(true)
    expect(observed).toEqual([{
      triggerPlayerId: trigger.id,
      ownerPlayerId: owner.id,
      playerId: trigger.id,
    }])
    expect(resp.state.players[1]!.cardStates?.[CARD_ID]?.extraData?.seenForest).toBe(true)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]).toBeUndefined()
  })
})
