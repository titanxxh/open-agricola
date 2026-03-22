import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import type { PlayerState } from '../../shared/game/types.ts'

const stableTradeModifiers: PlayerState['activeModifiers'] = [
  {
    type: 'trade',
    cardId: 'Test_Stable_Clay',
    appliesTo: ['stables'],
    from: { clay: 2 },
    to: { wood: 2 },
    max: 2,
  },
  {
    type: 'trade',
    cardId: 'Test_Stable_Stone',
    appliesTo: ['stables'],
    from: { stone: 2 },
    to: { wood: 2 },
    max: 2,
  },
]

describe('stable payment session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      wood: 5,
      reed: 2,
      clay: 2,
      stone: 2,
    }
    player.activeModifiers = [...stableTradeModifiers]

    session.loadState(state)
    return session
  }

  it('prompts for stable payment and applies the selected solution', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    const stableOption = resp.pending.options.find(
      (option) => option.labelKey === 'actions.stables.name',
    )
    expect(stableOption).toBeDefined()

    resp = session.resolveChoice(0, stableOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')
    if (resp.interaction.stateId !== 'farmSelect') return
    expect(resp.interaction.farm.farmType).toBe('stable')
    if (resp.interaction.farm.farmType !== 'stable') return

    const stable = resp.interaction.farm.selectableTiles[0]!
    resp = session.commitFarmChoice(0, 'stable', { stables: [stable] })
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')

    const stoneOption = resp.pending.options.find(
      (option) => typeof option.labelKey === 'string' && option.labelKey.includes('stone:2'),
    )
    expect(stoneOption).toBeDefined()

    resp = session.resolveChoice(0, stoneOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.stableTiles).toContainEqual(stable)
    expect(resp.state.players[0]!.resources.clay).toBe(2)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
  })
})
