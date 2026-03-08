import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { convexQuery } from '@convex-dev/react-query'
import { api } from '@convex/_generated/api'
import { Copy, ExternalLink, Globe, NotebookPen, TimerReset } from 'lucide-react'
import { toast } from 'sonner'
import { formatRelativeTime } from '@/lib/utils'

export const Route = createFileRoute('/_authenticated/site')({
  component: SitePage,
})

function SitePage() {
  const publishingOverviewQuery = useQuery(convexQuery(api.notes.publishingOverview, {}))

  const handleCopyLink = async (publicPath: string) => {
    try {
      await navigator.clipboard.writeText(window.location.origin + publicPath)
      toast.success('Public link copied')
    } catch {
      toast.error('Failed to copy public link')
    }
  }

  if (publishingOverviewQuery.isLoading) {
    return (
      <div className="grid h-full min-h-0 gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-8">
        <div className="animate-pulse border border-border bg-panel" />
        <div className="animate-pulse border border-border bg-panel-muted" />
      </div>
    )
  }

  const overview = publishingOverviewQuery.data
  const username = overview?.username
  const publishedNotes = overview?.publishedNotes ?? []

  return (
    <div className="grid h-full min-h-0 gap-4 p-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:p-8">
      <section className="border border-border bg-panel">
        <div className="border-b border-border px-5 py-4">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Public Site Manager</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Published notes</h1>
          <p className="mt-2 text-sm text-muted-foreground">Review public URLs, metadata, and lightweight publishing stats before sharing notes externally.</p>
        </div>

        <div className="p-5">
          {publishedNotes.length ? (
            <div className="space-y-3">
              {publishedNotes.map((note) => {
                const publicPath = username ? `/u/${username}/${note.slug}` : null

                return (
                  <div key={note._id} className="border border-border bg-background px-4 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-base font-medium text-foreground">{note.title}</h2>
                        <p className="mt-1 text-sm leading-6 text-muted-foreground">{note.excerpt || 'No excerpt yet.'}</p>
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                          <span>Slug: {note.slug}</span>
                          <span>Updated {formatRelativeTime(note.lastEditedAt)}</span>
                          {note.publishedAt ? <span>Published {formatRelativeTime(note.publishedAt)}</span> : null}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1 border border-border bg-panel px-2 py-1">
                            <NotebookPen className="h-3.5 w-3.5" />
                            {note.wordCount} words
                          </span>
                          <span className="inline-flex items-center gap-1 border border-border bg-panel px-2 py-1">
                            <TimerReset className="h-3.5 w-3.5" />
                            {note.readingMinutes || 1} min read
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        {publicPath ? (
                          <>
                            <Link
                              to={publicPath}
                              className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm text-foreground transition hover:bg-panel-muted"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Open
                            </Link>
                            <button
                              type="button"
                              onClick={() => handleCopyLink(publicPath)}
                              className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm text-foreground transition hover:bg-panel-muted"
                            >
                              <Copy className="h-4 w-4" />
                              Copy link
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="border border-dashed border-border bg-background px-5 py-12 text-center text-sm text-muted-foreground">
              No published notes yet. Publish a note from the Notes surface to make it appear here.
            </div>
          )}
        </div>
      </section>

      <aside className="border border-border bg-panel-muted p-5">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Routing model</p>
        <div className="mt-3 border border-border bg-panel px-3 py-3 font-mono text-xs text-foreground">
          /u/username/note-slug
        </div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          Public notes render as read-only markdown pages backed by a Convex public query and served through the same TanStack Start app.
        </p>
        <div className="mt-5 border border-border bg-panel px-4 py-4 text-sm">
          <div className="flex items-center gap-2 text-foreground">
            <Globe className="h-4 w-4" />
            Public username
          </div>
          <p className="mt-2 break-all text-muted-foreground">{username ?? 'Not configured yet'}</p>
        </div>
        <div className="mt-4 border border-border bg-panel px-4 py-4 text-sm text-muted-foreground">
          <div className="text-foreground">Published count</div>
          <div className="mt-2 text-2xl font-semibold text-foreground">{publishedNotes.length}</div>
        </div>
      </aside>
    </div>
  )
}