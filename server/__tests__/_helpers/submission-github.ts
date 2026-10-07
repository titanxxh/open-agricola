import { createHash } from 'node:crypto'

const hash = (value: string) => createHash('sha1').update(value).digest('hex')
export const submissionUpstream = {
  'shared/cards/register-all.ts': "// GENERATED\nimport './catalog'\n\nexport const ALL_CARD_IMPLS: Readonly<Record<string, CardImpl>> = {\n}\n\nexport type AllCardImpls = typeof ALL_CARD_IMPLS\n",
  'shared/cards/catalog.generated.ts': '// generated\nexport const catalogCardDefinitions = [\n]\n',
  'docs/community_cards.md': '# Community cards\n\n<!-- community-card-entries:begin -->\n| ID | Name | Type | Author | PR |\n<!-- community-card-entries:end -->\n',
}

/** Stateful fake of the external GitHub protocol. Application and database remain real. */
export class SubmissionGitHub {
  readonly refs = new Map([['main', 'a'.repeat(40)]])
  readonly blobs = new Map<string, string>()
  readonly trees = new Map<string, Record<string, string>>()
  readonly commits = new Map<string, Record<string, string>>([['a'.repeat(40), { ...submissionUpstream }]])
  readonly prs: Array<{ number: number; body: string; branch: string; base: string; draft: boolean; state: string; merged: boolean }> = []
  readonly writes: string[] = []
  loseCreateResponse = false
  loseRefResponse = false
  lagHeadAfterFinalPublish = false
  laggedHead: string | undefined
  beforeRefUpdate?: () => void | Promise<void>
  afterCreate?: () => void | Promise<void>

  changeHead(changes: Record<string,string>) {
    const branch = this.prs[0]!.branch
    const files = {...this.commits.get(this.refs.get(branch)!),...changes}
    const sha = hash(JSON.stringify(files))
    this.commits.set(sha,files)
    this.refs.set(branch,sha)
    return sha
  }

  pr(number: number) {
    const pr = this.prs.find(p => p.number === number)!
    return { ...pr, html_url: `https://github.com/titanxxh/open-agricola/pull/${number}`,
      head: { ref: pr.branch, sha: this.laggedHead ?? this.refs.get(pr.branch), repo: { full_name: 'titanxxh/open-agricola' } },
      base: { ref: pr.base }, merged_at: pr.merged ? '2026-10-07T00:00:00Z' : null }
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    const path = decodeURIComponent(url.pathname)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    const json = Response.json
    if (method !== 'GET') this.writes.push(`${method} ${path}`)
    if (path.endsWith('/access_tokens')) return json({ token: `${body.permissions.contents}-token`, expires_at: new Date(Date.now() + 3600_000).toISOString() })
    if (path === '/repos/titanxxh/open-agricola') return json({ node_id: 'repo', id: 1 })
    if (path.endsWith('/graphql')) {
      if (body.query.includes('updateRefs')) {
        await this.beforeRefUpdate?.()
        const update = body.variables.input.refUpdates[0]
        const branch = update.name.replace('refs/heads/', '')
        if ((this.refs.get(branch) ?? '0'.repeat(40)) !== update.beforeOid) return json({ errors: [{ message: 'Reference changed' }] })
        if (this.lagHeadAfterFinalPublish && update.beforeOid !== '0'.repeat(40)) this.laggedHead = update.beforeOid
        this.refs.set(branch, update.afterOid)
        if (this.loseRefResponse) { this.loseRefResponse = false; throw new TypeError('Ref response lost') }
        return json({ data: { updateRefs: { clientMutationId: null } } })
      }
      const pr = this.pr(body.variables.number)
      return json({ data: { repository: { pullRequest: {
        authorAssociation: 'NONE', reviewDecision: null, headRefOid: pr.head.sha, baseRefName: pr.base.ref,
        state: pr.state.toUpperCase(), isDraft: pr.draft, latestOpinionatedReviews: { nodes: [], pageInfo: { hasNextPage: false } },
      } } } })
    }
    if (path.includes('/git/ref/heads/')) {
      const sha = this.refs.get(path.split('/git/ref/heads/')[1]!)
      return sha ? json({ object: { sha } }) : json({}, { status: 404 })
    }
    if (path.includes('/contents/')) {
      const ref = url.searchParams.get('ref') ?? 'main'
      const files = this.commits.get(this.refs.get(ref) ?? ref)
      const content = files?.[path.split('/contents/')[1]!]
      return content === undefined ? json({}, { status: 404 })
        : json({ content: Buffer.from(content).toString('base64'), encoding: 'base64', sha: hash(`blob ${Buffer.byteLength(content)}\0${content}`) })
    }
    if (path.includes('/git/trees/') && method === 'GET') {
      const files = this.commits.get(path.split('/git/trees/')[1]!)!
      return json({truncated:false,tree:Object.keys(files).map(path => ({path,mode:'100644',type:'blob'}))})
    }
    const fileMatch = /\/pulls\/(\d+)\/files$/.exec(path)
    if (fileMatch) {
      const pr = this.pr(Number(fileMatch[1]))
      const files = this.commits.get(pr.head.sha!)!
      const main = this.commits.get('a'.repeat(40))!
      return json(Object.entries(files).filter(([path,content]) => content !== main[path]).map(([path,content]) => {
        const sha = hash(`blob ${Buffer.byteLength(content)}\0${content}`)
        this.blobs.set(sha,content)
        return {filename:path,sha,status:main[path] === undefined ? 'added':'modified'}
      }))
    }
    if (path.endsWith('/git/blobs')) {
      const content = body.encoding === 'base64' ? Buffer.from(body.content, 'base64').toString() : body.content
      const sha = hash(`blob ${Buffer.byteLength(content)}\0${content}`)
      this.blobs.set(sha, content)
      return json({ sha })
    }
    if (path.includes('/git/commits/') && method === 'GET') {
      const commit = path.split('/git/commits/')[1]!
      this.trees.set(`tree-${commit}`,this.commits.get(commit)!)
      return json({tree:{sha:`tree-${commit}`}})
    }
    if (path.endsWith('/git/trees') && method === 'POST') {
      const files = { ...this.trees.get(body.base_tree) }
      for (const file of body.tree) {
        if (file.sha === null) delete files[file.path]
        else files[file.path] = this.blobs.get(file.sha)!
      }
      const sha = hash(JSON.stringify(files))
      this.trees.set(sha, files)
      return json({ sha })
    }
    if (path.endsWith('/git/commits')) {
      const sha = hash(JSON.stringify(body))
      this.commits.set(sha, this.trees.get(body.tree)!)
      return json({ sha })
    }
    if (path.endsWith('/pulls') && method === 'POST') {
      const branch = body.head.split(':').at(-1)
      const number = this.prs.length + 1
      this.prs.push({ number, body: body.body, branch, base: body.base, draft: false, state: 'open', merged: false })
      await this.afterCreate?.()
      if (this.loseCreateResponse) { this.loseCreateResponse = false; throw new TypeError('Response lost') }
      return json(this.pr(number), { status: 201 })
    }
    if (path.endsWith('/pulls')) {
      const branch = url.searchParams.get('head')?.split(':').at(-1)
      return json(this.prs.filter(pr => pr.branch === branch).map(pr => this.pr(pr.number)))
    }
    const match = /\/pulls\/(\d+)$/.exec(path)
    if (match) return json(this.pr(Number(match[1])))
    throw new Error(`Unimplemented fake GitHub request: ${method} ${path}`)
  }
}
