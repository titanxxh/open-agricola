import { describe, expect, it } from 'vitest'
import { en } from '../../shared/i18n/en'
import { zh } from '../../shared/i18n/zh'
import { buildCardsManifest } from '../build-cards-manifest'

const strings = (node: unknown, path = ''): Array<[string, string]> => {
  if (typeof node === 'string') return [[path, node]]
  if (!node || typeof node !== 'object') return []
  return Object.entries(node).flatMap(([key, value]) => strings(value, path ? `${path}.${key}` : key))
}

const references = (text: string): string[] =>
  [...text.matchAll(/\{card:([^{}\s]+)\}/g)].map((match) => match[1])

describe('localized card-name references', () => {
  it('uses valid references with the same targets in both languages', () => {
    const manifest = buildCardsManifest('shared/cards')
    const english = new Map(strings(en))
    const chinese = new Map(strings(zh))
    const paths = new Set([...english.keys(), ...chinese.keys()])
    const offenders: string[] = []
    for (const path of paths) {
      const enRefs = references(english.get(path) ?? '')
      const zhRefs = references(chinese.get(path) ?? '')
      if (JSON.stringify(enRefs) !== JSON.stringify(zhRefs)) offenders.push(`${path}: language targets differ`)
      for (const id of [...enRefs, ...zhRefs]) {
        if (!manifest[id]) offenders.push(`${path}: unknown card ${id}`)
        if (path.endsWith('.name')) offenders.push(`${path}: card names cannot contain name references`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('keeps named prompts and buttons from copying the card name', () => {
    const manifest = buildCardsManifest('shared/cards')
    const normalize = (name: string) => name.toLowerCase().replaceAll(' ', '')
    const names = new Set(Object.values(manifest).map((entry) => normalize(entry.meta.name)))
    const offenders = strings({ ui: en.ui, cards: en.cards })
      .filter(([, text]) => /^([^:：]+)[:：]/.test(text))
      .filter(([, text]) => names.has(normalize(text.split(/[:：]/)[0])))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('does not duplicate interaction prompts in the log namespace', () => {
    for (const dictionary of [en, zh]) {
      expect(Object.keys(dictionary.log).filter((key) => key.startsWith('interaction') && key in dictionary.ui))
        .toEqual([])
    }
  })

  it('does not surround resource tokens with stray angle brackets', () => {
    const manifest = buildCardsManifest('shared/cards')
    const cardText = Object.entries(manifest).flatMap(([id, entry]) =>
      (entry.meta.desc ?? []).map((text) => [id, text] as const))
    const offenders = [...strings(en), ...strings(zh), ...cardText]
      .filter(([, text]) => /<<[A-Z0-9_-]+>>/.test(text))
      .map(([path]) => path)
    expect(offenders).toEqual([])
  })

  it('preserves printed resource icons and prerequisites in Moor and major translations', () => {
    const manifest = buildCardsManifest('shared/cards')
    const dictionary = new Map(strings(zh))
    const tags = (text: string) => [...text.matchAll(/<[A-Z0-9_-]+>|\{[^}]+\}/g)].map((match) => match[0]).sort()
    for (const [id, entry] of Object.entries(manifest)) {
      if (!/^M\d{3}_|^Major_/.test(id)) continue
      const prefix = id.startsWith('Major_') ? 'improvements' : 'minorImprovements'
      const fields = {
        description: entry.meta.desc?.join('\n'),
        rules: entry.meta.rules?.join('\n'),
        prerequisite: typeof entry.meta.prerequisite === 'string' ? entry.meta.prerequisite : undefined,
      }
      expect(dictionary.get(`${prefix}.${id}.name`), id).toMatch(/[\u4e00-\u9fff]/)
      for (const [field, source] of Object.entries(fields)) {
        if (!source) continue
        const translated = dictionary.get(`${prefix}.${id}.${field}`)
        expect(translated, `${id}.${field}`).toBeTruthy()
        expect(tags(translated!), `${id}.${field}`).toEqual(tags(source))
        expect(translated!.replace(/<[A-Z0-9_-]+>|\{[^}]+\}/g, ''), `${id}.${field}`).not.toMatch(/[a-z]/i)
      }
    }
  })
})
