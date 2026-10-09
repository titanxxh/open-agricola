import type { ActionHookPhase } from '../actions/hooks'

export const sandboxListenerPhases = [
  'before',
  'during',
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

/**
 * Prompt 描述元数据（单一真相源）：listener phase 的中文说明。
 * `getWorkshopSandboxContract` 运行时 import 此 map 提供 phase 描述。
 * `Record<SandboxListenerPhase, …>` 保证新增 phase 必须补描述，否则 tsc 报错。
 */
const reactionFields = ['flow', 'followUpActions', 'sourceCard', 'countCardUse', 'doable'] as const
export const sandboxListenerPhaseMeta: Record<SandboxListenerPhase, { desc: string; usage: string; resultKeys: readonly string[] }> = {
  before: { desc: '行动执行前', usage: '提前获得资源；place-farmer 的提前触发仅返回 flow/sourceCard', resultKeys: reactionFields },
  during: { desc: '行动执行完成后', usage: '追加反应，不覆写已执行的参数', resultKeys: reactionFields },
  immediatelyAfter: { desc: '行动刚完成', usage: '立即追加效果；reap 的专用反应仅返回 flow/sourceCard', resultKeys: reactionFields },
  after: { desc: '行动完全结束', usage: '获得额外资源等后续反应', resultKeys: reactionFields },
  computeCosts: { desc: '计算费用时', usage: '纯查询，费用贡献由实际定价行动消费', resultKeys: ['costs','costAttribution','trades','bonuses','paymentResourceProviders','sourceCard'] },
  computeArgs: { desc: '追加普通选择候选', usage: '仅 extraOptions；适用未提供原生候选构造器的 choice 请求及 occupied-placement 查询，不修改 actionContext', resultKeys: ['extraOptions','sourceCard'] },
  computeChoiceCandidates: { desc: '计算可选项时', usage: '仅追加原生候选；相同 value 保留先出现者', resultKeys: ['extraOptions','sourceCard'] },
  computeReplace: { desc: '替换行动', usage: 'actionId 继承原参数；或 decline:true + alternativeFlow；不提供 extraData 覆写', resultKeys: ['actionId','sourceCard','decline','alternativeFlow'] },
  isDoable: { desc: '判断行动可用性', usage: 'doable 不绕过正式结算；reserveResources 仅供 occupation 的候选查询', resultKeys: ['doable','reserveResources','sourceCard'] },
  anytime: { desc: '当前玩家的任意时刻能力', usage: '监听身份 anytime；返回 flow 与标签，卡主必须是当前玩家', resultKeys: ['flow','labelKey','labelParams','sourceCard'] },
  computeExchanges: { desc: '计算兑换目录', usage: '监听身份 compute-exchanges；纯查询，返回 extraExchanges，正式兑换负责结算', resultKeys: ['extraExchanges','sourceCard'] },
}
