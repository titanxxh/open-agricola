import { describe, expect, it } from 'vitest'
import { FULL_TASK_IDS, taskCommands } from '../ci/verification-tasks'

describe('complete candidate verification tasks', () => {
  it('selects the complete build checks once as one retryable task', () => {
    expect(taskCommands(process.cwd(), 'build')).toEqual([
      { command: 'pnpm', args: ['run', 'build'] },
      { command: 'pnpm', args: ['run', 'build:replay-viewer'] },
      { command: 'pnpm', args: ['run', 'check:bundle-size'] },
    ])
    expect(FULL_TASK_IDS).toEqual([
      'quality', 'fast', 'slow', 'build',
      'chromium-1', 'chromium-2', 'chromium-3', 'chromium-4', 'browser-sandbox', 'webkit',
    ])
  })
})
