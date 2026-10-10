import { describe, it, expect } from 'vitest'
import { actionDefinitions } from '../../actions'
import { internalActionDefinitions } from '../../actions/index'
import { SANDBOX_ALLOWED_ACTION_IDS, SANDBOX_SPECIAL_EFFECT_KINDS } from '../sandbox-action-ids'
import { sandboxListenerActions } from '../sandbox-listener-actions'

describe('SANDBOX_ALLOWED_ACTION_IDS', () => {
  it('包含核心沙盒 actionId 且无 card_ 前缀 ad-hoc id', () => {
    expect(SANDBOX_ALLOWED_ACTION_IDS).toContain('gain')
    expect(SANDBOX_ALLOWED_ACTION_IDS).toContain('special-effect')
    expect(SANDBOX_ALLOWED_ACTION_IDS).toContain('future-meeples')
    expect(SANDBOX_ALLOWED_ACTION_IDS.some((id) => id.startsWith('card_'))).toBe(false)
  })
  it('每个 id 去重', () => {
    expect(new Set(SANDBOX_ALLOWED_ACTION_IDS).size).toBe(SANDBOX_ALLOWED_ACTION_IDS.length)
  })
  it('白名单恰好是预期的 25 个 actionId', () => {
    expect([...SANDBOX_ALLOWED_ACTION_IDS].sort()).toEqual(
      [
        'bake-bread', 'bonus-vp', 'future-meeples', 'gain', 'pay',
        'push-to-card-stack', 'special-effect', 'store-on-card', 'take-from-card',
        'plow', 'sow', 'fence', 'stables', 'construct', 'renovate-house', 'improvement', 'occupation',
        'family-growth', 'breed', 'reap', 'exchange', 'set-first-player', 'selection', 'emit-choice', 'reorganize',
      ].sort(),
    )
  })
  it('只包含当前 action registry 中存在的 id', () => {
    const runtimeActionIds = new Set([...actionDefinitions, ...internalActionDefinitions].map(action => action.id))
    expect(SANDBOX_ALLOWED_ACTION_IDS.filter(id => !runtimeActionIds.has(id))).toEqual([])
  })
})

describe('SANDBOX_SPECIAL_EFFECT_KINDS', () => {
  it('白名单恰好是文档 §6.1 的 9 个卡牌局部 kind', () => {
    expect([...SANDBOX_SPECIAL_EFFECT_KINDS].sort()).toEqual([
      'increment-counter', 'increment-extra-data', 'pop-card-stack-top', 'remove-future-meeples', 'set-counter',
      'set-extra-data', 'set-flag', 'set-infobox', 'set-private-data',
    ])
  })
})

describe('sandboxListenerActions', () => {
  it('白名单恰好是支持的 listener action 集合', () => {
    expect([...sandboxListenerActions].sort()).toEqual(
      [
        'bake-bread', 'breed', 'collect', 'construct', 'family-growth', 'fence', 'gain',
        'improvement', 'occupation', 'place-farmer', 'plow', 'reap', 'receive',
        'renovate-house', 'sow', 'stables', 'wish-children',
      ].sort(),
    )
  })

  it('只包含当前 action registry 中存在的 id', () => {
    const runtimeActionIds = new Set(
      [...actionDefinitions, ...internalActionDefinitions].map((action) => action.id),
    )
    expect(sandboxListenerActions.filter((id) => !runtimeActionIds.has(id))).toEqual([])
  })
})
