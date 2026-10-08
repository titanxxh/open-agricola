import { expect, it, vi } from 'vitest'

const dependency = vi.hoisted(() => ({ upgraded: false }))
vi.mock('node:fs', async importOriginal => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    readFileSync: (...args: Parameters<typeof fs.readFileSync>) => {
      const content = fs.readFileSync(...args)
      if (!dependency.upgraded || !String(args[0]).endsWith('/pnpm-lock.yaml')) return content
      const upgraded = content.toString().replace(/typescript@\d+\.\d+\.\d+/g, 'typescript@0.0.0-contract-test')
      expect(upgraded).not.toBe(content.toString())
      return typeof content === 'string' ? upgraded : Buffer.from(upgraded)
    },
  }
})

it('changes the deployed contract when only resolved sandbox dependencies change', async () => {
  const before = (await import('../workshop-sandbox-contract')).getWorkshopSandboxContract()
  dependency.upgraded = true
  vi.resetModules()
  const after = (await import('../workshop-sandbox-contract')).getWorkshopSandboxContract()
  expect(after.id).not.toBe(before.id)
  expect({ ...after, id: before.id }).toEqual(before)
})
