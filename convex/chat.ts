import { ConvexError, v } from 'convex/values'
import type { Doc, Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { authMutation, authQuery } from './lib/customFunctions'
import { getUserProfile, requireActiveWorkspace, requireWorkspaceMember } from './lib/authHelpers'
import { rateLimiter } from './lib/services/rateLimitService'

type ChatCtx = QueryCtx | MutationCtx
type ChannelDoc = Doc<'chatChannels'>
type ChannelId = Id<'chatChannels'>

const ACTIVE_PRESENCE_WINDOW_MS = 90_000
const ACTIVE_TYPING_WINDOW_MS = 6_000

function slugifyChannelName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function buildDmKey(firstUserId: string, secondUserId: string): string {
  return [firstUserId, secondUserId].sort().join(':')
}

async function resolveWorkspace(ctx: ChatCtx, workspaceId?: Id<'workspaces'>) {
  if (workspaceId) {
    const workspace = await ctx.db.get(workspaceId)
    if (!workspace || workspace.archivedAt) {
      throw new ConvexError('Workspace not found')
    }
    return workspace
  }

  return await requireActiveWorkspace(ctx)
}

async function getChannelOrThrow(ctx: ChatCtx, channelId: ChannelId): Promise<ChannelDoc> {
  const channel = await ctx.db.get(channelId)
  if (!channel || channel.archivedAt) {
    throw new ConvexError('Channel not found')
  }
  return channel
}

async function requireChannelMember(ctx: ChatCtx, channelId: ChannelId, userId: string) {
  const membership = await ctx.db
    .query('chatChannelMembers')
    .withIndex('by_channel_user', (q) => q.eq('channelId', channelId).eq('userId', userId))
    .unique()

  if (!membership) {
    throw new ConvexError('Channel membership required')
  }

  return membership
}

async function ensureUniqueChannelSlug(ctx: ChatCtx, workspaceId: Id<'workspaces'>, baseSlug: string) {
  let candidate = baseSlug || 'channel'
  let suffix = 1

  while (
    await ctx.db
      .query('chatChannels')
      .withIndex('by_workspace_slug', (q) => q.eq('workspaceId', workspaceId).eq('slug', candidate))
      .unique()
  ) {
    suffix += 1
    candidate = `${baseSlug || 'channel'}-${suffix}`
  }

  return candidate
}

export const bootstrap = authQuery({
  args: {
    workspaceId: v.optional(v.id('workspaces')),
  },
  handler: async (ctx, args) => {
    const workspace = await resolveWorkspace(ctx, args.workspaceId)
    await requireWorkspaceMember(ctx, workspace._id, ctx.userId)

    const [channels, memberships, workspaceMembers] = await Promise.all([
      ctx.db
        .query('chatChannels')
        .withIndex('by_workspace_kind', (q) => q.eq('workspaceId', workspace._id).eq('kind', 'channel'))
        .collect(),
      ctx.db
        .query('chatChannelMembers')
        .withIndex('by_workspace_user', (q) => q.eq('workspaceId', workspace._id).eq('userId', ctx.userId))
        .collect(),
      ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', workspace._id))
        .collect(),
    ])

    const directChannels = await Promise.all(
      memberships.map(async (membership) => {
        const channel = await ctx.db.get(membership.channelId)
        if (!channel || channel.kind !== 'dm' || channel.archivedAt) {
          return null
        }

        const memberRows = await ctx.db
          .query('chatChannelMembers')
          .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
          .collect()

        const counterpart = memberRows.find((row) => row.userId !== ctx.userId)
        const counterpartProfile = counterpart ? await getUserProfile(ctx, counterpart.userId) : null

        return {
          _id: channel._id,
          name: counterpartProfile?.displayName ?? channel.name,
          slug: channel.slug,
          kind: channel.kind,
          lastMessageAt: channel.lastMessageAt,
          unreadCount: channel.lastMessageAt > (membership.lastReadAt ?? 0) ? 1 : 0,
          counterpartUserId: counterpart?.userId,
        }
      })
    )

    const membershipByChannelId = new Map(memberships.map((membership) => [membership.channelId, membership]))

    const memberList = await Promise.all(
      workspaceMembers.map(async (member) => {
        const profile = await getUserProfile(ctx, member.userId)
        return {
          userId: member.userId,
          displayName: profile?.displayName ?? 'Workspace member',
          username: profile?.username,
          avatarUrl: profile?.avatarUrl,
          role: member.role,
        }
      })
    )

    return {
      workspace,
      currentUserId: ctx.userId,
      channels: channels
        .filter((channel) => !channel.archivedAt)
        .sort((left, right) => right.lastMessageAt - left.lastMessageAt)
        .map((channel) => ({
          _id: channel._id,
          name: channel.name,
          slug: channel.slug,
          topic: channel.topic,
          kind: channel.kind,
          lastMessageAt: channel.lastMessageAt,
          unreadCount: channel.lastMessageAt > (membershipByChannelId.get(channel._id)?.lastReadAt ?? 0) ? 1 : 0,
        })),
      directMessages: directChannels
        .filter((channel): channel is NonNullable<typeof channel> => channel !== null)
        .sort((left, right) => right.lastMessageAt - left.lastMessageAt),
      members: memberList
        .filter((member) => member.userId !== ctx.userId)
        .sort((left, right) => left.displayName.localeCompare(right.displayName)),
    }
  },
})

export const listMessages = authQuery({
  args: {
    channelId: v.id('chatChannels'),
  },
  handler: async (ctx, args) => {
    const channel = await getChannelOrThrow(ctx, args.channelId)
    await requireWorkspaceMember(ctx, channel.workspaceId, ctx.userId)
    await requireChannelMember(ctx, channel._id, ctx.userId)

    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_channel_parent', (q) => q.eq('channelId', channel._id).eq('parentMessageId', undefined))
      .collect()

    const replyRows = await ctx.db
      .query('chatMessages')
      .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
      .collect()

    const replyCountByParent = new Map<string, number>()
    for (const reply of replyRows) {
      if (!reply.parentMessageId) {
        continue
      }
      replyCountByParent.set(reply.parentMessageId, (replyCountByParent.get(reply.parentMessageId) ?? 0) + 1)
    }

    return messages
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((message) => ({
        ...message,
        replyCount: replyCountByParent.get(message._id) ?? 0,
      }))
  },
})

export const getThread = authQuery({
  args: {
    channelId: v.id('chatChannels'),
    parentMessageId: v.id('chatMessages'),
  },
  handler: async (ctx, args) => {
    const channel = await getChannelOrThrow(ctx, args.channelId)
    await requireWorkspaceMember(ctx, channel.workspaceId, ctx.userId)
    await requireChannelMember(ctx, channel._id, ctx.userId)

    const messages = await ctx.db
      .query('chatMessages')
      .withIndex('by_channel_parent', (q) => q.eq('channelId', channel._id).eq('parentMessageId', args.parentMessageId))
      .collect()

    return messages.sort((left, right) => left.createdAt - right.createdAt)
  },
})

export const createChannel = authMutation({
  args: {
    workspaceId: v.optional(v.id('workspaces')),
    name: v.string(),
    topic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspace = await resolveWorkspace(ctx, args.workspaceId)
    await requireWorkspaceMember(ctx, workspace._id, ctx.userId)
    await rateLimiter.limit(ctx, 'createChatChannel', { key: ctx.userId })

    const trimmedName = args.name.trim()
    if (!trimmedName) {
      throw new ConvexError('Channel name is required')
    }

    const slug = await ensureUniqueChannelSlug(ctx, workspace._id, slugifyChannelName(trimmedName))
    const now = Date.now()

    const channelId = await ctx.db.insert('chatChannels', {
      workspaceId: workspace._id,
      kind: 'channel',
      name: trimmedName,
      slug,
      topic: args.topic?.trim() || undefined,
      createdBy: ctx.userId,
      lastMessageAt: now,
    })

    const members = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspace._id))
      .collect()

    for (const member of members) {
      await ctx.db.insert('chatChannelMembers', {
        workspaceId: workspace._id,
        channelId,
        userId: member.userId,
        joinedAt: now,
        lastReadAt: member.userId === ctx.userId ? now : undefined,
      })
    }

    return await ctx.db.get(channelId)
  },
})

export const openDirectMessage = authMutation({
  args: {
    workspaceId: v.optional(v.id('workspaces')),
    targetUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const workspace = await resolveWorkspace(ctx, args.workspaceId)
    await requireWorkspaceMember(ctx, workspace._id, ctx.userId)
    await requireWorkspaceMember(ctx, workspace._id, args.targetUserId)

    if (args.targetUserId === ctx.userId) {
      throw new ConvexError('Choose another workspace member for a direct message')
    }

    const dmKey = buildDmKey(ctx.userId, args.targetUserId)
    const existing = await ctx.db
      .query('chatChannels')
      .withIndex('by_workspace_dm_key', (q) => q.eq('workspaceId', workspace._id).eq('dmKey', dmKey))
      .unique()

    if (existing && !existing.archivedAt) {
      return existing
    }

    const targetProfile = await getUserProfile(ctx, args.targetUserId)
    const currentProfile = await getUserProfile(ctx, ctx.userId)
    const now = Date.now()

    const channelId = await ctx.db.insert('chatChannels', {
      workspaceId: workspace._id,
      kind: 'dm',
      name: targetProfile?.displayName ?? 'Direct message',
      slug: `dm-${slugifyChannelName(targetProfile?.displayName ?? args.targetUserId)}`,
      dmKey,
      createdBy: ctx.userId,
      lastMessageAt: now,
    })

    await ctx.db.insert('chatChannelMembers', {
      workspaceId: workspace._id,
      channelId,
      userId: ctx.userId,
      joinedAt: now,
      lastReadAt: now,
    })
    await ctx.db.insert('chatChannelMembers', {
      workspaceId: workspace._id,
      channelId,
      userId: args.targetUserId,
      joinedAt: now,
    })

    await ctx.db.insert('chatMessages', {
      workspaceId: workspace._id,
      channelId,
      body: `Direct thread started between ${currentProfile?.displayName ?? 'You'} and ${targetProfile?.displayName ?? 'member'}.`,
      authorId: ctx.userId,
      authorName: currentProfile?.displayName ?? ctx.user.name,
      authorImage: currentProfile?.avatarUrl ?? ctx.user.image ?? undefined,
      createdAt: now,
    })

    return await ctx.db.get(channelId)
  },
})

export const sendMessage = authMutation({
  args: {
    channelId: v.id('chatChannels'),
    body: v.string(),
    parentMessageId: v.optional(v.id('chatMessages')),
  },
  handler: async (ctx, args) => {
    const channel = await getChannelOrThrow(ctx, args.channelId)
    await requireWorkspaceMember(ctx, channel.workspaceId, ctx.userId)
    await requireChannelMember(ctx, channel._id, ctx.userId)
    await rateLimiter.limit(ctx, 'sendChatMessage', { key: ctx.userId })

    const trimmedBody = args.body.trim()
    if (!trimmedBody) {
      throw new ConvexError('Message cannot be empty')
    }
    if (trimmedBody.length > 4000) {
      throw new ConvexError('Message too long')
    }

    if (args.parentMessageId) {
      const parent = await ctx.db.get(args.parentMessageId)
      if (!parent || parent.channelId !== channel._id) {
        throw new ConvexError('Reply target not found')
      }
    }

    const profile = await getUserProfile(ctx, ctx.userId)
    const now = Date.now()

    const messageId = await ctx.db.insert('chatMessages', {
      workspaceId: channel.workspaceId,
      channelId: channel._id,
      parentMessageId: args.parentMessageId,
      body: trimmedBody,
      authorId: ctx.userId,
      authorName: profile?.displayName ?? ctx.user.name,
      authorImage: profile?.avatarUrl ?? ctx.user.image ?? undefined,
      createdAt: now,
    })

    await ctx.db.patch(channel._id, {
      lastMessageAt: now,
    })

    const membership = await ctx.db
      .query('chatChannelMembers')
      .withIndex('by_channel_user', (q) => q.eq('channelId', channel._id).eq('userId', ctx.userId))
      .unique()

    if (membership) {
      await ctx.db.patch(membership._id, {
        lastReadAt: now,
      })
    }

    return await ctx.db.get(messageId)
  },
})

export const markRead = authMutation({
  args: {
    channelId: v.id('chatChannels'),
  },
  handler: async (ctx, args) => {
    const channel = await getChannelOrThrow(ctx, args.channelId)
    await requireWorkspaceMember(ctx, channel.workspaceId, ctx.userId)

    const membership = await requireChannelMember(ctx, channel._id, ctx.userId)
    await ctx.db.patch(membership._id, {
      lastReadAt: Date.now(),
    })

    return { channelId: channel._id }
  },
})

export const heartbeatPresence = authMutation({
  args: {
    channelId: v.id('chatChannels'),
  },
  handler: async (ctx, args) => {
    const channel = await getChannelOrThrow(ctx, args.channelId)
    await requireWorkspaceMember(ctx, channel.workspaceId, ctx.userId)

    const membership = await requireChannelMember(ctx, channel._id, ctx.userId)
    await ctx.db.patch(membership._id, {
      lastPresenceAt: Date.now(),
    })

    return { channelId: channel._id }
  },
})

export const setTyping = authMutation({
  args: {
    channelId: v.id('chatChannels'),
    isTyping: v.boolean(),
    parentMessageId: v.optional(v.id('chatMessages')),
  },
  handler: async (ctx, args) => {
    const channel = await getChannelOrThrow(ctx, args.channelId)
    await requireWorkspaceMember(ctx, channel.workspaceId, ctx.userId)
    await requireChannelMember(ctx, channel._id, ctx.userId)

    const existing = await ctx.db
      .query('chatTyping')
      .withIndex('by_channel_user_parent', (q) =>
        q.eq('channelId', channel._id).eq('userId', ctx.userId).eq('parentMessageId', args.parentMessageId)
      )
      .unique()

    if (!args.isTyping) {
      if (existing) {
        await ctx.db.delete(existing._id)
      }
      return { channelId: channel._id, isTyping: false }
    }

    if (existing) {
      await ctx.db.patch(existing._id, { updatedAt: Date.now() })
    } else {
      await ctx.db.insert('chatTyping', {
        workspaceId: channel.workspaceId,
        channelId: channel._id,
        userId: ctx.userId,
        parentMessageId: args.parentMessageId,
        updatedAt: Date.now(),
      })
    }

    return { channelId: channel._id, isTyping: true }
  },
})

export const getChannelActivity = authQuery({
  args: {
    channelId: v.id('chatChannels'),
  },
  handler: async (ctx, args) => {
    const channel = await getChannelOrThrow(ctx, args.channelId)
    await requireWorkspaceMember(ctx, channel.workspaceId, ctx.userId)
    await requireChannelMember(ctx, channel._id, ctx.userId)

    const now = Date.now()
    const [memberships, typingRows] = await Promise.all([
      ctx.db
        .query('chatChannelMembers')
        .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
        .collect(),
      ctx.db
        .query('chatTyping')
        .withIndex('by_channel', (q) => q.eq('channelId', channel._id))
        .collect(),
    ])

    const activeMembers = await Promise.all(
      memberships
        .filter((membership) => (membership.lastPresenceAt ?? 0) >= now - ACTIVE_PRESENCE_WINDOW_MS)
        .map(async (membership) => {
          const profile = await getUserProfile(ctx, membership.userId)
          return {
            userId: membership.userId,
            displayName: profile?.displayName ?? 'Workspace member',
            avatarUrl: profile?.avatarUrl,
            lastPresenceAt: membership.lastPresenceAt ?? membership.joinedAt,
            isCurrentUser: membership.userId === ctx.userId,
          }
        })
    )

    const typingMembers = await Promise.all(
      typingRows
        .filter((row) => row.updatedAt >= now - ACTIVE_TYPING_WINDOW_MS)
        .map(async (row) => {
          const profile = await getUserProfile(ctx, row.userId)
          return {
            userId: row.userId,
            displayName: profile?.displayName ?? 'Workspace member',
            parentMessageId: row.parentMessageId,
            isCurrentUser: row.userId === ctx.userId,
          }
        })
    )

    return {
      activeMembers: activeMembers.sort((left, right) => Number(right.isCurrentUser) - Number(left.isCurrentUser) || left.displayName.localeCompare(right.displayName)),
      typingMembers,
    }
  },
})