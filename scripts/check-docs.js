import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const docPath = resolve(process.cwd(), 'docs/IMPLEMENTATION_STATUS.md')
const content = readFileSync(docPath, 'utf8')

const requiredSections = [
  '## 1. 当前实现情况',
  '## 2. 缺失部分总结',
  '## 3. 文档维护机制',
  '## 4. 排除项',
]

const missing = requiredSections.filter((section) => !content.includes(section))
if (missing.length > 0) {
  console.error(`文档缺少必要小节: ${missing.join(', ')}`)
  process.exit(1)
}

const utPath = resolve(process.cwd(), 'docs/ut.md')
const utContent = readFileSync(utPath, 'utf8')
if (!utContent.includes('# UT 说明与维护清单')) {
  console.error('ut.md 缺少标题或格式不正确')
  process.exit(1)
}
