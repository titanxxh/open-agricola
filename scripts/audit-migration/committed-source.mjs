import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const fail = message => { throw new Error(message) }
const git = (worktree, ...args) => execFileSync('git', args, { cwd: worktree, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })

/** Bind tested working-tree bytes and executable/symlink modes to the exact commit. */
export function assertCommittedSource({ worktree, head }) {
  if (typeof worktree !== 'string' || !path.isAbsolute(worktree) || typeof head !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(head)) fail('committed source requires an absolute worktree and exact HEAD')
  const [current, tree] = git(worktree, 'rev-parse', 'HEAD', 'HEAD^{tree}').trim().split('\n')
  if (current !== head) fail('committed source HEAD differs from the frozen head')
  const algorithm = head.length === 64 ? 'sha256' : 'sha1'
  const entries = git(worktree, 'ls-tree', '-r', '-t', '-z', '--full-tree', head).split('\0').filter(Boolean)
  for (const entry of entries) {
    const separator = entry.indexOf('\t')
    const [mode, type, object] = entry.slice(0, separator).split(' ')
    const file = entry.slice(separator + 1)
    if (separator < 0 || !file || path.isAbsolute(file) || file.split('/').some(part => part === '..' || part === '.')) fail('committed source contains an invalid tree entry')
    const target = path.join(worktree, file)
    let stat
    try { stat = fs.lstatSync(target) } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') fail(`committed source ${file}: tracked entry is missing`)
      throw error
    }
    if (mode === '040000' && type === 'tree') {
      if (!stat.isDirectory() || stat.isSymbolicLink()) fail(`committed source ${file}: directory mode differs from HEAD`)
      continue
    }
    let bytes
    if (mode === '120000' && type === 'blob') {
      if (!stat.isSymbolicLink()) fail(`committed source ${file}: symlink mode differs from HEAD`)
      bytes = fs.readlinkSync(target, { encoding: 'buffer' })
    } else if ((mode === '100644' || mode === '100755') && type === 'blob') {
      if (!stat.isFile() || stat.isSymbolicLink()) fail(`committed source ${file}: regular-file mode differs from HEAD`)
      if ((stat.mode & 0o100) !== (mode === '100755' ? 0o100 : 0)) fail(`committed source ${file}: executable mode differs from HEAD`)
      bytes = fs.readFileSync(target)
    } else fail(`committed source ${file}: unsupported Git mode ${mode}`)
    const actual = crypto.createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    if (actual !== object) fail(`committed source ${file}: bytes differ from HEAD`)
  }
  if (git(worktree, 'status', '--porcelain', '--untracked-files=all').trim()) fail('committed source has staged or untracked changes')
  return { head: current, tree }
}
