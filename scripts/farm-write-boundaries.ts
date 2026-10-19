import path from 'node:path'
import ts from 'typescript'
import { FARM_LAYOUT_PROPERTIES, FARM_WRITE_OWNERS, collectFarmWrites } from './farm-write-scan'
import { parseSource, walkSourceFiles } from './source-files'
import { isTestFile } from './architecture-policy.mjs'

export type FarmWriteViolation = { file: string; line?: number; message: string }

export function walkProductionFarmFiles(repoRoot: string): string[] {
  return ['shared', 'server'].flatMap(root => {
    const files = walkSourceFiles(path.join(repoRoot, root)).filter(file => !isTestFile(file))
    if (files.length === 0) throw new Error(`empty production farm-write scope: ${root}`)
    return files
  })
}

/** A closed list of setup/restore functions; new game writers belong in the owner. */
export function checkFarmWriteBoundaries(repoRoot: string): { filesChecked: number; violations: FarmWriteViolation[] } {
  const files = walkProductionFarmFiles(repoRoot)
  const violations: FarmWriteViolation[] = []
  const usedOwners = new Set<string>()
  for (const file of files) {
    const relative = path.relative(repoRoot, file).split(path.sep).join('/')
    for (const finding of collectFarmWrites(parseSource(file))) {
      const owner = `${relative}#${finding.owner}`
      if (FARM_WRITE_OWNERS.has(owner)) usedOwners.add(owner)
      else violations.push({ file, line: finding.line, message: `farm layout write must use commitFarmOperation: ${finding.text}` })
    }
  }
  for (const [owner] of FARM_WRITE_OWNERS) {
    if (!usedOwners.has(owner)) violations.push({ file: owner, message: 'stale farm-write owner exception' })
  }
  // A new dependency of authoritative used/placement geometry must join the same
  // receipt/write contract, rather than silently remaining outside this scan.
  for (const relative of ['shared/domain/farmyard-usage-core.ts', 'shared/domain/farmyard-geometry.ts', 'shared/domain/farmyard-space-states.ts']) {
    const file = path.join(repoRoot, relative)
    const source = parseSource(file)
    const visit = (node: ts.Node): void => {
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'player'
        && node.name.text !== 'id' && !FARM_LAYOUT_PROPERTIES.has(node.name.text)) {
        violations.push({ file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          message: `authoritative geometry reads ${node.name.text}, missing from FARM_LAYOUT_KEYS and the farm write boundary` })
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return { filesChecked: files.length, violations }
}
