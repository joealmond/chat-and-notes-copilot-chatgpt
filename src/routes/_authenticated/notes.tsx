import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '@convex/_generated/api'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/cn'
import { MarkdownPreview } from '@/components/notes/MarkdownPreview'
import { NoteEditor } from '@/components/notes/NoteEditor'
import { collectAncestorIds, filterNotesForQuery, flattenVisibleNoteIds, getRecentNotes } from '@/components/notes/note-tree'
import { useConvexMutation } from '@/lib/patterns/useConvexMutation'
import { Archive, ArrowRightToLine, BookOpenText, ChevronDown, ChevronRight, Clock3, ExternalLink, Globe, GripVertical, Loader2, Plus, Search, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Id } from '@convex/_generated/dataModel'

type TreeNote = {
  _id: Id<'notes'>
  parentId?: Id<'notes'>
  sortOrder: number
  title: string
  slug: string
  excerpt?: string
  isPublished: boolean
  lastEditedAt: number
  updatedBy: string
}

export const Route = createFileRoute('/_authenticated/notes')({
  component: NotesPage,
})

function NotesPage() {
  const queryClient = useQueryClient()
  const [workspaceName, setWorkspaceName] = useState('')
  const [publicUsername, setPublicUsername] = useState('')
  const [selectedNoteId, setSelectedNoteId] = useState<Id<'notes'> | null>(null)
  const [titleDraft, setTitleDraft] = useState('')
  const [markdownDraft, setMarkdownDraft] = useState('')
  const [slugDraft, setSlugDraft] = useState('')
  const [moveTargetId, setMoveTargetId] = useState<string>('root')
  const [noteSearch, setNoteSearch] = useState('')
  const [isQuickSwitcherOpen, setIsQuickSwitcherOpen] = useState(false)
  const [quickSwitcherQuery, setQuickSwitcherQuery] = useState('')
  const [quickSwitcherIndex, setQuickSwitcherIndex] = useState(0)
  const [draggingNoteId, setDraggingNoteId] = useState<Id<'notes'> | null>(null)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved' | 'error'>('idle')
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quickSwitcherInputRef = useRef<HTMLInputElement | null>(null)

  const workspacesQuery = useQuery(convexQuery(api.workspaces.list, {}))
  const currentWorkspaceQuery = useQuery(convexQuery(api.workspaces.current, {}))

  const activeWorkspaceId = currentWorkspaceQuery.data?._id
  const notesTreeQuery = useQuery({
    ...convexQuery(api.notes.listTree, activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
    enabled: !!activeWorkspaceId,
  })
  const publishingOverviewQuery = useQuery({
    ...convexQuery(api.notes.publishingOverview, activeWorkspaceId ? { workspaceId: activeWorkspaceId } : {}),
    enabled: !!activeWorkspaceId,
  })

  const currentNoteQuery = useQuery({
    ...convexQuery(api.notes.get, selectedNoteId ? { noteId: selectedNoteId } : { noteId: undefined as never }),
    enabled: !!selectedNoteId,
  })

  const createWorkspace = useConvexMutation(api.workspaces.create, { showSuccessToast: false })
  const setActiveWorkspace = useConvexMutation(api.workspaces.setActive, { showSuccessToast: false })
  const createNote = useConvexMutation(api.notes.create, { showSuccessToast: false })
  const renameNote = useConvexMutation(api.notes.rename, { showSuccessToast: false })
  const updateNoteContent = useConvexMutation(api.notes.updateContent, { showSuccessToast: false, showErrorToast: false })
  const togglePublish = useConvexMutation(api.notes.togglePublish, { showSuccessToast: false })
  const archiveNote = useConvexMutation(api.notes.archive, { showSuccessToast: false })
  const moveNote = useConvexMutation(api.notes.move, { showSuccessToast: false })
  const placeNote = useConvexMutation(api.notes.place, { showSuccessToast: false })

  const treeNotes = notesTreeQuery.data?.notes ?? []
  const selectedNote = currentNoteQuery.data ?? null
  const publishingOverview = publishingOverviewQuery.data

  useEffect(() => {
    if (!treeNotes.length) {
      setSelectedNoteId(null)
      return
    }

    if (!selectedNoteId || !treeNotes.some((note) => note._id === selectedNoteId)) {
      setSelectedNoteId(treeNotes[0]?._id ?? null)
    }
  }, [treeNotes, selectedNoteId])

  useEffect(() => {
    if (!selectedNote) {
      setTitleDraft('')
      setMarkdownDraft('')
      setSaveState('idle')
      return
    }

    setTitleDraft(selectedNote.title)
    setMarkdownDraft(selectedNote.contentMarkdown)
    setSlugDraft(selectedNote.slug)
    setMoveTargetId(selectedNote.parentId ?? 'root')
    setSaveState('idle')
  }, [selectedNote?._id, selectedNote?.title, selectedNote?.contentMarkdown, selectedNote?.slug])

  const allNotesByParent = useMemo(() => {
    const grouped = new Map<string, TreeNote[]>()
    for (const note of treeNotes) {
      const key = note.parentId ?? 'root'
      const existing = grouped.get(key) ?? []
      existing.push(note)
      grouped.set(key, existing)
    }
    return grouped
  }, [treeNotes])

  const filteredTree = useMemo(() => filterNotesForQuery(treeNotes, noteSearch), [treeNotes, noteSearch])

  const visibleNotesByParent = useMemo(() => {
    const grouped = new Map<string, TreeNote[]>()
    for (const note of filteredTree.notes) {
      const key = note.parentId ?? 'root'
      const existing = grouped.get(key) ?? []
      existing.push(note)
      grouped.set(key, existing)
    }
    return grouped
  }, [filteredTree.notes])

  const resolvedExpandedIds = useMemo(() => {
    const nextExpandedIds = { ...expandedIds }
    for (const noteId of filteredTree.autoExpandedIds) {
      nextExpandedIds[noteId] = true
    }
    return nextExpandedIds
  }, [expandedIds, filteredTree.autoExpandedIds])

  const visibleNoteIds = useMemo(
    () => flattenVisibleNoteIds(visibleNotesByParent, resolvedExpandedIds),
    [resolvedExpandedIds, visibleNotesByParent]
  )

  const recentNotes = useMemo(() => getRecentNotes(treeNotes, 5), [treeNotes])

  const quickSwitcherResults = useMemo(() => {
    if (!quickSwitcherQuery.trim()) {
      return recentNotes
    }

    return getRecentNotes(filterNotesForQuery(treeNotes, quickSwitcherQuery).notes, 10)
  }, [quickSwitcherQuery, recentNotes, treeNotes])

  const descendantsByNoteId = useMemo(() => {
    const descendants = new Map<string, Set<string>>()

    const walk = (noteId: string): Set<string> => {
      const children = allNotesByParent.get(noteId) ?? []
      const result = new Set<string>()
      for (const child of children) {
        result.add(child._id)
        for (const nestedId of walk(child._id)) {
          result.add(nestedId)
        }
      }
      descendants.set(noteId, result)
      return result
    }

    for (const note of treeNotes) {
      walk(note._id)
    }

    return descendants
  }, [allNotesByParent, treeNotes])

  const availableMoveTargets = useMemo(() => {
    if (!selectedNote) {
      return []
    }

    const blockedIds = descendantsByNoteId.get(selectedNote._id) ?? new Set<string>()
    blockedIds.add(selectedNote._id)

    return treeNotes.filter((note) => !blockedIds.has(note._id))
  }, [descendantsByNoteId, selectedNote, treeNotes])

  useEffect(() => {
    if (!isQuickSwitcherOpen) {
      return
    }

    quickSwitcherInputRef.current?.focus()
    setQuickSwitcherIndex(0)
  }, [isQuickSwitcherOpen])

  useEffect(() => {
    setQuickSwitcherIndex(0)
  }, [quickSwitcherQuery])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
        event.preventDefault()
        setIsQuickSwitcherOpen(true)
        return
      }

      if (event.key === 'Escape') {
        setIsQuickSwitcherOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const selectedNoteHasUnsavedChanges = selectedNote
    ? markdownDraft !== selectedNote.contentMarkdown
    : false

  useEffect(() => {
    if (!selectedNote || !selectedNoteHasUnsavedChanges) {
      return
    }

    setSaveState('dirty')
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveState('saving')
      try {
        await updateNoteContent.execute({
          noteId: selectedNote._id,
          contentMarkdown: markdownDraft,
        })

        await Promise.all([
          currentNoteQuery.refetch(),
          notesTreeQuery.refetch(),
        ])
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }, 700)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [markdownDraft, notesTreeQuery, currentNoteQuery, selectedNote, selectedNoteHasUnsavedChanges, updateNoteContent])

  const handleCreateWorkspace = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = workspaceName.trim()
    if (!trimmedName) {
      toast.error('Workspace name is required')
      return
    }

    const result = await createWorkspace.execute({
      name: trimmedName,
      username: publicUsername.trim() || undefined,
    })

    setWorkspaceName('')
    setPublicUsername('')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: convexQuery(api.workspaces.list, {}).queryKey }),
      queryClient.invalidateQueries({ queryKey: convexQuery(api.workspaces.current, {}).queryKey }),
    ])

    if (result.workspaceId) {
      toast.success('Workspace created')
    }
  }

  const handleSelectWorkspace = async (workspaceId: Id<'workspaces'>) => {
    await setActiveWorkspace.execute({ workspaceId })
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: convexQuery(api.workspaces.current, {}).queryKey }),
      queryClient.invalidateQueries({ queryKey: convexQuery(api.workspaces.list, {}).queryKey }),
    ])
  }

  const handleCreateNote = async () => {
    if (!activeWorkspaceId) {
      return
    }

    const result = await createNote.execute({ workspaceId: activeWorkspaceId })
    await notesTreeQuery.refetch()
    if (result?._id) {
      setSelectedNoteId(result._id)
      setExpandedIds((current) => ({ ...current, root: true }))
    }
  }

  const handleCreateChildNote = async () => {
    if (!activeWorkspaceId || !selectedNote) {
      return
    }

    const result = await createNote.execute({ workspaceId: activeWorkspaceId, parentId: selectedNote._id })
    await notesTreeQuery.refetch()
    if (result?._id) {
      setSelectedNoteId(result._id)
      setExpandedIds((current) => ({ ...current, [selectedNote._id]: true }))
    }
  }

  const handleRenameNote = async () => {
    if (!selectedNote) {
      return
    }

    const nextTitle = titleDraft.trim()
    if (!nextTitle || nextTitle === selectedNote.title) {
      setTitleDraft(selectedNote.title)
      return
    }

    await renameNote.execute({ noteId: selectedNote._id, title: nextTitle })
    await Promise.all([currentNoteQuery.refetch(), notesTreeQuery.refetch()])
  }

  const toggleExpanded = (noteId: Id<'notes'>) => {
    setExpandedIds((current) => ({
      ...current,
      [noteId]: !current[noteId],
    }))
  }

  const revealNoteInTree = (noteId: Id<'notes'>) => {
    const ancestors = collectAncestorIds(treeNotes, noteId)
    setExpandedIds((current) => {
      const next = { ...current }
      for (const ancestorId of ancestors) {
        next[ancestorId] = true
      }
      return next
    })
  }

  const refreshNotesState = async () => {
    await Promise.all([
      currentNoteQuery.refetch(),
      notesTreeQuery.refetch(),
      publishingOverviewQuery.refetch(),
    ])
  }

  const handleTogglePublish = async () => {
    if (!selectedNote) {
      return
    }

    const nextSlug = slugDraft.trim() || selectedNote.slug
    const result = await togglePublish.execute({
      noteId: selectedNote._id,
      isPublished: !selectedNote.isPublished,
      slug: nextSlug,
    })

    if (result?.slug) {
      setSlugDraft(result.slug)
    }
    await refreshNotesState()
  }

  const handleArchiveNote = async () => {
    if (!selectedNote) {
      return
    }

    await archiveNote.execute({ noteId: selectedNote._id, archived: true })
    await Promise.all([notesTreeQuery.refetch(), publishingOverviewQuery.refetch()])
    setSelectedNoteId(null)
  }

  const handleMoveNote = async () => {
    if (!selectedNote) {
      return
    }

    const nextParentId = moveTargetId === 'root' ? undefined : (moveTargetId as Id<'notes'>)
    await moveNote.execute({
      noteId: selectedNote._id,
      parentId: nextParentId,
    })
    await Promise.all([notesTreeQuery.refetch(), currentNoteQuery.refetch()])
  }

  const handlePlaceNote = async (noteId: Id<'notes'>, parentId: Id<'notes'> | undefined, targetIndex: number) => {
    await placeNote.execute({ noteId, parentId, targetIndex })
    setDraggingNoteId(null)
    setDropTargetKey(null)
    await Promise.all([notesTreeQuery.refetch(), currentNoteQuery.refetch()])
  }

  const handleSelectNote = (noteId: Id<'notes'>) => {
    revealNoteInTree(noteId)
    setSelectedNoteId(noteId)
  }

  const handleQuickSwitcherSelect = (noteId: Id<'notes'>) => {
    handleSelectNote(noteId)
    setIsQuickSwitcherOpen(false)
    setQuickSwitcherQuery('')
  }

  const publicUrl = selectedNote && publishingOverview?.username && selectedNote.isPublished
    ? `/u/${publishingOverview.username}/${selectedNote.slug}`
    : null

  if (currentWorkspaceQuery.isLoading || workspacesQuery.isLoading) {
    return <NotesLoadingState />
  }

  if (!currentWorkspaceQuery.data) {
    return (
      <WorkspaceSetupState
        workspaceName={workspaceName}
        publicUsername={publicUsername}
        onWorkspaceNameChange={setWorkspaceName}
        onPublicUsernameChange={setPublicUsername}
        onSubmit={handleCreateWorkspace}
        workspaces={workspacesQuery.data ?? []}
        onSelectWorkspace={handleSelectWorkspace}
        isCreating={createWorkspace.isLoading || setActiveWorkspace.isLoading}
      />
    )
  }

  return (
    <div className="relative grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)_minmax(320px,0.9fr)]">
      <aside className="border-r border-border bg-panel">
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Workspace</p>
            <h2 className="text-sm font-semibold text-foreground">{currentWorkspaceQuery.data.name}</h2>
          </div>
          <button
            type="button"
            onClick={handleCreateNote}
            className="inline-flex h-9 w-9 items-center justify-center border border-border text-foreground transition hover:bg-panel-muted"
            title="Create note"
          >
            {createNote.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </button>
        </div>

        <div className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
          Markdown is the source of truth. Use / on an empty line or Cmd/Ctrl+K to open block commands.
        </div>

        <div className="border-b border-border px-3 py-3">
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={noteSearch}
                onChange={(event) => setNoteSearch(event.target.value)}
                placeholder="Search notes"
                className="w-full border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-ring"
              />
            </label>
            <button
              type="button"
              onClick={() => setIsQuickSwitcherOpen(true)}
              className="inline-flex items-center justify-center border border-border px-3 py-2 text-xs text-foreground transition hover:bg-panel-muted"
              title="Open quick switcher"
            >
              Cmd+O
            </button>
          </div>
        </div>

        {!noteSearch && recentNotes.length ? (
          <div className="border-b border-border px-3 py-3">
            <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              Recent
            </div>
            <div className="space-y-1">
              {recentNotes.map((note) => (
                <button
                  key={note._id}
                  type="button"
                  onClick={() => handleSelectNote(note._id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 border border-transparent px-2 py-2 text-left text-sm transition hover:border-border hover:bg-panel-muted',
                    selectedNoteId === note._id && 'border-border bg-background'
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-foreground">{note.title}</span>
                  <span className="text-[11px] text-muted-foreground">{formatRelativeTime(note.lastEditedAt)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="border-b border-border px-3 py-2">
          <button
            type="button"
            onClick={handleCreateChildNote}
            disabled={!selectedNote}
            className="flex w-full items-center justify-center gap-2 border border-border px-3 py-2 text-sm text-foreground transition hover:bg-panel-muted disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Child note
          </button>
        </div>

        <div className="min-h-0 overflow-auto px-3 py-3">
          {!treeNotes.length ? (
            <div className="border border-dashed border-border bg-panel-muted px-4 py-8 text-center text-sm text-muted-foreground">
              No notes yet. Create the first note to begin writing.
            </div>
          ) : !visibleNoteIds.length ? (
            <div className="border border-dashed border-border bg-panel-muted px-4 py-8 text-center text-sm text-muted-foreground">
              No notes match this search.
            </div>
          ) : (
            <NoteTreeBranch
              parentId={undefined}
              depth={0}
              selectedNoteId={selectedNoteId}
              notesByParent={visibleNotesByParent}
              expandedIds={resolvedExpandedIds}
              matchedIds={filteredTree.matchedIds}
              canDrag={!noteSearch}
              draggingNoteId={draggingNoteId}
              dropTargetKey={dropTargetKey}
              onToggleExpanded={toggleExpanded}
              onSelect={handleSelectNote}
              onDragStart={setDraggingNoteId}
              onDragEnd={() => {
                setDraggingNoteId(null)
                setDropTargetKey(null)
              }}
              onSetDropTarget={setDropTargetKey}
              onPlaceNote={handlePlaceNote}
            />
          )}
        </div>
      </aside>

      <section className="flex min-h-0 flex-col border-r border-border bg-background">
        <div className="border-b border-border px-5 py-4">
          {selectedNote ? (
            <div className="space-y-3">
              <input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={handleRenameNote}
                className="w-full border border-border bg-panel px-3 py-2 text-xl font-semibold text-foreground outline-none transition focus:border-ring"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Updated {formatRelativeTime(selectedNote.lastEditedAt)}</span>
                <SaveStateLabel saveState={saveState} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={slugDraft}
                  onChange={(event) => setSlugDraft(event.target.value.toLowerCase())}
                  className="min-w-[220px] flex-1 border border-border bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring"
                  placeholder="public-slug"
                />
                <button
                  type="button"
                  onClick={handleTogglePublish}
                  disabled={togglePublish.isLoading}
                  className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm text-foreground transition hover:bg-panel-muted disabled:opacity-60"
                >
                  {togglePublish.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                  {selectedNote.isPublished ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={handleArchiveNote}
                  disabled={archiveNote.isLoading}
                  className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-panel-muted hover:text-foreground disabled:opacity-60"
                >
                  {archiveNote.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                  Archive
                </button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Select a note to begin editing.</div>
          )}
        </div>

        <div className="flex-1 p-5">
          {selectedNote ? (
            <NoteEditor
              value={markdownDraft}
              onChange={setMarkdownDraft}
              placeholder="# Start writing\n\nYour note is stored as markdown and autosaved to Convex."
            />
          ) : (
            <div className="flex h-full items-center justify-center border border-dashed border-border bg-panel-muted px-6 py-12 text-sm text-muted-foreground">
              Create or select a note to load the editor.
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-col bg-panel-muted">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Preview</p>
              <h2 className="mt-1 text-sm font-semibold text-foreground">Read-only markdown rendering</h2>
            </div>
            {publicUrl ? (
              <Link
                to={publicUrl}
                className="inline-flex items-center gap-2 border border-border px-3 py-2 text-xs text-foreground transition hover:bg-background"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open public page
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex-1 p-5">
          <MarkdownPreview markdown={markdownDraft} />
        </div>
        {selectedNote ? (
          <div className="border-t border-border px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Tree position</p>
            <div className="mt-3 flex items-center gap-2">
              <select
                value={moveTargetId}
                onChange={(event) => setMoveTargetId(event.target.value)}
                className="min-w-0 flex-1 border border-border bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring"
              >
                <option value="root">Root</option>
                {availableMoveTargets.map((note) => (
                  <option key={note._id} value={note._id}>
                    {note.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleMoveNote}
                disabled={moveNote.isLoading}
                className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm text-foreground transition hover:bg-background disabled:opacity-60"
              >
                {moveNote.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightToLine className="h-4 w-4" />}
                Move
              </button>
            </div>
          </div>
        ) : null}
        <div className="border-t border-border px-5 py-4 text-xs text-muted-foreground">
          {selectedNote ? (
            selectedNote.isPublished && publicUrl ? (
              <span>Public URL: {publicUrl}</span>
            ) : (
              <span>Publish this note to generate a public URL.</span>
            )
          ) : (
            <span>No note selected.</span>
          )}
        </div>
      </section>

      {isQuickSwitcherOpen ? (
        <div className="absolute inset-0 z-20 flex items-start justify-center bg-background/70 px-4 py-16 backdrop-blur-sm">
          <div className="w-full max-w-2xl border border-border bg-panel shadow-2xl">
            <div className="border-b border-border px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Quick switcher</p>
              <div className="mt-3 flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  ref={quickSwitcherInputRef}
                  value={quickSwitcherQuery}
                  onChange={(event) => setQuickSwitcherQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      setQuickSwitcherIndex((current) =>
                        quickSwitcherResults.length ? (current + 1) % quickSwitcherResults.length : 0
                      )
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      setQuickSwitcherIndex((current) =>
                        quickSwitcherResults.length ? (current === 0 ? quickSwitcherResults.length - 1 : current - 1) : 0
                      )
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      const selectedQuickSwitchNote = quickSwitcherResults[quickSwitcherIndex] ?? quickSwitcherResults[0]
                      if (selectedQuickSwitchNote) {
                        handleQuickSwitcherSelect(selectedQuickSwitchNote._id)
                      }
                    }
                  }}
                  placeholder="Jump to a note by title, slug, or excerpt"
                  className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring"
                />
              </div>
            </div>
            <div className="max-h-[420px] overflow-auto p-3">
              {quickSwitcherResults.length ? (
                <div className="space-y-1">
                  {quickSwitcherResults.map((note, index) => (
                    <button
                      key={note._id}
                      type="button"
                      onClick={() => handleQuickSwitcherSelect(note._id)}
                      className={cn(
                        'flex w-full items-center justify-between gap-4 border border-transparent px-3 py-3 text-left transition hover:border-border hover:bg-panel-muted',
                        quickSwitcherIndex === index && 'border-border bg-panel-muted'
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{note.title}</span>
                        <span className="mt-1 block truncate text-xs text-muted-foreground">{note.excerpt || note.slug}</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">{formatRelativeTime(note.lastEditedAt)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-border bg-panel-muted px-4 py-10 text-center text-sm text-muted-foreground">
                  No notes match that query.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function NotesLoadingState() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_minmax(0,1fr)_minmax(320px,0.9fr)]">
      <div className="border-r border-border bg-panel p-4">
        <div className="h-5 w-24 animate-pulse bg-panel-muted" />
      </div>
      <div className="border-r border-border bg-background p-5">
        <div className="h-full animate-pulse bg-panel" />
      </div>
      <div className="bg-panel-muted p-5">
        <div className="h-full animate-pulse bg-panel" />
      </div>
    </div>
  )
}

function WorkspaceSetupState({
  workspaceName,
  publicUsername,
  onWorkspaceNameChange,
  onPublicUsernameChange,
  onSubmit,
  workspaces,
  onSelectWorkspace,
  isCreating,
}: {
  workspaceName: string
  publicUsername: string
  onWorkspaceNameChange: (value: string) => void
  onPublicUsernameChange: (value: string) => void
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>
  workspaces: Array<{
    _id: Id<'workspaces'>
    name: string
    slug: string
    membership: { role: string }
    isActive: boolean
  }>
  onSelectWorkspace: (workspaceId: Id<'workspaces'>) => Promise<void>
  isCreating: boolean
}) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="border border-border bg-panel p-6">
        <div className="mb-6 space-y-2">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Notes workspace</p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Create your first workspace</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Notes, chat, and publishing all live inside a workspace. Create one here to unlock the notes tree and markdown editor.
          </p>
        </div>

        <form onSubmit={onSubmit} className="grid gap-4 border border-border bg-background p-5">
          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Workspace name</span>
            <input
              value={workspaceName}
              onChange={(event) => onWorkspaceNameChange(event.target.value)}
              className="w-full border border-border bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring"
              placeholder="Product studio"
            />
          </label>

          <label className="space-y-2">
            <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Public username</span>
            <input
              value={publicUsername}
              onChange={(event) => onPublicUsernameChange(event.target.value.toLowerCase())}
              className="w-full border border-border bg-panel px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring"
              placeholder="yourname"
            />
          </label>

          <button
            type="submit"
            disabled={isCreating}
            className="inline-flex items-center justify-center gap-2 border border-border px-4 py-3 text-sm text-foreground transition hover:bg-panel-muted disabled:opacity-60"
          >
            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
            Create workspace
          </button>
        </form>
      </section>

      <aside className="border border-border bg-panel-muted p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Existing workspaces</p>
        <div className="mt-4 space-y-2">
          {workspaces.length ? (
            workspaces.map((workspace) => (
              <button
                key={workspace._id}
                type="button"
                onClick={() => onSelectWorkspace(workspace._id)}
                className="flex w-full items-center justify-between border border-border bg-panel px-4 py-3 text-left text-sm text-foreground transition hover:bg-background"
              >
                <span>{workspace.name}</span>
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {workspace.membership.role}
                </span>
              </button>
            ))
          ) : (
            <div className="border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
              No workspaces yet.
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function NoteTreeBranch({
  parentId,
  depth,
  selectedNoteId,
  notesByParent,
  expandedIds,
  matchedIds,
  canDrag,
  draggingNoteId,
  dropTargetKey,
  onToggleExpanded,
  onSelect,
  onDragStart,
  onDragEnd,
  onSetDropTarget,
  onPlaceNote,
}: {
  parentId: Id<'notes'> | undefined
  depth: number
  selectedNoteId: Id<'notes'> | null
  notesByParent: Map<string, TreeNote[]>
  expandedIds: Record<string, boolean>
  matchedIds: Set<string>
  canDrag: boolean
  draggingNoteId: Id<'notes'> | null
  dropTargetKey: string | null
  onToggleExpanded: (noteId: Id<'notes'>) => void
  onSelect: (noteId: Id<'notes'>) => void
  onDragStart: (noteId: Id<'notes'>) => void
  onDragEnd: () => void
  onSetDropTarget: (key: string | null) => void
  onPlaceNote: (noteId: Id<'notes'>, parentId: Id<'notes'> | undefined, targetIndex: number) => Promise<void>
}) {
  const children = notesByParent.get(parentId ?? 'root') ?? []

  return (
    <div className="space-y-1">
      {children.map((note, index) => (
        <div key={note._id}>
          <NoteDropZone
            parentId={parentId}
            targetIndex={index}
            depth={depth}
            canDrop={canDrag && draggingNoteId !== null && draggingNoteId !== note._id}
            isActive={dropTargetKey === `${parentId ?? 'root'}:${index}`}
            onSetDropTarget={onSetDropTarget}
            onPlaceNote={onPlaceNote}
            draggingNoteId={draggingNoteId}
          />
          <NoteTreeItem
            note={note}
            depth={depth}
            selectedNoteId={selectedNoteId}
            notesByParent={notesByParent}
            expandedIds={expandedIds}
            matchedIds={matchedIds}
            canDrag={canDrag}
            draggingNoteId={draggingNoteId}
            onToggleExpanded={onToggleExpanded}
            onSelect={onSelect}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
          {(notesByParent.get(note._id)?.length ?? 0) > 0 && (expandedIds[note._id] ?? true) ? (
            <NoteTreeBranch
              parentId={note._id}
              depth={depth + 1}
              selectedNoteId={selectedNoteId}
              notesByParent={notesByParent}
              expandedIds={expandedIds}
              matchedIds={matchedIds}
              canDrag={canDrag}
              draggingNoteId={draggingNoteId}
              dropTargetKey={dropTargetKey}
              onToggleExpanded={onToggleExpanded}
              onSelect={onSelect}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onSetDropTarget={onSetDropTarget}
              onPlaceNote={onPlaceNote}
            />
          ) : null}
        </div>
      ))}
      <NoteDropZone
        parentId={parentId}
        targetIndex={children.length}
        depth={depth}
        canDrop={canDrag && draggingNoteId !== null}
        isActive={dropTargetKey === `${parentId ?? 'root'}:${children.length}`}
        onSetDropTarget={onSetDropTarget}
        onPlaceNote={onPlaceNote}
        draggingNoteId={draggingNoteId}
      />
    </div>
  )
}

function NoteDropZone({
  parentId,
  targetIndex,
  depth,
  canDrop,
  isActive,
  onSetDropTarget,
  onPlaceNote,
  draggingNoteId,
}: {
  parentId: Id<'notes'> | undefined
  targetIndex: number
  depth: number
  canDrop: boolean
  isActive: boolean
  onSetDropTarget: (key: string | null) => void
  onPlaceNote: (noteId: Id<'notes'>, parentId: Id<'notes'> | undefined, targetIndex: number) => Promise<void>
  draggingNoteId: Id<'notes'> | null
}) {
  const dropKey = `${parentId ?? 'root'}:${targetIndex}`

  return (
    <div
      onDragOver={(event) => {
        if (!canDrop) {
          return
        }
        event.preventDefault()
        onSetDropTarget(dropKey)
      }}
      onDragLeave={() => {
        if (isActive) {
          onSetDropTarget(null)
        }
      }}
      onDrop={(event) => {
        if (!canDrop || !draggingNoteId) {
          return
        }
        event.preventDefault()
        void onPlaceNote(draggingNoteId, parentId, targetIndex)
      }}
      className={cn('transition', canDrop ? 'h-2' : 'h-0', isActive && 'h-3')}
      style={{ marginLeft: `${depth * 14 + 8}px` }}
    >
      {canDrop ? <div className={cn('h-full rounded-full bg-transparent', isActive && 'bg-ring/80')} /> : null}
    </div>
  )
}

function NoteTreeItem({
  note,
  selectedNoteId,
  notesByParent,
  expandedIds,
  matchedIds,
  canDrag,
  draggingNoteId,
  onToggleExpanded,
  onSelect,
  onDragStart,
  onDragEnd,
  depth,
}: {
  note: TreeNote
  selectedNoteId: Id<'notes'> | null
  notesByParent: Map<string, TreeNote[]>
  expandedIds: Record<string, boolean>
  matchedIds: Set<string>
  canDrag: boolean
  draggingNoteId: Id<'notes'> | null
  onToggleExpanded: (noteId: Id<'notes'>) => void
  onSelect: (noteId: Id<'notes'>) => void
  onDragStart: (noteId: Id<'notes'>) => void
  onDragEnd: () => void
  depth: number
}) {
  const children = notesByParent.get(note._id) ?? []
  const hasChildren = children.length > 0
  const isExpanded = expandedIds[note._id] ?? true

  return (
    <div
      draggable={canDrag}
      onDragStart={() => onDragStart(note._id)}
      onDragEnd={onDragEnd}
      className={cn(draggingNoteId === note._id && 'opacity-50')}
    >
      <div
        className={cn(
          'flex items-center gap-2 border border-transparent px-2 py-2 text-sm transition hover:border-border hover:bg-panel-muted',
          selectedNoteId === note._id && 'border-border bg-background text-foreground',
          matchedIds.has(note._id) && 'border-border/60'
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        <button
          type="button"
          onClick={() => (hasChildren ? onToggleExpanded(note._id) : onSelect(note._id))}
          className="inline-flex h-4 w-4 items-center justify-center text-muted-foreground"
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : (
            <BookOpenText className="h-3.5 w-3.5" />
          )}
        </button>
        <button type="button" onClick={() => onSelect(note._id)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-foreground">{note.title}</div>
          <div className="truncate text-[11px] text-muted-foreground">{note.excerpt || note.slug}</div>
        </button>
        {canDrag ? (
          <span className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground" title="Drag to reorder">
            <GripVertical className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
    </div>
  )
}

function SaveStateLabel({ saveState }: { saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'error' }) {
  const label =
    saveState === 'saving'
      ? 'Saving...'
      : saveState === 'saved'
        ? 'Saved'
        : saveState === 'error'
          ? 'Save failed'
          : saveState === 'dirty'
            ? 'Unsaved changes'
            : 'Synced'

  return <span>{label}</span>
}