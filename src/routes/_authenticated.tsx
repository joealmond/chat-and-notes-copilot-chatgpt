import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { BookOpenText, ChevronLeft, ChevronRight, Globe, LogOut, MessageSquareText, PanelLeft, ShieldCheck } from 'lucide-react'
import { signOut, useSession } from '@/lib/auth-client'
import { useAdmin } from '@/hooks/use-admin'
import { cn } from '@/lib/cn'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context }) => {
    // Check authentication from root route context
    // The root route's beforeLoad already called getToken() and set isAuthenticated
    if (!context.isAuthenticated) {
      // Redirect to home page (which shows the sign-in button)
      throw redirect({ to: '/' })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const { data: session } = useSession()
  const { isAdmin } = useAdmin()

  return (
    <div className="flex h-screen bg-background text-foreground">
      <aside
        className={cn(
          'flex h-full flex-col border-r border-border bg-panel transition-[width] duration-200',
          isCollapsed ? 'w-[84px]' : 'w-[280px]'
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-4">
          <div className={cn('min-w-0', isCollapsed && 'hidden')}>
            <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Workspace</p>
            <h1 className="truncate text-sm font-semibold text-foreground">Productivity OS</h1>
          </div>
          <button
            type="button"
            onClick={() => setIsCollapsed((current) => !current)}
            className="inline-flex h-9 w-9 items-center justify-center border border-border text-muted-foreground transition hover:bg-panel-muted hover:text-foreground"
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="border-b border-border px-3 py-3">
          <nav className="space-y-1">
            <NavItem to="/notes" icon={BookOpenText} label="Notes" isCollapsed={isCollapsed} />
            <NavItem to="/chat" icon={MessageSquareText} label="Chat" isCollapsed={isCollapsed} />
            <NavItem to="/site" icon={Globe} label="Public Site" isCollapsed={isCollapsed} />
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-3">
            <div className="border border-border bg-panel-muted px-3 py-3 text-xs leading-5 text-muted-foreground">
              <p className="uppercase tracking-[0.18em]">Current slice</p>
              {!isCollapsed ? (
                <p className="mt-2">
                  Shell and design foundation are active. Notes, publishing, and chat attach here next.
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-3 py-3">
          <div className={cn('border border-border bg-panel-muted px-3 py-3', isCollapsed && 'px-2')}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-border bg-panel text-sm font-semibold text-foreground">
                {session?.user?.name?.slice(0, 1)?.toUpperCase() ?? 'U'}
              </div>
              {!isCollapsed ? (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {session?.user?.name ?? 'Authenticated user'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{session?.user?.email}</p>
                  {isAdmin ? (
                    <div className="mt-2 inline-flex items-center gap-1 border border-border px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-foreground">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Admin
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              className={cn(
                'mt-3 inline-flex w-full items-center justify-center gap-2 border border-border px-3 py-2 text-sm text-foreground transition hover:bg-background',
                isCollapsed && 'px-0'
              )}
            >
              <LogOut className="h-4 w-4" />
              {!isCollapsed ? 'Sign out' : null}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-border bg-background px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-9 w-9 items-center justify-center border border-border bg-panel text-muted-foreground">
              <PanelLeft className="h-4 w-4" />
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">Authenticated workspace</p>
              <p className="text-sm font-medium text-foreground">Persistent app shell</p>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

type NavItemProps = {
  to: '/notes' | '/chat' | '/site'
  icon: typeof BookOpenText
  label: string
  isCollapsed: boolean
}

function NavItem({ to, icon: Icon, label, isCollapsed }: NavItemProps) {
  return (
    <Link
      to={to}
      activeProps={{ className: 'border-border bg-background text-foreground' }}
      className={cn(
        'flex items-center gap-3 border border-transparent px-3 py-2 text-sm text-muted-foreground transition hover:border-border hover:bg-panel-muted hover:text-foreground',
        isCollapsed && 'justify-center px-0'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      {!isCollapsed ? <span>{label}</span> : null}
    </Link>
  )
}
