import type { CardDefinition } from '../contract/cards'
import type { CardImpl } from './registry'

export type CardSourceKind = 'minor' | 'occupation' | 'playerAction' | 'major'

type RuntimeOnlyCardDefinitionField = 'modifier' | 'modifiers'

export type CardSourceMetaInput = Omit<CardDefinition, RuntimeOnlyCardDefinitionField>

export type CardSourceMeta<K extends CardSourceKind = CardSourceKind> =
  CardSourceMetaInput & { kind: K }

export type CardSourceWithImpl<K extends CardSourceKind = CardSourceKind> = {
  meta: CardSourceMeta<K>
  impl: CardImpl
}

export type CardSourceWithoutImpl<K extends CardSourceKind = CardSourceKind> = {
  meta: CardSourceMeta<K>
  impl?: undefined
}

export type CardSource<K extends CardSourceKind = CardSourceKind> =
  | CardSourceWithImpl<K>
  | CardSourceWithoutImpl<K>

type CardSourceWithImplInput = {
  meta: CardSourceMetaInput
  impl: CardImpl
}

type CardSourceWithoutImplInput = {
  meta: CardSourceMetaInput
  impl?: undefined
}

type CardSourceInput = CardSourceWithImplInput | CardSourceWithoutImplInput

const defineCardSource = <K extends CardSourceKind>(
  kind: K,
  input: CardSourceInput,
): CardSource<K> => ({
  ...input,
  meta: {
    ...input.meta,
    kind,
  },
} as CardSource<K>)

export function defineMinorCard(input: CardSourceWithImplInput): CardSourceWithImpl<'minor'>
export function defineMinorCard(input: CardSourceWithoutImplInput): CardSourceWithoutImpl<'minor'>
export function defineMinorCard(input: CardSourceInput): CardSource<'minor'> {
  return defineCardSource('minor', input)
}

export function defineOccupationCard(input: CardSourceWithImplInput): CardSourceWithImpl<'occupation'>
export function defineOccupationCard(input: CardSourceWithoutImplInput): CardSourceWithoutImpl<'occupation'>
export function defineOccupationCard(input: CardSourceInput): CardSource<'occupation'> {
  return defineCardSource('occupation', input)
}

export function definePlayerActionCard(input: CardSourceWithImplInput): CardSourceWithImpl<'playerAction'>
export function definePlayerActionCard(input: CardSourceWithoutImplInput): CardSourceWithoutImpl<'playerAction'>
export function definePlayerActionCard(input: CardSourceInput): CardSource<'playerAction'> {
  return defineCardSource('playerAction', input)
}

export function defineMajorCard(input: CardSourceWithImplInput): CardSourceWithImpl<'major'>
export function defineMajorCard(input: CardSourceWithoutImplInput): CardSourceWithoutImpl<'major'>
export function defineMajorCard(input: CardSourceInput): CardSource<'major'> {
  return defineCardSource('major', input)
}
