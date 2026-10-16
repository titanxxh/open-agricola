import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { isMinorImprovementPlayable, playMinorImprovement } from '../../shared/actions/effects/improvement'
import { buildRenovationPlan, canRenovate } from '../../shared/actions/effects/renovation'

import '../../shared/cards/A/A010_WoodenShed'
import { A010_WoodenShed } from '../../shared/cards/A/A010_WoodenShed'

const CARD_ID = 'A010_WoodenShed'

describe('A010_WoodenShed session', () => {
  const setup = () => {
    const session = new GameSession(42)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('prerequisite passes in wood house', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.houseType).toBe('wood')
    expect(session.withCtx(() => meetsCardPrerequisites(player, A010_WoodenShed, state.round, state))).toBe(true)
  })

  it('prerequisite fails when house is clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseType = 'clay'
    expect(session.withCtx(() => meetsCardPrerequisites(player, A010_WoodenShed, state.round, state))).toBe(false)
  })

  it('adds +1 extra room capacity when played', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(0)
    player.minorPlayed.push(CARD_ID)
    expect(session.withCtx(() => getExtraRoomCapacity(player))).toBe(1)
  })

  it('blocks direct renovation planning when played', () => {
    const session = setup()
    const player = session.getState().state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources.clay = player.rooms
    player.resources.reed = 1

    expect(buildRenovationPlan(player, 'clay')).toBeNull()
    expect(canRenovate(player)).toBe(false)
  })

  describe('Major-Improvement-action gate', () => {
    const givePayResources = (player: ReturnType<GameSession['getState']>['state']['players'][number]) => {
      player.resources.wood = 5
      player.resources.reed = 5
    }

    it('is not playable through the minor-improvement action space', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      expect(session.withCtx(() => isMinorImprovementPlayable(state, player, CARD_ID, 'improvement', undefined, ['minor']))).toBe(false)
    })

    it('is playable through the improvement-any (Major Improvement) action space', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      expect(session.withCtx(() => isMinorImprovementPlayable(state, player, CARD_ID, 'improvement-any'))).toBe(true)
    })

    it('playMinorImprovement(actionCardId="minor-improvement") fails for A10', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      const result = session.withCtx(() => playMinorImprovement(state, player, CARD_ID, 'minor-improvement', undefined, undefined, undefined, session.actionHooks))
      expect(result.type).toBe('fail')
      expect(player.minorPlayed).not.toContain(CARD_ID)
    })

    it('playMinorImprovement(actionCardId="improvement-any") succeeds for A10', () => {
      const session = setup()
      const state = session.getState().state
      const player = state.players[0]!
      player.minorHand.push(CARD_ID)
      givePayResources(player)
      const result = session.withCtx(() => playMinorImprovement(state, player, CARD_ID, 'improvement-any', undefined, undefined, undefined, session.actionHooks))
      expect(result.type === 'ok' || result.type === 'flow').toBe(true)
      expect(player.minorPlayed).toContain(CARD_ID)
    })
  })
})
