import { Loader } from "lucide-react"

export default function EnviosLoading() {
  return (
    <div className="space-y-6">
      <div>
        <div className="h-9 w-56 bg-muted animate-pulse rounded-lg mb-2" />
        <div className="h-4 w-48 bg-muted animate-pulse rounded" />
        <div className="h-3 w-36 bg-muted animate-pulse rounded mt-1" />
      </div>

      <div className="h-14 bg-muted/50 animate-pulse rounded-xl border border-border" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-8 w-8 bg-muted animate-pulse rounded-lg" />
            </div>
            <div className="h-8 w-12 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>

      <div className="text-center py-16 bg-card rounded-xl border border-border">
        <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
        <p className="text-sm text-muted-foreground">Buscando envios de hoje...</p>
      </div>
    </div>
  )
}
