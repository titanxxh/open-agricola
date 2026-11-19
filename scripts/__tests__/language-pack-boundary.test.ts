import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { buildCardsManifest } from '../build-cards-manifest'
import { getLanguagePack, type LanguageManifest } from '../../shared/i18n'

const FACE_FIELDS = ['name', 'description', 'rules', 'prerequisite'] as const
// Classic Card Sources are written in English, and both the language package builder and `cardText` fall back to
// that text, so only the English package may omit classic faces (ADR 0049). Every other package carries every face.
const CLASSIC_CARD_ID = /^C[A-Z]+\d{3}_/
const SOURCE_TEXT_LOCALE = 'en'

function missingCardFaces(ids: readonly string[], locales: readonly string[], messagesOf: (locale: string) => Record<string, unknown> | undefined) {
  const missing: string[] = []
  for (const locale of locales) {
    const messages = messagesOf(locale)
    for (const id of ids) {
      if (locale === SOURCE_TEXT_LOCALE && CLASSIC_CARD_ID.test(id)) continue
      for (const field of FACE_FIELDS) if (typeof messages?.[`cardFaces.${id}.${field}`] !== 'string') missing.push(`${locale}:${id}.${field}`)
    }
  }
  return missing
}

describe('external language package boundary', () => {
  it('keeps translated application copy outside the game source repository', () => {
    expect(globSync('shared/i18n/**/*.{json,json5}')).toEqual([])
    const embedded: string[] = []
    for (const file of globSync(['client/**/*.{ts,tsx}', 'replay-viewer/src/**/*.{ts,tsx}', 'shared/events/public-event-presentation.ts'], { ignore: ['**/__tests__/**', '**/*.test.*', '**/*.spec.*'] })) {
      const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
      const visit = (node: ts.Node) => {
        if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isJsxText(node))
          && /[\u4e00-\u9fff]/.test(node.getText(source))) embedded.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}`)
        else ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(embedded).toEqual([])
    expect(Object.values(buildCardsManifest('shared/cards')).filter(card => card.meta.locales).map(card => card.meta.id)).toEqual([])
  })

  it('provides every current card face in every published package', () => {
    const manifest: LanguageManifest = JSON.parse(readFileSync('public/i18n/manifest.json', 'utf8'))
    const ids = Object.keys(buildCardsManifest('shared/cards'))
    expect(missingCardFaces(ids, manifest.languages.map(language => language.id), locale => getLanguagePack(locale)?.messages)).toEqual([])
  })

  it('lets only the English package omit classic faces', () => {
    const faces = (id: string) => Object.fromEntries(FACE_FIELDS.map(field => [`cardFaces.${id}.${field}`, field]))
    const packs: Record<string, Record<string, unknown>> = { en: faces('A001_Shelter'), zh: faces('A001_Shelter'), fr: {} }

    expect(missingCardFaces(['A001_Shelter', 'CE999_Probe'], ['en', 'zh'], locale => packs[locale]))
      .toEqual(FACE_FIELDS.map(field => `zh:CE999_Probe.${field}`))
    expect(missingCardFaces(['A001_Shelter'], ['fr'], locale => packs[locale]))
      .toEqual(FACE_FIELDS.map(field => `fr:A001_Shelter.${field}`))
    expect(missingCardFaces(['A001_Shelter'], ['en'], () => ({}))).toEqual(FACE_FIELDS.map(field => `en:A001_Shelter.${field}`))
  })
})
