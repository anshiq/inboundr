import type { NoteAttachment } from "@/lib/crm"
import {
  EDITOR_FILE_ACCEPT,
  EDITOR_FILE_MAX_SIZE,
  EDITOR_IMAGE_TYPES,
  downloadEditorFile,
  resolveEditorFileUrl,
  uploadEditorFile,
} from "@/lib/editor-files"

export const CRM_NOTE_FILE_MAX_SIZE = EDITOR_FILE_MAX_SIZE
export const CRM_NOTE_IMAGE_TYPES = EDITOR_IMAGE_TYPES
export const CRM_NOTE_FILE_ACCEPT = EDITOR_FILE_ACCEPT

export function uploadCrmNoteFile(file: File): Promise<NoteAttachment> {
  return uploadEditorFile(file, "crm")
}

export const resolveCrmFileUrl = resolveEditorFileUrl

export function downloadCrmFile(attachment: NoteAttachment): Promise<void> {
  return downloadEditorFile(attachment)
}
