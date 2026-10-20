import path from 'node:path'
import ts from 'typescript'
import { createActionSpaces } from '../shared/actions'
import { createMoorActionSpaces } from '../shared/moor/action-spaces'
import { createSeasonActionSpaces } from '../shared/seasons/action-spaces'
import { getRegisteredPlayerActionSpaceIds } from '../shared/cards/player-action-space'
import { listenerContractError } from '../shared/cards/listener-contract'
import { parseListenerFunction } from './listener-mutation-scan'
import type { CardImplBoundaryResult, RuntimeCardImpl } from './check-card-impl-boundaries'

export function collectBoardActionSpaceIds(): string[] {
  return [...new Set([
    ...createActionSpaces().map(space => space.id),
    ...Array.from({ length: 6 }, (_, index) => createMoorActionSpaces(index + 1)).flat().map(space => space.id),
    ...createSeasonActionSpaces().map(space => space.id),
    ...getRegisteredPlayerActionSpaceIds(),
  ])].sort()
}

type RuntimeListener = NonNullable<RuntimeCardImpl['listeners']>[number]
export function auditListenerContractError(listener: RuntimeListener, boardIds: ReadonlySet<string>): string | undefined {
  const shapeError = listenerContractError(listener)
  if (shapeError) return shapeError
  if (Array.isArray(listener.actionSpaces)) {
    const unknownIds = listener.actionSpaces.filter(id => !boardIds.has(id))
    if (unknownIds.length > 0) return `Listener ${listener.id}: unknown action space target(s): ${unknownIds.join(', ')}`
  }
  return undefined
}

export type CardAuditMetadata = { name: string; description: string }
type ReviewReason = 'placement-lifecycle' | 'space-context' | 'target-space-id' | 'action-id-query' | 'board-id-literal' | 'card-text-space'
export type ListenerAuditEntry = {
  cardId: string
  listenerId: string
  file: string
  phases: unknown
  actions?: unknown
  actionSpaces?: unknown
  events?: unknown
  globalQuery?: unknown
  error?: string
  reviewReasons: ReviewReason[]
}

function reviewReasons(listener: RuntimeListener, boardIds: ReadonlySet<string>, file: string): ReviewReason[] {
  const reasons = new Set<ReviewReason>()
  if (Array.isArray(listener.actions) && listener.actions.includes('place-farmer')) reasons.add('placement-lifecycle')
  const inspectKey = (key: string) => {
    if (key === 'space') reasons.add('space-context')
    if (key === 'spaceId' || key === 'targetSpaceId') reasons.add('target-space-id')
    if (key === 'actionId') reasons.add('action-id-query')
  }
  for (const handler of [listener.handler, listener.deriveCardCostCandidate]) {
    if (typeof handler !== 'function') continue
    const parsed = parseListenerFunction(handler, file)
    if (!parsed) continue // The existing mutation scan reports unparseable handlers as scope errors.
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node)) inspectKey(node.name.text)
      if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteralLike(node.argumentExpression)) {
        inspectKey(node.argumentExpression.text)
      }
      if (ts.isBindingElement(node)) {
        const key = node.propertyName ?? node.name
        if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) inspectKey(key.text)
      }
      if (ts.isStringLiteralLike(node) && boardIds.has(node.text)) reasons.add('board-id-literal')
      ts.forEachChild(node, visit)
    }
    visit(parsed)
  }
  return [...reasons].sort()
}

export function auditCardListeners(
  cards: readonly RuntimeCardImpl[],
  boardIds: ReadonlySet<string>,
  metadata: ReadonlyMap<string, CardAuditMetadata> = new Map(),
) {
  const inventory: ListenerAuditEntry[] = cards.flatMap(card => (card.listeners ?? []).map(listener => ({
    cardId: card.cardId,
    listenerId: listener.id,
    file: card.file,
    phases: listener.phases ?? [],
    actions: listener.actions,
    actionSpaces: listener.actionSpaces,
    events: listener.events,
    globalQuery: listener.globalQuery,
    error: auditListenerContractError(listener, boardIds),
    reviewReasons: [
      ...reviewReasons(listener, boardIds, card.file),
      ...(/\b(?:action|accumulation) spaces?\b/i.test(metadata.get(card.cardId)?.description ?? '') ? ['card-text-space' as const] : []),
    ],
  }))).sort((left, right) => left.cardId.localeCompare(right.cardId) || left.listenerId.localeCompare(right.listenerId))
  return {
    boardActionSpaceIds: [...boardIds].sort(),
    cards: cards.map(card => ({
      cardId: card.cardId,
      file: card.file,
      ...metadata.get(card.cardId),
      listenerCount: card.listeners?.length ?? 0,
    })).sort((left, right) => left.cardId.localeCompare(right.cardId)),
    inventory,
    reviewCandidates: inventory.filter(entry => !entry.error && !entry.actionSpaces && entry.reviewReasons.length > 0),
  }
}

export function renderCardListenerAudit(
  result: CardImplBoundaryResult,
  audit: ReturnType<typeof auditCardListeners>,
  source: { head: string; fingerprint: string },
  repoRoot: string,
): string {
  const cell = (value: unknown) => String(value ?? '').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')
  const list = (value: unknown) => cell(Array.isArray(value) ? value.join(', ') : value)
  const location = (file: string) => path.relative(repoRoot, file)
  const violations = result.violations.map(violation => `| ${cell(violation.cardId)} | ${cell(violation.listenerId)} | ${list(violation.phases)} | ${list(violation.targets)} | ${cell(violation.message)} | ${cell(location(violation.file))} |`)
  const candidates = audit.reviewCandidates.map(entry => `| ${cell(entry.cardId)} | ${cell(entry.listenerId)} | ${list(entry.phases)} | ${list(entry.actions ?? entry.events ?? 'globalQuery')} | ${cell(entry.reviewReasons.join(', '))} | ${cell(location(entry.file))} |`)
  return [
    '# Card Listener 全卡审计', '',
    `源码 HEAD：\`${source.head}\`。源码指纹：\`${source.fingerprint}\`。`, '',
    `扫描 ${audit.cards.length} 个真实 Card Impl、${audit.inventory.length} 条 listener 注册、${audit.boardActionSpaceIds.length} 个权威行动格 ID。`,
    `扫描范围${result.scopeErrors.length === 0 ? '完整' : '有错误，不能作为完整审计'}；结构违规 ${result.violations.length} 条；牌面审查候选 ${audit.reviewCandidates.length} 条。`, '',
    '## 扫描范围错误', '', ...result.scopeErrors.map(error => `- ${error}`),
    ...(result.scopeErrors.length === 0 ? ['无。'] : []), '',
    '## 确定的结构违规', '',
    '| cardId | listenerId | phase | targets | reason | source |',
    '|---|---|---|---|---|---|', ...violations,
    ...(violations.length === 0 ? ['无。'] : []), '',
    '## 需要对照牌面的候选', '',
    '以下是合法注册中的同函数语法或牌面关键词线索，不是违规或已确认迁移清单。检查不追踪跨函数数据流；未列入候选不代表牌面语义已经验证。完整卡牌、牌面和注册清单保存在同目录 audit.json。', '',
    '| cardId | listenerId | phase | targets | review reasons | source |',
    '|---|---|---|---|---|---|', ...candidates, '',
  ].join('\n')
}
