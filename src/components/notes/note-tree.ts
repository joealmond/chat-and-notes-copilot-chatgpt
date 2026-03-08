export type SearchableTreeNote<TId extends string = string> = {
  _id: TId
  parentId?: TId
  title: string
  slug: string
  excerpt?: string
  lastEditedAt: number
}

function normalizeQuery(query: string) {
  return query.trim().toLowerCase()
}

export function collectAncestorIds<TNote extends SearchableTreeNote>(notes: TNote[], noteId: TNote['_id']) {
  const notesById = new Map(notes.map((note) => [note._id, note]))
  const ancestors: Array<TNote['_id']> = []

  let current = notesById.get(noteId)
  while (current?.parentId) {
    ancestors.unshift(current.parentId)
    current = notesById.get(current.parentId)
  }

  return ancestors
}

export function filterNotesForQuery<TNote extends SearchableTreeNote>(notes: TNote[], query: string) {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) {
    return {
      notes,
      matchedIds: new Set<TNote['_id']>(),
      autoExpandedIds: new Set<TNote['_id']>(),
    }
  }

  const includedIds = new Set<TNote['_id']>()
  const matchedIds = new Set<TNote['_id']>()
  const autoExpandedIds = new Set<TNote['_id']>()

  for (const note of notes) {
    const haystack = [note.title, note.slug, note.excerpt ?? ''].join(' ').toLowerCase()
    if (!haystack.includes(normalizedQuery)) {
      continue
    }

    matchedIds.add(note._id)
    includedIds.add(note._id)

    for (const ancestorId of collectAncestorIds(notes, note._id)) {
      includedIds.add(ancestorId)
      autoExpandedIds.add(ancestorId)
    }
  }

  return {
    notes: notes.filter((note) => includedIds.has(note._id)),
    matchedIds,
    autoExpandedIds,
  }
}

export function flattenVisibleNoteIds<TId extends string>(
  notesByParent: Map<string, Array<SearchableTreeNote<TId>>>,
  expandedIds: Record<string, boolean>
) {
  const orderedIds: TId[] = []

  const walk = (parentId: string) => {
    for (const note of notesByParent.get(parentId) ?? []) {
      orderedIds.push(note._id)
      if ((notesByParent.get(note._id)?.length ?? 0) > 0 && (expandedIds[note._id] ?? true)) {
        walk(note._id)
      }
    }
  }

  walk('root')
  return orderedIds
}

export function getRecentNotes<TNote extends SearchableTreeNote>(notes: TNote[], limit: number) {
  return [...notes]
    .sort((left, right) => {
      if (right.lastEditedAt !== left.lastEditedAt) {
        return right.lastEditedAt - left.lastEditedAt
      }
      return left.title.localeCompare(right.title)
    })
    .slice(0, limit)
}