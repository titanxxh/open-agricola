import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ExtraSowableField } from '../card-effects'
import type { CropStack, FarmTilePosition, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import { dispatchReapListener } from '../../actions/effects/reap'
import type { CardImpl } from '../registry'
import { E80_RockGarden } from '../../cards-display/E/E80_RockGarden'

const CARD_ID = E80_RockGarden.id
const MAX_STACKS = 3
const STACK_INITIAL = 2 // vegetable rhythm
const VIRTUAL_TILE_ROW = -80

type E80Stack = CropStack & { kind: 'stone' }

const getStacks = (player: PlayerState): E80Stack[] =>
  readCardExtraData<E80Stack[]>(player, CARD_ID, 'stacks') ?? []

const setStacks = (player: PlayerState, stacks: E80Stack[]) =>
  writeCardExtraData(player, CARD_ID, 'stacks', stacks)

const buildSlotTile = (slotIndex: number): FarmTilePosition => ({
  row: VIRTUAL_TILE_ROW,
  col: slotIndex,
})

const isMySlotTile = (tile: FarmTilePosition) =>
  tile.row === VIRTUAL_TILE_ROW && tile.col >= 0 && tile.col < MAX_STACKS

const isDoableListener: CardListenerRegistration = {
  id: 'E80-rock-garden-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (canSow(context.player)) return
    if (getStacks(context.player).length >= MAX_STACKS) return
    if ((context.player.resources.stone ?? 0) <= 0) return
    return { doable: true }
  },
}

export const E80_RockGarden_impl = {
  listeners: [isDoableListener],
  effect: {
    id: CARD_ID,

    onComputeSowableFields: (player): ExtraSowableField[] => {
      const used = getStacks(player).length
      const freeSlots = MAX_STACKS - used
      const stone = player.resources.stone ?? 0
      const expose = Math.min(freeSlots, stone)
      const entries: ExtraSowableField[] = []
      for (let i = used; i < used + expose; i++) {
        entries.push({
          tile: buildSlotTile(i),
          allowedCrops: ['stone'],
          sourceCard: CARD_ID,
          groupKey: CARD_ID,
        })
      }
      return entries
    },

    onSowExtraField: (player, tile, crop) => {
      if (!isMySlotTile(tile)) return false
      if (crop !== 'stone') return false
      const stacks = getStacks(player)
      if (stacks.length >= MAX_STACKS) return false
      if ((player.resources.stone ?? 0) <= 0) return false
      player.resources.stone -= 1
      stacks.push({ kind: 'stone', remaining: STACK_INITIAL })
      setStacks(player, stacks)
      return true
    },

    onHarvestFieldPhase: (state, player) => {
      const stacks = getStacks(player)
      if (stacks.length === 0) return
      let gained = 0
      const next: E80Stack[] = []
      for (const s of stacks) {
        s.remaining -= 1
        gained += 1
        if (s.remaining > 0) next.push(s)
      }
      player.resources.stone += gained
      setStacks(player, next)
      dispatchReapListener(state, player, 'stone', gained)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
