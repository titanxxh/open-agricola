/**
 * A fixture's `run()` receives the LLM-generated TS source (already extracted
 * from the markdown response) and is fully responsible for compiling /
 * registering / invoking / asserting. Returns a result envelope.
 *
 * This is intentionally simple — each fixture self-contains its scenario,
 * trigger, and assertion logic, calling into helpers from session-helpers.ts.
 */

export interface FixtureResult {
  ok: boolean
  reason?: string
}

export interface CardFixture {
  /** Test ID, used for it() name and the LLM-output dump filename. */
  id: string
  /** Stable cardId used in registration; LLM's invented id is rewritten to this. */
  cardId: string
  /** Card type as the LLM should declare it (matches CARD_DEF constructor). */
  cardType: 'minor' | 'occupation'
  /** Message sent to the LLM as the user turn (after the system prompt). */
  userMessage: string
  /**
   * Compile + register + invoke the relevant hook(s); inspect the result;
   * return `{ ok: true }` if the LLM-generated card behaves as expected.
   */
  run: (llmGeneratedCode: string) => Promise<FixtureResult> | FixtureResult
}
