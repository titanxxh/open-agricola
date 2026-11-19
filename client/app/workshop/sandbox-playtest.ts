import type { ClassicPoolShortfall } from '../../../shared/contract/card-edition'
import type { PlaytestFailure, PlaytestSource } from '../../services/llm/generation/request'

/** Error body of a Workshop sandbox settings request. */
export type SandboxStartResult = {
  ok: boolean
  error?: string
  shortfall?: ClassicPoolShortfall
}

/** Page-local proof; none of these envelope fields enters a model request. */
export type SandboxPlaytest = {
  source: PlaytestSource
  instanceId: string
  warningScope: 'single-custom-card' | 'unattributed'
}

/** Binds a pinned version to the browser launch that loads it. */
export function bindSandboxPlaytest(launch: {
  instanceId: string
  seed: number
  cardCount: number
  source: PlaytestSource
}): SandboxPlaytest {
  return {
    source: { ...launch.source, gameSeed: launch.seed },
    instanceId: launch.instanceId,
    warningScope: launch.cardCount === 1 ? 'single-custom-card' : 'unattributed',
  }
}

export function sandboxFailureFor(
  playtest: SandboxPlaytest | null | undefined,
  errors: string[],
): PlaytestFailure | null {
  return playtest?.warningScope === 'single-custom-card' && errors.length > 0
    ? { ...playtest.source, errors } : null
}
