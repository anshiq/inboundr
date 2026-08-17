import * as React from "react"
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  HardDriveIcon,
  SearchIcon,
} from "lucide-react"

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
import { formatBytes, listDriveNodes, type DriveNode } from "@/lib/drive"
import { cn } from "@/lib/utils"

export interface DriveFileSelection {
  id: string
  name: string
}

/**
 * Browse-or-search picker for existing Drive files (the folder picker only
 * selects destinations). Selecting a file resolves immediately; folders
 * navigate deeper.
 */
export function DriveFilePickerDialog({
  open,
  onOpenChange,
  onSelectFile,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectFile: (file: DriveFileSelection) => void
}) {
  const [currentFolder, setCurrentFolder] = React.useState<DriveNode | null>(null)
  const [breadcrumbs, setBreadcrumbs] = React.useState<DriveNode[]>([])
  const [nodes, setNodes] = React.useState<DriveNode[]>([])
  const [loading, setLoading] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)

  const searching = search.trim().length > 0

  const load = React.useCallback(async (parentId: string | null, searchTerm: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await listDriveNodes(
        searchTerm.trim()
          ? { search: searchTerm.trim(), view: "my", sort: "name", dir: "asc" }
          : { parentId, view: "my", sort: "name", dir: "asc" }
      )
      setNodes(response.nodes)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Drive files")
      setNodes([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    setSearch("")
    setCurrentFolder(null)
    setBreadcrumbs([])
  }, [open])

  // Single loader for open/navigation/search. Search input is debounced so
  // typing does not fire a request per keystroke; navigation loads on the
  // next tick. Depending on `open` means closing the dialog cancels any
  // pending load instead of letting it fire against a closed picker.
  React.useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(
      () => {
        void load(currentFolder?._id ?? null, search)
      },
      search.trim() ? 250 : 0
    )
    return () => window.clearTimeout(timer)
  }, [open, search, currentFolder, load])

  function enterFolder(folder: DriveNode) {
    setCurrentFolder(folder)
    setBreadcrumbs((current) => [...current, folder])
    setSearch("")
  }

  function jumpToRoot() {
    setCurrentFolder(null)
    setBreadcrumbs([])
    setSearch("")
  }

  function jumpToCrumb(index: number) {
    const folder = breadcrumbs[index]
    if (!folder) return
    setCurrentFolder(folder)
    setBreadcrumbs((current) => current.slice(0, index + 1))
    setSearch("")
  }

  const folders = nodes.filter((node) => node.type === "folder")
  const files = nodes.filter((node) => node.type === "file")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[82svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b px-5 py-4 pr-12">
          <DialogTitle>Insert Drive File</DialogTitle>
          <DialogDescription>Pick a file from Drive to reference here.</DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b px-5 py-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search files in Drive..."
                className="pl-8"
              />
            </div>
          </div>

          {!searching && (
            <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-5 py-2 text-xs text-muted-foreground">
              <Button variant="ghost" size="xs" className="h-7 px-1.5" onClick={jumpToRoot}>
                <HardDriveIcon className="size-3.5" />
                Drive
              </Button>
              {breadcrumbs.map((folder, index) => (
                <React.Fragment key={folder._id}>
                  <ChevronRightIcon className="size-3.5" />
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-7 max-w-40 px-1.5"
                    onClick={() => jumpToCrumb(index)}
                  >
                    <span className="truncate">{folder.name}</span>
                  </Button>
                </React.Fragment>
              ))}
            </div>
          )}

          <div className="min-h-64 flex-1 overflow-y-auto px-3 py-3">
            {loading ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                <Spinner className="size-5" />
                Loading...
              </div>
            ) : error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                {error}
              </div>
            ) : nodes.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <FileIcon className="size-8 opacity-50" />
                <p>{searching ? "No files match your search." : "This folder is empty."}</p>
              </div>
            ) : (
              <div className="grid gap-1">
                {!searching &&
                  folders.map((folder) => (
                    <button
                      key={folder._id}
                      type="button"
                      onClick={() => enterFolder(folder)}
                      className="group flex w-full items-center justify-between rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderIcon className="size-4 shrink-0 text-sky-500" />
                        <span className="truncate text-sm font-medium">{folder.name}</span>
                      </span>
                      <ChevronRightIcon className="size-4 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
                    </button>
                  ))}
                {files.map((file) => (
                  <button
                    key={file._id}
                    type="button"
                    onClick={() => onSelectFile({ id: file._id, name: file.name })}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted"
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{file.name}</span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(file.size)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
