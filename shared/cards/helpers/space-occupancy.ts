import type { GameState } from '../../contract/types'
import { findActionSpaceById } from '../../domain/space'

/**
 * 某行动格上当前物理存在的"人"数量（含新生儿）。
 *
 * 依赖 Worker 身份模型：`space.takenBy` 是按放置顺序的 WorkerRef 数组，
 * Family Growth 会把新生儿的 WorkerRef 也 push 到 FG 格；被送回家的工人
 * 会从 takenBy 中精确移除。因此 `takenBy.length` 直接对应"几个人"。
 *
 * 也解决 B004_WoodPile 的 TODO（"数累积格上有几个人"）。
 */
export const countPeopleOnSpace = (state: GameState, spaceId: string): number => {
  const space = findActionSpaceById(state, spaceId)
  if (!space) return 0
  return space.takenBy.length
}
