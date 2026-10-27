import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: true })

export function markdownHtml(value: string) {
  const rendered = marked.parse(value || '') as string
  return DOMPurify.sanitize(rendered, { USE_PROFILES: { html: true } })
}

export default function QuestionContent({ value, className = 'problem-content' }: { value: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: markdownHtml(value) }} />
}
