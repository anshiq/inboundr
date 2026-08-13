import {
  FileCode2,
  FileJson,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileArchive,
  FileType,
  FileCog,
  File,
  Folder,
  FolderOpen,
  type LucideIcon,
} from "lucide-react"

interface IconSpec {
  Icon: LucideIcon
  className: string
}

const CODE_EXTS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "cs", "php", "swift", "kt"])
const MARKUP_EXTS = new Set(["html", "htm", "xml", "css", "scss", "less", "vue", "svelte"])
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "tiff"])
const VIDEO_EXTS = new Set(["mp4", "webm", "mov", "avi", "mkv", "flv", "wmv"])
const AUDIO_EXTS = new Set(["mp3", "wav", "ogg", "flac", "aac", "m4a"])
const ARCHIVE_EXTS = new Set(["zip", "tar", "gz", "rar", "7z", "bz2", "xz"])
const FONT_EXTS = new Set(["ttf", "otf", "woff", "woff2", "eot"])
const CONFIG_EXTS = new Set(["yml", "yaml", "toml", "ini", "env", "conf", "lock"])
const EXECUTABLE_EXTS = new Set(["exe", "sh", "bat", "app", "bin", "dmg", "msi"])

export function iconForFile(ext: string, name: string): IconSpec {
  const lower = ext.toLowerCase()
  if (lower === "json") return { Icon: FileJson, className: "text-amber-500" }
  if (lower === "md" || lower === "markdown") return { Icon: FileText, className: "text-blue-400" }
  if (lower === "pdf") return { Icon: FileType, className: "text-red-500" }
  if (CODE_EXTS.has(lower)) return { Icon: FileCode2, className: "text-sky-500" }
  if (MARKUP_EXTS.has(lower)) return { Icon: FileCode2, className: "text-orange-400" }
  if (IMAGE_EXTS.has(lower)) return { Icon: FileImage, className: "text-emerald-500" }
  if (VIDEO_EXTS.has(lower)) return { Icon: FileVideo, className: "text-purple-500" }
  if (AUDIO_EXTS.has(lower)) return { Icon: FileAudio, className: "text-pink-500" }
  if (ARCHIVE_EXTS.has(lower)) return { Icon: FileArchive, className: "text-yellow-600" }
  if (FONT_EXTS.has(lower)) return { Icon: FileType, className: "text-indigo-400" }
  if (CONFIG_EXTS.has(lower)) return { Icon: FileCog, className: "text-slate-500" }
  if (EXECUTABLE_EXTS.has(lower)) return { Icon: FileCog, className: "text-rose-500" }
  if (!ext && name.startsWith(".")) return { Icon: FileCog, className: "text-slate-500" } // dotfiles like .gitignore
  return { Icon: File, className: "text-muted-foreground" }
}

export function iconForFolder(isExpanded: boolean): IconSpec {
  return isExpanded
    ? { Icon: FolderOpen, className: "text-amber-500" }
    : { Icon: Folder, className: "text-amber-500" }
}
