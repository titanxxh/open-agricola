import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir, readFile, writeFile, stat, rm, lstat } from 'node:fs/promises'
import { join } from 'node:path'

const stemPattern = /^(daily|pre|manual)-[a-zA-Z0-9._-]+$/
const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS ?? 30)
if (!Number.isSafeInteger(retentionDays) || retentionDays < 1 || retentionDays > 30) throw new Error('Invalid backup retention age')
const maxAge = retentionDays * 24 * 60 * 60 * 1000
const digest = async path => {
  const hash = createHash('sha256')
  for await (const bytes of createReadStream(path)) hash.update(bytes)
  return { sha256: hash.digest('hex'), size: (await stat(path)).size }
}
const removeSet = async (root, stem) => {
  for (const name of [`${stem}.tgz`, `${stem}.manifest.json`, `env-${stem}`]) await rm(join(root, name), { force: true })
}

async function pruneRestore(root, name) {
  const id = name.slice('restore-'.length), marker = join(root, `${name}.retention.json`)
  let createdAt = null
  try {
    if (!(await lstat(marker)).isFile()) throw new Error('Invalid restore retention proof')
    const value = JSON.parse(await readFile(marker, 'utf8'))
    if (typeof value.targetFingerprint === 'string' && /^[a-f0-9]{64}$/.test(value.targetFingerprint)
      && value.targetFingerprint !== process.env.BACKUP_TARGET_FINGERPRINT) return
    if (value.formatVersion !== 1 || value.operationId !== id || value.targetFingerprint !== process.env.BACKUP_TARGET_FINGERPRINT
      || !/^[a-f0-9-]{36}$/.test(value.dataGeneration) || !/^[a-f0-9]{64}$/.test(value.archiveSha256)
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)) || Date.parse(value.createdAt) > Date.now()) throw new Error('Invalid restore retention proof')
    createdAt = Date.parse(value.createdAt)
  } catch (error) {
    if (error.code && error.code !== 'ENOENT') throw error
    // Unproven partial caches are regenerable from a still-valid sealed pair.
  }
  if (createdAt !== null && Date.now() - createdAt <= maxAge) return
  await rm(join(root, name), { recursive: true, force: true })
  await rm(marker, { force: true })
}

async function completeSets(root) {
  const sets = []
  for (const name of await readdir(root)) {
    if (!name.endsWith('.manifest.json')) continue
    const stem = name.slice(0, -'.manifest.json'.length)
    if (!stemPattern.test(stem)) continue
    const archivePath = join(root, `${stem}.tgz`)
    let archiveStat
    try { archiveStat = await stat(archivePath) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
    if (Date.now() - archiveStat.mtimeMs > maxAge) continue
    const report = JSON.parse(await readFile(join(root, name), 'utf8'))
    const archive = await digest(archivePath)
    const configuration = await digest(join(root, `env-${stem}`))
    if (report.formatVersion !== 2 || report.backupStem !== stem || !report.validatedAt
      || report.archiveSha256 !== archive.sha256 || report.archiveSizeBytes !== archive.size
      || (report.configurationSha256 !== undefined && (report.configurationSha256 !== configuration.sha256
        || report.configurationSizeBytes !== configuration.size))) throw new Error(`Invalid committed backup: ${stem}`)
    sets.push({ stem, modified: archiveStat.mtimeMs, files: [
      { name: `${stem}.tgz`, ...archive }, { name: `env-${stem}`, ...configuration }, { name, ...await digest(join(root, name)) },
    ] })
  }
  return sets
}

async function main([command, root, first, second]) {
  if (!root) throw new Error('Usage: backup-files.mjs seal|list|prune <directory> <arguments>')
  if (command === 'seal') {
    if (!stemPattern.test(first ?? '')) throw new Error('Invalid backup name')
    const report = JSON.parse(await readFile(join(root, 'report.json'), 'utf8'))
    if (report.formatVersion !== 2 || !report.validatedAt) throw new Error('Backup has no successful restore validation')
    const archive = await digest(join(root, 'archive.tgz')), configuration = await digest(join(root, 'env'))
    Object.assign(report, { backupStem: first, environment: process.env.BACKUP_ENVIRONMENT ?? 'stable', retentionDays,
      ...(process.env.BACKUP_DATA_GENERATION ? { dataGeneration: process.env.BACKUP_DATA_GENERATION, targetFingerprint: process.env.BACKUP_TARGET_FINGERPRINT } : {}),
      archiveSha256: archive.sha256, archiveSizeBytes: archive.size,
      configurationSha256: configuration.sha256, configurationSizeBytes: configuration.size })
    await writeFile(join(root, 'manifest.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    return
  }
  if (command === 'list') {
    if (!first || !second) throw new Error('list requires file-list and checksum-list paths')
    const files = (await completeSets(root)).flatMap(set => set.files)
    await writeFile(first, files.map(file => file.name + '\0').join(''), { mode: 0o600 })
    await writeFile(second, files.map(file => `${file.sha256}\t${file.size}\t${file.name}\n`).join(''), { mode: 0o600 })
    return
  }
  if (command === 'prune') {
    const daily = Number(first), pre = Number(second)
    if (!Number.isSafeInteger(daily) || daily < 1 || !Number.isSafeInteger(pre) || pre < 1) throw new Error('Invalid backup retention counts')
    for (const name of await readdir(root)) {
      const path = join(root, name)
      if (retentionDays === 7 && /^prerelease-[a-z0-9-]+$/.test(process.env.BACKUP_ENVIRONMENT ?? '')
        && /^[a-f0-9]{64}$/.test(process.env.BACKUP_TARGET_FINGERPRINT ?? '')
        && /^restore-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}(\.retention\.json)?$/.test(name)) {
        await pruneRestore(root, name.replace(/\.retention\.json$/, ''))
        continue
      }
      let info
      try { info = await stat(path) } catch (error) { if (error.code === 'ENOENT') continue; throw error }
      if (Date.now() - info.mtimeMs <= maxAge) continue
      if (name.endsWith('.tgz') && stemPattern.test(name.slice(0, -4))) await removeSet(root, name.slice(0, -4))
      else if (name.startsWith('env-') && stemPattern.test(name.slice(4))) await removeSet(root, name.slice(4))
      else if (name.endsWith('.manifest.json') && stemPattern.test(name.slice(0, -'.manifest.json'.length))) await removeSet(root, name.slice(0, -'.manifest.json'.length))
      else if (info.isDirectory() && /^\.(pending|incoming|capture)-[a-zA-Z0-9._-]+$/.test(name)) await rm(path, { recursive: true, force: true })
    }
    const sets = (await completeSets(root)).sort((a, b) => b.modified - a.modified)
    for (const [prefix, count] of [['daily-', daily], ['pre-', pre]]) {
      for (const set of sets.filter(set => set.stem.startsWith(prefix)).slice(count)) await removeSet(root, set.stem)
    }
    return
  }
  throw new Error('Unknown backup file operation')
}

try { await main(process.argv.slice(2)) }
catch (error) { console.error(error instanceof Error ? error.message : 'Backup file operation failed'); process.exitCode = 1 }
