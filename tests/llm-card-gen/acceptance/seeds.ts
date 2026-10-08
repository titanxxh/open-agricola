import { readFileSync } from 'node:fs'
import { acceptanceInputs } from './inputs'
import { extractCardCode, rewriteCardId } from '../extract'

// Synthetic browser responses only. Real model output is saved unchanged and
// passed directly to the fixed Vitest cases, without this adaptation.
export function acceptanceSeed(id: string): string {
  const input = acceptanceInputs.find(item => item.id === id)!
  if (id.startsWith('M1-')) return `const CARD_ID = '${input.draft.cardId}'
const CARD_DEF = { cardType: 'minor', meta: { id: CARD_ID, name: '${input.draft.name}', cost: { wood: 1 }, prerequisite: '3 Occupations', desc: ['Acceptance fixture'] } }
const CARD_IMPL = { effect: { onBuy: () => gainLeaf(CARD_ID, { wood: 3, food: 1 }) } }`
  const recording = readFileSync(new URL(`../recordings/${id}.txt`, import.meta.url), 'utf8')
  return rewriteCardId(extractCardCode(recording), input.draft.cardId).replace(/name:\s*(['"])[^'"]*\1/, `name: ${JSON.stringify(input.draft.name)}`)
}
