'use client'

import { useCallback, useEffect, useRef } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold,
  Italic,
  Strikethrough,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Heading2,
  Link2,
  ImagePlus,
  Undo2,
  Redo2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type TaskRichEditorProps = {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  uploadImage: (file: File) => Promise<string | null>
  disabled?: boolean
  className?: string
}

export function TaskRichEditor({
  content,
  onChange,
  placeholder = 'Describe the task… Paste images from clipboard.',
  uploadImage,
  disabled,
  className,
}: TaskRichEditorProps) {
  const uploadImageRef = useRef(uploadImage)
  const editorRef = useRef<Editor | null>(null)
  uploadImageRef.current = uploadImage

  const handlePasteImage = useCallback(async (file: File) => {
    const url = await uploadImageRef.current(file)
    const ed = editorRef.current
    if (url && ed) {
      ed.chain().focus().setImage({ src: url }).run()
    }
  }, [])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Image.configure({ inline: false, allowBase64: false, HTMLAttributes: { class: 'rounded-md max-w-full h-auto' } }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        HTMLAttributes: { class: 'text-primary underline', rel: 'noopener noreferrer', target: '_blank' },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: content || '',
    editable: !disabled,
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
    onCreate: ({ editor: ed }) => {
      editorRef.current = ed
    },
    onDestroy: () => {
      editorRef.current = null
    },
    editorProps: {
      attributes: {
        class: cn(
          'max-w-none min-h-[188px] px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm leading-relaxed',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          '[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-md',
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5',
          '[&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold',
        ),
      },
      handlePaste(_view, event) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (file) void handlePasteImage(file)
            return true
          }
        }
        return false
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [editor, disabled])

  const fileInputRef = useRef<HTMLInputElement>(null)

  const insertImageFromPicker = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !f.type.startsWith('image/')) return
    await handlePasteImage(f)
  }

  if (!editor) {
    return <div className="min-h-[188px] rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 animate-pulse" />
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex flex-wrap items-center gap-1 rounded-md border border-input bg-muted/30 p-1">
        <Button
          type="button"
          variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('underline') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('strike') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          type="button"
          variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => {
            const prev = editor.getAttributes('link').href as string | undefined
            const url = window.prompt('Link URL', prev || 'https://')
            if (url === null) return
            const trimmed = url.trim()
            if (trimmed === '') {
              editor.chain().focus().unsetLink().run()
              return
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run()
          }}
        >
          <Link2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImagePlus className="h-4 w-4" />
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={insertImageFromPicker}
        />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled || !editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={disabled || !editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <Redo2 className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
