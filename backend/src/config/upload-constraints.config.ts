export const BRANDING_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
] as const;

export const BRANDING_MAX_FILE_SIZE = 2 * 1024 * 1024;

// Shared by the visitor presign (support-chat.controller) and the agent
// presign (uploads.controller) so both sides accept the same video types.
export const SUPPORT_VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

export const SUPPORT_VIDEO_MAX_FILE_SIZE = 50 * 1024 * 1024;

export const EMAIL_ATTACHMENT_ALLOWED_MIME_TYPES = [
  // Documents
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
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/bmp",
  "image/tiff",
  // Text and data
  "text/plain",
  "text/csv",
  "text/markdown",
  "application/json",
  "text/calendar",
  // Archives
  "application/zip",
  "application/x-zip-compressed",
  "application/gzip",
  "application/x-tar",
  "application/x-7z-compressed",
  "application/vnd.rar",
] as const;

/**
 * Extensions Gmail refuses to deliver. Checked alongside the MIME allowlist
 * because a renamed executable can still present a benign content type.
 */
export const EMAIL_ATTACHMENT_BLOCKED_EXTENSIONS = [
  "ade", "adp", "apk", "appx", "appxbundle", "bat", "cab", "chm", "cmd", "com",
  "cpl", "dll", "dmg", "ex", "ex_", "exe", "hta", "ins", "isp", "iso", "jar",
  "js", "jse", "lib", "lnk", "mde", "msc", "msi", "msix", "msixbundle", "msp",
  "mst", "nsh", "pif", "ps1", "scr", "sct", "shb", "sys", "vb", "vbe", "vbs",
  "vxd", "wsc", "wsf", "wsh",
] as const;

export const EMAIL_ATTACHMENT_MAX_FILE_SIZE = 15 * 1024 * 1024;

/**
 * Gmail rejects sends over 25MB of raw MIME, and base64 inflates payloads by
 * roughly a third, so the combined attachment budget has to sit well below it.
 */
export const EMAIL_ATTACHMENT_MAX_TOTAL_SIZE = 18 * 1024 * 1024;

export function isBlockedAttachmentFilename(filename: string): boolean {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  return (EMAIL_ATTACHMENT_BLOCKED_EXTENSIONS as readonly string[]).includes(extension);
}
