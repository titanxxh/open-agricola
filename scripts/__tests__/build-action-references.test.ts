import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { buildActionReferences } from '../build-action-references'

const temporary: string[] = []
afterEach(() => temporary.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })))
function fixture(text: string) {
  const root = mkdtempSync(join(tmpdir(), 'agricola-action-refs-'))
  temporary.push(root)
  mkdirSync(join(root, 'public/i18n'), { recursive: true })
  writeFileSync(join(root, 'public/i18n/manifest.json'), JSON.stringify({ languages: [{ id: 'en', file: 'en.json' }] }))
  writeFileSync(join(root, 'public/i18n/en.json'), JSON.stringify({ messages: { 'cardFaces.Fixture.description': text } }))
  return root
}

it('builds printed rules for player counts without leaking a game or reveal order', () => {
  const root = fixture('__space:fishing|Fishing__ and __moor:cut-peat|Cut Peat__')
  const catalog = buildActionReferences(root)
  expect(catalog.spaces.find(space => space.id === 'forest' && space.players.includes(1))?.gainPerRound).toEqual({ wood: 2 })
  expect(catalog.spaces.find(space => space.id === 'forest' && space.players.includes(2))?.gainPerRound).toEqual({ wood: 3 })
  const manifest = JSON.parse(readFileSync(join(root, 'public/action-references.json'), 'utf8'))
  const raw = readFileSync(join(root, 'public', manifest.file), 'utf8')
  expect(raw).not.toMatch(/roundActionOrder|gameSeed|takenBy|cardStates|workerId/)
  expect(catalog.moorCards.find(card => card.id === 'moor-special-1-2-terrain')?.actions).toEqual(['fell-trees', 'slash-and-burn', 'cut-peat'])
})

it.each(['__space:not-a-space|Unknown__', '__moor:not-an-action|Unknown__', '__space:|Broken__'])('rejects invalid official reference %s', text => {
  expect(() => buildActionReferences(fixture(text))).toThrow(/Invalid action reference/)
})
