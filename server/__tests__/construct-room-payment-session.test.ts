import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { A123_FrameBuilder } from '../../shared/cards/A/A123_FrameBuilder'
import type { PlayerState } from '../../shared/game/types.ts'

describe('construct room payment session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 4,
      clay: 2,
      stone: 2,
      reed: 2,
    }
    player.occupationPlayed.push('A123_FrameBuilder')
    player.playedCards.push('occupation:A123_FrameBuilder')
    player.activeModifiers = [
      ...((A123_FrameBuilder as unknown as { modifiers: PlayerState['activeModifiers'] }).modifiers ?? []),
    ]

    session.loadState(state)
    return session
  }

  it('prompts for room payment and applies the selected solution', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const constructOption = resp.pending.options.find(
      (option) => option.labelKey === 'actions.construct.name',
    )
    expect(constructOption).toBeDefined()

    resp = session.resolveChoice(0, constructOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')
    if (resp.interaction.stateId !== 'farmSelect') return
    expect(resp.interaction.farm.farmType).toBe('room')
    if (resp.interaction.farm.farmType !== 'room') return

    const room = resp.interaction.farm.selectableTiles[0]!

    resp = session.commitFarmChoice(0, 'room', { rooms: [room] })
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')
    expect(resp.pending.options).toHaveLength(2)

    const stoneOption = resp.pending.options.find(
      (option) => typeof option.labelKey === 'string' && option.labelKey.includes('stone:2'),
    )
    expect(stoneOption).toBeDefined()

    resp = session.resolveChoice(0, stoneOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.rooms).toBe(3)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
    expect(resp.state.players[0]!.resources.clay).toBe(2)
    expect(resp.state.players[0]!.resources.reed).toBe(0)
  })
})
