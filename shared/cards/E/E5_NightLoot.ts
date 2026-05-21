import type { ActionFlow, Resource } from '../../contract/types'
import type { CardImpl } from '../registry'
import { createPartialTakeFromSpaceLeaf } from '../helpers/partial-take'
import { E5_NightLoot } from '../../cards-display/E/E5_NightLoot'

const CARD_ID = E5_NightLoot.id

const BUILDING_RESOURCES: (keyof Resource)[] = ['wood', 'clay', 'reed', 'stone']

type Option = { spaceId: string; spaceName: string; type: keyof Resource }

const collectLeaf = (opt: Option): ActionFlow =>
  createPartialTakeFromSpaceLeaf({
    sourceCard: CARD_ID,
    spaceId: opt.spaceId,
    spaceName: opt.spaceName,
    resource: opt.type,
    includeEffectPreview: true,
  })

export const E5_NightLoot_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (state): ActionFlow | undefined => {
      const options: Option[] = []
      for (const space of state.actionSpaces) {
        for (const type of BUILDING_RESOURCES) {
          const isAccumulation = (space.gainPerRound?.[type] ?? 0) > 0
          if (!isAccumulation) continue
          if ((space.resources[type] ?? 0) >= 1) {
            options.push({ spaceId: space.id, spaceName: space.nameKey ?? space.id, type })
          }
        }
      }
      if (options.length === 0) return undefined

      const types = Array.from(new Set(options.map((o) => o.type)))
      const nb = types.length >= 2 ? 2 : 1

      if (nb === 1) {
        if (options.length === 1) return collectLeaf(options[0]!)
        return { type: 'xor', children: options.map(collectLeaf) }
      }

      const pairs: ActionFlow[] = []
      for (let i = 0; i < options.length; i++) {
        for (let j = i + 1; j < options.length; j++) {
          const a = options[i]!
          const b = options[j]!
          if (a.type === b.type) continue
          pairs.push({ type: 'seq', children: [collectLeaf(a), collectLeaf(b)] })
        }
      }
      if (pairs.length === 0) return undefined
      return { type: 'xor', children: pairs }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
