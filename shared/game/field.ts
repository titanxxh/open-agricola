import type { CropStack, Field } from '../contract/types'

export const fieldIsEmpty = (f: Field): boolean => f.stacks.length === 0

export const fieldTopStack = (f: Field): CropStack | undefined =>
  f.stacks[f.stacks.length - 1]

export const fieldBottomStack = (f: Field): CropStack | undefined => f.stacks[0]

export const fieldHasCrop = (f: Field, kind: CropStack['kind']): boolean =>
  f.stacks.some((s) => s.kind === kind)

export const fieldTotalRemaining = (f: Field): number =>
  f.stacks.reduce((acc, s) => acc + s.remaining, 0)

export const fieldPopIfDepleted = (f: Field): void => {
  while (
    f.stacks.length > 0 &&
    (f.stacks[f.stacks.length - 1]?.remaining ?? 0) <= 0
  ) {
    f.stacks.pop()
  }
}

export const fieldDecrementTop = (f: Field): void => {
  const top = f.stacks[f.stacks.length - 1]
  if (!top) return
  top.remaining -= 1
  fieldPopIfDepleted(f)
}

export const fieldFindStackOfKind = (
  f: Field,
  kind: CropStack['kind'],
): CropStack | undefined => f.stacks.find((s) => s.kind === kind)

export const countFieldsWithCrop = (
  fields: Field[],
  kind: CropStack['kind'],
): number => fields.filter((f) => fieldHasCrop(f, kind)).length

export const countEmptyFields = (fields: Field[]): number =>
  fields.filter(fieldIsEmpty).length
