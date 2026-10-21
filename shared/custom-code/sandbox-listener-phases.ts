import type { ActionHookPhase } from '../actions/hooks'
import type { CustomCodeManifest } from './types'
import { listenerContractError } from '../cards/listener-contract'
import { isSandboxListenerAction } from './sandbox-listener-actions'

export const sandboxListenerPhases = [
  'before',
  'immediatelyAfter',
  'after',
  'computeCosts',
  'computeArgs',
  'computeChoiceCandidates',
  'computeReplace',
  'isDoable',
  'anytime',
  'computeExchanges',
] as const satisfies readonly ActionHookPhase[]

export type SandboxListenerPhase = typeof sandboxListenerPhases[number]

export const isSandboxListenerPhase = (value: unknown): value is SandboxListenerPhase =>
  typeof value === 'string' && (sandboxListenerPhases as readonly string[]).includes(value)

export class UnsupportedSandboxListenerError extends Error {
  readonly code: 'unsupported_listener_subscription' | 'unsupported_listener_phase' = 'unsupported_listener_subscription'

  constructor(cardId: string, listenerId: string, detail: string) {
    super(`Custom card ${cardId} listener "${listenerId}": ${detail}`)
    this.name = 'UnsupportedSandboxListenerError'
  }
}

export class UnsupportedSandboxListenerPhaseError extends UnsupportedSandboxListenerError {
  override readonly code = 'unsupported_listener_phase'

  constructor(cardId: string, listenerId: string, phase: unknown) {
    super(cardId, listenerId, `unsupported listener phase '${String(phase)}'`)
    this.name = 'UnsupportedSandboxListenerPhaseError'
  }
}

/** Reject the complete saved manifest before any effects, listeners or workers are installed. */
export const assertSandboxListenerManifest = (cardId: string, manifest: CustomCodeManifest): void => {
  for (const listener of manifest.listeners) {
    for (const phase of Array.isArray(listener.phases) ? listener.phases : []) {
      if (!isSandboxListenerPhase(phase)) {
        throw new UnsupportedSandboxListenerPhaseError(cardId, listener.registrationId, phase)
      }
    }
  }
  for (const listener of manifest.listeners) {
    if ('events' in listener || 'globalQuery' in listener || 'actionSpaces' in listener) throw new UnsupportedSandboxListenerError(cardId, listener.registrationId, 'unsupported selector')
    const error = listenerContractError({ ...listener, id: listener.registrationId })
    if (error) throw new UnsupportedSandboxListenerError(cardId, listener.registrationId, error)
    if (!listener.actions?.every(isSandboxListenerAction)) throw new UnsupportedSandboxListenerError(cardId, listener.registrationId, 'unsupported listener action')
  }
}

/**
 * Prompt 描述元数据（单一真相源）：listener phase 的中文说明。
 * `getWorkshopSandboxContract` 运行时 import 此 map 提供 phase 描述。
 * `Record<SandboxListenerPhase, …>` 保证新增 phase 必须补描述，否则 tsc 报错。
 */
export const sandboxListenerPhaseMeta: Record<SandboxListenerPhase, { desc: string; usage: string }> = {
  before: { desc: '行动执行前', usage: '提前获得资源' },
  immediatelyAfter: { desc: '行动刚完成', usage: '立即追加效果' },
  after: { desc: '行动完成后', usage: '依赖行动结果的反应，或牌面明确写明 after 的效果' },
  computeCosts: { desc: '计算费用时', usage: '费用折扣' },
  computeArgs: { desc: '计算行动参数时', usage: '调整参数' },
  computeChoiceCandidates: { desc: '计算可选项时', usage: '修改选项列表' },
  computeReplace: { desc: '替换行动', usage: '替换为别的效果' },
  isDoable: { desc: '判断行动可用性', usage: '让不可用行动变可用' },
  anytime: { desc: '任意时刻', usage: "actions: ['anytime']，列出当前合法的主动能力" },
  computeExchanges: { desc: '列出可用兑换时', usage: "actions: ['compute-exchanges']，返回 extraExchanges 追加依赖当前状态的兑换" },
}
