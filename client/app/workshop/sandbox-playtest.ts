import type { PlaytestFailure, PlaytestSource } from '../../services/llm/generation/request'

export type SandboxStartResult = {
  ok: boolean
  error?: string
  cardWarnings?: string[]
  gameInstanceId?: string
  state?: { gameSeed?: number | string }
  customCardsLoaded?: number
  customCardVersionsLoaded?: Array<{ cardId: string; versionId: string }>
}

/** Page-local proof; none of these envelope fields enters a model request. */
export type SandboxPlaytest = {
  source: PlaytestSource
  instanceId: string
  warningScope: 'single-custom-card' | 'unattributed'
}

export function bindSandboxPlaytest(
  result: SandboxStartResult,
  source?: PlaytestSource,
): SandboxPlaytest | null {
  const versions = result.customCardVersionsLoaded
  if (!result.ok || !source || !result.gameInstanceId
    || !versions?.some(version => version.cardId === source.workspaceId && version.versionId === source.versionId)) return null
  return {
    source: { ...source, gameSeed: result.state?.gameSeed },
    instanceId: result.gameInstanceId,
    warningScope: result.customCardsLoaded === 1 && versions.length === 1
      ? 'single-custom-card' : 'unattributed',
  }
}

export function sandboxFailureFor(
  playtest: SandboxPlaytest | null | undefined,
  errors: string[],
): PlaytestFailure | null {
  return playtest?.warningScope === 'single-custom-card' && errors.length > 0
    ? { ...playtest.source, errors } : null
}
