import type { ReactNode } from 'react'

type AppSectionPlaceholderProps = {
  eyebrow: string
  title: string
  description: string
  actions?: ReactNode
  children?: ReactNode
}

export function AppSectionPlaceholder({
  eyebrow,
  title,
  description,
  actions,
  children,
}: AppSectionPlaceholderProps) {
  return (
    <div className="flex h-full flex-col bg-background">
      <section className="border-b border-border px-6 py-5 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">{eyebrow}</p>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
          {actions ? <div className="flex items-center gap-3">{actions}</div> : null}
        </div>
      </section>

      <section className="flex-1 px-6 py-6 lg:px-8">
        <div className="grid h-full gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
          <div className="flex min-h-[360px] flex-col border border-border bg-panel">
            <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Workspace Surface
            </div>
            <div className="flex flex-1 items-center justify-center p-6">{children}</div>
          </div>

          <aside className="flex min-h-[360px] flex-col border border-border bg-panel-muted">
            <div className="border-b border-border px-4 py-3 text-xs uppercase tracking-[0.22em] text-muted-foreground">
              Next Build Slice
            </div>
            <div className="space-y-4 p-4 text-sm text-muted-foreground">
              <div className="border border-border bg-panel px-4 py-4">
                Notes work will land next in this shell, then publishing and chat will attach to the same workspace primitives.
              </div>
              <div className="border border-border bg-panel px-4 py-4">
                The current goal of this route is to validate layout, navigation, and the shared design system before domain implementation starts.
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  )
}