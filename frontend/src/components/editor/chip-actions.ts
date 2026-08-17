import { toast } from "sonner"

import { getDriveFileUrl } from "@/lib/drive"

/**
 * Opens the referenced Drive file in a new tab via a short-lived signed URL.
 * Drive permissions are enforced server-side: viewers without access to the
 * file get an error toast instead of the content.
 */
export async function openDriveFileChip(nodeId: string): Promise<void> {
  try {
    const { url } = await getDriveFileUrl(nodeId)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.target = "_blank"
    anchor.rel = "noopener noreferrer"
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } catch (err) {
    toast.error(
      err instanceof Error && err.message !== "Drive request failed"
        ? err.message
        : "You do not have access to this Drive file"
    )
  }
}

/** Opens the referenced form's editor page in a new tab. */
export function openFormChip(slug: string): void {
  window.open(`/forms/${encodeURIComponent(slug)}`, "_blank", "noopener")
}

/** Dispatches a click on a chip element rendered from stored HTML. */
export function handleChipElementClick(target: HTMLElement): boolean {
  const chip = target.closest<HTMLElement>(
    'span[data-type="drive-file"], span[data-type="form-link"]'
  )
  if (!chip) return false

  if (chip.dataset.type === "drive-file") {
    const nodeId = chip.dataset.nodeId
    if (nodeId) void openDriveFileChip(nodeId)
    return true
  }

  const slug = chip.dataset.slug
  if (slug) openFormChip(slug)
  return true
}
