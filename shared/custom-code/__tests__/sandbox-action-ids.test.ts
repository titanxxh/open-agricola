import { describe, it, expect } from 'vitest'
import { actionDefinitions } from '../../actions'
import { internalActionDefinitions } from '../../actions/internal-actions'
import { SANDBOX_ALLOWED_ACTION_IDS } from '../sandbox-action-ids'
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
  it('白名单恰好是预期的 9 个 actionId', () => {
    expect([...SANDBOX_ALLOWED_ACTION_IDS].sort()).toEqual(
      [
        'bake-bread', 'bonus-vp', 'future-meeples', 'gain', 'pay',
        'push-to-card-stack', 'special-effect', 'store-on-card', 'take-from-card',
      ].sort(),
    )
  })
})

describe('sandboxListenerActions', () => {
  it('只包含当前 action registry 中存在的 id', () => {
    const runtimeActionIds = new Set(
      [...actionDefinitions, ...internalActionDefinitions].map((action) => action.id),
    )
    expect(sandboxListenerActions.filter((id) => !runtimeActionIds.has(id))).toEqual([])
  })
})
