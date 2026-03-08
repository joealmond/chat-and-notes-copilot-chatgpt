import { ConvexError, v } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { authMutation, authQuery, publicQuery } from './lib/customFunctions'
import {
  getUserProfile,
  requireActiveWorkspace,
  requireWorkspaceMember,
  type WorkspaceDoc,
  type WorkspaceId,
} from './lib/authHelpers'
import { rateLimiter } from './lib/services/rateLimitService'

type NoteDoc = Doc<'notes'>
type NoteId = Id<'notes'>
type NoteContext = QueryCtx | MutationCtx

function slugifyNoteTitle(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
}

function extractExcerpt(markdown: string): string {
  const cleaned = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*|__|~~|[*_]/g, '')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned.slice(0, 220)
}

function countWords(markdown: string): number {
  const cleaned = extractExcerpt(markdown)
  if (!cleaned) {
    return 0
  }

  return cleaned.split(/\s+/).filter(Boolean).length
}

function estimateReadingMinutes(markdown: string): number {
  const wordCount = countWords(markdown)
  return wordCount ? Math.max(1, Math.ceil(wordCount / 200)) : 0
}

async function resolveWorkspace(ctx: NoteContext, workspaceId?: WorkspaceId): Promise<WorkspaceDoc> {
  if (workspaceId) {
    const workspace = await ctx.db.get(workspaceId)
    if (!workspace || workspace.archivedAt) {
      throw new ConvexError('Workspace not found')
    }
    return workspace
  }

  return await requireActiveWorkspace(ctx)
}

async function getNoteOrThrow(ctx: NoteContext, noteId: NoteId): Promise<NoteDoc> {
  const note = await ctx.db.get(noteId)
  if (!note || note.archivedAt) {
    throw new ConvexError('Note not found')
  }
  return note
}

async function ensureWorkspaceNote(
  ctx: NoteContext,
  noteId: NoteId,
  workspaceId: WorkspaceId
): Promise<NoteDoc> {
  const note = await getNoteOrThrow(ctx, noteId)
  if (note.workspaceId !== workspaceId) {
    throw new ConvexError('Note does not belong to the active workspace')
  }
  return note
}

async function ensureUniqueWorkspaceSlug(
  ctx: NoteContext,
  workspaceId: WorkspaceId,
  baseSlug: string,
  excludedNoteId?: NoteId
): Promise<string> {
  const normalizedBase = baseSlug || 'untitled'
  let candidate = normalizedBase
  let suffix = 1

  while (true) {
    const conflicts = await ctx.db
      .query('notes')
      .withIndex('by_workspace_slug', (q) => q.eq('workspaceId', workspaceId).eq('slug', candidate))
      .collect()

    const taken = conflicts.some((note) => note._id !== excludedNoteId && !note.archivedAt)
    if (!taken) {
      return candidate
    }

    suffix += 1
    candidate = `${normalizedBase}-${suffix}`
  }
}

async function ensureUniquePublicSlug(
  ctx: NoteContext,
  authorId: string,
  slug: string,
  excludedNoteId?: NoteId
): Promise<void> {
  const conflicts = await ctx.db
    .query('notes')
    .withIndex('by_author_slug', (q) => q.eq('createdBy', authorId).eq('slug', slug))
    .collect()

  const collision = conflicts.some((note) => note._id !== excludedNoteId && !note.archivedAt)
  if (collision) {
    throw new ConvexError('A published note already uses this slug')
  }
}

async function assertParentCanContainNote(
  ctx: NoteContext,
  workspaceId: WorkspaceId,
  noteId: NoteId,
  nextParentId?: NoteId
): Promise<void> {
  if (!nextParentId) {
    return
  }

  if (nextParentId === noteId) {
    throw new ConvexError('A note cannot be moved inside itself')
  }

  let cursor = await ensureWorkspaceNote(ctx, nextParentId, workspaceId)
  while (cursor.parentId) {
    if (cursor.parentId === noteId) {
      throw new ConvexError('A note cannot be moved into one of its descendants')
    }

    cursor = await ensureWorkspaceNote(ctx, cursor.parentId, workspaceId)
  }
}

function sortTreeNotes(notes: NoteDoc[]): NoteDoc[] {
  return [...notes].sort((left, right) => {
    const leftParent = left.parentId ?? ''
    const rightParent = right.parentId ?? ''

    if (leftParent !== rightParent) {
      return leftParent.localeCompare(rightParent)
    }

    const leftOrder = left.sortOrder ?? left._creationTime
    const rightOrder = right.sortOrder ?? right._creationTime
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder
    }

    return left.title.localeCompare(right.title)
  })
}

export const listTree = authQuery({
  args: {
    workspaceId: v.optional(v.id('workspaces')),
  },
  handler: async (ctx, args) => {
    const workspace = await resolveWorkspace(ctx, args.workspaceId)
    await requireWorkspaceMember(ctx, workspace._id, ctx.userId)

    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspace._id))
      .collect()

    return {
      workspace,
      notes: sortTreeNotes(notes.filter((note) => !note.archivedAt)).map((note) => ({
        _id: note._id,
        parentId: note.parentId,
        sortOrder: note.sortOrder ?? note._creationTime,
        title: note.title,
        slug: note.slug,
        excerpt: note.excerpt,
        isPublished: note.isPublished,
        lastEditedAt: note.lastEditedAt,
        updatedBy: note.updatedBy,
      })),
    }
  },
})

export const get = authQuery({
  args: {
    noteId: v.id('notes'),
  },
  handler: async (ctx, args) => {
    const note = await getNoteOrThrow(ctx, args.noteId)
    await requireWorkspaceMember(ctx, note.workspaceId, ctx.userId)
    return note
  },
})

export const publishingOverview = authQuery({
  args: {
    workspaceId: v.optional(v.id('workspaces')),
  },
  handler: async (ctx, args) => {
    const workspace = await resolveWorkspace(ctx, args.workspaceId)
    await requireWorkspaceMember(ctx, workspace._id, ctx.userId)

    const profile = await getUserProfile(ctx, ctx.userId)
    const notes = await ctx.db
      .query('notes')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspace._id))
      .collect()

    const publishedNotes = notes
      .filter((note) => note.isPublished && !note.archivedAt)
      .sort((left, right) => right.lastEditedAt - left.lastEditedAt)
      .map((note) => ({
        _id: note._id,
        title: note.title,
        slug: note.slug,
        excerpt: note.excerpt,
        publishedAt: note.publishedAt,
        lastEditedAt: note.lastEditedAt,
        wordCount: countWords(note.contentMarkdown),
        readingMinutes: estimateReadingMinutes(note.contentMarkdown),
      }))

    return {
      workspace,
      username: profile?.username,
      publishedNotes,
    }
  },
})

export const create = authMutation({
  args: {
    workspaceId: v.optional(v.id('workspaces')),
    parentId: v.optional(v.id('notes')),
    title: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = await resolveWorkspace(ctx, args.workspaceId)
    await requireWorkspaceMember(ctx, workspace._id, ctx.userId)

    if (args.parentId) {
      await ensureWorkspaceNote(ctx, args.parentId, workspace._id)
    }

    const title = args.title?.trim() || 'Untitled'
    const slug = await ensureUniqueWorkspaceSlug(ctx, workspace._id, slugifyNoteTitle(title))
    const now = Date.now()

    const noteId = await ctx.db.insert('notes', {
      workspaceId: workspace._id,
      parentId: args.parentId,
      sortOrder: now,
      title,
      slug,
      contentMarkdown: '',
      excerpt: '',
      isPublished: false,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
      lastEditedAt: now,
    })

    return await ctx.db.get(noteId)
  },
})

export const rename = authMutation({
  args: {
    noteId: v.id('notes'),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const note = await getNoteOrThrow(ctx, args.noteId)
    await requireWorkspaceMember(ctx, note.workspaceId, ctx.userId)

    const nextTitle = args.title.trim()
    if (!nextTitle) {
      throw new ConvexError('Note title cannot be empty')
    }

    const nextSlug = note.isPublished
      ? note.slug
      : await ensureUniqueWorkspaceSlug(ctx, note.workspaceId, slugifyNoteTitle(nextTitle), note._id)

    await ctx.db.patch(note._id, {
      title: nextTitle,
      slug: nextSlug,
      updatedBy: ctx.userId,
      lastEditedAt: Date.now(),
    })

    return await ctx.db.get(note._id)
  },
})

export const move = authMutation({
  args: {
    noteId: v.id('notes'),
    parentId: v.optional(v.id('notes')),
  },
  handler: async (ctx, args) => {
    const note = await getNoteOrThrow(ctx, args.noteId)
    await requireWorkspaceMember(ctx, note.workspaceId, ctx.userId)
    await assertParentCanContainNote(ctx, note.workspaceId, note._id, args.parentId)

    if (args.parentId) {
      await ensureWorkspaceNote(ctx, args.parentId, note.workspaceId)
    }

    await ctx.db.patch(note._id, {
      parentId: args.parentId,
      updatedBy: ctx.userId,
      lastEditedAt: Date.now(),
    })

    return await ctx.db.get(note._id)
  },
})

export const reorder = authMutation({
  args: {
    noteId: v.id('notes'),
    direction: v.union(v.literal('up'), v.literal('down')),
  },
  handler: async (ctx, args) => {
    const note = await getNoteOrThrow(ctx, args.noteId)
    await requireWorkspaceMember(ctx, note.workspaceId, ctx.userId)

    const siblings = sortTreeNotes(
      (await ctx.db
        .query('notes')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', note.workspaceId))
        .collect())
        .filter((candidate) => !candidate.archivedAt && candidate.parentId === note.parentId)
    )

    const index = siblings.findIndex((candidate) => candidate._id === note._id)
    if (index === -1) {
      throw new ConvexError('Note not found in sibling set')
    }

    const targetIndex = args.direction === 'up' ? index - 1 : index + 1
    const target = siblings[targetIndex]
    if (!target) {
      return { moved: false }
    }

    const noteOrder = note.sortOrder ?? note._creationTime
    const targetOrder = target.sortOrder ?? target._creationTime

    await ctx.db.patch(note._id, {
      sortOrder: targetOrder,
      updatedBy: ctx.userId,
      lastEditedAt: Date.now(),
    })
    await ctx.db.patch(target._id, {
      sortOrder: noteOrder,
      updatedBy: ctx.userId,
      lastEditedAt: Date.now(),
    })

    return { moved: true }
  },
})

export const place = authMutation({
  args: {
    noteId: v.id('notes'),
    parentId: v.optional(v.id('notes')),
    targetIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const note = await getNoteOrThrow(ctx, args.noteId)
    await requireWorkspaceMember(ctx, note.workspaceId, ctx.userId)
    await assertParentCanContainNote(ctx, note.workspaceId, note._id, args.parentId)

    if (args.parentId) {
      await ensureWorkspaceNote(ctx, args.parentId, note.workspaceId)
    }

    const siblings = sortTreeNotes(
      (await ctx.db
        .query('notes')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', note.workspaceId))
        .collect())
        .filter(
          (candidate) =>
            !candidate.archivedAt && candidate.parentId === args.parentId && candidate._id !== note._id
        )
    )

    const nextIndex = Math.max(0, Math.min(args.targetIndex, siblings.length))
    const orderedNotes = [...siblings.slice(0, nextIndex), note, ...siblings.slice(nextIndex)]
    const now = Date.now()

    for (const [index, sibling] of orderedNotes.entries()) {
      await ctx.db.patch(sibling._id, {
        parentId: args.parentId,
        sortOrder: (index + 1) * 1024,
        updatedBy: ctx.userId,
        lastEditedAt: sibling._id === note._id ? now : sibling.lastEditedAt,
      })
    }

    return { moved: true }
  },
})

export const updateContent = authMutation({
  args: {
    noteId: v.id('notes'),
    contentMarkdown: v.string(),
  },
  handler: async (ctx, args) => {
    const note = await getNoteOrThrow(ctx, args.noteId)
    await requireWorkspaceMember(ctx, note.workspaceId, ctx.userId)
    await rateLimiter.limit(ctx, 'saveNote', { key: ctx.userId })

    const normalizedMarkdown = args.contentMarkdown.replace(/\r\n/g, '\n')
    if (normalizedMarkdown.length > 200_000) {
      throw new ConvexError('Note content is too large')
    }

    await ctx.db.patch(note._id, {
      contentMarkdown: normalizedMarkdown,
      excerpt: extractExcerpt(normalizedMarkdown),
      updatedBy: ctx.userId,
      lastEditedAt: Date.now(),
    })

    return await ctx.db.get(note._id)
  },
})

export const archive = authMutation({
  args: {
    noteId: v.id('notes'),
    archived: v.boolean(),
  },
  handler: async (ctx, args) => {
    const note = await getNoteOrThrow(ctx, args.noteId)
    await requireWorkspaceMember(ctx, note.workspaceId, ctx.userId)

    await ctx.db.patch(note._id, {
      archivedAt: args.archived ? Date.now() : undefined,
      isPublished: args.archived ? false : note.isPublished,
      publishedAt: args.archived ? undefined : note.publishedAt,
      updatedBy: ctx.userId,
      lastEditedAt: Date.now(),
    })

    return { noteId: note._id, archived: args.archived }
  },
})

export const togglePublish = authMutation({
  args: {
    noteId: v.id('notes'),
    isPublished: v.boolean(),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const note = await getNoteOrThrow(ctx, args.noteId)
    await requireWorkspaceMember(ctx, note.workspaceId, ctx.userId)

    const profile = await getUserProfile(ctx, ctx.userId)
    if (args.isPublished && !profile?.username) {
      throw new ConvexError('Set a public username before publishing notes')
    }

    const nextSlug = args.slug?.trim()
      ? slugifyNoteTitle(args.slug)
      : note.slug || slugifyNoteTitle(note.title)

    if (args.isPublished) {
      if (!nextSlug) {
        throw new ConvexError('Published notes require a slug')
      }
      await ensureUniquePublicSlug(ctx, note.createdBy, nextSlug, note._id)
    }

    await ctx.db.patch(note._id, {
      isPublished: args.isPublished,
      publishedAt: args.isPublished ? Date.now() : undefined,
      slug: nextSlug || note.slug,
      updatedBy: ctx.userId,
      lastEditedAt: Date.now(),
    })

    return await ctx.db.get(note._id)
  },
})

export const resolvePublished = publicQuery({
  args: {
    username: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedUsername = args.username.trim().toLowerCase()
    const normalizedSlug = slugifyNoteTitle(args.slug)

    const profile = await ctx.db
      .query('userProfiles')
      .withIndex('by_username', (q) => q.eq('username', normalizedUsername))
      .unique()

    if (!profile) {
      return null
    }

    const candidates = await ctx.db
      .query('notes')
      .withIndex('by_author_slug', (q) => q.eq('createdBy', profile.userId).eq('slug', normalizedSlug))
      .collect()

    const note = candidates.find((candidate) => candidate.isPublished && !candidate.archivedAt)
    if (!note) {
      return null
    }

    return {
      note,
      profile,
    }
  },
})