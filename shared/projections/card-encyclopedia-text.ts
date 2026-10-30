import type { EncyclopediaText } from '../contract/card-encyclopedia'

export type EncyclopediaTranslate = (key: string, params?: Readonly<Record<string, string | number>>) => string

export const resolveEncyclopediaText = (parts: EncyclopediaText, translate: EncyclopediaTranslate): string =>
  parts.map((part) => ('literal' in part ? part.literal : translate(part.key, part.params))).join('')
