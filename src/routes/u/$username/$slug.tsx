import { createFileRoute, Link } from '@tanstack/react-router'
import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { ArrowLeft, Copy, Hash, TimerReset } from 'lucide-react'
import { api } from '@convex/_generated/api'
import { MarkdownPreview } from '@/components/notes/MarkdownPreview'
import { formatRelativeTime } from '@/lib/utils'
import { getHeadingOutline, getReadingMinutes, getWordCount } from '@/lib/note-metadata'
import { toast } from 'sonner'

export const Route = createFileRoute('/u/$username/$slug')({
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(
      convexQuery(api.notes.resolvePublished, {
        username: params.username,
        slug: params.slug,
      })
    )
  },
  component: PublicNotePage,
})

function PublicNotePage() {
  const { username, slug } = Route.useParams()
  const { data } = useSuspenseQuery(
    convexQuery(api.notes.resolvePublished, {
      username,
      slug,
    })
  )

  const headingOutline = getHeadingOutline(data?.note.contentMarkdown ?? '')
  const wordCount = getWordCount(data?.note.contentMarkdown ?? '')
  const readingMinutes = getReadingMinutes(data?.note.contentMarkdown ?? '')

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      toast.success('Public link copied')
    } catch {
      toast.error('Failed to copy link')
    }
  }

  if (!data) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Public note</p>
        <h1 className="mt-3 text-4xl font-semibold text-foreground">Not found</h1>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          This note is unavailable or no longer published.
        </p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center gap-2 border border-border px-4 py-3 text-sm text-foreground transition hover:bg-panel-muted">
            <ArrowLeft className="h-4 w-4" />
            Return home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10 text-foreground lg:px-10 lg:py-14">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="mb-6 border border-border bg-panel p-6">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Published note</p>
                <h1 className="mt-2 text-4xl font-semibold tracking-tight text-foreground">{data.note.title}</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                  {data.note.excerpt || 'A published markdown note from the shared workspace.'}
                </p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1">@{data.profile.username}</span>
                  <span className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1">
                    <TimerReset className="h-3.5 w-3.5" />
                    {readingMinutes || 1} min read
                  </span>
                  <span className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1">
                    <Hash className="h-3.5 w-3.5" />
                    {wordCount} words
                  </span>
                  <span className="inline-flex items-center gap-1 border border-border bg-background px-2 py-1">
                    updated {formatRelativeTime(data.note.lastEditedAt)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-2 border border-border px-4 py-3 text-sm text-foreground transition hover:bg-panel-muted"
                >
                  <Copy className="h-4 w-4" />
                  Copy link
                </button>
                <Link to="/" className="inline-flex items-center gap-2 border border-border px-4 py-3 text-sm text-foreground transition hover:bg-panel-muted">
                  <ArrowLeft className="h-4 w-4" />
                  Home
                </Link>
              </div>
            </div>

            <div className="mt-6 min-h-[540px] border border-border bg-background p-5">
              <MarkdownPreview markdown={data.note.contentMarkdown} />
            </div>
          </div>
        </div>

        <aside className="h-fit border border-border bg-panel-muted p-5">
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Outline</p>
          {headingOutline.length ? (
            <div className="mt-4 space-y-2">
              {headingOutline.map((heading, index) => (
                <div
                  key={`${heading.title}-${index}`}
                  className="border border-border bg-panel px-3 py-3 text-sm text-foreground"
                  style={{ marginLeft: `${(heading.level - 1) * 10}px` }}
                >
                  {heading.title}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 border border-dashed border-border bg-panel px-4 py-8 text-sm text-muted-foreground">
              No headings in this note yet.
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}