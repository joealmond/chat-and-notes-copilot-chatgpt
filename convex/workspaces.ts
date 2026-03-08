import { ConvexError, v } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { authMutation, authQuery } from './lib/customFunctions'
import {
  ensureUserProfile,
  getUserProfile,
  getWorkspaceMember,
  requireActiveWorkspace,
  requireWorkspaceMember,
} from './lib/authHelpers'
import { rateLimiter } from './lib/services/rateLimitService'
import { WORKSPACE_ROLES } from './lib/config'

type WorkspaceContext = QueryCtx | MutationCtx

function slugifyWorkspaceName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

async function ensureUniqueWorkspaceSlug(ctx: WorkspaceContext, baseSlug: string) {
  let candidate = baseSlug || 'workspace'
  let suffix = 1

  while (await ctx.db.query('workspaces').withIndex('by_slug', (q) => q.eq('slug', candidate)).unique()) {
    suffix += 1
    candidate = `${baseSlug || 'workspace'}-${suffix}`
  }

  return candidate
}

export const list = authQuery({
  args: {},
  handler: async (ctx) => {
    const memberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_user', (q) => q.eq('userId', ctx.userId))
      .collect()

    const profile = await getUserProfile(ctx, ctx.userId)

    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId)
        if (!workspace || workspace.archivedAt) {
          return null
        }

        return {
          ...workspace,
          membership,
          isActive: profile?.activeWorkspaceId === workspace._id,
        }
      })
    )

    return workspaces.filter((workspace) => workspace !== null)
  },
})

export const current = authQuery({
  args: {},
  handler: async (ctx) => {
    const profile = await getUserProfile(ctx, ctx.userId)

    if (!profile?.activeWorkspaceId) {
      return null
    }

    const workspace = await ctx.db.get(profile.activeWorkspaceId)
    if (!workspace || workspace.archivedAt) {
      return null
    }

    const membership = await getWorkspaceMember(ctx, workspace._id, ctx.userId)
    if (!membership) {
      return null
    }

    return {
      ...workspace,
      membership,
    }
  },
})

export const create = authMutation({
  args: {
    name: v.string(),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await rateLimiter.limit(ctx, 'createWorkspace', { key: ctx.userId })

    const trimmedName = args.name.trim()
    if (!trimmedName) {
      throw new ConvexError('Workspace name cannot be empty')
    }

    const baseSlug = slugifyWorkspaceName(trimmedName)
    const slug = await ensureUniqueWorkspaceSlug(ctx, baseSlug)
    const now = Date.now()

    const workspaceId = await ctx.db.insert('workspaces', {
      name: trimmedName,
      slug,
      ownerId: ctx.userId,
      createdBy: ctx.userId,
      createdAt: now,
      updatedAt: now,
    })

    await ctx.db.insert('workspaceMembers', {
      workspaceId,
      userId: ctx.userId,
      role: WORKSPACE_ROLES.OWNER,
      joinedAt: now,
      invitedBy: ctx.userId,
    })

    const profile = await ensureUserProfile(ctx, ctx.user)
    await ctx.db.patch(profile._id, {
      activeWorkspaceId: workspaceId,
      username: args.username?.trim() || profile.username,
      updatedAt: now,
    })

    return { workspaceId, slug }
  },
})

export const setActive = authMutation({
  args: {
    workspaceId: v.id('workspaces'),
  },
  handler: async (ctx, args) => {
    await requireWorkspaceMember(ctx, args.workspaceId, ctx.userId)

    const profile = await ensureUserProfile(ctx, ctx.user)
    await ctx.db.patch(profile._id, {
      activeWorkspaceId: args.workspaceId,
      updatedAt: Date.now(),
    })

    return { workspaceId: args.workspaceId }
  },
})

export const members = authQuery({
  args: {
    workspaceId: v.optional(v.id('workspaces')),
  },
  handler: async (ctx, args) => {
    const workspace = args.workspaceId ? await ctx.db.get(args.workspaceId) : await requireActiveWorkspace(ctx)

    if (!workspace || workspace.archivedAt) {
      throw new ConvexError('Workspace not found')
    }

    await requireWorkspaceMember(ctx, workspace._id, ctx.userId)

    const memberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspace._id))
      .collect()

    const members = await Promise.all(
      memberships.map(async (membership) => {
        const profile = await getUserProfile(ctx, membership.userId)
        return {
          userId: membership.userId,
          role: membership.role,
          joinedAt: membership.joinedAt,
          displayName: profile?.displayName ?? 'Workspace member',
          username: profile?.username,
          avatarUrl: profile?.avatarUrl,
        }
      })
    )

    return members.sort((left, right) => left.displayName.localeCompare(right.displayName))
  },
})