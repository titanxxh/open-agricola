import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { expect, it } from 'vitest'
import type { EncyclopediaEntry, EncyclopediaSearchDocument } from '../../shared/contract/card-encyclopedia'
import { writeOfflineEncyclopedia } from '../card-encyclopedia/offline-artifacts'

it('publishes a hash-verified self-contained reader that searches the saved language and labels English fallback', () => {
  const directory = mkdtempSync(join(tmpdir(), 'offline-encyclopedia-'))
  const entries = [{
    key: 'season:winter', sourceKind: 'season', sourceId: 'winter', group: 'seasons', publicType: 'season',
    displayNumber: 'S004', players: null, face: { kind: 'season', season: 'winter' },
    text: { name: [{ key: 'season.winter' }], body: [{ literal: 'Printed winter text.' }] },
    cost: { kind: 'notApplicable' }, score: { fixed: null, extraVp: false },
  }] satisfies EncyclopediaEntry[]
  const documents = [{
    key: 'season:winter', identifiers: ['winter', 'S004'], extraTerms: [],
    locales: {
      en: { name: { text: 'Winter', status: 'localized' }, body: { text: 'Printed winter text.', status: 'localized' } },
      zh: { name: { text: '冬季', status: 'localized' }, body: { text: 'Printed winter text.', status: 'fallback' } },
    },
  }] satisfies EncyclopediaSearchDocument[]
  const languages = [
    { id: 'en', messages: {
      'ui.encyclopedia.offline.title': 'Offline encyclopedia',
      'ui.encyclopedia.offline.search': 'Search cards by number, name, or text',
      'ui.encyclopedia.offline.noResults': 'No matching cards.',
      'ui.encyclopedia.offline.downloadRequired': 'Download the offline encyclopedia again.',
    }, ownKeys: new Set<string>() },
    { id: 'zh', messages: {
      'ui.encyclopedia.offline.title': '离线百科',
      'ui.encyclopedia.offline.search': '按编号、名称或正文搜索卡牌',
      'ui.encyclopedia.offline.noResults': '没有匹配的卡牌。',
      'ui.encyclopedia.offline.downloadRequired': '请重新下载离线百科。',
      'ui.encyclopedia.fallback.english': '英文原文',
    }, ownKeys: new Set<string>() },
  ]

  try {
    const manifest = writeOfflineEncyclopedia({ outputDir: directory, entries, documents, languages })
    const archive = manifest.packs.find(packageRef => packageRef.locale === 'zh')
    expect(archive).toBeDefined()
    if (!archive) throw new Error('Missing zh offline pack')
    const html = readFileSync(join(directory, archive.file), 'utf8')
    expect(archive.sha256).toBe(createHash('sha256').update(html).digest('hex'))
    expect(archive.size).toBe(Buffer.byteLength(html))
    expect(JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'))).toEqual(manifest)
    expect(readFileSync(join(directory, 'index.html'), 'utf8')).toContain('请重新下载离线百科。')

    const { window } = new JSDOM(html, { runScripts: 'dangerously' })
    try {
      const { document } = window
      expect(document.title).toBe('离线百科')
      expect(document.querySelectorAll('script[src], link[rel=stylesheet], img')).toHaveLength(0)
      const search = document.querySelector('input')
      if (!search) throw new Error('The offline reader needs a search input')
      for (const query of ['Ｓ００４', '冬季']) {
        search.value = query
        search.dispatchEvent(new window.Event('input'))
        expect(document.querySelector('summary')?.textContent).toContain('S004')
        expect(document.querySelector('details p[lang=en]')?.textContent).toContain('Printed winter text.')
        expect(document.querySelector('details p[lang=en]')?.textContent).toContain('英文原文')
      }
      search.value = 'summer'
      search.dispatchEvent(new window.Event('input'))
      expect(document.querySelector('main')?.textContent).toContain('没有匹配的卡牌。')
    } finally {
      window.close()
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
