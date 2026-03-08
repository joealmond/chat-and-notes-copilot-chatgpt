import { Eye, EyeOff, Shield } from 'lucide-react'
import { useAdmin } from '@/hooks/use-admin'
import { useImpersonate } from '@/hooks/use-impersonate'

/**
 * Admin toolbar - shows at the bottom of the screen for admins.
 * Allows toggling "view as user" mode to see what regular users see.
 */
export function AdminToolbar() {
  const { isRealAdmin } = useAdmin()
  const { isViewingAsUser, toggleViewAsUser, stopViewingAsUser } = useImpersonate()

  // Only show for real admins
  if (!isRealAdmin) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 border border-border bg-panel px-2 py-2">
      {isViewingAsUser ? (
        <>
          <span className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs font-medium text-foreground">
            <Eye className="h-3 w-3" />
            Viewing as User
          </span>
          <button
            onClick={stopViewingAsUser}
            className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs font-medium text-foreground transition hover:bg-panel-muted"
          >
            <Shield className="h-3 w-3" />
            Back to Admin
          </button>
        </>
      ) : (
        <>
          <span className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs font-medium text-foreground">
            <Shield className="h-3 w-3" />
            Admin Mode
          </span>
          <button
            onClick={toggleViewAsUser}
            className="inline-flex items-center gap-1 border border-border px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-panel-muted hover:text-foreground"
          >
            <EyeOff className="h-3 w-3" />
            View as User
          </button>
        </>
      )}
    </div>
  )
}
