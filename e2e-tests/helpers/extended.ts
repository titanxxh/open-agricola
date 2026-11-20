import { test, type TestDetails } from '@playwright/test'

/** Tag of the repeated viewport, locale or device variants that default browser verification leaves out. */
export const EXTENDED_TAG = '@extended'

/** Whether this run includes the extended variants and Session-covered rule cases (`playwright.config.ts`). */
export const EXTENDED_RUN = process.env.E2E_EXTENDED === '1'

/**
 * Test details for one variant of a scenario whose body runs unchanged across viewports, locales or devices.
 * Default verification runs only the primary variant; `E2E_EXTENDED=1` runs every variant (`playwright.config.ts`).
 * Keep exactly one primary per scenario, and never mark a case that a requirements file or an explicit `--grep`
 * selection names: the default exclusion would drop it from that selection.
 */
export const matrixVariant = (primary: boolean): TestDetails => primary ? {} : { tag: EXTENDED_TAG }

/**
 * Skips a browser case whose rule outcome the named Session tests already prove, unless `E2E_EXTENDED=1`.
 * Call it at the top of a spec file (every case) or as the first statement of one case. Unlike a tagged variant,
 * the case stays listed and reports `skipped`, so a spec whose every case is covered still has results when
 * Routine selects it. Never use it on a case that a requirements file names.
 */
export function sessionCovered(...sessionTests: [string, ...string[]]): void {
  test.skip(!EXTENDED_RUN, `Rule outcome proven by ${sessionTests.join(', ')}; runs with E2E_EXTENDED=1`)
}
