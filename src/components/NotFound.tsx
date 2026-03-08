import { Link } from '@tanstack/react-router'
import { Home, ArrowLeft } from 'lucide-react'

/**
 * 404 Not Found component used as defaultNotFoundComponent in router
 */
export function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="max-w-md border border-border bg-panel p-8 text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-8xl font-bold text-muted-foreground/30">404</h1>
          <h2 className="text-2xl font-semibold text-foreground">Page Not Found</h2>
          <p className="text-muted-foreground">
            The page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 border border-border px-4 py-2 text-foreground transition hover:bg-panel-muted"
          >
            <Home className="w-4 h-4" />
            Go Home
          </Link>
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center justify-center gap-2 border border-border px-4 py-2 text-muted-foreground transition hover:bg-panel-muted hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </button>
        </div>
      </div>
    </div>
  )
}
