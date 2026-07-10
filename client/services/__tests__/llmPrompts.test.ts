import { describe, expect, it } from 'vitest'
import { CARD_DESIGNER_SYSTEM_PROMPT, renderActionIdList } from '../llmPrompts'
import { cardEffectHooks } from '../../../shared/cards/card-effects'
import { sandboxListenerPhases } from '../../../shared/custom-code/sandbox-listener-phases'
import { sandboxListenerScopes } from '../../../shared/custom-code/sandbox-listener-scopes'
import { SANDBOX_ALLOWED_ACTION_IDS } from '../../../shared/custom-code/sandbox-action-ids'

describe('CARD_DESIGNER_SYSTEM_PROMPT', () => {
  it('does not advertise deprecated before-end dispatch metadata', () => {
    expect(CARD_DESIGNER_SYSTEM_PROMPT).not.toContain('beforeEndGameDispatchMode')
    expect(CARD_DESIGNER_SYSTEM_PROMPT).not.toContain("'serial' | 'select'")
  })

  // 三张 schema 表运行时从真相源数组渲染，故名字不会与引擎漂移。以下断言取代了
  // 旧 check-prompt-sync 对 llmPrompts.ts 的 hook/phase substring + action-ids block
  // 校验：断言每个名字确实渲染进 prompt（防 render 逻辑 bug 漏掉某类），
  // actionId 额外做双向集合相等（渲染只遍历白名单，故不可能多，但仍显式钉住）。
  it('renders every card-effect hook name', () => {
    expect(cardEffectHooks.filter((hook) => !CARD_DESIGNER_SYSTEM_PROMPT.includes(hook))).toEqual([])
  })

  it('renders every sandbox listener phase name', () => {
    expect(sandboxListenerPhases.filter((phase) => !CARD_DESIGNER_SYSTEM_PROMPT.includes(phase))).toEqual([])
  })

  it('renders every sandbox listener scope as a table row', () => {
    expect(sandboxListenerScopes.filter((scope) => !CARD_DESIGNER_SYSTEM_PROMPT.includes(`| \`${scope}\` |`))).toEqual([])
  })

  it('steers feeding-start gains away from the recursive harvest hook', () => {
    expect(CARD_DESIGNER_SYSTEM_PROMPT).toContain('请用 `onHarvest` 返回 `gainLeaf`')
    expect(CARD_DESIGNER_SYSTEM_PROMPT).toContain('不要从 `onStartHarvestFeedingPhase` 返回 flow')
  })

  it('steers accumulating-space listeners to exact action-space ids', () => {
    expect(CARD_DESIGNER_SYSTEM_PROMPT).toContain("资源累积格用 `actions: ['collect']`")
    expect(CARD_DESIGNER_SYSTEM_PROMPT).toContain('用 `context.space?.id` 精确判断')
    expect(CARD_DESIGNER_SYSTEM_PROMPT).toContain('不要假设 `context.result.spaceId` 存在')
  })

  it('renders exactly the actionId whitelist (no missing, no extras)', () => {
    const listed = [...renderActionIdList().matchAll(/`([^`]+)`/g)].map((m) => m[1])
    expect(new Set(listed)).toEqual(new Set(SANDBOX_ALLOWED_ACTION_IDS))
  })
})
