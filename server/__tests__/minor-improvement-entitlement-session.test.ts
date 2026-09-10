import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/A/A096_TaskArtisan'
import '../../shared/cards/D/D026_CarpentersYard'
import '../../shared/cards/E/E109_BraidMaker'
import '../../shared/cards/E/E152_BargainHunter'
import '../../shared/cards/E/E047_SyrupTap'

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? [] : []

describe('card-granted minor improvement entitlement', () => {
  it.each([
    ['D026_CarpentersYard', 'Major_Well'],
    ['D026_CarpentersYard', 'Major_Joinery'],
    ['E109_BraidMaker', 'Major_Basket'],
  ])('%s converts a true minor action to %s but leaves Bargain Hunter restricted', (cardId, majorId) => {
    for (const trueAction of [true, false]) {
      const session = new GameSession(848865, undefined, { playerCount: trueAction ? 2 : 4 })
      const state = session.getState().state
      stabilizeRandomHands(state.players)
      state.round = 5
      state.roundPhase = 'work'
      state.currentPlayerIndex = 0
      state.availableMajorImprovements = [majorId]
      state.actionSpaces.forEach((space) => { space.takenBy = [] })
      state.players.forEach((player) => {
        setWorkersAtHome(state, player, 2)
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        Object.assign(player.resources, { wood: 10, reed: 10, stone: 10, food: 20 })
      })
      const player = state.players[0]!
      player.minorHand = ['E047_SyrupTap']
      if (cardId.startsWith('D')) player.minorPlayed.push(cardId)
      else player.occupationPlayed.push(cardId)
      if (trueAction) player.occupationHand = ['A096_TaskArtisan']
      else {
        player.occupationPlayed.push('E152_BargainHunter')
        state.players.forEach((entry) => markAllWorkersUsed(state, entry))
      }
      session.loadState(state)
      let response = trueAction ? session.takeAction(0, 'lessons') : session.performRoundEnd()
      if (trueAction && options(response).some((option) => option.value === 'A096_TaskArtisan')) {
        response = session.resolveChoice(0, 'A096_TaskArtisan')
      }
      response = resolveTriggerIfPresent(session, response, trueAction ? 'A096_TaskArtisan' : 'E152_BargainHunter')
      const accept = options(response).find((option) => option.value !== '__skip__')
      expect(accept, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(0, accept!.value)
      expect(options(response).some((option) => option.value === majorId)).toBe(trueAction)
      if (trueAction || response.state.players[0]!.minorHand.includes('E047_SyrupTap')) {
        response = session.resolveChoice(0, trueAction ? majorId : 'E047_SyrupTap')
      }
      if (response.interaction.promptKey === 'prompt.selectPayment') {
        const payment = options(response).find((option) => option.value !== 'cancel')
        expect(payment, JSON.stringify(response.interaction)).toBeDefined()
        response = session.resolveChoice(0, payment!.value)
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.improvements).toEqual(trueAction ? [majorId] : [])
      if (!trueAction) expect(response.state.players[0]!.minorPlayed).toContain('E047_SyrupTap')
      if (trueAction && cardId === 'E109_BraidMaker') {
        expect(response.state.players[0]!.resources).toMatchObject({ reed: 9, stone: 9 })
      }
    }
  })
})
