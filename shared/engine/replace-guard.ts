const SKIP_COMPUTE_REPLACE_LISTENER_IDS = 'skipComputeReplaceListenerIds'

const normalizeListenerIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0)
}

export const getSkipComputeReplaceListenerIds = (
  actionContext?: Record<string, unknown>,
): string[] => normalizeListenerIds(actionContext?.[SKIP_COMPUTE_REPLACE_LISTENER_IDS])

export const withSkippedComputeReplaceListeners = (
  actionContext: Record<string, unknown> | undefined,
  listenerIds: readonly string[],
): Record<string, unknown> | undefined => {
  const normalized = listenerIds.filter((entry) => entry.length > 0)
  if (normalized.length === 0) {
    return actionContext ? { ...actionContext } : undefined
  }
  const existing = getSkipComputeReplaceListenerIds(actionContext)
  return {
    ...(actionContext ?? {}),
    [SKIP_COMPUTE_REPLACE_LISTENER_IDS]: [...new Set([...existing, ...normalized])],
  }
}

export const resetComputeReplaceGuards = (
  actionContext?: Record<string, unknown>,
): Record<string, unknown> => ({
  ...actionContext,
  checkedReplaceAction: false,
  [SKIP_COMPUTE_REPLACE_LISTENER_IDS]: [],
})
