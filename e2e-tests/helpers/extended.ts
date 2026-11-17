import type { TestDetails } from '@playwright/test'

/** Tag of the repeated viewport, locale or device variants that default browser verification leaves out. */
export const EXTENDED_TAG = '@extended'

/**
 * Test details for one variant of a scenario whose body runs unchanged across viewports, locales or devices.
 * Default verification runs only the primary variant; `E2E_EXTENDED=1` runs every variant (`playwright.config.ts`).
 * Keep exactly one primary per scenario, and never mark a case that a requirements file or an explicit `--grep`
 * selection names: the default exclusion would drop it from that selection.
 */
export const matrixVariant = (primary: boolean): TestDetails => primary ? {} : { tag: EXTENDED_TAG }
