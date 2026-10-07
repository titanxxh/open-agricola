import { fixtures } from '../fixtures'
import type { GenerationIntent, PlaytestFailure } from '../../../client/services/llm/generation/request'
import type { WorkshopAbilityCandidateContract, WorkshopDraftContract } from '../../../shared/contract/workshop'
import { sourceFingerprint } from '../../../shared/projections/workshop-generation'

export type AcceptanceInput = {
  id: string
  workspaceId: string
  baseRevision: number
  draft: WorkshopDraftContract
  intent: GenerationIntent
  selectedCandidate?: WorkshopAbilityCandidateContract
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  oracle: string
  expected: 'source' | 'capability-gap'
}
const names = ['Quick Haul', 'Logging Boots', 'Harvest Helper', 'Cattle Steward', 'Frugal Family', 'Action Tallyman', 'Wood to Food', 'Neighborly Help', 'Omenspeaker', 'Traveling Tutor', 'Medieval Mallet']
const cardDraft = (cardId: string, name: string, cardType: 'minor' | 'occupation', effectCode: string | null = null): WorkshopDraftContract => ({
  cardId, name, cardType, description: '', cardJson: { id: cardId, name, card_type: cardType, cost: {}, desc: [] }, effectCode, artUrl: null, generation: {},
})
export const sourceWith = (id: string, name: string, cardType: 'minor' | 'occupation', implementation: string, meta: Record<string, unknown> = {}): string => `const CARD_ID = '${id}'\nconst CARD_DEF = ${JSON.stringify({ cardType, meta: { id, name, cost: {}, desc: ['Acceptance fixture'], locales: { zh: { name: '验收卡', desc: ['验收说明'] } }, ...meta } })}\nconst CARD_IMPL = ${implementation}`

export const FOLLOWUP_ID = 'CUSTOM_M13_WorkshopMallet'
export const FOLLOWUP_META = { cost: { wood: 1 }, vp: 1, desc: ['When played, gain 2 <FOOD>. Improvements cost you 1 less <WOOD>.'], locales: { zh: { name: '工坊木槌', desc: ['打出时获得 2 <FOOD>。购买改良少支付 1 <WOOD>。'] } } }
export function followupSource(discount: number, food = 2): string {
  return sourceWith(FOLLOWUP_ID, 'Workshop Mallet', 'minor', `{
    effect: { onBuy: () => gainLeaf(CARD_ID, { food: ${food} }) },
    listeners: [{ cardIds: [CARD_ID], actions: ['improvement'], phases: ['computeCosts'], handler: () => ({ bonuses: [{ discount: { wood: ${discount} }, capDiscountAtCost: true, optional: false, sources: [CARD_ID] }], sourceCard: CARD_ID }) }]
  }`, { ...FOLLOWUP_META, desc: FOLLOWUP_META.desc.map(text => text.replace('1 less', `${discount} less`)), locales: { zh: { ...FOLLOWUP_META.locales.zh, desc: FOLLOWUP_META.locales.zh.desc.map(text => text.replace('1 <WOOD>', `${discount} <WOOD>`)) } } })
}
const candidate = (id: string, sourceCode: string, cardJson: Record<string, unknown> = {}): WorkshopAbilityCandidateContract => ({ id, kind: 'ability', prompt: id, sourceCode, cardJson, createdAt: 1, validation: { valid: true } })
const original = fixtures.map((fixture, index): AcceptanceInput => ({
  id: fixture.id, workspaceId: `acceptance-${fixture.id}`, baseRevision: 1,
  draft: cardDraft(fixture.cardId, names[index], fixture.cardType),
  intent: { kind: 'generate', message: fixture.userMessage.replace(/- 卡牌名称: .*/, `- 卡牌名称: ${names[index]}`) },
  oracle: fixture.id, expected: 'source',
}))
const followupDraft = cardDraft(FOLLOWUP_ID, 'Workshop Mallet', 'minor', followupSource(1, 7))
followupDraft.cardJson = { ...followupDraft.cardJson, ...FOLLOWUP_META }
const repairBase = original.find(item => item.id.startsWith('M9-'))!
const repairSource = sourceWith(repairBase.draft.cardId, repairBase.draft.name, 'occupation', '{ effect: { onBuy: (state, player) => futureMeeplesNode({ cardId: CARD_ID, playerId: player.id, entries: [{ round: state.round + 1, resources: { wood: 1 } }] }) } }')
const failed: PlaytestFailure = { workspaceId: 'acceptance-M14', versionId: 'tested-B-v2', source: repairSource, sourceFingerprint: sourceFingerprint(repairSource), errors: ['onBuy: ReferenceError: futureMeeplesNode is not defined'] }

export const acceptanceInputs: AcceptanceInput[] = [
  ...original,
  { id: 'M12-combined-forest-counter', workspaceId: 'acceptance-M12', baseRevision: 1,
    draft: cardDraft('CUSTOM_M12_ForestRecorder', 'Forest Recorder', 'occupation'),
    intent: { kind: 'generate', message: '实现职业卡 Forest Recorder：你每次使用伐木（forest）额外获得 1 食物；累计每触发 3 次，再获得 1 分。计数跨轮保留，只有自己的伐木计数，其他行动或对手行动不触发。' }, oracle: 'M12', expected: 'source' },
  { id: 'M13-selected-candidate-followup', workspaceId: 'acceptance-M13', baseRevision: 2, draft: followupDraft,
    selectedCandidate: candidate('selected-B', followupSource(1), { id: FOLLOWUP_ID, name: 'Workshop Mallet', card_type: 'minor', ...FOLLOWUP_META }),
    messages: [{ role: 'assistant', content: `Earlier C source:\n\`\`\`typescript\n${followupSource(1, 9)}\n\`\`\`` }],
    intent: { kind: 'follow-up', message: '把选中候选的购买改良木材折扣从 1 改为 2；保留打出时获得 2 食物、费用、分值、身份及双语信息，其他行为不变。' }, oracle: 'M13', expected: 'source' },
  { id: 'M14-tested-source-repair', workspaceId: 'acceptance-M14', baseRevision: 2, draft: { ...repairBase.draft, effectCode: repairSource },
    selectedCandidate: candidate('selected-C', sourceWith(repairBase.draft.cardId, repairBase.draft.name, 'occupation', '{ effect: { onBuy: () => gainLeaf(CARD_ID, { wood: 9 }) } }')),
    intent: { kind: 'repair', message: '修复实际试玩 B 的错误：打出时预放的 1 木材必须在下一轮开始时到账，不能改为立即收益，其他规则不变。', failure: failed }, oracle: repairBase.id, expected: 'source' },
  { id: 'M15-cropped-field-stable-gap', workspaceId: 'acceptance-M15', baseRevision: 1,
    draft: cardDraft('CUSTOM_M15_FieldStable', 'Field Stable', 'minor'),
    intent: { kind: 'generate', message: '实现 Field Stable：我可以在一块仍种有谷物的田地上建造一个马厩，原有田地和谷物全部保留；仍照常支付建马厩费用，并消耗一个自己的马厩组件。必须同时保留这三个条件，不能改为空田、清掉谷物或免费发一个虚构马厩。若现有沙盒不能实现，请说明缺少的通用能力。' }, oracle: 'M15', expected: 'capability-gap' },
  { ...original[1], id: 'M16-forest-english', workspaceId: 'acceptance-M16', intent: { kind: 'generate', message: 'Create the Logging Boots occupation. Whenever I use the Forest action space, give me one extra wood. Other actions and other players must not trigger this reward.' } },
  { ...original[10], id: 'M17-discount-english', workspaceId: 'acceptance-M17', intent: { kind: 'generate', message: 'Create the Medieval Mallet occupation. Once played, building rooms and buying improvements each costs me two less wood. Do not reduce other resource costs or allow a discount to produce resources.' } },
]

export function assertCapabilityGap(kind: string | undefined, message: string, hasSource: boolean): void {
  if (kind !== 'capability-gap' || hasSource) throw new Error('Expected a capability gap without an adoptable replacement source')
  for (const [label, pattern] of [
    ['occupied crop field', /(?:谷物|作物|grain|crop)/i], ['retained crops', /(?:保留|保持|retain|preserv|keep)/i],
    ['ordinary payment', /(?:支付|费用|payment|cost)/i], ['component supply', /(?:组件|库存|供应|supply|component|piece)/i],
    ['missing candidate/settlement contract', /(?:getSpecialStablePositions|applySpecialStable|候选|结算|candidate|settlement)/i],
  ] as const) if (!pattern.test(message)) throw new Error(`Capability gap did not explain ${label}`)
}
