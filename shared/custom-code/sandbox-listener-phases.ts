import type { ActionHookPhase } from '../actions/hooks'
import type { CustomCodeManifest } from './types'

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
] as const satisfies readonly ActionHookPhase[]

export type SandboxListenerPhase = typeof sandboxListenerPhases[number]

export const isSandboxListenerPhase = (value: unknown): value is SandboxListenerPhase =>
  typeof value === 'string' && (sandboxListenerPhases as readonly string[]).includes(value)

/** Saved compiled manifests must obey the same phase contract as new source. */
export const assertSandboxListenerPhases = (cardId: string, manifest: CustomCodeManifest): void => {
  for (const listener of manifest.listeners) {
    for (const phase of listener.phases ?? []) {
      if (!isSandboxListenerPhase(phase)) {
        throw new Error(`Custom card ${cardId} listener "${listener.registrationId}": unsupported listener phase '${phase}'`)
      }
    }
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
  after: { desc: '行动完成后', usage: '追加效果、获得额外资源' },
  computeCosts: { desc: '计算费用时', usage: '费用折扣' },
  computeArgs: { desc: '计算行动参数时', usage: '调整参数' },
  computeChoiceCandidates: { desc: '计算可选项时', usage: '修改选项列表' },
  computeReplace: { desc: '替换行动', usage: '替换为别的效果' },
  isDoable: { desc: '判断行动可用性', usage: '让不可用行动变可用' },
  anytime: { desc: '任意时刻', usage: '全局触发' },
}
