import type { SoloHandSelectionGroup, SoloHandSelectionState, SoloHandSelectionSubmission } from '../contract/solo-hand-selection'
import type { SoloHandMode } from '../contract/game-creation'

export const createSoloHandGroups = (
  mode: SoloHandMode,
  pools: { occupation: string[]; minor: string[]; moorMinor: string[] },
  moor: boolean,
): SoloHandSelectionGroup[] => {
  const moorIds = new Set(pools.moorMinor)
  const groups: SoloHandSelectionGroup[] = [
    { kind: 'occupation', keepCount: 7, cardIds: [...new Set(pools.occupation)] },
    { kind: 'minor', keepCount: moor ? 3 : 7, cardIds: [...new Set(pools.minor)].filter(id => !moorIds.has(id)) },
    ...(moor ? [{ kind: 'moor-minor' as const, keepCount: 4, cardIds: [...moorIds] }] : []),
  ]
  return groups.map(group => {
    const required = mode === 'random' ? group.keepCount : group.kind === 'occupation' ? 10 : group.kind === 'minor' && moor ? 4 : group.kind === 'moor-minor' ? 6 : 10
    if (group.cardIds.length < required) throw new Error(`Solo ${group.kind} pool has ${group.cardIds.length} cards; need ${required}`)
    return { ...group, cardIds: group.cardIds.slice(0, required) }
  })
}

export const validateSoloHandSelection = (
  selection: SoloHandSelectionState,
  input: unknown,
): SoloHandSelectionSubmission | null => {
  if (!input || typeof input !== 'object' || !('groups' in input) || !Array.isArray(input.groups)) return null
  if (input.groups.length !== selection.groups.length) return null
  const groups: SoloHandSelectionSubmission['groups'] = []
  const seen = new Set<string>()
  for (const expected of selection.groups) {
    const matches = input.groups.filter((group: unknown) => !!group && typeof group === 'object' && 'kind' in group && group.kind === expected.kind)
    if (matches.length !== 1) return null
    const group: unknown = matches[0]
    if (!group || typeof group !== 'object' || !('cardIds' in group) || !Array.isArray(group.cardIds) || group.cardIds.length !== expected.keepCount) return null
    const cardIds: string[] = []
    for (const id of group.cardIds) {
      if (typeof id !== 'string' || !expected.cardIds.includes(id) || seen.has(id)) return null
      seen.add(id)
      cardIds.push(id)
    }
    // Client click order has no rule meaning. Keep the original candidate order.
    groups.push({ kind: expected.kind, cardIds: expected.cardIds.filter(id => cardIds.includes(id)) })
  }
  return { groups }
}
