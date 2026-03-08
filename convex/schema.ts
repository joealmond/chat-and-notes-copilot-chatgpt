import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  userProfiles: defineTable({
    userId: v.string(),
    username: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    activeWorkspaceId: v.optional(v.id('workspaces')),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index('by_user_id', ['userId'])
    .index('by_username', ['username'])
    .index('by_active_workspace', ['activeWorkspaceId']),

  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.string(),
    createdBy: v.string(),
    archivedAt: v.optional(v.number()),
    description: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index('by_slug', ['slug'])
    .index('by_owner', ['ownerId']),

  workspaceMembers: defineTable({
    workspaceId: v.id('workspaces'),
    userId: v.string(),
    role: v.union(v.literal('owner'), v.literal('admin'), v.literal('member')),
    joinedAt: v.number(),
    invitedBy: v.optional(v.string()),
    lastViewedAt: v.optional(v.number()),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_user', ['userId'])
    .index('by_workspace_user', ['workspaceId', 'userId']),

  notes: defineTable({
    workspaceId: v.id('workspaces'),
    parentId: v.optional(v.id('notes')),
    sortOrder: v.optional(v.number()),
    title: v.string(),
    slug: v.string(),
    contentMarkdown: v.string(),
    excerpt: v.optional(v.string()),
    isPublished: v.boolean(),
    publishedAt: v.optional(v.number()),
    archivedAt: v.optional(v.number()),
    createdBy: v.string(),
    updatedBy: v.string(),
    lastEditedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_workspace_parent', ['workspaceId', 'parentId'])
    .index('by_workspace_slug', ['workspaceId', 'slug'])
    .index('by_author_slug', ['createdBy', 'slug']),

  chatChannels: defineTable({
    workspaceId: v.id('workspaces'),
    kind: v.union(v.literal('channel'), v.literal('dm')),
    name: v.string(),
    slug: v.string(),
    topic: v.optional(v.string()),
    dmKey: v.optional(v.string()),
    createdBy: v.string(),
    archivedAt: v.optional(v.number()),
    lastMessageAt: v.number(),
  })
    .index('by_workspace_kind', ['workspaceId', 'kind'])
    .index('by_workspace_slug', ['workspaceId', 'slug'])
    .index('by_workspace_dm_key', ['workspaceId', 'dmKey']),

  chatChannelMembers: defineTable({
    workspaceId: v.id('workspaces'),
    channelId: v.id('chatChannels'),
    userId: v.string(),
    joinedAt: v.number(),
    lastReadAt: v.optional(v.number()),
    lastPresenceAt: v.optional(v.number()),
  })
    .index('by_channel', ['channelId'])
    .index('by_channel_user', ['channelId', 'userId'])
    .index('by_workspace_user', ['workspaceId', 'userId']),

  chatTyping: defineTable({
    workspaceId: v.id('workspaces'),
    channelId: v.id('chatChannels'),
    userId: v.string(),
    parentMessageId: v.optional(v.id('chatMessages')),
    updatedAt: v.number(),
  })
    .index('by_channel', ['channelId'])
    .index('by_channel_user_parent', ['channelId', 'userId', 'parentMessageId']),

  chatMessages: defineTable({
    workspaceId: v.id('workspaces'),
    channelId: v.id('chatChannels'),
    parentMessageId: v.optional(v.id('chatMessages')),
    body: v.string(),
    authorId: v.string(),
    authorName: v.string(),
    authorImage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index('by_channel', ['channelId'])
    .index('by_channel_parent', ['channelId', 'parentMessageId'])
    .index('by_workspace', ['workspaceId']),

  // Example messages table for Hello World demo
  // Uses built-in _creationTime instead of manual createdAt
  messages: defineTable({
    content: v.string(),
    authorId: v.optional(v.string()),
    authorName: v.optional(v.string()),
    // Legacy field — kept optional for backward compatibility with existing data
    createdAt: v.optional(v.number()),
  }),

  // File uploads example
  files: defineTable({
    storageId: v.id('_storage'),
    name: v.string(),
    type: v.string(),
    size: v.number(),
    uploadedBy: v.optional(v.string()),
    // Legacy field — kept optional for backward compatibility with existing data
    createdAt: v.optional(v.number()),
  }).index('by_uploader', ['uploadedBy']),
})
