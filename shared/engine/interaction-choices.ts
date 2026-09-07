import type { InteractionRequest } from '../contract/types'

export type CompletionChoice = { value: string; payload?: Record<string, unknown> }

export function* selectionOrders<T>(items: readonly T[]): Generator<T[]> {
  if (items.length === 0) {
    yield []
    return
  }
  for (let index = 0; index < items.length; index += 1) {
    for (const rest of selectionOrders([...items.slice(0, index), ...items.slice(index + 1)])) {
      yield [items[index]!, ...rest]
    }
  }
}

export function* resourceAllocations(available: Record<string, number>, maxTotal = Infinity): Generator<Record<string, number>> {
  const entries = Object.entries(available)
  function* choose(index: number, remaining: number, counts: Record<string, number>): Generator<Record<string, number>> {
    if (index === entries.length) {
      yield counts
      return
    }
    const [resource, max] = entries[index]!
    for (let count = 0; count <= Math.min(max, remaining); count += 1) {
      yield* choose(index + 1, remaining - count, count > 0 ? { ...counts, [resource]: count } : counts)
    }
  }
  yield* choose(0, maxTotal, {})
}

export function* selectionSubsets<T>(items: readonly T[], min: number, max: number): Generator<T[]> {
  function* choose(start: number, remaining: number, selected: T[]): Generator<T[]> {
    if (remaining === 0) {
      yield selected
      return
    }
    for (let index = start; index <= items.length - remaining; index += 1) {
      yield* choose(index + 1, remaining - 1, [...selected, items[index]!])
    }
  }
  for (let count = min; count <= Math.min(max, items.length); count += 1) {
    yield* choose(0, count, [])
  }
}

export function* interactionChoices(request: InteractionRequest): Generator<CompletionChoice> {
  if (request.kind === 'choice' || request.kind === 'select-trigger') {
    for (const option of request.options) {
      if (!('disabled' in option && option.disabled)) yield { value: option.value }
    }
  } else if (request.kind === 'farm-select') {
    const farm = request.farm
    if (farm.farmType === 'plow') {
      for (const tile of farm.selectableTiles) yield { value: 'confirm', payload: { tile } }
    } else if (farm.farmType === 'room') {
      for (const rooms of selectionSubsets(farm.selectableTiles, 1, farm.maxSelections)) {
        yield { value: 'confirm', payload: { rooms } }
      }
    } else if (farm.farmType === 'stable') {
      for (const stables of selectionSubsets(farm.selectableTiles, 0, farm.maxSelections)) {
        if (stables.length > 0) yield { value: 'confirm', payload: { stables } }
        for (const farmHand of farm.farmHandPositions ?? []) {
          yield { value: 'confirm', payload: { stables, farmHand } }
        }
      }
    } else if (farm.farmType === 'sow') {
      for (const fields of selectionSubsets(farm.selectableFields, farm.minSelections ?? 1, farm.maxSelections ?? farm.selectableFields.length)) {
        function* crops(index: number, selected: Array<Record<string, unknown>>): Generator<CompletionChoice> {
          if (index === fields.length) {
            yield { value: 'confirm', payload: { crops: selected } }
            return
          }
          const field = fields[index]!
          for (const crop of field.allowedCrops) {
            yield* crops(index + 1, [...selected, { ...field.tile, crop }])
          }
        }
        yield* crops(0, [])
      }
    }
  } else if (request.kind === 'selection') {
    const selection = request.selection
    if (selection.kind === 'occupation-hand') {
      for (const cards of selectionSubsets(selection.selectableCards, selection.minSelections, selection.maxSelections)) {
        yield { value: 'confirm', payload: { cards } }
      }
    } else {
      const groups = selection.validPositionGroups
        ?? selectionSubsets(selection.selectablePositions, selection.minSelections ?? 1, selection.maxSelections)
      for (const positions of groups) {
        if (selection.allowedSelectionCounts && !selection.allowedSelectionCounts.includes(positions.length)) continue
        yield { value: 'confirm', payload: { positions: positions.map(({ row, col }) => `${row}-${col}`) } }
      }
    }
  } else if (request.kind === 'resource-quantity-select') {
    for (const resourceCounts of resourceAllocations(request.availableByResource)) {
      if (request.requireAtLeastOne && Object.keys(resourceCounts).length === 0) continue
      yield { value: 'confirm', payload: { resourceCounts } }
    }
  } else if (request.kind === 'resource-batch-exchange-select') {
    for (const discard of resourceAllocations(request.discardAvailableByResource, request.maxTotal)) {
      const total = Object.values(discard).reduce((sum, count) => sum + count, 0)
      if (request.requireAtLeastOne && total === 0) continue
      for (const receive of resourceAllocations(Object.fromEntries(request.receiveResources.map((resource) => [resource, total])), total)) {
        if (Object.values(receive).reduce((sum, count) => sum + count, 0) !== total) continue
        yield { value: 'confirm', payload: { resourceBatchExchange: { discard, receive } } }
      }
    }
  }
}
