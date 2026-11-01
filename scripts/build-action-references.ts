import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { actionReferences, type ActionReferenceCatalog } from '../shared/contract/action-reference'
import { createInitialState } from '../shared/session/state-bootstrap'
import { createBaseActionDescriber } from '../shared/actions/base-description'
import { createMoorActionSpaces } from '../shared/moor/action-spaces'
import { moorSpecialActionCardDefinitions } from '../shared/moor/special-action-cards'

export function buildActionReferences(root: string): ActionReferenceCatalog {
  const spaces = [1, 2, 3, 4, 5, 6].flatMap(playerCount => {
    const state = createInitialState(1, { playerCount }, [], 'defer')
    state.actionSpaces.push(...createMoorActionSpaces(playerCount))
    const describe = createBaseActionDescriber(state)
    return state.actionSpaces.map(space => ({
      id: space.id, players: [playerCount], nameKey: space.nameKey,
      descriptionKey: space.descriptionKey, rulesKey: space.rulesKey, preview: describe(space), gainPerRound: space.gainPerRound,
    }))
  })
  const catalog: ActionReferenceCatalog = { version: 1, spaces, moorCards: moorSpecialActionCardDefinitions }
  const spaceIds = new Set(spaces.map(space => space.id))
  const moorIds = new Set(catalog.moorCards.flatMap(card => card.actions))
  const manifest = JSON.parse(readFileSync(resolve(root, 'public/i18n/manifest.json'), 'utf8'))
  for (const language of manifest.languages) {
    const pack = JSON.parse(readFileSync(resolve(root, 'public/i18n', language.file), 'utf8'))
    for (const [key, value] of Object.entries(pack.messages)) {
      if (typeof value !== 'string') continue
      for (const reference of actionReferences(value)) {
        const allowed = reference.kind === 'space' ? spaceIds : moorIds
        for (const id of reference.ids) {
          if (!allowed.has(id)) throw new Error(`Invalid action reference ${language.id}:${key}: ${reference.kind}:${id}`)
        }
      }
    }
  }
  const raw = JSON.stringify(catalog) + '\n'
  const sha256 = createHash('sha256').update(raw).digest('hex')
  const file = `action-references.${sha256.slice(0, 16)}.json`
  writeFileSync(resolve(root, 'public', file), raw)
  writeFileSync(resolve(root, 'public/action-references.json'), JSON.stringify({ version: 1, file, sha256 }) + '\n')
  for (const previous of readdirSync(resolve(root, 'public'))) {
    if (/^action-references\.[a-f0-9]{16}\.json$/.test(previous) && previous !== file) rmSync(resolve(root, 'public', previous))
  }
  return catalog
}
