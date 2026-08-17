import { API_ORIGIN } from "@/lib/env"

/** Attachment shape shared by every rich-editor surface (CRM notes, tasks). */
export interface EditorAttachment {
  key: string
  name: string
  contentType: string
  size: number
}

/** Presign scopes with an editor upload surface behind them. */
export type EditorUploadScope = "crm" | "projects"

export const EDITOR_FILE_MAX_SIZE = 15 * 1024 * 1024

export const EDITOR_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]

export const EDITOR_FILE_ACCEPT = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/rtf",
  "application/vnd.oasis.opendocument.text",
  "application/vnd.oasis.opendocument.spreadsheet",
  ...EDITOR_IMAGE_TYPES,
  "image/bmp",
  "image/tiff",
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "text/calendar",
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "application/vnd.rar",
].join(",")

interface PresignedUpload {
  uploadUrl: string
  headers: Record<string, string>
  file: { key: string }
}

export async function uploadEditorFile(
  file: File,
  scope: EditorUploadScope
): Promise<EditorAttachment> {
  if (file.size > EDITOR_FILE_MAX_SIZE) {
    const limitMb = Math.round(EDITOR_FILE_MAX_SIZE / 1024 / 1024)
    throw new Error(`${file.name} must be ${limitMb}MB or smaller`)
  }

  const presignResponse = await fetch(`${API_ORIGIN}/api/v1/uploads/presign`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      size: file.size,
    }),
  })
  const presign: PresignedUpload | { error?: string } = await presignResponse.json()
  if (!presignResponse.ok || !("uploadUrl" in presign)) {
    throw new Error((presign as { error?: string }).error || `Failed to prepare ${file.name}`)
  }

  const uploadResponse = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: presign.headers,
    body: file,
  })
  if (!uploadResponse.ok) {
    throw new Error(`Failed to upload ${file.name}`)
  }

  return {
    key: presign.file.key,
    name: file.name,
    contentType: file.type || "application/octet-stream",
    size: file.size,
  }
}

async function fetchViewUrl(key: string, download?: { fileName: string }): Promise<string> {
  const params = new URLSearchParams({ key })
  if (download) {
    params.set("download", "1")
    params.set("filename", download.fileName)
  }
  const response = await fetch(`${API_ORIGIN}/api/v1/uploads/view?${params.toString()}`, {
    credentials: "include",
  })
  const data: { url?: string; expiresInSeconds?: number; error?: string } = await response
    .json()
    .catch(() => ({}))
  if (!response.ok || !data.url) {
    throw new Error(data.error || "Failed to load the file")
  }
  return data.url
}

// Signed URLs expire, so stored HTML references stable storage keys and every
// render resolves them. The cache keeps a page full of images from
// re-requesting a URL per entry per mount; entries are dropped well before S3
// expiry.
const VIEW_URL_CACHE_TTL_MS = 1000 * 60 * 60
const viewUrlCache = new Map<string, { url: string; expiresAt: number }>()

export async function resolveEditorFileUrl(key: string): Promise<string> {
  const cached = viewUrlCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.url

  const url = await fetchViewUrl(key)
  viewUrlCache.set(key, { url, expiresAt: Date.now() + VIEW_URL_CACHE_TTL_MS })
  return url
}

export async function downloadEditorFile(attachment: EditorAttachment): Promise<void> {
  const url = await fetchViewUrl(attachment.key, { fileName: attachment.name })
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.rel = "noopener noreferrer"
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
