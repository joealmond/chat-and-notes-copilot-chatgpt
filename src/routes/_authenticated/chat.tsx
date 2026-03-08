import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '@convex/_generated/api'
import { useConvexMutation } from '@/lib/patterns/useConvexMutation'
import { cn } from '@/lib/cn'
import { formatRelativeTime } from '@/lib/utils'
import { Circle, Hash, Loader2, MessageSquareText, Plus, Search, Send, Users2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Id } from '@convex/_generated/dataModel'

export const Route = createFileRoute('/_authenticated/chat')({
  component: ChatPage,
})

function ChatPage() {
  const [selectedChannelId, setSelectedChannelId] = useState<Id<'chatChannels'> | null>(null)
  const [selectedThreadId, setSelectedThreadId] = useState<Id<'chatMessages'> | null>(null)
  const [newChannelName, setNewChannelName] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [messageDraft, setMessageDraft] = useState('')
  const [threadDraft, setThreadDraft] = useState('')
  const [optimisticMessages, setOptimisticMessages] = useState<Array<OptimisticMessage>>([])
  const [optimisticReplies, setOptimisticReplies] = useState<Array<OptimisticMessage>>([])
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const threadTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const bootstrapQuery = useQuery(convexQuery(api.chat.bootstrap, {}))
  const activityQuery = useQuery({
    ...convexQuery(api.chat.getChannelActivity, selectedChannelId ? { channelId: selectedChannelId } : { channelId: undefined as never }),
    enabled: !!selectedChannelId,
    refetchInterval: 4000,
  })
  const createChannel = useConvexMutation(api.chat.createChannel, { showSuccessToast: false })
  const openDirectMessage = useConvexMutation(api.chat.openDirectMessage, { showSuccessToast: false })
  const sendMessage = useConvexMutation(api.chat.sendMessage, { showSuccessToast: false, showErrorToast: true })
  const markRead = useConvexMutation(api.chat.markRead, { showSuccessToast: false, showErrorToast: false })
  const heartbeatPresence = useConvexMutation(api.chat.heartbeatPresence, { showSuccessToast: false, showErrorToast: false })
  const setTyping = useConvexMutation(api.chat.setTyping, { showSuccessToast: false, showErrorToast: false })

  const channels = bootstrapQuery.data?.channels ?? []
  const directMessages = bootstrapQuery.data?.directMessages ?? []
  const members = bootstrapQuery.data?.members ?? []
  const activeChannel = [...channels, ...directMessages].find((channel) => channel._id === selectedChannelId) ?? null
  const normalizedChannelFilter = channelFilter.trim().toLowerCase()

  const filteredChannels = useMemo(
    () => channels.filter((channel) => [channel.name, channel.topic ?? ''].join(' ').toLowerCase().includes(normalizedChannelFilter)),
    [channels, normalizedChannelFilter]
  )
  const filteredDirectMessages = useMemo(
    () => directMessages.filter((channel) => channel.name.toLowerCase().includes(normalizedChannelFilter)),
    [directMessages, normalizedChannelFilter]
  )
  const filteredMembers = useMemo(
    () => members.filter((member) => [member.displayName, member.username ?? '', member.role].join(' ').toLowerCase().includes(normalizedChannelFilter)),
    [members, normalizedChannelFilter]
  )

  const messagesQuery = useQuery({
    ...convexQuery(api.chat.listMessages, selectedChannelId ? { channelId: selectedChannelId } : { channelId: undefined as never }),
    enabled: !!selectedChannelId,
  })
  const threadQuery = useQuery({
    ...convexQuery(
      api.chat.getThread,
      selectedChannelId && selectedThreadId
        ? { channelId: selectedChannelId, parentMessageId: selectedThreadId }
        : { channelId: undefined as never, parentMessageId: undefined as never }
    ),
    enabled: !!selectedChannelId && !!selectedThreadId,
  })

  useEffect(() => {
    if (!selectedChannelId) {
      const initialChannel = channels[0]?._id ?? directMessages[0]?._id ?? null
      if (initialChannel) {
        setSelectedChannelId(initialChannel)
      }
      return
    }

    const exists = [...channels, ...directMessages].some((channel) => channel._id === selectedChannelId)
    if (!exists) {
      setSelectedChannelId(channels[0]?._id ?? directMessages[0]?._id ?? null)
    }
  }, [channels, directMessages, selectedChannelId])

  useEffect(() => {
    if (!selectedChannelId) {
      return
    }

    void markRead.execute({ channelId: selectedChannelId }).then(() => {
      void bootstrapQuery.refetch()
    })
  }, [selectedChannelId])

  useEffect(() => {
    if (!selectedChannelId) {
      return
    }

    void heartbeatPresence.execute({ channelId: selectedChannelId })
    const interval = setInterval(() => {
      void heartbeatPresence.execute({ channelId: selectedChannelId })
    }, 25000)

    return () => {
      clearInterval(interval)
    }
  }, [heartbeatPresence, selectedChannelId])

  useEffect(() => {
    if (!selectedChannelId) {
      return
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    void setTyping.execute({ channelId: selectedChannelId, isTyping: Boolean(messageDraft.trim()) })

    if (messageDraft.trim()) {
      typingTimeoutRef.current = setTimeout(() => {
        void setTyping.execute({ channelId: selectedChannelId, isTyping: false })
      }, 1800)
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
    }
  }, [messageDraft, selectedChannelId, setTyping])

  useEffect(() => {
    if (!selectedChannelId || !selectedThreadId) {
      return
    }

    if (threadTypingTimeoutRef.current) {
      clearTimeout(threadTypingTimeoutRef.current)
    }

    void setTyping.execute({
      channelId: selectedChannelId,
      parentMessageId: selectedThreadId,
      isTyping: Boolean(threadDraft.trim()),
    })

    if (threadDraft.trim()) {
      threadTypingTimeoutRef.current = setTimeout(() => {
        void setTyping.execute({
          channelId: selectedChannelId,
          parentMessageId: selectedThreadId,
          isTyping: false,
        })
      }, 1800)
    }

    return () => {
      if (threadTypingTimeoutRef.current) {
        clearTimeout(threadTypingTimeoutRef.current)
      }
    }
  }, [threadDraft, selectedChannelId, selectedThreadId, setTyping])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedThreadId(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [])

  const mergedMessages = useMemo(() => {
    const base = messagesQuery.data ?? []
    const pending = optimisticMessages.filter((message) => message.channelId === selectedChannelId)
    return [...base, ...pending]
  }, [messagesQuery.data, optimisticMessages, selectedChannelId])

  const mergedReplies = useMemo(() => {
    const base = threadQuery.data ?? []
    const pending = optimisticReplies.filter((message) => message.parentMessageId === selectedThreadId)
    return [...base, ...pending]
  }, [threadQuery.data, optimisticReplies, selectedThreadId])

  const selectedThreadMessage = mergedMessages.find((message) => message._id === selectedThreadId) ?? null
  const activeMembers = activityQuery.data?.activeMembers ?? []
  const typingMembers = activityQuery.data?.typingMembers ?? []
  const channelTypingMembers = typingMembers.filter((member) => !member.parentMessageId && !member.isCurrentUser)
  const threadTypingMembers = typingMembers.filter((member) => member.parentMessageId === selectedThreadId && !member.isCurrentUser)

  const handleCreateChannel = async () => {
    const name = newChannelName.trim()
    if (!name) {
      return
    }

    const result = await createChannel.execute({ name })
    setNewChannelName('')
    await bootstrapQuery.refetch()
    if (result?._id) {
      setSelectedChannelId(result._id)
    }
  }

  const handleOpenDm = async (targetUserId: string) => {
    const result = await openDirectMessage.execute({ targetUserId })
    await bootstrapQuery.refetch()
    if (result?._id) {
      setSelectedChannelId(result._id)
    }
  }

  const handleSendMessage = async () => {
    if (!selectedChannelId || !messageDraft.trim()) {
      return
    }

    const optimisticId = `optimistic-${Date.now()}`
    const optimisticMessage: OptimisticMessage = {
      _id: optimisticId,
      channelId: selectedChannelId,
      body: messageDraft.trim(),
      authorName: 'You',
      authorId: bootstrapQuery.data?.currentUserId ?? 'self',
      createdAt: Date.now(),
      replyCount: 0,
    }

    setOptimisticMessages((current) => [...current, optimisticMessage])
    const nextDraft = messageDraft
    setMessageDraft('')

    try {
      await sendMessage.execute({ channelId: selectedChannelId, body: nextDraft })
      setOptimisticMessages((current) => current.filter((message) => message._id !== optimisticId))
      await Promise.all([bootstrapQuery.refetch(), messagesQuery.refetch()])
    } catch {
      setOptimisticMessages((current) => current.filter((message) => message._id !== optimisticId))
      setMessageDraft(nextDraft)
    }
  }

  const handleSendReply = async () => {
    if (!selectedChannelId || !selectedThreadId || !threadDraft.trim()) {
      return
    }

    const optimisticId = `optimistic-reply-${Date.now()}`
    const optimisticReply: OptimisticMessage = {
      _id: optimisticId,
      channelId: selectedChannelId,
      parentMessageId: selectedThreadId,
      body: threadDraft.trim(),
      authorName: 'You',
      authorId: bootstrapQuery.data?.currentUserId ?? 'self',
      createdAt: Date.now(),
    }

    setOptimisticReplies((current) => [...current, optimisticReply])
    const nextDraft = threadDraft
    setThreadDraft('')

    try {
      await sendMessage.execute({ channelId: selectedChannelId, body: nextDraft, parentMessageId: selectedThreadId })
      setOptimisticReplies((current) => current.filter((message) => message._id !== optimisticId))
      await Promise.all([messagesQuery.refetch(), threadQuery.refetch(), bootstrapQuery.refetch()])
    } catch {
      setOptimisticReplies((current) => current.filter((message) => message._id !== optimisticId))
      setThreadDraft(nextDraft)
    }
  }

  if (bootstrapQuery.isLoading) {
    return <ChatLoadingState />
  }

  if (!bootstrapQuery.data) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        No active workspace is available. Create one in the Notes view first.
      </div>
    )
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)_320px]">
      <aside className="flex min-h-0 flex-col border-r border-border bg-panel">
        <div className="border-b border-border px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Workspace chat</p>
          <h1 className="mt-1 text-sm font-semibold text-foreground">{bootstrapQuery.data.workspace.name}</h1>
          <div className="mt-3 flex gap-2">
            <input
              value={newChannelName}
              onChange={(event) => setNewChannelName(event.target.value)}
              placeholder="new channel"
              className="min-w-0 flex-1 border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-ring"
            />
            <button
              type="button"
              onClick={handleCreateChannel}
              disabled={createChannel.isLoading}
              className="inline-flex h-10 w-10 items-center justify-center border border-border text-foreground transition hover:bg-panel-muted disabled:opacity-60"
            >
              {createChannel.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            </button>
          </div>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={channelFilter}
              onChange={(event) => setChannelFilter(event.target.value)}
              placeholder="Filter channels, DMs, or teammates"
              className="w-full border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-ring"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
          <SidebarSection title="Channels">
            {filteredChannels.length ? filteredChannels.map((channel) => (
              <SidebarRow
                key={channel._id}
                active={channel._id === selectedChannelId}
                onClick={() => {
                  setSelectedChannelId(channel._id)
                  setSelectedThreadId(null)
                }}
                icon={<Hash className="h-4 w-4" />}
                label={channel.name}
                meta={channel.unreadCount ? `${channel.unreadCount} unread` : channel.topic}
                badge={channel.unreadCount}
              />
            )) : <EmptySidebarState label="No channels yet" />}
          </SidebarSection>

          <SidebarSection title="Direct messages">
            {filteredDirectMessages.length ? filteredDirectMessages.map((channel) => (
              <SidebarRow
                key={channel._id}
                active={channel._id === selectedChannelId}
                onClick={() => {
                  setSelectedChannelId(channel._id)
                  setSelectedThreadId(null)
                }}
                icon={<MessageSquareText className="h-4 w-4" />}
                label={channel.name}
                meta={channel.unreadCount ? `${channel.unreadCount} unread` : undefined}
                badge={channel.unreadCount}
              />
            )) : <EmptySidebarState label="No DMs yet" />}
          </SidebarSection>

          <SidebarSection title="Start a DM">
            {filteredMembers.length ? filteredMembers.map((member) => (
              <SidebarRow
                key={member.userId}
                active={false}
                onClick={() => handleOpenDm(member.userId)}
                icon={<Users2 className="h-4 w-4" />}
                label={member.displayName}
                meta={member.username ? `@${member.username}` : member.role}
              />
            )) : <EmptySidebarState label="No teammates found" />}
          </SidebarSection>
        </div>
      </aside>

      <section className="flex min-h-0 flex-col border-r border-border bg-background">
        <div className="border-b border-border px-5 py-4">
          {activeChannel ? (
            <>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                {activeChannel.kind === 'channel' ? 'Channel' : 'Direct message'}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">{activeChannel.kind === 'channel' ? `# ${activeChannel.name}` : activeChannel.name}</h2>
              <p className="mt-1 text-xs text-muted-foreground">Optimistic delivery is enabled while Convex sync completes.</p>
              {activeMembers.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeMembers.map((member) => (
                    <span key={member.userId} className="inline-flex items-center gap-2 border border-border bg-panel px-2 py-1 text-xs text-foreground">
                      <Circle className="h-2.5 w-2.5 fill-current text-emerald-400" />
                      {member.isCurrentUser ? 'You' : member.displayName}
                    </span>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Choose a channel to begin.</div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {activeChannel ? (
            mergedMessages.length ? (
              <div className="space-y-3">
                {mergedMessages.map((message) => (
                  <button
                    key={message._id}
                    type="button"
                    onClick={() => setSelectedThreadId(message._id as Id<'chatMessages'>)}
                    className={cn(
                      'block w-full border border-border bg-panel px-4 py-4 text-left transition hover:bg-panel-muted',
                      selectedThreadId === message._id && 'bg-panel-muted'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{message.authorName}</p>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{message.body}</p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <div>{formatRelativeTime(message.createdAt)}</div>
                        {message.replyCount ? <div className="mt-1">{message.replyCount} repl{message.replyCount === 1 ? 'y' : 'ies'}</div> : null}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex h-full items-center justify-center border border-dashed border-border bg-panel-muted px-6 py-12 text-sm text-muted-foreground">
                No messages yet. Start the conversation.
              </div>
            )
          ) : null}
        </div>

        <div className="border-t border-border px-5 py-4">
          {channelTypingMembers.length ? (
            <div className="mb-3 text-xs text-muted-foreground">
              {channelTypingMembers.map((member) => member.displayName).join(', ')} typing...
            </div>
          ) : null}
          <div className="flex gap-2">
            <input
              value={messageDraft}
              onChange={(event) => setMessageDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleSendMessage()
                }
              }}
              placeholder={activeChannel ? 'Send a message…' : 'Choose a channel first'}
              disabled={!activeChannel || sendMessage.isLoading}
              className="min-w-0 flex-1 border border-border bg-panel px-3 py-3 text-sm text-foreground outline-none transition focus:border-ring disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSendMessage}
              disabled={!activeChannel || !messageDraft.trim() || sendMessage.isLoading}
              className="inline-flex h-12 w-12 items-center justify-center border border-border text-foreground transition hover:bg-panel-muted disabled:opacity-60"
            >
              {sendMessage.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col bg-panel-muted">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Thread</p>
              <h2 className="mt-1 text-sm font-semibold text-foreground">{selectedThreadMessage ? 'Replies' : 'Select a message'}</h2>
              {selectedThreadMessage?.replyCount ? (
                <p className="mt-1 text-xs text-muted-foreground">{selectedThreadMessage.replyCount} repl{selectedThreadMessage.replyCount === 1 ? 'y' : 'ies'}</p>
              ) : null}
            </div>
            {selectedThreadMessage ? (
              <button
                type="button"
                onClick={() => setSelectedThreadId(null)}
                className="inline-flex h-8 w-8 items-center justify-center border border-border text-muted-foreground transition hover:bg-background hover:text-foreground"
                title="Close thread"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          {selectedThreadMessage ? (
            <div className="space-y-4">
              <div className="border border-border bg-panel px-4 py-4">
                <p className="text-sm font-medium text-foreground">{selectedThreadMessage.authorName}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{selectedThreadMessage.body}</p>
              </div>
              <div className="space-y-3">
                {mergedReplies.length ? mergedReplies.map((message) => (
                  <div key={message._id} className="border border-border bg-background px-4 py-4">
                    <p className="text-sm font-medium text-foreground">{message.authorName}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{message.body}</p>
                  </div>
                )) : (
                  <div className="border border-dashed border-border bg-background px-4 py-8 text-center text-sm text-muted-foreground">
                    No replies yet.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center border border-dashed border-border bg-background px-6 py-12 text-sm text-muted-foreground">
              Pick any message to open its thread.
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-4">
          {threadTypingMembers.length ? (
            <div className="mb-3 text-xs text-muted-foreground">
              {threadTypingMembers.map((member) => member.displayName).join(', ')} typing in thread...
            </div>
          ) : null}
          <div className="flex gap-2">
            <input
              value={threadDraft}
              onChange={(event) => setThreadDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void handleSendReply()
                }
              }}
              placeholder={selectedThreadMessage ? 'Reply in thread…' : 'Choose a message first'}
              disabled={!selectedThreadMessage || sendMessage.isLoading}
              className="min-w-0 flex-1 border border-border bg-panel px-3 py-3 text-sm text-foreground outline-none transition focus:border-ring disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleSendReply}
              disabled={!selectedThreadMessage || !threadDraft.trim() || sendMessage.isLoading}
              className="inline-flex h-12 w-12 items-center justify-center border border-border text-foreground transition hover:bg-background disabled:opacity-60"
            >
              {sendMessage.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>
    </div>
  )
}

type OptimisticMessage = {
  _id: string
  channelId: Id<'chatChannels'>
  parentMessageId?: Id<'chatMessages'>
  body: string
  authorName: string
  authorId: string
  createdAt: number
  replyCount?: number
}

function ChatLoadingState() {
  return (
    <div className="grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)_320px]">
      <div className="animate-pulse border-r border-border bg-panel" />
      <div className="animate-pulse border-r border-border bg-background" />
      <div className="animate-pulse bg-panel-muted" />
    </div>
  )
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <p className="mb-2 px-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground">{title}</p>
      <div className="space-y-1">{children}</div>
    </section>
  )
}

function SidebarRow({
  active,
  onClick,
  icon,
  label,
  meta,
  badge,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  meta?: string
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-start gap-3 border border-transparent px-3 py-3 text-left transition hover:border-border hover:bg-panel-muted',
        active && 'border-border bg-background'
      )}
    >
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">{label}</span>
        {meta ? <span className="block truncate text-xs text-muted-foreground">{meta}</span> : null}
      </span>
      {badge ? (
        <span className="inline-flex min-w-6 items-center justify-center border border-border bg-background px-1.5 py-0.5 text-[11px] text-foreground">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

function EmptySidebarState({ label }: { label: string }) {
  return <div className="border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">{label}</div>
}