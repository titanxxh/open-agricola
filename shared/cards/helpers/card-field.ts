import type { CardImpl } from '../registry'
import type { CardListenerRegistration } from '../card-listeners'
import type { ExtraSowableField, ExtraSowableCrop } from '../card-effects'
import type {
  ActionFlow, FarmTilePosition, Field, GameState, PlayerState,
} from '../../contract/types'
import type { DraftGameEvent, EventSink, FarmCropRemovedEvent } from '../../contract/events'
import { readCardExtraData, writeCardExtraData } from './card-state'
import { defaultReapTrigger, type ReapTrigger } from '../../actions/helpers/reap-listener'
import { appendImmediateEvents } from '../../events/append'

type Crop = ExtraSowableCrop

export type CardFieldStack = { crop: Crop; remaining: number }
export type CardFieldSlot = CardFieldStack | null

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

export type CardFieldCropRemovedContext = Omit<CardFieldReapContext, 'trigger'> & {
  reason: FarmCropRemovedEvent['reason']
  trigger?: ReapTrigger
}

export type CardFieldOptions = {
  onReap?: (ctx: CardFieldReapContext) => ActionFlow | void
  onCropRemoved?: (ctx: CardFieldCropRemovedContext) => ActionFlow | void
  extraListeners?: CardListenerRegistration[]
}

const RHYTHM: Record<Crop, number> = {
  grain: 3, vegetable: 2, wood: 3, stone: 2,
}

const DECK_ORDINAL: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5 }
const cardFieldDefs = new Map<string, CardFieldDef>()

const parseCardBaseCol = (cardId: string): number => {
  const match = cardId.match(/^([A-E])(\d+)_/)
  if (!match) throw new Error(`[card-field] cardId "${cardId}" not in <Deck><Number>_ format`)
  const ord = DECK_ORDINAL[match[1]]
  if (ord === undefined) throw new Error(`[card-field] unknown deck letter "${match[1]}" in ${cardId}`)
  return ord * 1000 + Number(match[2])
}

export const deriveVirtualTileCol = (cardId: string, slotIdx: number): number =>
  parseCardBaseCol(cardId) + slotIdx

const readSlots = (
  player: PlayerState,
  cardId: string,
  def = cardFieldDefs.get(cardId),
): CardFieldSlot[] => {
  if (!def) throw new Error(`[card-field] missing definition for ${cardId}`)
  const stored = readCardExtraData<unknown>(player, cardId, 'cardFieldStacks')
  if (stored === undefined) return Array.from<CardFieldSlot>({ length: def.capacity }).fill(null)
  if (!Array.isArray(stored) || stored.length > def.capacity) {
    throw new Error(`[card-field] invalid fixed-slot state for ${cardId}`)
  }
  const slots = Array.from<CardFieldSlot>({ length: def.capacity }).fill(null)
  for (const [index, value] of stored.entries()) {
    if (value === null) continue
    if (
      !value ||
      typeof value !== 'object' ||
      !def.allowedCrops.includes((value as CardFieldStack).crop) ||
      !Number.isSafeInteger((value as CardFieldStack).remaining) ||
      (value as CardFieldStack).remaining <= 0
    ) {
      throw new Error(`[card-field] invalid slot ${index} for ${cardId}`)
    }
    slots[index] = { ...(value as CardFieldStack) }
  }
  return slots
}

const writeSlots = (player: PlayerState, cardId: string, slots: CardFieldSlot[]) =>
  writeCardExtraData(player, cardId, 'cardFieldStacks', slots)

export type CardFieldCropRemovalResult = {
  crop: Crop
  amount: number
  flow?: ActionFlow
}

export type CardFieldCropRemovalOptions = {
  reason?: FarmCropRemovedEvent['reason']
  sourceCard?: string
  eventSink?: EventSink
}

type CardFieldCropRemover = (
  state: GameState,
  player: PlayerState,
  slotIdx: number,
  options?: CardFieldCropRemovalOptions,
) => CardFieldCropRemovalResult | undefined

const cardFieldCropRemovers = new Map<string, CardFieldCropRemover>()
const cardFieldOptions = new Map<string, CardFieldOptions>()

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
    cardFieldDefs.has(cardId) && readSlots(player, cardId).some((slot) => slot !== null),
  )

export const hasCardFieldCrop = (player: PlayerState, crop: Crop): boolean =>
  playedCardIds(player).some((cardId) =>
    cardFieldDefs.has(cardId) && readSlots(player, cardId).some((slot) => slot?.crop === crop),
  )

export type LogicalFieldSlot = Readonly<{
  index: number
  tile: Readonly<FarmTilePosition>
  stack: Readonly<Field['stacks'][number]> | null
}>

export type LogicalField = Readonly<{
  id: string
  kind: 'farmyard' | 'card'
  row: number
  col: number
  stacks: readonly Readonly<Field['stacks'][number]>[]
  slots: readonly LogicalFieldSlot[]
  sourceCard?: string
  groupKey: string
}>

export type LogicalFieldTarget = {
  fieldId: string
  slot?: number
}

export type LogicalFieldMutationTarget = LogicalFieldTarget | FarmTilePosition

export type LogicalFieldMutationOptions = {
  sourceCard?: string
  eventSink?: EventSink
  reason?: FarmCropRemovedEvent['reason']
  emitEvents?: boolean
  trigger?: ReapTrigger
  deferOwnerCallbacks?: boolean
}

export type LogicalFieldMutationResult =
  | { ok: true; crop?: Crop; amount?: number; flow?: ActionFlow; ownerCallback?: () => ActionFlow | undefined }
  | { ok: false; error: 'invalid-target' | 'invalid-amount' | 'invalid-crop' | 'occupied' | 'empty' }

const farmyardFieldId = (field: Pick<Field, 'row' | 'col'>) =>
  `farmyard:${field.row}:${field.col}`

const freezeStack = (stack: Field['stacks'][number]) => Object.freeze({ ...stack })

export const getFarmyardFields = (player: PlayerState): readonly LogicalField[] =>
  Object.freeze(
    [...player.fields]
      .sort((a, b) => a.row - b.row || a.col - b.col)
      .map((field): LogicalField => {
        const stacks = Object.freeze(field.stacks.map(freezeStack))
        return Object.freeze({
          id: farmyardFieldId(field),
          kind: 'farmyard',
          row: field.row,
          col: field.col,
          stacks,
          slots: Object.freeze(stacks.map((stack, index) => Object.freeze({
            index,
            tile: Object.freeze({ row: field.row, col: field.col }),
            stack,
          }))),
          groupKey: farmyardFieldId(field),
        })
      }),
  )

const getCardFields = (player: PlayerState): readonly LogicalField[] =>
  [...new Set(playedCardIds(player))]
    .filter((cardId) => cardFieldDefs.has(cardId))
    .sort()
    .map((cardId): LogicalField => {
      const slots = readSlots(player, cardId)
      const logicalSlots = Object.freeze(slots.map((slot, index) => {
        const stack = slot ? freezeStack({ kind: slot.crop, remaining: slot.remaining }) : null
        return Object.freeze({
          index,
          tile: Object.freeze({ row: -1, col: deriveVirtualTileCol(cardId, index) }),
          stack,
        })
      }))
      return Object.freeze({
        id: `card:${cardId}`,
        kind: 'card',
        row: -1,
        col: deriveVirtualTileCol(cardId, 0),
        stacks: Object.freeze(logicalSlots.flatMap((slot) => slot.stack ? [slot.stack] : [])),
        slots: logicalSlots,
        sourceCard: cardId,
        groupKey: cardId,
      })
    })

export const getLogicalFields = (player: PlayerState): readonly LogicalField[] =>
  Object.freeze([...getFarmyardFields(player), ...getCardFields(player)])

const validAmount = (amount: number) => Number.isSafeInteger(amount) && amount > 0

export const mutateLogicalFields = (
  state: GameState,
  player: PlayerState,
  options: LogicalFieldMutationOptions = {},
) => {
  const validateCardFields = () => {
    for (const cardId of playedCardIds(player)) {
      if (cardFieldDefs.has(cardId)) readSlots(player, cardId)
    }
  }
  const normalizeTarget = (target: LogicalFieldMutationTarget): LogicalFieldTarget | undefined => {
    if ('fieldId' in target) return target
    const farmyard = player.fields.find((field) => field.row === target.row && field.col === target.col)
    if (farmyard) return { fieldId: farmyardFieldId(farmyard) }
    for (const cardId of playedCardIds(player)) {
      const def = cardFieldDefs.get(cardId)
      if (!def || target.row !== -1) continue
      const slot = target.col - deriveVirtualTileCol(cardId, 0)
      if (Number.isSafeInteger(slot) && slot >= 0 && slot < def.capacity) {
        return { fieldId: `card:${cardId}`, slot }
      }
    }
  }
  const farmyardTarget = (target: LogicalFieldTarget) =>
    player.fields.find((field) => farmyardFieldId(field) === target.fieldId)
  const cardTarget = (target: LogicalFieldTarget) => {
    if (!target.fieldId.startsWith('card:')) return
    const cardId = target.fieldId.slice('card:'.length)
    if (!playedCardIds(player).includes(cardId)) return
    const def = cardFieldDefs.get(cardId)
    if (!def) return
    const slot = target.slot ?? 0
    if (!Number.isSafeInteger(slot) || slot < 0 || slot >= def.capacity) return
    return { cardId, def, slot, slots: readSlots(player, cardId, def) }
  }
  const emit = <T extends DraftGameEvent['type']>(event: DraftGameEvent<T>) => {
    if (options.emitEvents === false) return
    if (options.eventSink) {
      options.eventSink.emitMany([event])
    } else if (Number.isSafeInteger(state.round) && state.round > 0) {
      appendImmediateEvents(state, [event], {
        actorPlayerId: player.id,
        sourceActionId: 'logical-field-mutation',
        sourceCardId: options.sourceCard,
      })
    }
  }
  const emitAdded = (
    target: Field | { cardId: string },
    crop: Crop,
    amount: number,
  ) => emit<'farm.cropAdded'>({
    type: 'farm.cropAdded',
    sourceCardId: options.sourceCard,
    crops: [{
      location: 'cardId' in target
        ? { kind: 'card', playerId: player.id, cardId: target.cardId }
        : { kind: 'field', playerId: player.id, row: target.row, col: target.col },
      crop,
      amount,
    }],
    reason: 'cardEffect',
  })
  const emitRemoved = (
    target: Field | { cardId: string },
    crop: Crop,
    amount: number,
  ) => emit<'farm.cropRemoved'>({
    type: 'farm.cropRemoved',
    sourceCardId: options.sourceCard,
    crops: [{
      location: 'cardId' in target
        ? { kind: 'card', playerId: player.id, cardId: target.cardId }
        : { kind: 'field', playerId: player.id, row: target.row, col: target.col },
      crop,
      amount,
    }],
    reason: options.reason ?? 'cardEffect',
  })
  const cardRemovalCallback = (
    cardId: string,
    crop: Crop,
    amount: number,
    slots: CardFieldSlot[],
  ) => {
    const owner = cardFieldOptions.get(cardId)
    const isLast = !slots.some((candidate) => candidate?.crop === crop)
    return (): ActionFlow | undefined => {
      const flows: ActionFlow[] = []
      if (options.reason === 'reap') {
        const reapFlow = owner?.onReap?.({
          state,
          player,
          crop,
          amount,
          isLast,
          cardId,
          trigger: options.trigger ?? defaultReapTrigger(),
          sourceCard: options.sourceCard,
        })
        if (reapFlow) appendFlowChildren(flows, reapFlow)
      }
      const removedFlow = owner?.onCropRemoved?.({
        state,
        player,
        crop,
        amount,
        isLast,
        cardId,
        reason: options.reason ?? 'cardEffect',
        ...(options.trigger ? { trigger: options.trigger } : {}),
        sourceCard: options.sourceCard,
      })
      if (removedFlow) appendFlowChildren(flows, removedFlow)
      return flows.length === 1 ? flows[0] : toParallelFlow(flows)
    }
  }
  const place = (
    requestedTarget: LogicalFieldMutationTarget,
    crop: Crop,
    amount: number,
  ): LogicalFieldMutationResult => {
    validateCardFields()
    if (!validAmount(amount)) return { ok: false, error: 'invalid-amount' }
    const target = normalizeTarget(requestedTarget)
    if (!target) return { ok: false, error: 'invalid-target' }
    const field = farmyardTarget(target)
    if (field) {
      if (field.stacks.length > 0) return { ok: false, error: 'occupied' }
      field.stacks.push({ kind: crop, remaining: amount })
      emitAdded(field, crop, amount)
      return { ok: true }
    }
    const card = cardTarget(target)
    if (!card) return { ok: false, error: 'invalid-target' }
    if (!card.def.allowedCrops.includes(crop)) return { ok: false, error: 'invalid-crop' }
    if (card.slots[card.slot]) return { ok: false, error: 'occupied' }
    card.slots[card.slot] = { crop, remaining: amount }
    writeSlots(player, card.cardId, card.slots)
    emitAdded(card, crop, amount)
    return { ok: true }
  }
  const grow = (
    requestedTarget: LogicalFieldMutationTarget,
    amount = 1,
  ): LogicalFieldMutationResult => {
    validateCardFields()
    if (!validAmount(amount)) return { ok: false, error: 'invalid-amount' }
    const target = normalizeTarget(requestedTarget)
    if (!target) return { ok: false, error: 'invalid-target' }
    const field = farmyardTarget(target)
    if (field) {
      const stack = field.stacks[target.slot ?? field.stacks.length - 1]
      if (!stack) return { ok: false, error: 'empty' }
      stack.remaining += amount
      emitAdded(field, stack.kind, amount)
      return { ok: true, crop: stack.kind, amount }
    }
    const card = cardTarget(target)
    if (!card) return { ok: false, error: 'invalid-target' }
    const stack = card.slots[card.slot]
    if (!stack) return { ok: false, error: 'empty' }
    stack.remaining += amount
    writeSlots(player, card.cardId, card.slots)
    emitAdded(card, stack.crop, amount)
    return { ok: true, crop: stack.crop, amount }
  }
  const remove = (
    requestedTarget: LogicalFieldMutationTarget,
    requestedAmount?: number,
  ): LogicalFieldMutationResult => {
    validateCardFields()
    const target = normalizeTarget(requestedTarget)
    if (!target) return { ok: false, error: 'invalid-target' }
    const field = farmyardTarget(target)
    if (field) {
      const slot = target.slot ?? field.stacks.length - 1
      const stack = field.stacks[slot]
      if (!stack) return { ok: false, error: 'empty' }
      const amount = requestedAmount ?? stack.remaining
      if (!validAmount(amount) || amount > stack.remaining) return { ok: false, error: 'invalid-amount' }
      const crop = stack.kind
      stack.remaining -= amount
      if (stack.remaining === 0) field.stacks.splice(slot, 1)
      emitRemoved(field, crop, amount)
      return { ok: true, crop, amount }
    }
    const card = cardTarget(target)
    if (!card) return { ok: false, error: 'invalid-target' }
    const stack = card.slots[card.slot]
    if (!stack) return { ok: false, error: 'empty' }
    const amount = requestedAmount ?? stack.remaining
    if (!validAmount(amount) || amount > stack.remaining) return { ok: false, error: 'invalid-amount' }
    const crop = stack.crop
    card.slots[card.slot] = amount === stack.remaining
      ? null
      : { ...stack, remaining: stack.remaining - amount }
    writeSlots(player, card.cardId, card.slots)
    emitRemoved(card, crop, amount)
    const ownerCallback = cardRemovalCallback(card.cardId, crop, amount, card.slots)
    if (options.deferOwnerCallbacks) return { ok: true, crop, amount, ownerCallback }
    const flow = ownerCallback()
    return { ok: true, crop, amount, ...(flow ? { flow } : {}) }
  }
  const replace = (
    requestedTarget: LogicalFieldMutationTarget,
    crop: Crop,
    amount: number,
  ): LogicalFieldMutationResult => {
    validateCardFields()
    if (!validAmount(amount)) return { ok: false, error: 'invalid-amount' }
    const target = normalizeTarget(requestedTarget)
    if (!target) return { ok: false, error: 'invalid-target' }
    const field = farmyardTarget(target)
    if (field) {
      const slot = target.slot ?? field.stacks.length - 1
      const previous = field.stacks[slot]
      if (!previous) return { ok: false, error: 'empty' }
      field.stacks[slot] = { kind: crop, remaining: amount }
      emitRemoved(field, previous.kind, previous.remaining)
      emitAdded(field, crop, amount)
      return { ok: true }
    }
    const card = cardTarget(target)
    if (!card) return { ok: false, error: 'invalid-target' }
    if (!card.def.allowedCrops.includes(crop)) return { ok: false, error: 'invalid-crop' }
    const previous = card.slots[card.slot]
    if (!previous) return { ok: false, error: 'empty' }
    card.slots[card.slot] = { crop, remaining: amount }
    writeSlots(player, card.cardId, card.slots)
    emitRemoved(card, previous.crop, previous.remaining)
    emitAdded(card, crop, amount)
    const flow = cardRemovalCallback(card.cardId, previous.crop, previous.remaining, card.slots)()
    return { ok: true, ...(flow ? { flow } : {}) }
  }
  return { place, grow, remove, replace }
}

export type CroppedCardField = {
  field: Field
  tile: FarmTilePosition
  sourceCard: string
  groupKey: string
  cardFieldSlot: number
}

export const getCroppedCardFields = (player: PlayerState): CroppedCardField[] =>
  playedCardIds(player).flatMap((cardId) => {
    if (!cardFieldDefs.has(cardId)) return []
    return readSlots(player, cardId).flatMap((stack, slotIdx) => {
      if (!stack) return []
      const tile = { row: -1, col: deriveVirtualTileCol(cardId, slotIdx) }
      return [{
        field: {
          ...tile,
          stacks: [{ kind: stack.crop, remaining: stack.remaining }],
        },
        tile,
        sourceCard: cardId,
        groupKey: cardId,
        cardFieldSlot: slotIdx,
      }]
    })
  })

export const removeCardFieldCrop = (
  state: GameState,
  player: PlayerState,
  tile: FarmTilePosition,
  options: CardFieldCropRemovalOptions = {},
): CardFieldCropRemovalResult | undefined => {
  const field = getCroppedCardFields(player).find(
    (candidate) => candidate.tile.row === tile.row && candidate.tile.col === tile.col,
  )
  if (!field) return
  return cardFieldCropRemovers.get(field.sourceCard)?.(
    state,
    player,
    field.cardFieldSlot,
    options,
  )
}

export const makeCardFieldImpl = (
  cardId: string,
  def: CardFieldDef,
  options?: CardFieldOptions,
): CardImpl => {
  const baseCol = parseCardBaseCol(cardId)
  cardFieldDefs.set(cardId, def)
  cardFieldOptions.set(cardId, options ?? {})

  cardFieldCropRemovers.set(cardId, (
    state,
    player,
    slotIdx,
    runOptions = {},
  ) => {
    const slots = readSlots(player, cardId, def)
    const stack = slots[slotIdx]
    if (!stack) return
    const crop = stack.crop
    const available = slots.reduce(
      (sum, candidate) => sum + (candidate?.crop === crop ? candidate.remaining : 0),
      0,
    )
    if (available <= 0) return
    for (const [index, candidate] of slots.entries()) {
      if (candidate?.crop === crop) slots[index] = null
    }
    writeSlots(player, cardId, slots)
    const event = {
      type: 'farm.cropRemoved' as const,
      sourceCardId: runOptions.sourceCard,
      crops: [{
        location: { kind: 'card' as const, playerId: player.id, cardId },
        crop,
        amount: available,
      }],
      reason: runOptions.reason ?? 'cardEffect',
    }
    if (runOptions.eventSink) {
      runOptions.eventSink.emit<'farm.cropRemoved'>(event)
    } else if (Number.isSafeInteger(state.round) && state.round > 0) {
      appendImmediateEvents(state, [event], {
        actorPlayerId: player.id,
        sourceActionId: 'card-field-crop-removal',
        sourceCardId: runOptions.sourceCard,
      })
    }
    const flow = options?.onCropRemoved?.({
      state,
      player,
      crop,
      amount: available,
      isLast: !slots.some((candidate) => candidate?.crop === crop),
      cardId,
      reason: event.reason,
      sourceCard: runOptions.sourceCard,
    })
    return { crop, amount: available, ...(flow ? { flow } : {}) }
  })

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
      if (
        getFarmyardFields(player).some((field) => field.stacks.length === 0)
        && (player.resources.grain > 0 || player.resources.vegetable > 0)
      ) return
      const slots = readSlots(player, cardId, def)
      if (slots.every((slot) => slot !== null)) return
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
        const slots = readSlots(player, cardId, def)
        const entries: ExtraSowableField[] = []
        for (let i = 0; i < def.capacity; i += 1) {
          if (slots[i]) continue
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
        const slotIdx = tileMatchesCard(tile)
        if (slotIdx === null) return false
        if (!def.allowedCrops.includes(crop)) return false
        const slots = readSlots(player, cardId, def)
        if (slots[slotIdx]) return false
        if ((player.resources[crop] ?? 0) <= 0) return false
        player.resources[crop] -= 1
        slots[slotIdx] = { crop, remaining: RHYTHM[crop] }
        writeSlots(player, cardId, slots)
        return true
      },

    },
    reaches: [],
  } satisfies CardImpl
}
