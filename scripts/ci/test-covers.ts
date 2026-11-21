import { globSync } from 'glob'

// Leading `// @covers <prefix> ...` declarations shared by the routine planner and the test covers gate.

export function coverPrefixes(text: string): string[] {
  const prefixes: string[] = []
  let inBlock = false
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (inBlock) {
      if (trimmed.includes('*/')) inBlock = false
      continue
    }
    if (trimmed === '') continue
    if (trimmed.startsWith('/*')) {
      if (!trimmed.includes('*/')) inBlock = true
      continue
    }
    if (!trimmed.startsWith('//')) break
    const match = trimmed.match(/^\/\/\s*@covers\b(.*)$/)
    if (match?.[1]) prefixes.push(...match[1].trim().split(/\s+/).filter(Boolean))
  }
  return prefixes
}

export function prefixMatches(prefix: string, path: string): boolean {
  if (path === prefix) return true
  const directory = prefix.endsWith('/') ? prefix : `${prefix}/`
  return path.startsWith(directory)
}

export function isBrowserSpec(file: string): boolean {
  return /^e2e-tests\/.+\.spec\.[cm]?[jt]sx?$/.test(file)
}

// Vitest files and the test helpers beside them. A declaration on a helper reaches the tests that import it.
export function isVitestSource(file: string): boolean {
  if (file.startsWith('e2e-tests/') || file.includes('/node_modules/')) return false
  return file.includes('/__tests__/') || file.startsWith('tests/') || /\.test\.[cm]?[jt]sx?$/.test(file)
}

export function repositoryFiles(root: string): string[] {
  return globSync('**/*', {
    cwd: root,
    nodir: true,
    posix: true,
    ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/.build/**', '**/coverage/**', '**/playwright-report/**', '**/test-results/**'],
  })
}
