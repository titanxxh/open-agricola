import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { A040_PottersYard, A040_PottersYard_impl } from '../../shared/cards/A/A040_PottersYard'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getAllTilePositions } from '../../shared/domain/farm'
import type { ActionFlow } from '../../shared/contract/types'
import { specialEffectAction } from '../../shared/actions/effects/special-effect'

const leaves = (flow: ActionFlow | undefined): Extract<ActionFlow, { type: 'leaf' }>[] => {
  if (!flow) return []
  if (flow.type === 'leaf') return [flow]
  return 'children' in flow ? flow.children.flatMap(leaves) : []
}

describe('A040_PottersYard prerequisite', () => {
  it('blocks when player has more than 7 free farmyard spaces', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, A040_PottersYard, state.round, state)).toBe(false)
  })

  it('allows when free spaces <= 7 (e.g. 8 spaces used)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    player.roomTiles = getAllTilePositions().slice(0, 8)
    player.fields = []
    player.stableTiles = []
    player.pastures = []
    expect(meetsCardPrerequisites(player, A040_PottersYard, state.round, state)).toBe(true)
  })

  it('records and consumes used-space counts through ordered leaves', () => {
    const session = new GameSession()
    const state = session.getState().state
    const player = state.players[0]!
    A040_PottersYard_impl.effect!.onBuy!(state, player)
    const beforeListener = A040_PottersYard_impl.listeners!.find((entry) =>
      entry.id === 'A40-potters-yard-before-plow')!
    const afterListener = A040_PottersYard_impl.listeners!.find((entry) =>
      entry.id === 'A40-potters-yard-after-plow')!

    const beforeState = JSON.stringify(state)
    const beforeResult = beforeListener.handler({ state, player, actionId: 'plow', phase: 'before' } as never)
    expect(JSON.stringify(state)).toBe(beforeState)
    const snapshotLeaf = leaves(beforeResult?.flow)[0]!
    expect(snapshotLeaf.params).toMatchObject({ kind: 'set-extra-data', key: 'usedCountBefore' })
    specialEffectAction.execute({
      state,
      player,
      params: snapshotLeaf.params,
      sourceCard: snapshotLeaf.sourceCard,
    } as never)

    const used = new Set(player.roomTiles.map((tile) => `${tile.row}-${tile.col}`))
    const tile = getAllTilePositions().find((candidate) => !used.has(`${candidate.row}-${candidate.col}`))!
    player.fields.push({ ...tile, stacks: [] })
    const afterState = JSON.stringify(state)
    const afterResult = afterListener.handler({ state, player, actionId: 'plow', phase: 'after' } as never)
    expect(JSON.stringify(state)).toBe(afterState)
    expect(leaves(afterResult?.flow)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionId: 'special-effect',
        params: expect.objectContaining({ kind: 'set-extra-data', key: 'clayRemaining' }),
      }),
      expect.objectContaining({ actionId: 'gain', params: { clay: 1 } }),
    ]))
  })
})
