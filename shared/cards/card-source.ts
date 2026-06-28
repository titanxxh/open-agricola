import type { CardDefinition, PlayerActionCardType } from '../contract/cards'
import type { CardImpl } from './registry'

export type CardSourceKind = 'minor' | 'occupation' | 'playerAction' | 'major'

type RuntimeOnlyCardDefinitionField = 'modifier' | 'modifiers'

export type CardSourceMetaInput = Omit<CardDefinition, RuntimeOnlyCardDefinitionField>

export type CardSourceMeta<K extends CardSourceKind = CardSourceKind> =
  CardSourceMetaInput & { kind: K }

export type CardSourceWithImpl<K extends CardSourceKind = CardSourceKind> = {
  meta: CardSourceMeta<K>
  impl: CardImpl
} & CardSourceMeta<K>

export type CardSourceWithoutImpl<K extends CardSourceKind = CardSourceKind> = {
  meta: CardSourceMeta<K>
  impl?: undefined
} & CardSourceMeta<K>

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
type PlayerActionCardSourceMetaInput =
  CardSourceMetaInput & { playerActionCardType: PlayerActionCardType }
type PlayerActionCardSourceWithImplInput = {
  meta: PlayerActionCardSourceMetaInput
  impl: CardImpl
}
type PlayerActionCardSourceWithoutImplInput = {
  meta: PlayerActionCardSourceMetaInput
  impl?: undefined
}
type PlayerActionCardSourceInput =
  | PlayerActionCardSourceWithImplInput
  | PlayerActionCardSourceWithoutImplInput

const defineCardSource = <K extends CardSourceKind>(
  kind: K,
  input: CardSourceInput,
): CardSource<K> => {
  const meta = {
    ...input.meta,
    kind,
  }
  return {
    ...meta,
    meta,
    impl: input.impl,
  } as CardSource<K>
}

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

export function definePlayerActionCard(input: PlayerActionCardSourceWithImplInput): CardSourceWithImpl<'playerAction'>
export function definePlayerActionCard(input: PlayerActionCardSourceWithoutImplInput): CardSourceWithoutImpl<'playerAction'>
export function definePlayerActionCard(input: PlayerActionCardSourceInput): CardSource<'playerAction'> {
  return defineCardSource('playerAction', input)
}

export function defineMajorCard(input: CardSourceWithImplInput): CardSourceWithImpl<'major'>
export function defineMajorCard(input: CardSourceWithoutImplInput): CardSourceWithoutImpl<'major'>
export function defineMajorCard(input: CardSourceInput): CardSource<'major'> {
  return defineCardSource('major', input)
}
