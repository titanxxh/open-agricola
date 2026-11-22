// No test here imports it any more; the owner repository's tests import it from their producer checkout (#1978).
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Fixture roots that keep the same absolute paths from one test to the next within a test file.
 *
 * tsx keys its transform cache by the source file's absolute path, so a CLI copied into a fresh
 * `mkdtemp` root transpiles from scratch in every test. Reusing `<base>/<prefix><n>` lets every
 * test after the first hit the cache. `reset()` removes the roots created since the last reset,
 * so each test still starts from an empty directory; `dispose()` also removes the private base.
 */
export function reusableTempRoots(prefix: string) {
  let base: string | undefined
  let next = 0
  return {
    create(): string {
      base ??= mkdtempSync(join(tmpdir(), prefix))
      const root = join(base, `${prefix}${next++}`)
      rmSync(root, { recursive: true, force: true })
      mkdirSync(root, { mode: 0o700 })
      return root
    },
    reset(): void {
      if (base) for (let index = 0; index < next; index++) rmSync(join(base, `${prefix}${index}`), { recursive: true, force: true })
      next = 0
    },
    dispose(): void {
      if (base) rmSync(base, { recursive: true, force: true })
      base = undefined
      next = 0
    },
  }
}
