import { useCallback, useEffect, useRef, useState } from "react"
import type { ArchiveSummary, WorkerRequest, WorkerResponse, ZipTreeFolder } from "./zip-worker"

export type ParseStatus = "idle" | "loading" | "parsing" | "ready" | "error"

interface ParseProgress {
  processed: number
  total: number
}

// ── Small LRU cache for extracted object URLs ───────────────────────────────
// Bounded at MAX_CACHED_BLOBS so a long browsing session across a huge
// archive can't accumulate unbounded blob memory. Oldest-touched entry is
// evicted first; touching (get) an entry refreshes its recency.
const MAX_CACHED_BLOBS = 30

class BlobLRU {
  private map = new Map<string, string>() // path -> object URL, insertion order = recency

  get(path: string): string | undefined {
    const url = this.map.get(path)
    if (url === undefined) return undefined
    this.map.delete(path)
    this.map.set(path, url)
    return url
  }

  set(path: string, url: string) {
    if (this.map.has(path)) {
      URL.revokeObjectURL(this.map.get(path)!)
      this.map.delete(path)
    }
    this.map.set(path, url)
    while (this.map.size > MAX_CACHED_BLOBS) {
      const oldestKey = this.map.keys().next().value
      if (oldestKey === undefined) break
      const oldestUrl = this.map.get(oldestKey)
      if (oldestUrl) URL.revokeObjectURL(oldestUrl)
      this.map.delete(oldestKey)
    }
  }

  clear() {
    for (const url of this.map.values()) URL.revokeObjectURL(url)
    this.map.clear()
  }
}

export interface ExtractedFile {
  url: string
  mime: string
}

export function useZipWorker(url: string, reloadKey: number) {
  const [status, setStatus] = useState<ParseStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [progress, setProgress] = useState<ParseProgress>({ processed: 0, total: 0 })
  const [tree, setTree] = useState<ZipTreeFolder | null>(null)
  const [summary, setSummary] = useState<ArchiveSummary | null>(null)

  const workerRef = useRef<Worker | null>(null)
  const blobCacheRef = useRef(new BlobLRU())
  const pendingExtractRef = useRef(new Map<string, (result: ExtractedFile | { error: string }) => void>())
  const pendingSearchRef = useRef(new Map<string, (paths: string[]) => void>())

  useEffect(() => {
    setStatus("loading")
    setErrorMessage(null)
    setProgress({ processed: 0, total: 0 })
    setTree(null)
    setSummary(null)
    blobCacheRef.current.clear()
    pendingExtractRef.current.clear()
    pendingSearchRef.current.clear()

    const worker = new Worker(new URL("./zip-worker.ts", import.meta.url), { type: "module" })
    workerRef.current = worker

    worker.addEventListener("message", (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data
      switch (msg.type) {
        case "progress":
          setStatus("parsing")
          setProgress({ processed: msg.processed, total: msg.total })
          break
        case "parsed":
          setTree(msg.tree)
          setSummary(msg.summary)
          setStatus("ready")
          break
        case "parse-error":
          setErrorMessage(msg.message)
          setStatus("error")
          break
        case "extracted": {
          const resolve = pendingExtractRef.current.get(msg.requestId)
          if (resolve) {
            const blob = new Blob([msg.buffer], { type: msg.mime })
            const objectUrl = URL.createObjectURL(blob)
            blobCacheRef.current.set(msg.path, objectUrl)
            resolve({ url: objectUrl, mime: msg.mime })
            pendingExtractRef.current.delete(msg.requestId)
          }
          break
        }
        case "extract-error": {
          const resolve = pendingExtractRef.current.get(msg.requestId)
          if (resolve) {
            resolve({ error: msg.message })
            pendingExtractRef.current.delete(msg.requestId)
          }
          break
        }
        case "search-results": {
          const resolve = pendingSearchRef.current.get(msg.requestId)
          if (resolve) {
            resolve(msg.paths)
            pendingSearchRef.current.delete(msg.requestId)
          }
          break
        }
      }
    })

    let cancelled = false
    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to download zip archive (${res.status})`)
        return res.arrayBuffer()
      })
      .then((buffer) => {
        if (cancelled) return
        const req: WorkerRequest = { type: "parse", buffer }
        worker.postMessage(req, [buffer])
      })
      .catch((err) => {
        if (cancelled) return
        setErrorMessage(err instanceof Error ? err.message : "Failed to download archive")
        setStatus("error")
      })

    return () => {
      cancelled = true
      worker.terminate()
      workerRef.current = null
      blobCacheRef.current.clear()
    }
  }, [url, reloadKey])

  const extractFile = useCallback((path: string): Promise<ExtractedFile | { error: string }> => {
    const cached = blobCacheRef.current.get(path)
    if (cached) return Promise.resolve({ url: cached, mime: guessMimeFallback(path) })

    return new Promise((resolve) => {
      const worker = workerRef.current
      if (!worker) {
        resolve({ error: "Archive is not ready" })
        return
      }
      const requestId = `${path}-${Date.now()}-${Math.random().toString(36).slice(2)}`
      pendingExtractRef.current.set(requestId, resolve)
      const req: WorkerRequest = { type: "extract", path, requestId }
      worker.postMessage(req)
    })
  }, [])

  const search = useCallback((query: string): Promise<string[]> => {
    return new Promise((resolve) => {
      const worker = workerRef.current
      if (!worker) {
        resolve([])
        return
      }
      const requestId = `search-${Date.now()}-${Math.random().toString(36).slice(2)}`
      pendingSearchRef.current.set(requestId, resolve)
      const req: WorkerRequest = { type: "search", query, requestId }
      worker.postMessage(req)
    })
  }, [])

  return { status, errorMessage, progress, tree, summary, extractFile, search }
}

// Only used for the cache-hit path above, where we don't have the mime from
// the worker response anymore — good enough for the <img>/<video>/etc tag to
// pick a sensible renderer; the authoritative mime is set on first extract.
function guessMimeFallback(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? ""
  const map: Record<string, string> = {
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf",
  }
  return map[ext] ?? "application/octet-stream"
}
