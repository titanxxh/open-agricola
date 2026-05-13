import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ExtraSowableField } from '../card-effects'
import type { CropStack, FarmTilePosition, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import { dispatchReapListener } from '../../actions/effects/reap'
import type { CardImpl } from '../registry'
import { D75_WoodField } from '../../cards-display/D/D75_WoodField'

const CARD_ID = D75_WoodField.id
const MAX_STACKS = 2
const STACK_INITIAL = 3 // grain rhythm
const VIRTUAL_TILE_ROW = -75

type D75Stack = CropStack & { kind: 'wood' }

const getStacks = (player: PlayerState): D75Stack[] =>
  readCardExtraData<D75Stack[]>(player, CARD_ID, 'stacks') ?? []

const setStacks = (player: PlayerState, stacks: D75Stack[]) =>
  writeCardExtraData(player, CARD_ID, 'stacks', stacks)

const buildSlotTile = (slotIndex: number): FarmTilePosition => ({
  row: VIRTUAL_TILE_ROW,
  col: slotIndex,
})

const isMySlotTile = (tile: FarmTilePosition) =>
  tile.row === VIRTUAL_TILE_ROW && tile.col >= 0 && tile.col < MAX_STACKS

const isDoableListener: CardListenerRegistration = {
  id: 'D75-wood-field-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (canSow(context.player)) return
    if (getStacks(context.player).length >= MAX_STACKS) return
    if ((context.player.resources.wood ?? 0) <= 0) return
    return { doable: true }
  },
}

export const D75_WoodField_impl = {
  listeners: [isDoableListener],
  effect: {
    id: CARD_ID,

    onComputeSowableFields: (player): ExtraSowableField[] => {
      const used = getStacks(player).length
      const freeSlots = MAX_STACKS - used
      const wood = player.resources.wood ?? 0
      const expose = Math.min(freeSlots, wood)
      const entries: ExtraSowableField[] = []
      for (let i = used; i < used + expose; i++) {
        entries.push({
          tile: buildSlotTile(i),
          allowedCrops: ['wood'],
          sourceCard: CARD_ID,
          groupKey: CARD_ID,
        })
      }
      return entries
    },

    onSowExtraField: (player, tile, crop) => {
      if (!isMySlotTile(tile)) return false
      if (crop !== 'wood') return false
      const stacks = getStacks(player)
      if (stacks.length >= MAX_STACKS) return false
      if ((player.resources.wood ?? 0) <= 0) return false
      player.resources.wood -= 1
      stacks.push({ kind: 'wood', remaining: STACK_INITIAL })
      setStacks(player, stacks)
      return true
    },

    onHarvestFieldPhase: (state, player) => {
      const stacks = getStacks(player)
      if (stacks.length === 0) return
      let gained = 0
      const next: D75Stack[] = []
      for (const s of stacks) {
        s.remaining -= 1
        gained += 1
        if (s.remaining > 0) next.push(s)
      }
      player.resources.wood += gained
      setStacks(player, next)
      dispatchReapListener(state, player, 'wood', gained)
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
