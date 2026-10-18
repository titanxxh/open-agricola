/**
 * Runs every release step in order, including steps appended while it runs, so
 * one failed step cannot leave later resources open. Drains `steps`; failures are
 * reported together once the last step has run.
 */
export async function releaseAll(steps: Array<() => unknown>): Promise<void> {
  const errors: unknown[] = []
  for (let step = steps.shift(); step; step = steps.shift()) {
    try { await step() } catch (error) { errors.push(error) }
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, `${errors.length} release steps failed`)
}

/**
 * Cleanup registrations for one test's teardown. A timed-out test body keeps
 * running and may acquire resources after teardown has begun; those are released
 * as soon as they are registered instead of waiting for a teardown that is over.
 */
export function releaseQueue(onLateFailure: (error: unknown) => void = error => console.error('[release] late cleanup failed', error)) {
  const steps: Array<() => unknown> = []
  let closed = false
  return {
    register(step: () => unknown): void {
      if (!closed) steps.push(step)
      else void (async () => step())().catch(onLateFailure)
    },
    /** Releases everything registered so far, most recent first. */
    release(): Promise<void> {
      closed = true
      return releaseAll(steps.reverse())
    },
  }
}
