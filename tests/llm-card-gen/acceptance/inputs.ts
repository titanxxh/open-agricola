import { fixtures } from '../fixtures'
import type { GenerationIntent } from '../../../client/services/llm/generation/request'
import type { WorkshopDraftContract } from '../../../shared/contract/workshop'

export type AcceptanceInput = {
  id: string
  workspaceId: string
  baseRevision: number
  draft: WorkshopDraftContract
  intent: GenerationIntent
}

const names = ['Quick Haul', 'Logging Boots', 'Harvest Helper', 'Cattle Steward', 'Frugal Family', 'Action Tallyman', 'Wood to Food', 'Neighborly Help', 'Omenspeaker', 'Traveling Tutor', 'Medieval Mallet']

// Generation and replay use the same fixed fixtures. The browser only supplies
// complete card source; runner.test.ts owns all behavior assertions.
export const acceptanceInputs: AcceptanceInput[] = fixtures.map((fixture, index) => ({
  id: fixture.id, workspaceId: `acceptance-${fixture.id}`, baseRevision: 1,
  draft: {
    cardId: fixture.cardId, name: names[index], cardType: fixture.cardType, description: '',
    cardJson: { id: fixture.cardId, name: names[index], card_type: fixture.cardType, cost: {}, desc: [] },
    effectCode: null, artUrl: null, generation: {},
  },
  intent: { kind: 'generate', message: fixture.userMessage.replace(/- 卡牌名称: .*/, `- 卡牌名称: ${names[index]}`) },
}))
