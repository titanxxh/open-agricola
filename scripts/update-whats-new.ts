import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parseWhatsNew, WHATS_NEW_FILENAME, WHATS_NEW_MAX_BYTES, type WhatsNew } from '../shared/contract/whats-new.ts'

const usage = 'Usage: deploy-operations.sh --whats-new <ssh-host> <whats-new.json> [game-dir], or --whats-new --local <whats-new.json> <community-dir>'
const [destination, notesPath, directory] = process.argv.slice(2)
if (!destination || !notesPath || (destination === '--local' && !directory) || process.argv.length > 5) throw new Error(usage)

const source = await open(notesPath, 'r')
let bytes: Buffer
try {
  const stat = await source.stat()
  if (!stat.isFile() || stat.size > WHATS_NEW_MAX_BYTES) throw new Error(`Expected a JSON file no larger than ${WHATS_NEW_MAX_BYTES / 1024} KiB`)
  bytes = await source.readFile()
} finally { await source.close() }
let notes: WhatsNew
try {
  notes = parseWhatsNew(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)))
} catch (error) {
  console.error(`Invalid What's New file: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
const digest = createHash('sha256').update(bytes).digest('hex')

if (destination === '--local') {
  const root = resolve(directory)
  await mkdir(root, { recursive: true, mode: 0o755 })
  const temporary = join(root, `.${WHATS_NEW_FILENAME}.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o644 })
    await rename(temporary, join(root, WHATS_NEW_FILENAME))
  } finally { await rm(temporary, { force: true }) }
} else {
  const host = destination.includes('@') ? destination : `ubuntu@${destination}`
  if (host.startsWith('-')) throw new Error('Invalid SSH host')
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`
  const root = `${directory ?? '/home/ubuntu/open-agricola'}/data/community`
  // The file travels over stdin. Only a verified complete temporary file replaces the live notes.
  execFileSync('ssh', [host, `bash -c ${quote(`set -euo pipefail
umask 022
directory=${quote(root)}
mkdir -p -m 0755 -- "$directory"
exec 9>"$directory/.${WHATS_NEW_FILENAME}.lock"
flock -w 30 9
temporary=$(mktemp "$directory/.${WHATS_NEW_FILENAME}.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
cat > "$temporary"
actual=$(sha256sum -- "$temporary")
[[ "\${actual%% *}" == ${quote(digest)} ]] || { echo 'Release notes transfer checksum mismatch' >&2; exit 1; }
chmod 0644 "$temporary"
mv -f -- "$temporary" "$directory/${WHATS_NEW_FILENAME}"
`)}`], { input: bytes, stdio: ['pipe', 'inherit', 'inherit'] })
}
console.log(JSON.stringify({ whatsNewSha256: digest, releases: notes.releases.length, latest: notes.releases[0]?.version ?? null }))
