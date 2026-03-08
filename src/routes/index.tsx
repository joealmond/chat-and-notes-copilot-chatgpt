import { createFileRoute, Link } from '@tanstack/react-router'
import { useSession, signIn, signOut } from '@/lib/auth-client'
import { ArrowRight, BookOpenText, Globe, LogIn, LogOut, MessageSquareText } from 'lucide-react'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const { data: session, isPending: isSessionLoading } = useSession()

  const handleSignIn = () => {
    signIn.social({ provider: 'google' })
  }

  const handleSignOut = () => {
    signOut()
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 lg:px-8">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Workspace OS</p>
            <h1 className="text-sm font-semibold text-foreground">
              Notes, chat, and publishing on one shell
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {session?.user ? (
              <>
                <Link
                  to="/notes"
                  className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm text-foreground transition hover:bg-panel-muted"
                >
                  Enter workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm text-muted-foreground transition hover:bg-panel-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleSignIn}
                disabled={isSessionLoading}
                className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm text-foreground transition hover:bg-panel-muted disabled:opacity-60"
              >
                <LogIn className="h-4 w-4" />
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8 lg:py-14">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <div className="border border-border bg-panel">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Core stack</p>
            </div>
            <div className="space-y-6 px-5 py-6 lg:px-8 lg:py-8">
              <div className="space-y-4">
                <h2 className="max-w-3xl text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">
                  A desktop-style workspace for markdown notes, real-time chat, and public publishing.
                </h2>
                <p className="max-w-2xl text-base leading-7 text-muted-foreground">
                  The first implementation slice replaces the starter template with the persistent application shell and the strict dark design system this product will grow on.
                </p>
              </div>

              <div className="grid gap-px border border-border bg-border sm:grid-cols-3">
                <FeatureCard
                  icon={BookOpenText}
                  title="Notes"
                  description="Markdown-native notes with a nested tree and live editing surface."
                />
                <FeatureCard
                  icon={MessageSquareText}
                  title="Chat"
                  description="Workspace channels, DMs, and threads with optimistic updates."
                />
                <FeatureCard
                  icon={Globe}
                  title="Publishing"
                  description="Per-note public URLs served through cached SSR on Cloudflare Workers."
                />
              </div>
            </div>
          </div>

          <aside className="border border-border bg-panel-muted">
            <div className="border-b border-border px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-muted-foreground">Build status</p>
            </div>
            <div className="space-y-5 px-5 py-6 text-sm text-muted-foreground">
              <div className="border border-border bg-panel px-4 py-4">
                <p className="font-medium uppercase tracking-[0.18em] text-foreground">Current ticket</p>
                <p className="mt-2 leading-6">
                  Shell and design foundation. Notes, publishing, and chat routes are now treated as app surfaces instead of demo pages.
                </p>
              </div>
              <div className="space-y-3">
                <StatusLine label="Auth" value="Google sign-in preserved" />
                <StatusLine label="Storage format" value="Markdown is canonical" />
                <StatusLine label="UI mode" value="Strict dark desktop shell" />
                <StatusLine label="Routing" value="Notes, Chat, Public Site placeholders" />
              </div>
              {session?.user ? (
                <Link
                  to="/notes"
                  className="inline-flex w-full items-center justify-center gap-2 border border-border px-4 py-3 text-sm text-foreground transition hover:bg-background"
                >
                  Open authenticated workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : null}
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof BookOpenText
  title: string
  description: string
}) {
  return (
    <div className="bg-panel px-4 py-5">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center border border-border bg-background text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  )
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</span>
      <span className="text-right text-sm text-foreground">{value}</span>
    </div>
  )
}
