import { readFileSync } from 'node:fs'
import { acceptanceInputs, followupSource, sourceWith } from './inputs'
import { extractCardCode, rewriteCardId } from '../extract'

// These are test-owned counterexample seeds, deliberately adapted here only.
// Paid outputs go straight to evaluateBehavior without this helper or rewriting.
export function acceptanceSeed(id: string): string {
  const input = acceptanceInputs.find(item => item.id === id)!
  if (input.oracle.startsWith('M1-')) return sourceWith(input.draft.cardId, input.draft.name, 'minor', '{ effect: { onBuy: () => gainLeaf(CARD_ID, { wood: 3, food: 1 }) } }', { cost: { wood: 1 }, prerequisite: '3 Occupations' })
  if (input.oracle === 'M12') return sourceWith(input.draft.cardId, input.draft.name, 'occupation', `{
    listeners: [{ cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], handler: ctx => {
      if (ctx.space?.id !== 'forest') return;
      const count = ctx.player.cardStates[CARD_ID]?.counters?.forestVisits || 0;
      return { sourceCard: CARD_ID, flow: { type: 'seq', children: [gainLeaf(CARD_ID, { food: 1 }),
        { type: 'leaf', actionId: 'special-effect', params: { kind: 'increment-counter', key: 'forestVisits', amount: 1 }, sourceCard: CARD_ID },
        ...((count + 1) % 3 === 0 ? [{ type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID }] : [])] } };
    } }]
  }`)
  if (input.oracle === 'M13') return followupSource(2)
  const recording = readFileSync(new URL(`../recordings/${input.oracle}.txt`, import.meta.url), 'utf8')
  return rewriteCardId(extractCardCode(recording), input.draft.cardId).replace(/name:\s*(['"])[^'"]*\1/, `name: ${JSON.stringify(input.draft.name)}`)
}

export const GAP_SEED = JSON.stringify({ kind: 'capability-gap', message: 'The sandbox lacks getSpecialStablePositions and applySpecialStable candidate/settlement hooks. It cannot preserve grain crops on the field while also applying normal payment and component supply.' })
