const original = globalThis.fetch
const fixes = [
  [1534, 'a94787d1e61004fc863aaf3dbf2171bda834a716'],
  [1484, 'db196efe21951429230301454cee7eef35a8d249'],
  [1515, 'd1570f66cd2dac96c0f66d008684cfff12f168f5'],
  [1592, 'f9edb37342f4f9deeb2ccd344d5c0b9ab9a3cebf'],
]
const repository = 'titanxxh/open-agricola'
globalThis.fetch = async (resource, init) => {
  const url = new URL(String(resource))
  if (url.origin !== 'https://api.github.com' || !url.pathname.startsWith(`/repos/${repository}/`)) return original(resource, init)
  if (!/^test_[a-f0-9]{32}$/.test(process.env.DATABASE_SCHEMA ?? '')) throw new Error('Historical GitHub fixture requires an isolated database')
  const path = url.pathname
  if (path.endsWith('/issues/1465')) return Response.json({ number: 1465, html_url: `https://github.com/${repository}/issues/1465`, body: process.env.HISTORICAL_TEST_ISSUE_BODY })
  const entry = fixes.find(([number, sha]) => path.endsWith(`/pulls/${number}`) || path.includes(`/commits/${sha}`))
  if (!entry) throw new Error(`Unexpected historical fixture read ${path}`)
  const [number, sha] = entry
  const pull = { number, merged: true, merged_at: '2026-11-01T00:00:00Z', merge_commit_sha: sha, html_url: `https://github.com/${repository}/pull/${number}`, base: { ref: 'main', repo: { full_name: repository } } }
  return Response.json(path.endsWith('/pulls') ? [pull] : path.includes('/commits/') ? { sha } : pull)
}
