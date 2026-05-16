import type { CardImpl } from '../registry'
import type { CardListenerRegistration } from '../card-listeners'
import type { ExtraSowableField, ExtraSowableCrop } from '../card-effects'
import type {
  ActionFlow, FarmTilePosition, GameState, PlayerState,
} from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from './card-state'
import { canSow } from '../../actions/effects/sow'
import { dispatchReapListener } from '../../actions/effects/reap'

type Crop = ExtraSowableCrop

export type CardFieldStack = { crop: Crop; remaining: number }

export type CardFieldDef = {
  allowedCrops: readonly Crop[]
  capacity: number
}

export type CardFieldReapContext = {
  state: GameState
  player: PlayerState
  crop: Crop
  /** 该卡上该 crop 经本次扣减后总 remaining === 0 */
  isLast: boolean
}

export type CardFieldOptions = {
  onReap?: (ctx: CardFieldReapContext) => ActionFlow | void
  extraListeners?: CardListenerRegistration[]
}

const RHYTHM: Record<Crop, number> = {
  grain: 3, vegetable: 2, wood: 3, stone: 2,
}

const DECK_ORDINAL: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 }

export const deriveVirtualTileCol = (cardId: string, slotIdx: number): number => {
  const match = cardId.match(/^([A-E])(\d+)_/)
  if (!match) throw new Error(`[card-field] cardId "${cardId}" not in <Deck><Number>_ format`)
  const deckLetter = match[1]
  const cardNumber = Number(match[2])
  const ord = DECK_ORDINAL[deckLetter]
  if (ord === undefined) throw new Error(`[card-field] unknown deck letter "${deckLetter}" in ${cardId}`)
  return ord * 1000 + cardNumber + slotIdx
}

const readStacks = (player: PlayerState, cardId: string): CardFieldStack[] =>
  readCardExtraData<CardFieldStack[]>(player, cardId, 'cardFieldStacks') ?? []

const writeStacks = (player: PlayerState, cardId: string, stacks: CardFieldStack[]) =>
  writeCardExtraData(player, cardId, 'cardFieldStacks', stacks)

const tileMatchesCard = (cardId: string, capacity: number, tile: FarmTilePosition): number | null => {
  if (tile.row !== -1) return null
  for (let i = 0; i < capacity; i += 1) {
    if (deriveVirtualTileCol(cardId, i) === tile.col) return i
  }
  return null
}

export const makeCardFieldImpl = (
  cardId: string,
  def: CardFieldDef,
  options?: CardFieldOptions,
): CardImpl => {
  const isDoableListener: CardListenerRegistration = {
    id: `${cardId}-cardfield-isdoable-sow`,
    cardIds: [cardId],
    phases: ['isDoable'],
    actions: ['sow'],
    handler: ({ player }) => {
      if (canSow(player)) return
      const stacks = readStacks(player, cardId)
      if (stacks.length >= def.capacity) return
      const hasAny = def.allowedCrops.some((c) => (player.resources[c] ?? 0) > 0)
      if (!hasAny) return
      return { doable: true }
    },
  }

  return {
    listeners: [isDoableListener, ...(options?.extraListeners ?? [])],
    effect: {
      id: cardId,

      onComputeSowableFields: (player): ExtraSowableField[] => {
        const stacks = readStacks(player, cardId)
        const free = def.capacity - stacks.length
        if (free <= 0) return []
        const entries: ExtraSowableField[] = []
        for (let i = stacks.length; i < def.capacity; i += 1) {
          entries.push({
            tile: { row: -1, col: deriveVirtualTileCol(cardId, i) },
            allowedCrops: def.allowedCrops as ExtraSowableCrop[],
            sourceCard: cardId,
            groupKey: def.capacity > 1 ? cardId : undefined,
          })
        }
        return entries
      },

      onSowExtraField: (player, tile, crop) => {
        if (tileMatchesCard(cardId, def.capacity, tile) === null) return false
        if (!def.allowedCrops.includes(crop)) return false
        const stacks = readStacks(player, cardId)
        if (stacks.length >= def.capacity) return false
        if ((player.resources[crop] ?? 0) <= 0) return false
        player.resources[crop] -= 1
        stacks.push({ crop, remaining: RHYTHM[crop] })
        writeStacks(player, cardId, stacks)
        return true
      },

      onHarvestFieldPhase: (state, player): ActionFlow | void => {
        const stacks = readStacks(player, cardId)
        if (stacks.length === 0) return
        // Pass 1: decrement each stack, accumulate into summary, track per-crop total
        const perCropAmount = new Map<Crop, number>()
        const nextStacks: CardFieldStack[] = []
        for (const stack of stacks) {
          stack.remaining -= 1
          player.resources[stack.crop] += 1
          perCropAmount.set(stack.crop, (perCropAmount.get(stack.crop) ?? 0) + 1)
          if (stack.remaining > 0) nextStacks.push(stack)
        }
        // Accumulate into harvestReapSummary (modulo entry must already exist)
        const entry = state.harvestReapSummary?.[player.id]
        if (entry) {
          for (const [crop, amount] of perCropAmount) {
            entry.resources[crop] = (entry.resources[crop] ?? 0) + amount
          }
        }
        writeStacks(player, cardId, nextStacks)
        // Pass 2: dispatch reap event + collect onReap flows
        const flows: ActionFlow[] = []
        for (const [crop, amount] of perCropAmount) {
          dispatchReapListener(state, player, crop, amount)
          const stillHas = nextStacks.some((s) => s.crop === crop)
          const isLast = !stillHas
          const flow = options?.onReap?.({ state, player, crop, isLast })
          if (flow) flows.push(flow)
        }
        if (flows.length === 0) return
        if (flows.length === 1) return flows[0]
        return { type: 'seq', children: flows }
      },
    },
    reaches: [] as readonly string[],
  } satisfies CardImpl
}
