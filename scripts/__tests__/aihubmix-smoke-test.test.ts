import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('image smoke CLI', () => {
  it('loads pinned translations in a cold process and builds prompts without API calls', () => {
    const blockNetwork = `data:text/javascript,${encodeURIComponent("globalThis.fetch = async () => { throw new Error('Network is disabled for the prompt check') }")}`
    const stdout = execFileSync(process.execPath, [
      '--import', 'tsx', '--import', blockNetwork,
      resolve('scripts/aihubmix-smoke-test.ts'), '--image-only', '--dry-run',
    ], { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 })
    const prompts: unknown = JSON.parse(stdout.trim().split('\n').at(-1) ?? '')

    expect(prompts).toEqual([
      { id: 'CUSTOM_M1_QuickHaul', prompt: expect.stringContaining('一辆装满木材和食物的小型手推车，由农夫在泥土小路上快速推行') },
      { id: 'CUSTOM_M2_LumberJackBoots', prompt: expect.stringContaining('一位穿着结实木屑靴子的伐木工，肩扛斧头，站在农场边缘的木柴堆旁') },
    ])
    expect(stdout).not.toContain('ui.copy.')
  })
})
