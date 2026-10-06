import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { CARD_STATE_SCAN_ROOTS, checkCardStateBoundaries, scanCardStateSource } from '../check-card-state-boundaries'

const prompts = ['ui.interactionMoonshineChoice', 'ui.interactionHideFarmerOptional']
const scan = (code: string, file = 'shared/domain/example.ts') =>
  scanCardStateSource(ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true), file, prompts, ['BogPony'])
const dirs: string[] = []
afterEach(() => { dirs.splice(0).forEach((dir) => fs.rmSync(dir, { recursive: true, force: true })) })
const fixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'card-state-boundaries-')); dirs.push(root)
  for (const name of [...CARD_STATE_SCAN_ROOTS, 'shared/cards/A']) {
    fs.mkdirSync(path.join(root, name), { recursive: true })
    fs.writeFileSync(path.join(root, name, name === 'shared/cards/A' ? 'A003_PaperKnife.ts' : 'index.ts'),
      name === 'shared/cards/A' ? "export const source = { promptKey: 'ui.interactionMoonshineChoice' }" : 'export const valid = true')
  }
  return root
}

describe('generic Card State architecture boundaries', () => {
  it.each([
    "player.cardStates.B085_FarmHand.extraData.position",
    "player['cardStates']['C148_MudWallower'].counters.held",
    "const id = 'D132_HideFarmer' as const; const key = id; player.cardStates[key].extraData.hiddenSpaces",
    "const states = player.cardStates ?? {}; states['E074_AshTrees'].counters.fences",
    "const { cardStates: states } = player; delete states.E148_Lazybones.extraData.reservedActionSpaces",
    "const read = readCardExtraData; read(player, 'M084_BogPony', 'lyingHorseCount')",
    "import { readCardExtraData as read } from '../cards/helpers/card-state'; read(player, 'C146_WorkshopAssistant', 'pairs')",
    "if (request.promptKey === 'ui.interactionMoonshineChoice') return disabledError",
    "const key = request.promptKey; const prefix = 'ui.interactionHideFarmer'; if (key.startsWith(prefix)) allow()",
    "switch (request.promptKey) { case 'ui.interactionMoonshineChoice': return disabledError }",
    "import { readPony } from '../cards/M/M084_BogPony-state'",
    "import { readPony } from '../projections/bog-pony-state'",
  ])('rejects an ordinary bypass: %s', (code) => {
    const findings = scan(code)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings[0]).toMatchObject({ file: 'shared/domain/example.ts', line: 1, reason: expect.any(String) })
  })
  it.each([
    'const state = player.cardStates[id]; render(state.extraData)',
    'const { counters } = player.cardStates[id]; render(counters)',
    'Object.values(player.cardStates).forEach(state => render(state.counters))',
    'for (const [id, state] of Object.entries(player.cardStates)) render(state.stack)',
  ])('rejects frontend raw storage interpretation: %s', (code) => {
    expect(scan(code, 'client/app/example.ts').some((item) => item.kind === 'raw-client-state')).toBe(true)
    expect(scan(code, 'replay-viewer/src/example.ts').some((item) => item.kind === 'raw-client-state')).toBe(true)
  })
  it.each([
    'const state = player.cardStates[sourceCard]; use(state.counters)',
    "const metadata = getCard('B085_FarmHand').name; const art = 'B085_FarmHand.png'",
    "const options = { promptKey: 'ui.interactionMoonshineChoice' }",
    "if (request.promptKey === 'ui.interactionStableSelect') render()",
    '// player.cardStates.B085_FarmHand.extraData.position\nconst valid = true',
    'for (const [source, facts] of Object.entries(player.cardStatePresentation)) render(facts.counters)',
  ])('accepts generic facts and static metadata: %s', (code) => expect(scan(code)).toEqual([]))
  it('discovers new nested production directories and excludes tests and fixtures', () => {
    const root = fixture()
    fs.mkdirSync(path.join(root, 'shared/actions/effects/internal/new-directory'), { recursive: true })
    fs.writeFileSync(path.join(root, 'shared/actions/effects/internal/new-directory/read.ts'), "player.cardStates['C148_MudWallower'].counters.held")
    fs.mkdirSync(path.join(root, 'client/fixtures'), { recursive: true })
    fs.writeFileSync(path.join(root, 'client/fixtures/mock.ts'), 'player.cardStates.B085_FarmHand')
    fs.writeFileSync(path.join(root, 'client/example.test.ts'), 'player.cardStates.B085_FarmHand')
    expect(checkCardStateBoundaries(root)).toMatchObject({ scopeErrors: [], findings: [expect.objectContaining({
      file: 'shared/actions/effects/internal/new-directory/read.ts', kind: 'single-card-state',
    })] })
  })
  it.each(CARD_STATE_SCAN_ROOTS)('fails closed if mandatory root %s is missing or empty', (name) => {
    const root = fixture(); fs.rmSync(path.join(root, name), { recursive: true })
    expect(checkCardStateBoundaries(root).scopeErrors.some((error) => error.includes(name))).toBe(true)
    fs.mkdirSync(path.join(root, name))
    expect(checkCardStateBoundaries(root).scopeErrors.some((error) => error.includes(name))).toBe(true)
  })
  it('fails on parse errors and invalid, duplicate or stale precise exceptions', () => {
    const root = fixture()
    fs.writeFileSync(path.join(root, 'client/broken.ts'), 'export const =')
    expect(checkCardStateBoundaries(root).scopeErrors.some((error) => error.includes('client/broken.ts'))).toBe(true)
    fs.rmSync(path.join(root, 'client/broken.ts'))
    const exception = { file: 'client/index.ts', line: 1, kind: 'single-card-state' as const, reason: 'Printed target identity only' }
    expect(checkCardStateBoundaries(root, [exception]).scopeErrors).toContain('Stale or ambiguous exception: client/index.ts:1:single-card-state')
    expect(checkCardStateBoundaries(root, [{ ...exception, file: 'client/*' }, exception, exception]).scopeErrors.some((error) => error.startsWith('Invalid exact exception'))).toBe(true)
  })
})
