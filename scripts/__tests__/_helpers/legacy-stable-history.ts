import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const legacyStableHistory = {
  cutoff: '53b8a0ccf5649ce3bb7084303f0677e46c1d20e7',
  older: 'ac1244f0494020f7c52c08635a400162567d79ef',
  newer: '3dab161ce0e48a82e2ee9886b1a1ecf8d3a8b82b',
}

/** Original public commit/tree/blob objects, with an explicit three-parent shallow boundary. */
export function createLegacyStableOrigin(directory: string): string {
  const path = resolve(import.meta.dirname, '../../../tests/fixtures/git/legacy-stable-history.pack')
  const metadata = lstatSync(path)
  if (!metadata.isFile() || metadata.nlink !== 1 || metadata.size !== 24_725_340) throw new Error('Invalid fixed legacy history fixture')
  const pack = readFileSync(path)
  if (createHash('sha256').update(pack).digest('hex') !== '24dcd90b34537edf80a92c7fd92dc093b92050394e000a5ce42633c856d401b4') {
    throw new Error('Legacy public history pack changed')
  }
  execFileSync('git', ['init', '--bare', '--initial-branch=main', directory], { stdio: 'ignore' })
  writeFileSync(join(directory, 'shallow'), legacyStableHistory.older + '\n')
  execFileSync('git', ['--git-dir', directory, 'index-pack', '--stdin'], { input: pack, stdio: ['pipe', 'ignore', 'pipe'] })
  execFileSync('git', ['--git-dir', directory, 'update-ref', 'refs/heads/main', legacyStableHistory.newer])
  const older = execFileSync('git', ['--git-dir', directory, 'rev-parse', `${legacyStableHistory.cutoff}~3`], { encoding: 'utf8' }).trim()
  if (older !== legacyStableHistory.older) throw new Error('Legacy fixture lost the original cutoff ancestry')
  return directory
}
