import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import { describe, expect, it } from 'vitest'
import { zh } from '../../shared/i18n/zh'
import { flattenDictionary } from '../i18n/flatten-dictionary'

const inconsistentTerms = /大改良|重大改进|小发展|小改进/g

describe('Chinese improvement terminology', () => {
  it('uses only the canonical terms in the Chinese dictionary', () => {
    const violations = [...flattenDictionary(zh)].flatMap(([key, value]) =>
      [...value.matchAll(inconsistentTerms)].map(([term]) => `${key}: ${term}`),
    )
    expect(violations).toEqual([])
  })

  it('keeps client UI and generation prompts consistent with the dictionary', () => {
    const files = globSync('client/**/*.{ts,tsx}', {
      ignore: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'],
    })
    expect(files.length).toBeGreaterThan(0)
    const violations = files.flatMap((file) =>
      readFileSync(file, 'utf8').split('\n').flatMap((line, index) =>
        [...line.matchAll(inconsistentTerms)].map(([term]) => `${file}:${index + 1}: ${term}`),
      ),
    )
    expect(violations).toEqual([])
  })
})
