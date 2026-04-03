type BridgeRequest = {
  url: string
  path: string
  body: unknown
}

const readStdin = async () => {
  let raw = ''
  for await (const chunk of process.stdin) {
    raw += chunk.toString()
  }
  return raw
}

const main = async () => {
  const raw = await readStdin()
  const request = JSON.parse(raw) as BridgeRequest
  const response = await fetch(new URL(request.path, request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request.body),
  })
  const text = await response.text()
  process.stdout.write(text)
}

void main().catch((error) => {
  process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exit(1)
})
