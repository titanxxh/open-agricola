import { useState } from 'react'

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code.trim()).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="ai-code-block">
      <div className="ai-code-header">
        {lang && <span className="ai-code-lang">{lang}</span>}
        <button type="button" className="ai-code-copy" onClick={handleCopy}>
          {copied ? '✓' : '复制'}
        </button>
      </div>
      <pre tabIndex={0}><code>{code}</code></pre>
    </div>
  )
}

export function MessageContent({ text }: { text: string }) {
  // Split on complete code blocks first
  const parts = text.split(/(```[\s\S]*?```)/g)

  // Check if there's an unclosed code block at the end (during streaming)
  const lastPart = parts[parts.length - 1] ?? ''
  const openMatch = lastPart.match(/^([\s\S]*?)(```(\w*)\n[\s\S]*)$/)

  const renderedParts: { type: 'text' | 'code'; content: string; lang?: string }[] = []

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i] ?? ''
    const codeMatch = part.match(/^```(\w*)\n?([\s\S]*?)```$/)
    if (codeMatch) {
      renderedParts.push({ type: 'code', lang: codeMatch[1] ?? '', content: codeMatch[2] ?? '' })
    } else {
      renderedParts.push({ type: 'text', content: part })
    }
  }

  if (openMatch) {
    // Text before the unclosed block
    if (openMatch[1]) renderedParts.push({ type: 'text', content: openMatch[1] })
    // Unclosed code block — render as code anyway
    const openLang = openMatch[3] ?? ''
    const openCode = (openMatch[2] ?? '').replace(/^```\w*\n?/, '')
    renderedParts.push({ type: 'code', lang: openLang, content: openCode })
  } else {
    const codeMatch = lastPart.match(/^```(\w*)\n?([\s\S]*?)```$/)
    if (codeMatch) {
      renderedParts.push({ type: 'code', lang: codeMatch[1] ?? '', content: codeMatch[2] ?? '' })
    } else if (lastPart) {
      renderedParts.push({ type: 'text', content: lastPart })
    }
  }

  return (
    <>
      {renderedParts.map((part, i) =>
        part.type === 'code'
          ? <CodeBlock key={i} lang={part.lang ?? ''} code={part.content} />
          : <span key={i}>{part.content}</span>
      )}
    </>
  )
}

