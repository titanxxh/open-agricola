import type { CardImpl } from '../registry'
import type { CardListenerRegistration } from '../card-listeners'
import type { ExtraSowableField, ExtraSowableCrop } from '../card-effects'
import type {
  ActionFlow, FarmTilePosition, Field, GameState, PlayerState,
} from '../../contract/types'
import type { EventSink, FarmCropRemovedEvent } from '../../contract/events'
import { readCardExtraData, writeCardExtraData } from './card-state'
import { canSow } from '../../actions/effects/sow'
import { defaultReapTrigger, dispatchReapListener, type ReapTrigger } from '../../actions/helpers/reap-listener'
import { appendImmediateEvents } from '../../events/append'
import { computeHarvestCount } from '../../actions/helpers/harvest-count-registry'

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

const cardFieldReapers = new Map<string, CardFieldReaper>()
const cardFieldCropRemovers = new Map<string, CardFieldCropRemover>()

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

export type LogicalFieldMutationResult =
  | { ok: true; crop?: Crop; amount?: number }
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

export const mutateLogicalFields = (_state: GameState, player: PlayerState) => {
  const validateCardFields = () => {
    for (const cardId of playedCardIds(player)) {
      if (cardFieldDefs.has(cardId)) readSlots(player, cardId)
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
  const place = (
    target: LogicalFieldTarget,
    crop: Crop,
    amount: number,
  ): LogicalFieldMutationResult => {
    validateCardFields()
    if (!validAmount(amount)) return { ok: false, error: 'invalid-amount' }
    const field = farmyardTarget(target)
    if (field) {
      if (field.stacks.length > 0) return { ok: false, error: 'occupied' }
      field.stacks.push({ kind: crop, remaining: amount })
      return { ok: true }
    }
    const card = cardTarget(target)
    if (!card) return { ok: false, error: 'invalid-target' }
    if (!card.def.allowedCrops.includes(crop)) return { ok: false, error: 'invalid-crop' }
    if (card.slots[card.slot]) return { ok: false, error: 'occupied' }
    card.slots[card.slot] = { crop, remaining: amount }
    writeSlots(player, card.cardId, card.slots)
    return { ok: true }
  }
  const grow = (
    target: LogicalFieldTarget,
    amount = 1,
  ): LogicalFieldMutationResult => {
    validateCardFields()
    if (!validAmount(amount)) return { ok: false, error: 'invalid-amount' }
    const field = farmyardTarget(target)
    if (field) {
      const stack = field.stacks[target.slot ?? field.stacks.length - 1]
      if (!stack) return { ok: false, error: 'empty' }
      stack.remaining += amount
      return { ok: true, crop: stack.kind, amount }
    }
    const card = cardTarget(target)
    if (!card) return { ok: false, error: 'invalid-target' }
    const stack = card.slots[card.slot]
    if (!stack) return { ok: false, error: 'empty' }
    stack.remaining += amount
    writeSlots(player, card.cardId, card.slots)
    return { ok: true, crop: stack.crop, amount }
  }
  const remove = (
    target: LogicalFieldTarget,
    requestedAmount?: number,
  ): LogicalFieldMutationResult => {
    validateCardFields()
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
    return { ok: true, crop, amount }
  }
  const replace = (
    target: LogicalFieldTarget,
    crop: Crop,
    amount: number,
  ): LogicalFieldMutationResult => {
    validateCardFields()
    if (!validAmount(amount)) return { ok: false, error: 'invalid-amount' }
    const field = farmyardTarget(target)
    if (field) {
      const slot = target.slot ?? field.stacks.length - 1
      if (!field.stacks[slot]) return { ok: false, error: 'empty' }
      field.stacks[slot] = { kind: crop, remaining: amount }
      return { ok: true }
    }
    const card = cardTarget(target)
    if (!card) return { ok: false, error: 'invalid-target' }
    if (!card.def.allowedCrops.includes(crop)) return { ok: false, error: 'invalid-crop' }
    if (!card.slots[card.slot]) return { ok: false, error: 'empty' }
    card.slots[card.slot] = { crop, remaining: amount }
    writeSlots(player, card.cardId, card.slots)
    return { ok: true }
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
    if (!cardFieldReapers.has(cardId)) return []
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
  cardFieldDefs.set(cardId, def)

  const reapCardField = (
    state: GameState,
    player: PlayerState,
    runOptions: CardFieldReapRunOptions = {},
  ): ActionFlow | undefined => {
    const slots = readSlots(player, cardId, def)
    if (slots.every((slot) => slot === null)) return
    const trigger = runOptions.trigger ?? defaultReapTrigger()
    const perCropAmount = new Map<Crop, number>()
    const nextSlots = slots.map((slot) => slot ? { ...slot } : null)
    for (const [slotIdx, stack] of nextSlots.entries()) {
      if (!stack) continue
      const field: Field = {
        row: -1,
        col: baseCol + slotIdx,
        stacks: [{ kind: stack.crop, remaining: stack.remaining }],
      }
      const amount = computeHarvestCount(state, player, field).count
      stack.remaining -= amount
      player.resources[stack.crop] += amount
      if (amount > 0) perCropAmount.set(stack.crop, (perCropAmount.get(stack.crop) ?? 0) + amount)
      if (stack.remaining <= 0) nextSlots[slotIdx] = null
    }
    if (runOptions.updateHarvestSummary !== false) {
      const entry = state.harvestReapSummary?.[player.id]
      if (entry) {
        for (const [crop, amount] of perCropAmount) {
          entry.resources[crop] = (entry.resources[crop] ?? 0) + amount
        }
        if (
          perCropAmount.size > 0 &&
          !entry.harvestedPositions?.some(({ row, col }) => row === -1 && col === baseCol)
        ) {
          entry.harvestedPositions = [
            ...(entry.harvestedPositions ?? []),
            { row: -1, col: baseCol },
          ]
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
    writeSlots(player, cardId, nextSlots)
    const flows: ActionFlow[] = []
    for (const [crop, amount] of perCropAmount) {
      appendFlowChildren(
        flows,
        dispatchReapListener(state, player, crop, amount, undefined, {
          trigger,
          sourceCard: runOptions.sourceCard,
        }),
      )
      const stillHas = nextSlots.some((slot) => slot?.crop === crop)
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
      const removedFlow = options?.onCropRemoved?.({
        state,
        player,
        crop,
        amount,
        isLast: !stillHas,
        cardId,
        reason: 'reap',
        trigger,
        sourceCard: runOptions.sourceCard,
      })
      if (removedFlow) appendFlowChildren(flows, removedFlow)
    }
    return toParallelFlow(flows)
  }

  cardFieldReapers.set(cardId, reapCardField)

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
      if (canSow(player)) return
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

      onHarvestFieldPhase: (state, player): ActionFlow | void => {
        return reapCardField(state, player, { trigger: defaultReapTrigger() })
      },
    },
    reaches: [],
  } satisfies CardImpl
}
