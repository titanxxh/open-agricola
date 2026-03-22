import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { storePendingFenceBonus } from '../../shared/cards/helpers/pending-fence-bonus'
import type { PlayerState } from '../../shared/game/types.ts'

const fenceTradeModifiers: PlayerState['activeModifiers'] = [
  {
    type: 'trade',
    cardId: 'Test_Fence_Clay',
    appliesTo: ['fencing'],
    from: { clay: 2 },
    to: { wood: 2 },
    max: 2,
  },
  {
    type: 'trade',
    cardId: 'Test_Fence_Stone',
    appliesTo: ['fencing'],
    from: { stone: 2 },
    to: { wood: 2 },
    max: 2,
  },
]

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

describe('fence payment session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources = {
      ...player.resources,
      clay: 2,
      stone: 2,
    }
    player.activeModifiers = [...fenceTradeModifiers]
    storePendingFenceBonus(player, {
      sourceCard: 'TestFenceBonus',
      counterKey: 'fences',
      freeFences: 2,
    })

    session.loadState(state)
    return session
  }

  it('prompts for fence payment and applies the selected solution', () => {
    const session = setup()

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('farmSelect')
    if (resp.interaction.stateId !== 'farmSelect') return
    expect(resp.interaction.farm.farmType).toBe('fence')

    resp = session.commitFarmChoice(0, 'fence', {
      edges: edgesForTile(1, 1),
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return
    expect(resp.pending.promptKey).toBe('prompt.selectPayment')

    const stoneOption = resp.pending.options.find(
      (option) => typeof option.labelParams === 'object' && option.labelParams?.resourcesPaid?.stone === 2,
    )
    expect(stoneOption).toBeDefined()

    resp = session.resolveChoice(0, stoneOption!.value)
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.clay).toBe(2)
    expect(resp.state.players[0]!.resources.stone).toBe(0)
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
  })
})
