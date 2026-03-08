/**
 * Auth Helpers - Role-Based Access Control (RBAC)
 * ================================================
 *
 * This module provides authentication and authorization helpers for Convex functions.
 *
 * ## Quick Start
 *
 * Prefer the custom function wrappers from `customFunctions.ts` which auto-inject
 * `ctx.user` and `ctx.userId`:
 *
 * ```ts
 * import { authMutation, adminMutation } from './lib/customFunctions'
 *
 * // Authenticated — ctx.user and ctx.userId are auto-injected
 * export const myMutation = authMutation({
 *   handler: async (ctx) => {
 *     console.log(ctx.user.email, ctx.userId)
 *   },
 * })
 *
 * // Admin only — ctx.user is guaranteed admin
 * export const adminOnly = adminMutation({
 *   handler: async (ctx) => {
 *     // Only admins reach this point
 *   },
 * })
 * ```
 *
 * For optional auth in public functions, use the helpers directly:
 *
 * ```ts
 * import { publicQuery } from './lib/customFunctions'
 * import { getAuthUserSafe } from './lib/authHelpers'
 *
 * export const optionalAuth = publicQuery({
 *   handler: async (ctx) => {
 *     const user = await getAuthUserSafe(ctx) // null if not logged in
 *   },
 * })
 * ```
 *
 * ## Admin Detection
 *
 * A user is considered an admin if:
 * 1. Their email is in the ADMIN_EMAILS whitelist (see config.ts), OR
 * 2. Their user record has `role: 'admin'` in the database
 *
 * ## Setup
 *
 * Add admin emails to `convex/lib/config.ts`:
 * ```ts
 * export const ADMIN_EMAILS = ['admin@example.com']
 * ```
 */

import { authComponent } from '../auth'
import { ConvexError } from 'convex/values'
import { ADMIN_EMAILS, WORKSPACE_ROLES, type WorkspaceRole } from './config'
import type { QueryCtx, MutationCtx } from '../_generated/server'
import type { Doc, Id } from '../_generated/dataModel'

/** Context type for queries and mutations */
type AuthContext = QueryCtx | MutationCtx
export type WorkspaceId = Id<'workspaces'>
export type WorkspaceDoc = Doc<'workspaces'>
export type WorkspaceMemberDoc = Doc<'workspaceMembers'>
export type UserProfileDoc = Doc<'userProfiles'>

/**
 * User type returned by Better Auth Convex adapter.
 * Extended with optional role field for RBAC.
 * Note: _id is a string because the user table is managed by the Better Auth component.
 */
export interface AuthUser {
  _id: string
  name: string
  email: string
  image?: string | null
  role?: string | null
}

/**
 * Get the authenticated user or null if not authenticated.
 *
 * @param ctx - Convex query or mutation context
 * @returns The authenticated user or null
 */
export async function getAuthUser(ctx: AuthContext): Promise<AuthUser | null> {
  const user = await authComponent.getAuthUser(ctx)
  return user as AuthUser | null
}

/**
 * Get the authenticated user without throwing.
 * Returns null on any error (important for SSR where auth may not be available).
 *
 * @param ctx - Convex query or mutation context
 * @returns The authenticated user or null
 */
export async function getAuthUserSafe(ctx: AuthContext): Promise<AuthUser | null> {
  try {
    return await getAuthUser(ctx)
  } catch {
    return null
  }
}

/**
 * Require authentication. Throws if not authenticated.
 *
 * @param ctx - Convex query or mutation context
 * @returns The authenticated user (never null)
 * @throws Error if user is not authenticated
 */
export async function requireAuth(ctx: AuthContext): Promise<AuthUser> {
  const user = await getAuthUser(ctx)
  if (!user) {
    throw new Error('Authentication required')
  }
  return user
}

/**
 * Check if a user has admin privileges.
 *
 * Admin status is determined by:
 * 1. Email whitelist (ADMIN_EMAILS in config.ts)
 * 2. Role field on user record (role === 'admin')
 *
 * @param user - The user to check
 * @returns true if user is an admin
 */
export function isAdmin(user: AuthUser): boolean {
  // Check email whitelist first (for easy setup)
  if (user.email && ADMIN_EMAILS.includes(user.email)) {
    return true
  }
  // Fallback to role field in database
  return user.role === 'admin'
}

/**
 * Require admin role. Throws if not an admin.
 *
 * @param ctx - Convex query or mutation context
 * @returns The authenticated admin user
 * @throws Error if user is not authenticated or not an admin
 */
export async function requireAdmin(ctx: AuthContext): Promise<AuthUser> {
  const user = await requireAuth(ctx)
  if (!isAdmin(user)) {
    throw new Error('Admin access required')
  }
  return user
}

export async function getUserProfile(
  ctx: AuthContext,
  userId: string
): Promise<UserProfileDoc | null> {
  return await ctx.db.query('userProfiles').withIndex('by_user_id', (q) => q.eq('userId', userId)).unique()
}

export async function getCurrentUserProfile(ctx: AuthContext): Promise<UserProfileDoc | null> {
  const user = await requireAuth(ctx)
  return await getUserProfile(ctx, user._id)
}

export async function ensureUserProfile(ctx: MutationCtx, user: AuthUser): Promise<UserProfileDoc> {
  const existing = await getUserProfile(ctx, user._id)
  const now = Date.now()

  if (existing) {
    await ctx.db.patch(existing._id, {
      displayName: user.name,
      avatarUrl: user.image ?? undefined,
      updatedAt: now,
    })

    return {
      ...existing,
      displayName: user.name,
      avatarUrl: user.image ?? undefined,
      updatedAt: now,
    }
  }

  const profileId = await ctx.db.insert('userProfiles', {
    userId: user._id,
    username: undefined,
    displayName: user.name,
    avatarUrl: user.image ?? undefined,
    createdAt: now,
    updatedAt: now,
  })

  const profile = await ctx.db.get(profileId)
  if (!profile) {
    throw new ConvexError('Failed to create user profile')
  }

  return profile
}

export async function getWorkspaceMember(
  ctx: AuthContext,
  workspaceId: WorkspaceId,
  userId: string
): Promise<WorkspaceMemberDoc | null> {
  return await ctx.db
    .query('workspaceMembers')
    .withIndex('by_workspace_user', (q) => q.eq('workspaceId', workspaceId).eq('userId', userId))
    .unique()
}

export async function requireWorkspaceMember(
  ctx: AuthContext,
  workspaceId: WorkspaceId,
  userId?: string
): Promise<WorkspaceMemberDoc> {
  const resolvedUserId = userId ?? (await requireAuth(ctx))._id
  const membership = await getWorkspaceMember(ctx, workspaceId, resolvedUserId)

  if (!membership) {
    throw new ConvexError('Workspace membership required')
  }

  return membership
}

export async function requireWorkspaceRole(
  ctx: AuthContext,
  workspaceId: WorkspaceId,
  allowedRoles: WorkspaceRole[],
  userId?: string
): Promise<WorkspaceMemberDoc> {
  const membership = await requireWorkspaceMember(ctx, workspaceId, userId)
  if (!allowedRoles.includes(membership.role)) {
    throw new ConvexError('Insufficient workspace permissions')
  }
  return membership
}

export async function requireWorkspaceAdmin(
  ctx: AuthContext,
  workspaceId: WorkspaceId,
  userId?: string
): Promise<WorkspaceMemberDoc> {
  return await requireWorkspaceRole(ctx, workspaceId, [WORKSPACE_ROLES.OWNER, WORKSPACE_ROLES.ADMIN], userId)
}

export async function getActiveWorkspace(
  ctx: AuthContext,
  userId?: string
): Promise<WorkspaceDoc | null> {
  const resolvedUserId = userId ?? (await requireAuth(ctx))._id
  const profile = await getUserProfile(ctx, resolvedUserId)

  if (profile?.activeWorkspaceId) {
    return await ctx.db.get(profile.activeWorkspaceId)
  }

  const membership = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_user', (q) => q.eq('userId', resolvedUserId))
    .first()

  if (!membership) {
    return null
  }

  return await ctx.db.get(membership.workspaceId)
}

export async function requireActiveWorkspace(
  ctx: AuthContext,
  userId?: string
): Promise<WorkspaceDoc> {
  const workspace = await getActiveWorkspace(ctx, userId)
  if (!workspace) {
    throw new ConvexError('No active workspace found')
  }
  return workspace
}
