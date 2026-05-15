import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { GameSession } from '../../../server/game/authoritative-session'
import type { PlayerState } from '../../contract/types'
import { E5_NightLoot_impl } from '../E/E5_NightLoot'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const setup = () => {
  const session = new GameSession(42)
  const core = session as any
  core.state.players.forEach((p: PlayerState) => {
    ;(p as any).minorHand = ['__test_placeholder__']
    ;(p as any).occupationHand = ['__test_placeholder__']
  })
  return { session, core }
}

describe('E5_NightLoot', () => {
  it('E5 source file does not contain "E33" (no hard coupling)', () => {
    const src = readFileSync(path.resolve(__dirname, '..', 'E', 'E5_NightLoot.ts'), 'utf8')
    expect(src.includes('E33')).toBe(false)
  })

  it('emits XOR of SEQ pairs when ≥2 distinct types available; every leaf is collect with actionContext', () => {
    const state: any = {
      actionSpaces: [
        { id: 'forest', gainPerRound: { wood: 3 }, resources: { wood: 3, clay: 0, reed: 0, stone: 0 } },
        { id: 'clay-pit', gainPerRound: { clay: 1 }, resources: { wood: 0, clay: 2, reed: 0, stone: 0 } },
        { id: 'reed-bank', gainPerRound: { reed: 1 }, resources: { wood: 0, clay: 0, reed: 1, stone: 0 } },
      ],
    }
    const flow = E5_NightLoot_impl.effect.onBuy(state, { id: 'p1' } as any)
    expect(flow).toBeDefined()
    expect(flow.type).toBe('xor')
    expect(flow.optional).toBeFalsy()
    expect(flow.children.length).toBe(3) // C(3,2) = 3
    for (const seq of flow.children) {
      expect(seq.type).toBe('seq')
      expect(seq.children.length).toBe(2)
      for (const leaf of seq.children) {
        expect(leaf.actionId).toBe('collect')
        expect(leaf.actionContext.amount).toBe(1)
        expect(['forest', 'clay-pit', 'reed-bank']).toContain(leaf.actionContext.spaceId)
      }
      expect(seq.children[0].actionContext.resource).not.toBe(seq.children[1].actionContext.resource)
    }
  })

  it('emits single collect leaf when only 1 type available (nb=1, not optional)', () => {
    const state: any = {
      actionSpaces: [
        { id: 'forest', gainPerRound: { wood: 3 }, resources: { wood: 3, clay: 0, reed: 0, stone: 0 } },
      ],
    }
    const flow = E5_NightLoot_impl.effect.onBuy(state, { id: 'p1' } as any)
    expect(flow).toBeDefined()
    expect(flow.type === 'leaf' || flow.type === 'xor').toBe(true)
    if (flow.type === 'leaf') {
      expect(flow.actionId).toBe('collect')
      expect(flow.actionContext.resource).toBe('wood')
    } else if (flow.type === 'xor') {
      expect(flow.children.length).toBe(1)
      expect(flow.optional).toBeFalsy()
    }
  })

  it('returns undefined when no accumulation space has any building resource', () => {
    const state: any = { actionSpaces: [] }
    const flow = E5_NightLoot_impl.effect.onBuy(state, { id: 'p1' } as any)
    expect(flow).toBeUndefined()
  })

  it('excludes non-accumulation spaces (gainPerRound[type] === 0)', () => {
    const state: any = {
      actionSpaces: [
        { id: 'forest', gainPerRound: { wood: 3 }, resources: { wood: 1, clay: 0, reed: 0, stone: 0 } },
        { id: 'visitor', gainPerRound: {}, resources: { wood: 5, clay: 0, reed: 0, stone: 0 } },
      ],
    }
    const flow = E5_NightLoot_impl.effect.onBuy(state, { id: 'p1' } as any)
    if (flow?.type === 'leaf') {
      expect(flow.actionContext.spaceId).toBe('forest')
    } else if (flow?.type === 'xor') {
      for (const c of flow.children) {
        const sid = c.actionContext?.spaceId ?? c.children?.[0]?.actionContext?.spaceId
        expect(sid).toBe('forest')
      }
    }
  })

  it('lists all (spaceId, type) options including multiple spaces of same type', () => {
    const state: any = {
      actionSpaces: [
        { id: 'forest', gainPerRound: { wood: 3 }, resources: { wood: 1, clay: 0, reed: 0, stone: 0 } },
        { id: 'forest-extra', gainPerRound: { wood: 1 }, resources: { wood: 1, clay: 0, reed: 0, stone: 0 } },
        { id: 'reed-bank', gainPerRound: { reed: 1 }, resources: { wood: 0, clay: 0, reed: 1, stone: 0 } },
      ],
    }
    const flow = E5_NightLoot_impl.effect.onBuy(state, { id: 'p1' } as any)
    expect(flow?.type).toBe('xor')
    expect(flow!.children.length).toBe(2) // (forest,wood)×(reed-bank,reed) + (forest-extra,wood)×(reed-bank,reed)
    const spaceIds = flow!.children.flatMap((seq: any) => seq.children.map((l: any) => l.actionContext.spaceId))
    expect(spaceIds).toContain('forest')
    expect(spaceIds).toContain('forest-extra')
  })

  it('adds display metadata for each collect leaf so same-resource choices remain distinguishable', () => {
    const state: any = {
      actionSpaces: [
        { id: 'forest', nameKey: 'actions.forest.name', gainPerRound: { wood: 3 }, resources: { wood: 1, clay: 0, reed: 0, stone: 0 } },
        { id: 'forest-extra', nameKey: 'actions.forest-extra.name', gainPerRound: { wood: 1 }, resources: { wood: 1, clay: 0, reed: 0, stone: 0 } },
        { id: 'reed-bank', nameKey: 'actions.reed-bank.name', gainPerRound: { reed: 1 }, resources: { wood: 0, clay: 0, reed: 1, stone: 0 } },
      ],
    }
    const flow = E5_NightLoot_impl.effect.onBuy(state, { id: 'p1' } as any)
    expect(flow?.type).toBe('xor')

    const leaves = flow!.children.flatMap((seq: any) => seq.children)
    for (const leaf of leaves) {
      const { resource, spaceId } = leaf.actionContext
      expect(leaf.choiceLabelKey).toBe('ui.interactionTakeFromSpace')
      expect(leaf.choiceLabelParams).toEqual({
        resource,
        spaceId,
        spaceName: `actions.${spaceId}.name`,
      })
      expect(leaf.effectPreview).toEqual({
        kind: 'resourceExchange',
        resourcesGained: { [resource]: 1 },
      })
    }
  })
})
