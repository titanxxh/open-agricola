import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
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

    resp = session.resolveChoice(0, 'confirm', {
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

  it('preserves palisade selection across fence payment-choice resolution', () => {
    // Regression (I2): when a fence commit triggers a payment-choice pending,
    // the stored farmPayment payload must retain palisadeEdges so the resumed
    // applyFarmChoice places palisades instead of silently dropping them.
    const session = new GameSession()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // 1 wood forces a payment choice when total cost is 3 (1 fence + 1 palisade*2).
    player.resources = {
      ...player.resources,
      wood: 1,
      clay: 4,
      stone: 4,
    }
    player.activeModifiers = [...fenceTradeModifiers]
    player.minorPlayed = [...player.minorPlayed, 'B30_WoodPalisades']

    session.loadState(state)

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Enclose tile (0,1) using 3 fences + 1 palisade on the top (border) edge.
    // H-0-1 is row=0 (border). H-1-1, V-0-1, V-0-2 are internal fences.
    resp = session.resolveChoice(0, 'confirm', {
      edges: ['H-1-1', 'V-0-1', 'V-0-2'],
      palisadeEdges: ['H-0-1'],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    // Pick any offered option — correctness of the post-resume application
    // (palisade placed, not dropped) is what we assert.
    const option = resp.pending.options[0]
    expect(option).toBeDefined()

    resp = session.resolveChoice(0, option!.value)
    expect(resp.ok).toBe(true)
    const segments = resp.state.players[0]!.fenceSegments
    expect(segments).toHaveLength(4)
    const palisade = segments.find((s) => s.edge === 'H-0-1')
    expect(palisade).toBeDefined()
    expect(palisade?.type).toBe('palisade')
  })
})
