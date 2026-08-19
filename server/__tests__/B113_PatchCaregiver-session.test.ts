import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed } from '../../shared/domain/player'
import '../../shared/cards/B/B113_PatchCaregiver'
import { B113_PatchCaregiver_impl } from '../../shared/cards/B/B113_PatchCaregiver'

const CARD_ID = 'B113_PatchCaregiver'
const VIRTUAL_COL = 2113
const harvestRounds = [4, 7, 9, 11, 13, 14]

const setup = (options?: {
  resources?: Partial<{ grain: number; vegetable: number; wood: number; stone: number; food: number }>
  round?: number
  stacks?: { crop: 'grain' | 'vegetable' | 'wood' | 'stone'; remaining: number }[]
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1
  state.roundPhase = 'work'
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  player.workersAvailable = options?.round && harvestRounds.includes(options.round) ? 0 : 2
  player.resources.food = options?.resources?.food ?? 10
  player.resources.grain = options?.resources?.grain ?? 0
  player.resources.vegetable = options?.resources?.vegetable ?? 0
  player.resources.wood = options?.resources?.wood ?? 0
  player.resources.stone = options?.resources?.stone ?? 0
  player.fields = []
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
  player.minorPlayed.push(CARD_ID)
  if (options?.stacks) {
    player.cardStates = player.cardStates ?? {}
    player.cardStates[CARD_ID] = { extraData: { cardFieldStacks: options.stacks } }
  }
  if (options?.round && harvestRounds.includes(options.round)) {
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
      p.resources.food = 10
    }
  }
  session.loadState(state)
  return session
}

describe('B113 PatchCaregiver — cardField bug fix (4 crops)', () => {
  it.each(['grain', 'vegetable', 'wood', 'stone'] as const)(
    'allows sowing %s on virtual tile (reference constraints=null)',
    (crop) => {
      const session = setup({ resources: { [crop]: 2 } })
      const resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.farm.farmType === 'sow') {
        const cardField = resp.interaction.request.farm.selectableFields.find(
          (f) => f.tile.row === -1 && f.tile.col === VIRTUAL_COL,
        )
        expect(cardField).toBeDefined()
        expect(cardField?.allowedCrops).toContain(crop)
      }
      const next = session.commitSelectionChoice(0, {
        crops: [{ row: -1, col: VIRTUAL_COL, crop }],
      })
      expect(next.ok).toBe(true)
      const player = next.state.players[0]!
      expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([
        { crop, remaining: crop === 'grain' || crop === 'wood' ? 3 : 2 },
      ])
      expect(player.resources[crop]).toBe(1)
    },
  )

  it('harvest produces +1 of sown crop and updates summary/log', () => {
    const session = setup({
      round: 4,
      stacks: [{ crop: 'grain', remaining: 2 }],
    })
    const resp = session.performRoundEnd()
    expect(resp.ok).toBe(true)
    const player = resp.state.players[0]!
    expect(player.resources.grain).toBe(1)
    expect(player.cardStates?.[CARD_ID]?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 1 },
    ])
    const logs = resp.state.log
    const reapDetail = logs.find(
      (e) => e.key === 'log.reapDetail' && (e.params as { player?: string })?.player === player.name,
    )
    expect(reapDetail).toBeDefined()
    expect((reapDetail!.params as { resources: { grain?: number } }).resources.grain).toBeGreaterThanOrEqual(1)
  })

  it('onBuy XOR pending shows two pay/gain options', () => {
    const session = setup()
    const state = session.getState().state
    const flow = B113_PatchCaregiver_impl.effect.onBuy!(state, state.players[0]!)
    expect(flow).toMatchObject({ type: 'xor', optional: true })
    const xor = flow as Extract<typeof flow, { type: 'xor' }>
    expect(xor.children).toHaveLength(2)
    expect(xor.children[0]).toMatchObject({ type: 'seq' })
    expect(xor.children[1]).toMatchObject({ type: 'seq' })
  })
})
