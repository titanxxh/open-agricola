import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { runCardEffectHook } from '../../shared/cards/card-effects'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A121_ClayPuncher'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { ActionFlow } from '../../shared/contract/types'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

describe('A121_ClayPuncher session', () => {
  const setup = (playerCount: number = 2) => {
    const session = new GameSession(undefined, undefined, { playerCount })
    const state = session.getState().state
    state.players = state.players.slice(0, playerCount)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('A121_ClayPuncher')
    setWorkersAtHome(state, player, 2)
    player.resources.clay = 0
    player.resources.food = 5

    for (const otherPlayer of state.players.slice(1)) {
      otherPlayer.workersAvailable = 2
    }

    // Ensure clay-pit has accumulated resources
    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    if (clayPit) clayPit.resources.clay = 2

    session.loadState(state)
    session.devPlayCard(0, 'A121_ClayPuncher')
    return session
  }

  it('onBuy grants 1 clay', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    const flow = runCardEffectHook(state, player, 'A121_ClayPuncher', 'onBuy')
    expect(flow).not.toBeNull()
    expect(flow!.type).toBe('leaf')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).actionId).toBe('gain')
    expect((flow as Extract<ActionFlow, { type: 'leaf' }>).params).toEqual({ clay: 1 })
  })

  it('gains 1 extra clay when using clay-pit', () => {
    const session = setup()
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const resp = session.takeAction(0, 'clay-pit')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    // 2 accumulated clay + 1 bonus from ClayPuncher = 3
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 2 + 1)
  })

  it('gains 1 extra clay when using lessons', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    // Need an occupation in hand for lessons to be usable (must be in catalog)
    player.occupationHand.push('A093_BedMaker')
    const clayBefore = player.resources.clay
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons')
    expect(resp.ok).toBe(true)

    // lessons action prompts for occupation choice
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      const option = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === 'A093_BedMaker')
      expect(option).toBeDefined()
      resp = session.resolveChoice(0, option!.value)
    }

    // Walk through player switches
    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    // Should have gained 1 clay from ClayPuncher trigger on lessons
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('gains 1 extra clay when using lessons-3', () => {
    const session = setup(3)
    const state = session.getState().state
    const player = state.players[0]!
    player.occupationHand.push('A093_BedMaker')
    const clayBefore = player.resources.clay
    session.loadState(state)

    let resp = session.takeAction(0, 'lessons-3')
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId === 'wait') {
      const option = resp.interaction.options?.find((o: ActionChoiceOption) => o.value === 'A093_BedMaker')
      expect(option).toBeDefined()
      resp = session.resolveChoice(0, option!.value)
    }

    while (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-player-switch') {
      resp = confirmPlayerSwitch(session)
    }

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore + 1)
  })

  it('does not trigger on non-matching spaces', () => {
    const session = setup()
    const state = session.getState().state
    const clayBefore = state.players[0]!.resources.clay
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const after = session.getState().state
    expect(after.players[0]!.resources.clay).toBe(clayBefore)
  })
})
