import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'

import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/B/B160_PubOwner'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'B160_PubOwner'

describe('B160_PubOwner session', () => {
  it('onBuy returns a gain-1-grain flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)

    const player = state.players[0]!
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBuy!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.grain).toBe(1)
  })

  it('onBeforeReturnHome gives 1 grain when forest, clay-pit, reed-bank all occupied', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 0

    // Mark all three spaces as taken
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (forest) forest.takenBy = [{ playerId: 'p2', workerId: '1' }]
    if (clayPit) clayPit.takenBy = [{ playerId: 'p1', workerId: '1' }]
    if (reedBank) reedBank.takenBy = [{ playerId: 'p2', workerId: '1' }]

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    expect(effect).toBeDefined()
    const flow = effect!.onBeforeReturnHome!(state, player)
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params?.grain).toBe(1)
  })

  it('onBeforeReturnHome does not trigger when forest is not occupied', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 0

    // Only clay-pit and reed-bank taken, forest not taken
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (clayPit) clayPit.takenBy = [{ playerId: 'p1', workerId: '1' }]
    if (reedBank) reedBank.takenBy = [{ playerId: 'p2', workerId: '1' }]

    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBeforeReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('onBeforeReturnHome does not trigger when no spaces occupied', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 0

    // No spaces taken
    session.loadState(state)

    const effect = getCardEffect(CARD_ID)
    const flow = effect!.onBeforeReturnHome!(state, player)
    expect(flow).toBeUndefined()
  })

  it('integration: end of work phase gives grain when all three spaces occupied', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 1

    state.players.forEach((p) => {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    })

    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.grain = 2

    // Mark all three spaces as occupied
    const forest = state.actionSpaces.find((s) => s.id === 'forest')
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const reedBank = state.actionSpaces.find((s) => s.id === 'reed-bank')
    if (forest) forest.takenBy = state.players[0]!.id
    if (clayPit) clayPit.takenBy = state.players[1]!.id
    if (reedBank) reedBank.takenBy = state.players[0]!.id

    session.loadState(state)

    let resp = session.performRoundEnd()

    // Drive through any pending choices
    let safety = 30
    while (safety-- > 0 && resp.interaction.stateId === 'wait') {
      if (resp.interaction.stateId === 'wait') {
        const skipOpt = resp.interaction.request.options?.find((o: ActionChoiceOption) => o.value === '__skip__')
        if (skipOpt) {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, '__skip__')
        } else {
          resp = session.resolveChoice(resp.interaction.playerIndex ?? 0, resp.interaction.request.options[0]!.value)
        }
      } else {
        break
      }
    }

    // After round end, PubOwner should have given 1 grain during return home phase
    expect(resp.state.players[0]!.resources.grain).toBe(2 + 1)
  })
})
