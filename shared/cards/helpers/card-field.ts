import type { CardImpl } from '../registry'
import type { CardListenerRegistration } from '../card-listeners'
import type { ExtraSowableField, ExtraSowableCrop } from '../card-effects'
import type {
  ActionFlow, FarmTilePosition, GameState, PlayerState,
} from '../../contract/types'
import type { EventSink } from '../../contract/events'
import { readCardExtraData, writeCardExtraData } from './card-state'
import { canSow } from '../../actions/effects/sow'
import { dispatchReapListener, type ReapTrigger } from '../../actions/effects/reap'
import { appendImmediateEvents } from '../../events/append'

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
  amount: number
  /** 该卡上该 crop 经本次扣减后总 remaining === 0 */
  isLast: boolean
  cardId: string
  trigger: ReapTrigger
  sourceCard?: string
}

export type CardFieldOptions = {
  onReap?: (ctx: CardFieldReapContext) => ActionFlow | void
  extraListeners?: CardListenerRegistration[]
}

const RHYTHM: Record<Crop, number> = {
  grain: 3, vegetable: 2, wood: 3, stone: 2,
}

const DECK_ORDINAL: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 }

const parseCardBaseCol = (cardId: string): number => {
  const match = cardId.match(/^([A-E])(\d+)_/)
  if (!match) throw new Error(`[card-field] cardId "${cardId}" not in <Deck><Number>_ format`)
  const ord = DECK_ORDINAL[match[1]]
  if (ord === undefined) throw new Error(`[card-field] unknown deck letter "${match[1]}" in ${cardId}`)
  return ord * 1000 + Number(match[2])
}

export const deriveVirtualTileCol = (cardId: string, slotIdx: number): number =>
  parseCardBaseCol(cardId) + slotIdx

const readStacks = (player: PlayerState, cardId: string): CardFieldStack[] =>
  readCardExtraData<CardFieldStack[]>(player, cardId, 'cardFieldStacks') ?? []

const writeStacks = (player: PlayerState, cardId: string, stacks: CardFieldStack[]) =>
  writeCardExtraData(player, cardId, 'cardFieldStacks', stacks)

type CardFieldReapRunOptions = {
  trigger?: ReapTrigger
  sourceCard?: string
  eventSink?: EventSink
  updateHarvestSummary?: boolean
}

type CardFieldReaper = (
  state: GameState,
  player: PlayerState,
  options?: CardFieldReapRunOptions,
) => ActionFlow | undefined

const cardFieldReapers = new Map<string, CardFieldReaper>()

const defaultReapTrigger = (): ReapTrigger => ({ phase: 'harvest' })

const appendFlowChildren = (children: ActionFlow[], flow: ActionFlow | undefined) => {
  if (!flow) return
  if (flow.type === 'parallel') {
    children.push(...flow.children)
    return
  }
  children.push(flow)
}

const toParallelFlow = (children: ActionFlow[]): ActionFlow | undefined =>
  children.length > 0 ? { type: 'parallel', children } : undefined

const playedCardIds = (player: PlayerState): string[] => [
  ...(player.improvements ?? []),
  ...(player.minorPlayed ?? []),
  ...(player.occupationPlayed ?? []),
]

export const hasAnyCardFieldCrops = (player: PlayerState): boolean =>
  playedCardIds(player).some((cardId) =>
    readStacks(player, cardId).some((stack) => stack.remaining > 0),
  )

export const reapAllCardFields = (
  state: GameState,
  player: PlayerState,
  options: CardFieldReapRunOptions = {},
): ActionFlow | undefined => {
  const children: ActionFlow[] = []
  for (const cardId of playedCardIds(player)) {
    appendFlowChildren(children, cardFieldReapers.get(cardId)?.(state, player, options))
  }
  return toParallelFlow(children)
}

export const makeCardFieldImpl = (
  cardId: string,
  def: CardFieldDef,
  options?: CardFieldOptions,
): CardImpl => {
  const baseCol = parseCardBaseCol(cardId)

  const reapCardField = (
    state: GameState,
    player: PlayerState,
    runOptions: CardFieldReapRunOptions = {},
  ): ActionFlow | undefined => {
    const stacks = readStacks(player, cardId)
    if (stacks.length === 0) return
    const trigger = runOptions.trigger ?? defaultReapTrigger()
    const perCropAmount = new Map<Crop, number>()
    const nextStacks: CardFieldStack[] = []
    for (const stack of stacks) {
      stack.remaining -= 1
      player.resources[stack.crop] += 1
      perCropAmount.set(stack.crop, (perCropAmount.get(stack.crop) ?? 0) + 1)
      if (stack.remaining > 0) nextStacks.push(stack)
    }
    if (runOptions.updateHarvestSummary !== false) {
      const entry = state.harvestReapSummary?.[player.id]
      if (entry) {
        for (const [crop, amount] of perCropAmount) {
          entry.resources[crop] = (entry.resources[crop] ?? 0) + amount
        }
      }
    }
    const events = [...perCropAmount].map(([crop, amount]) => ({
      type: 'resource.moved' as const,
      resources: { [crop]: amount },
      from: { kind: 'card' as const, playerId: player.id, cardId },
      to: { kind: 'player' as const, playerId: player.id },
      reason: 'reap' as const,
      trigger,
      sourceCardId: cardId,
    }))
    if (runOptions.eventSink) {
      events.forEach((event) => runOptions.eventSink!.emit<'resource.moved'>(event))
    } else if (Number.isSafeInteger(state.round) && state.round > 0) {
      appendImmediateEvents(
        state,
        events,
        { actorPlayerId: player.id, sourceActionId: 'reap', sourceCardId: cardId },
      )
    }
    writeStacks(player, cardId, nextStacks)
    const flows: ActionFlow[] = []
    for (const [crop, amount] of perCropAmount) {
      appendFlowChildren(
        flows,
        dispatchReapListener(state, player, crop, amount, undefined, {
          trigger,
          sourceCard: runOptions.sourceCard,
        }),
      )
      const stillHas = nextStacks.some((s) => s.crop === crop)
      const flow = options?.onReap?.({
        state,
        player,
        crop,
        amount,
        isLast: !stillHas,
        cardId,
        trigger,
        sourceCard: runOptions.sourceCard,
      })
      if (flow) appendFlowChildren(flows, flow)
    }
    return toParallelFlow(flows)
  }

  cardFieldReapers.set(cardId, reapCardField)

  const tileMatchesCard = (tile: FarmTilePosition): number | null => {
    if (tile.row !== -1) return null
    const i = tile.col - baseCol
    if (i < 0 || i >= def.capacity) return null
    return i
  }

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
            tile: { row: -1, col: baseCol + i },
            allowedCrops: [...def.allowedCrops],
            sourceCard: cardId,
            groupKey: def.capacity > 1 ? cardId : undefined,
          })
        }
        return entries
      },

      onSowExtraField: (player, tile, crop) => {
        if (tileMatchesCard(tile) === null) return false
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
        return reapCardField(state, player, { trigger: defaultReapTrigger() })
      },
    },
    reaches: [],
  } satisfies CardImpl
}
