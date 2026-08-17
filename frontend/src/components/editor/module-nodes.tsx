import { Node, mergeAttributes } from "@tiptap/react"

/**
 * Inline chips that reference records in other modules. They serialize as
 * `<span data-type="...">` (like mentions) so the server-side sanitizer can
 * whitelist exactly that shape, and the stored HTML stays renderable without
 * the editor.
 */

function dataAttribute(name: string) {
  return {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute(name),
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes[toCamel(name)] ? { [name]: attributes[toCamel(name)] } : {},
  }
}

function toCamel(dataName: string): string {
  return dataName
    .replace(/^data-/, "")
    .replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase())
}

export interface DriveFileChipAttrs {
  nodeId: string
  label: string
}

/** A Drive file reference: `<span data-type="drive-file" data-node-id data-label>`. */
export const DriveFileChip = Node.create({
  name: "driveFile",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      nodeId: dataAttribute("data-node-id"),
      label: dataAttribute("data-label"),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="drive-file"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "drive-file" }, HTMLAttributes),
      String(node.attrs.label ?? "Drive file"),
    ]
  },

  renderText({ node }) {
    return String(node.attrs.label ?? "Drive file")
  },
})

export interface FormLinkChipAttrs {
  formId: string
  slug: string
  label: string
}

/** A Form reference: `<span data-type="form-link" data-form-id data-slug data-label>`. */
export const FormLinkChip = Node.create({
  name: "formLink",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      formId: dataAttribute("data-form-id"),
      slug: dataAttribute("data-slug"),
      label: dataAttribute("data-label"),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="form-link"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "span",
      mergeAttributes({ "data-type": "form-link" }, HTMLAttributes),
      String(node.attrs.label ?? "Form"),
    ]
  },

  renderText({ node }) {
    return String(node.attrs.label ?? "Form")
  },
})
