import type { GenerationFeasibility } from '../../../shared/contract/workshop-generation'
import type { WorkshopDraftContract } from '../../../shared/contract/workshop'

const REPOSITORY = 'titanxxh/open-agricola'
// GitHub rejects very long prefill URLs; the body keeps its head when trimmed.
const MAX_BODY_LENGTH = 6000

const list = (items: string[]) => items.length ? items.map(item => `- ${item}`).join('\n') : '- (none)'

/** A needs-platform verdict becomes an issue the author files from their own account (ADR 0052). */
export function platformIssueUrl(input: {
  draft: Pick<WorkshopDraftContract, 'cardId' | 'cardType' | 'name' | 'description'>
  request: string
  feasibility: GenerationFeasibility
  referenceCommit?: string
}): string {
  const { draft, feasibility } = input
  const body = [
    '## Card request',
    `- ID: \`${draft.cardId}\``,
    `- Type: ${draft.cardType}`,
    `- Name: ${draft.name}`,
    draft.description.trim() ? `- Card text: ${draft.description.trim()}` : null,
    input.request.trim() ? `- Author request: ${input.request.trim()}` : null,
    '',
    '## Workshop research',
    feasibility.summary,
    input.referenceCommit ? `\nResearched at commit \`${input.referenceCommit}\`.` : null,
    '',
    '### Missing shared mechanisms',
    list(feasibility.gaps),
    '',
    '### Evidence',
    list(feasibility.evidence.map(item => `\`${item.path}\`: ${item.finding}`)),
  ].filter(line => line !== null).join('\n')
  const url = new URL(`https://github.com/${REPOSITORY}/issues/new`)
  url.searchParams.set('title', `Workshop card ${draft.cardId} needs a platform change`)
  url.searchParams.set('body', body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH)}\n\n…` : body)
  url.searchParams.set('labels', 'needs-triage')
  return url.href
}
