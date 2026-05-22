import { describe, it, expect } from 'vitest'
import { Driver } from '../driver'

describe('Driver', () => {
  it('未知 interaction kind 抛清晰错误', () => {
    const fakeSession = {
      takeAction: () => ({
        ok: true,
        interaction: { stateId: 'wait', request: { kind: 'totally-unknown-kind' }, playerIndex: 0 },
      }),
      getState: () => ({ state: {} }),
    }
    const driver = new Driver(fakeSession as any, { cardId: 'X' } as any)
    expect(() => driver.takeAction(0, 'forest')).toThrow(/driver needs extension: unknown interaction kind totally-unknown-kind/)
  })
})
