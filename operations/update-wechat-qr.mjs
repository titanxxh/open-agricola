import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { loadImage } from 'canvas'

const [destination, imagePath, directory] = process.argv.slice(2)
if (!destination || !imagePath || (destination === '--local' && !directory) || process.argv.length > 5) {
  throw new Error('Usage: deploy-operations.sh --wechat-qr <ssh-host> <image.png|image.jpg> [game-dir], or --wechat-qr --local <image> <community-dir>')
}

const source = await open(imagePath, 'r')
let image
try {
  const stat = await source.stat()
  if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('Expected an image file no larger than 5 MiB')
  image = await source.readFile()
} finally { await source.close() }
const png = image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
const jpeg = image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff
if (!png && !jpeg) throw new Error('Use a PNG or JPEG image exported from WeChat')
const decoded = await loadImage(image)
if (decoded.width < 200 || decoded.height < 200 || decoded.width > 4096 || decoded.height > 4096) {
  throw new Error('Image dimensions must be between 200 and 4096 pixels on each side')
}
const digest = createHash('sha256').update(image).digest('hex')

if (destination === '--local') {
  const root = resolve(directory)
  await mkdir(root, { recursive: true, mode: 0o755 })
  const temporary = join(root, `.wechat-qr.${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, image, { flag: 'wx', mode: 0o644 })
    await rename(temporary, join(root, 'wechat-qr'))
  } finally { await rm(temporary, { force: true }) }
} else {
  const host = destination.includes('@') ? destination : `ubuntu@${destination}`
  if (host.startsWith('-')) throw new Error('Invalid SSH host')
  const quote = value => `'${value.replaceAll("'", "'\\''")}'`
  const root = `${directory ?? '/home/ubuntu/open-agricola'}/data/community`
  // The image travels over stdin. Only a verified complete temporary file replaces the live file.
  execFileSync('ssh', [host, `bash -c ${quote(`set -euo pipefail
umask 022
directory=${quote(root)}
mkdir -p -m 0755 -- "$directory"
exec 9>"$directory/.wechat-qr.lock"
flock -w 30 9
temporary=$(mktemp "$directory/.wechat-qr.XXXXXX")
trap 'rm -f -- "$temporary"' EXIT
cat > "$temporary"
actual=$(sha256sum -- "$temporary")
[[ "\${actual%% *}" == ${quote(digest)} ]] || { echo 'Image transfer checksum mismatch' >&2; exit 1; }
chmod 0644 "$temporary"
mv -f -- "$temporary" "$directory/wechat-qr"
`)}`], { input: image, stdio: ['pipe', 'inherit', 'inherit'] })
}
console.log(JSON.stringify({ wechatQrSha256: digest, width: decoded.width, height: decoded.height }))
