import {
  RichEditor,
  type RichEditorApi,
  type RichEditorPayload,
  type RichEditorProps,
} from "@/components/editor/rich-editor"

export type NoteEditorPayload = RichEditorPayload
export type NoteEditorApi = RichEditorApi

export type NoteEditorProps = Omit<
  RichEditorProps,
  "uploadScope" | "enableMentions" | "enableSlashMenu"
>

/** CRM note composer: the shared rich editor bound to the CRM upload scope. */
export function NoteEditor({
  placeholder = "Log an internal note... (type '#' for a heading, '-' for a list)",
  ...props
}: NoteEditorProps) {
  return <RichEditor {...props} placeholder={placeholder} uploadScope="crm" enableMentions />
}

export default NoteEditor
