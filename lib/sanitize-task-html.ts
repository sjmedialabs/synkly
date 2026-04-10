import DOMPurify from 'isomorphic-dompurify'

/** Safe HTML for task descriptions (rich text + embedded images). */
export function sanitizeTaskDescriptionHtml(dirty: string | null | undefined): string {
  if (!dirty?.trim()) return ''
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'u',
      's',
      'b',
      'i',
      'h1',
      'h2',
      'h3',
      'ul',
      'ol',
      'li',
      'blockquote',
      'a',
      'img',
      'code',
      'pre',
      'span',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
    ADD_ATTR: ['target'],
    ALLOW_DATA_ATTR: false,
  })
}
