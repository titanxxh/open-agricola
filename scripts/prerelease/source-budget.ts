import { readFileSync } from 'node:fs'
import { parseRuntimeLimits } from '../image-intake.ts'

// Staging runs beside the live pre app. Its temporary cgroup is independent of the
// sealed backup, intake and application cgroups in the target configuration.
export function parseSourceBudget(value: unknown) {
  const limits = parseRuntimeLimits(value)
  const swapMiB = value && typeof value === 'object' && 'swapMiB' in value ? value.swapMiB : 0
  if (typeof swapMiB !== 'number' || !Number.isSafeInteger(swapMiB) || swapMiB < 0 || !Number.isSafeInteger((limits.memoryMiB + swapMiB) * 1048576)) throw new Error('Invalid prerelease preparation swap budget')
  return { ...limits, swapMiB }
}

export type SourceBudget = ReturnType<typeof parseSourceBudget>

export function checkPreparationSwap(budget: SourceBudget, read = () => readFileSync('/proc/meminfo', 'utf8')) {
  if (!budget.swapMiB) return
  const match = /^SwapFree:\s+(\d+) kB$/m.exec(read())
  if (!match || Number(match[1]) < budget.swapMiB * 1024) throw new Error('Insufficient free swap for the selected prerelease preparation budget')
}
