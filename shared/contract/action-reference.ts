import type { ChoiceDescriptionPreview, Resource } from './types'

export type ActionReference = { kind: 'space' | 'moor'; ids: readonly string[]; label: string }

/** Inside an emphasis token: __space:fishing|Fishing__. */
export const parseActionReference = (text: string): ActionReference | undefined => {
  const match = /^(space|moor):([a-z0-9-]+(?:,[a-z0-9-]+)*)\|(.+)$/.exec(text)
  if (!match || (match[1] !== 'space' && match[1] !== 'moor')) return undefined
  return { kind: match[1], ids: match[2].split(','), label: match[3] }
}

export const actionReferences = (text: string): ActionReference[] => [...text.matchAll(/__([^_]+)__/g)]
  .flatMap(match => {
    const reference = parseActionReference(match[1])
    if (!reference && /^(space|moor):/.test(match[1])) throw new Error(`Invalid action reference markup: ${match[1]}`)
    return reference ?? []
  })

export type ActionReferenceSpace = {
  id: string
  players: readonly number[]
  nameKey: string
  descriptionKey: string
  rulesKey?: string
  preview?: ChoiceDescriptionPreview
  gainPerRound?: Partial<Resource>
}

export type ActionReferenceMoorCard = {
  id: string
  players: readonly number[]
  actions: readonly string[]
  image: string
}

export type ActionReferenceCatalog = {
  version: 1
  spaces: readonly ActionReferenceSpace[]
  moorCards: readonly ActionReferenceMoorCard[]
}
