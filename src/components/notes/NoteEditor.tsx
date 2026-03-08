import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import {
  Bold,
  Code2,
  Command,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  TextCursorInput,
  Undo2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

type MarkdownStorage = {
  markdown: {
    getMarkdown: () => string
  }
}

type NoteEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

type EditorCommand = {
  id: string
  label: string
  description: string
  keywords: string[]
  icon: React.ReactNode
  run: (editor: Editor) => void
}

function createEditorCommands(): EditorCommand[] {
  return [
    {
      id: 'paragraph',
      label: 'Text',
      description: 'Reset the current block to regular body text.',
      keywords: ['paragraph', 'text', 'body', 'normal'],
      icon: <TextCursorInput className="h-4 w-4" />,
      run: (editor) => {
        editor.chain().focus().clearNodes().unsetAllMarks().run()
      },
    },
    {
      id: 'heading-1',
      label: 'Heading 1',
      description: 'Create a top-level section heading.',
      keywords: ['heading', 'h1', 'title'],
      icon: <Heading1 className="h-4 w-4" />,
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 1 }).run()
      },
    },
    {
      id: 'heading-2',
      label: 'Heading 2',
      description: 'Create a mid-level section heading.',
      keywords: ['heading', 'h2', 'section'],
      icon: <Heading2 className="h-4 w-4" />,
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 2 }).run()
      },
    },
    {
      id: 'heading-3',
      label: 'Heading 3',
      description: 'Create a lower-level section heading.',
      keywords: ['heading', 'h3', 'subsection'],
      icon: <Heading3 className="h-4 w-4" />,
      run: (editor) => {
        editor.chain().focus().toggleHeading({ level: 3 }).run()
      },
    },
    {
      id: 'bullet-list',
      label: 'Bullet list',
      description: 'Turn the current block into an unordered list.',
      keywords: ['list', 'bullets', 'unordered'],
      icon: <List className="h-4 w-4" />,
      run: (editor) => {
        editor.chain().focus().toggleBulletList().run()
      },
    },
    {
      id: 'ordered-list',
      label: 'Numbered list',
      description: 'Turn the current block into an ordered list.',
      keywords: ['list', 'ordered', 'numbered'],
      icon: <ListOrdered className="h-4 w-4" />,
      run: (editor) => {
        editor.chain().focus().toggleOrderedList().run()
      },
    },
    {
      id: 'blockquote',
      label: 'Quote',
      description: 'Format the current block as a blockquote.',
      keywords: ['quote', 'blockquote', 'callout'],
      icon: <Quote className="h-4 w-4" />,
      run: (editor) => {
        editor.chain().focus().toggleBlockquote().run()
      },
    },
    {
      id: 'code-block',
      label: 'Code block',
      description: 'Switch the current block into fenced code.',
      keywords: ['code', 'snippet', 'pre'],
      icon: <Code2 className="h-4 w-4" />,
      run: (editor) => {
        editor.chain().focus().toggleCodeBlock().run()
      },
    },
  ]
}

function shouldOpenSlashMenu(editor: Editor) {
  const { selection } = editor.state
  if (!selection.empty) {
    return false
  }

  return selection.$from.parent.textContent.trim().length === 0
}

export function NoteEditor({ value, onChange, placeholder, className }: NoteEditorProps) {
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const commandSearchRef = useRef<HTMLInputElement | null>(null)
  const editorCommands = useMemo(() => createEditorCommands(), [])

  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: [
        StarterKit.configure({
          link: false,
        }),
        Placeholder.configure({
          placeholder: placeholder ?? 'Start writing…',
        }),
        Markdown.configure({
          html: false,
          transformCopiedText: true,
        }),
      ],
      content: value,
      editorProps: {
        attributes: {
          class: 'note-editor prose-reset min-h-[520px] focus:outline-none',
        },
      },
      onUpdate: ({ editor: currentEditor }) => {
        const nextMarkdown = ((currentEditor.storage as unknown) as MarkdownStorage).markdown.getMarkdown()
        onChange(nextMarkdown)
      },
    },
    []
  )

  const filteredCommands = useMemo(() => {
    const normalizedQuery = commandQuery.trim().toLowerCase()
    if (!normalizedQuery) {
      return editorCommands
    }

    return editorCommands.filter((command) => {
      const searchText = [command.label, command.description, ...command.keywords].join(' ').toLowerCase()
      return searchText.includes(normalizedQuery)
    })
  }, [commandQuery, editorCommands])

  const openCommandMenu = () => {
    setCommandQuery('')
    setSelectedCommandIndex(0)
    setIsCommandMenuOpen(true)
  }

  const closeCommandMenu = () => {
    setIsCommandMenuOpen(false)
    setCommandQuery('')
    setSelectedCommandIndex(0)
  }

  const runCommand = (command: EditorCommand) => {
    if (!editor) {
      return
    }

    command.run(editor)
    closeCommandMenu()
    editor.commands.focus()
  }

  useEffect(() => {
    if (!editor) {
      return
    }

    const currentMarkdown = ((editor.storage as unknown) as MarkdownStorage).markdown.getMarkdown()
    if (currentMarkdown !== value) {
      editor.commands.setContent(value)
    }
  }, [editor, value])

  useEffect(() => {
    setSelectedCommandIndex(0)
  }, [commandQuery, isCommandMenuOpen])

  useEffect(() => {
    if (!isCommandMenuOpen) {
      return
    }

    commandSearchRef.current?.focus()
  }, [isCommandMenuOpen])

  useEffect(() => {
    if (!isCommandMenuOpen) {
      return
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        closeCommandMenu()
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isCommandMenuOpen])

  if (!editor) {
    return <div className={cn('h-full min-h-[520px] animate-pulse border border-border bg-panel', className)} />
  }

  return (
    <div
      ref={containerRef}
      className={cn('relative flex h-full min-h-[520px] flex-col border border-border bg-panel', className)}
      onKeyDownCapture={(event) => {
        if (!editor) {
          return
        }

        const isShortcut = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'

        if (isShortcut) {
          event.preventDefault()
          if (isCommandMenuOpen) {
            closeCommandMenu()
            editor.commands.focus()
          } else {
            openCommandMenu()
          }
          return
        }

        if (!isCommandMenuOpen && event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey && shouldOpenSlashMenu(editor)) {
          event.preventDefault()
          openCommandMenu()
          return
        }

        if (!isCommandMenuOpen) {
          return
        }

        if (event.key === 'Escape') {
          event.preventDefault()
          closeCommandMenu()
          editor.commands.focus()
          return
        }

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSelectedCommandIndex((current) => {
            if (!filteredCommands.length) {
              return 0
            }
            return (current + 1) % filteredCommands.length
          })
          return
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSelectedCommandIndex((current) => {
            if (!filteredCommands.length) {
              return 0
            }
            return current === 0 ? filteredCommands.length - 1 : current - 1
          })
          return
        }

        if (event.key === 'Enter' && filteredCommands.length) {
          event.preventDefault()
          const selectedCommand = filteredCommands[selectedCommandIndex] ?? filteredCommands[0]
          if (selectedCommand) {
            runCommand(selectedCommand)
          }
        }
      }}
    >
      <div className="flex flex-wrap gap-px border-b border-border bg-border p-px">
        <EditorButton label="Command menu" onClick={openCommandMenu} active={isCommandMenuOpen}>
          <Command className="h-4 w-4" />
        </EditorButton>
        <EditorButton label="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 className="h-4 w-4" />
        </EditorButton>
        <EditorButton label="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 className="h-4 w-4" />
        </EditorButton>
        <EditorButton
          label="Bold"
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive('bold')}
        >
          <Bold className="h-4 w-4" />
        </EditorButton>
        <EditorButton
          label="Italic"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive('italic')}
        >
          <Italic className="h-4 w-4" />
        </EditorButton>
        <EditorButton
          label="Heading 1"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          active={editor.isActive('heading', { level: 1 })}
        >
          <Heading1 className="h-4 w-4" />
        </EditorButton>
        <EditorButton
          label="Heading 2"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive('heading', { level: 2 })}
        >
          <Heading2 className="h-4 w-4" />
        </EditorButton>
        <EditorButton
          label="Heading 3"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive('heading', { level: 3 })}
        >
          <Heading3 className="h-4 w-4" />
        </EditorButton>
        <EditorButton
          label="Bullet list"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive('bulletList')}
        >
          <List className="h-4 w-4" />
        </EditorButton>
        <EditorButton
          label="Ordered list"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive('orderedList')}
        >
          <ListOrdered className="h-4 w-4" />
        </EditorButton>
        <EditorButton
          label="Quote"
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive('blockquote')}
        >
          <Quote className="h-4 w-4" />
        </EditorButton>
        <EditorButton
          label="Code block"
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          active={editor.isActive('codeBlock')}
        >
          <Code2 className="h-4 w-4" />
        </EditorButton>
      </div>

      {isCommandMenuOpen ? (
        <div className="border-b border-border bg-background/90 px-4 py-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Quick commands</p>
              <p className="mt-1 text-sm text-foreground">Type on an empty line with <span className="font-mono text-xs">/</span> or press <span className="font-mono text-xs">Cmd/Ctrl+K</span>.</p>
            </div>
          </div>
          <input
            ref={commandSearchRef}
            value={commandQuery}
            onChange={(event) => setCommandQuery(event.target.value)}
            placeholder="Filter commands"
            className="w-full border border-border bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring"
          />
          <div className="mt-3 grid gap-2">
            {filteredCommands.length ? (
              filteredCommands.map((command, index) => (
                <button
                  key={command.id}
                  type="button"
                  onClick={() => runCommand(command)}
                  className={cn(
                    'flex items-start gap-3 border border-border bg-panel px-3 py-3 text-left transition hover:bg-panel-muted',
                    selectedCommandIndex === index && 'bg-panel-muted'
                  )}
                >
                  <span className="mt-0.5 text-muted-foreground">{command.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{command.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{command.description}</span>
                  </span>
                </button>
              ))
            ) : (
              <div className="border border-dashed border-border bg-panel px-4 py-6 text-sm text-muted-foreground">
                No commands match that filter.
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto px-4 py-4">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

function EditorButton({
  children,
  label,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center bg-panel text-muted-foreground transition hover:bg-panel-muted hover:text-foreground disabled:opacity-40',
        active && 'bg-background text-foreground'
      )}
    >
      {children}
    </button>
  )
}