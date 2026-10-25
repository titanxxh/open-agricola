import { readFileSync } from 'node:fs'
import { globSync } from 'glob'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { buildCardsManifest } from '../build-cards-manifest'
import { getLanguagePack, type LanguageManifest } from '../../shared/i18n'

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
    const missing: string[] = []
    for (const language of manifest.languages) {
      const messages = getLanguagePack(language.id)?.messages
      for (const id of Object.keys(buildCardsManifest('shared/cards'))) {
        for (const field of ['name', 'description', 'rules', 'prerequisite']) {
          if (typeof messages?.[`cardFaces.${id}.${field}`] !== 'string') missing.push(`${language.id}:${id}.${field}`)
        }
      }
    }
    expect(missing).toEqual([])
  })
})
