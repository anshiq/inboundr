import * as React from "react"
import { FileTextIcon, SearchIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { listForms } from "@/lib/forms-api"
import type { ManagedForm } from "@/components/forms/types"

export interface FormSelection {
  id: string
  slug: string
  title: string
}

export function FormPickerDialog({
  open,
  onOpenChange,
  onSelectForm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectForm: (form: FormSelection) => void
}) {
  const [forms, setForms] = React.useState<ManagedForm[]>([])
  const [loading, setLoading] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    async function reset() {
      setSearch("")
      setLoading(true)
      setError(null)
      try {
        const items = await listForms()
        setForms(items.filter((form) => form.status !== "archived"))
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load forms")
        setForms([])
      } finally {
        setLoading(false)
      }
    }
    void reset()
  }, [open])

  const needle = search.trim().toLowerCase()
  const filtered = needle
    ? forms.filter(
        (form) =>
          form.title.toLowerCase().includes(needle) || form.slug.toLowerCase().includes(needle)
      )
    : forms

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>Insert Form</DialogTitle>
          <DialogDescription>Pick a form to reference here.</DialogDescription>
        </DialogHeader>

        <div className="border-b px-5 py-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search forms..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="min-h-56 flex-1 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
              <Spinner className="size-5" />
              Loading forms...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <FileTextIcon className="size-8 opacity-50" />
              <p>{needle ? "No forms match your search." : "No forms yet."}</p>
            </div>
          ) : (
            <div className="grid gap-1">
              {filtered.map((form) => (
                <button
                  key={form._id}
                  type="button"
                  onClick={() => onSelectForm({ id: form._id, slug: form.slug, title: form.title })}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{form.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        /f/{form.slug}
                      </span>
                    </span>
                  </span>
                  <Badge variant={form.status === "published" ? "default" : "secondary"} className="shrink-0 capitalize">
                    {form.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="border-t px-5 py-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
