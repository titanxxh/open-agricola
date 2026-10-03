import { en } from './en'
import { zh } from './zh'

export type Locale = 'zh' | 'en'

const dictionaries = { zh, en }

const getValue = (dict: Record<string, unknown>, path: string): string => {
  const parts = path.split('.')
  let current: unknown = dict
  for (const part of parts) {
    if (
      current &&
      typeof current === 'object' &&
      part in (current as Record<string, unknown>)
    ) {
      current = (current as Record<string, unknown>)[part]
    } else {
      return path
    }
  }
  return typeof current === 'string' ? current : path
}

export const t = (
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {},
) => {
  const template = getValue(dictionaries[locale], key)
  return Object.entries(params).reduce(
    (result, [paramKey, value]) =>
      result.replaceAll(`{${paramKey}}`, String(value)),
    template,
  )
}
