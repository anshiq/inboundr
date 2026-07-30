const ADDRESS_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Header values are comma separated, but a display name may itself contain a
 * comma, so quoted sections and angle brackets have to be respected rather than
 * naively splitting on the delimiter.
 */
export function splitRecipients(value: string): string[] {
  const parts: string[] = []
  let current = ""
  let inQuotes = false
  let inAngle = false

  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes
      current += char
      continue
    }
    if (char === "<") inAngle = true
    if (char === ">") inAngle = false

    if ((char === "," || char === ";") && !inQuotes && !inAngle) {
      if (current.trim()) parts.push(current.trim())
      current = ""
      continue
    }
    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

export function addressOf(recipient: string): string {
  const match = recipient.match(/<([^>]+)>/)
  return (match?.[1] ?? recipient).trim().replace(/^mailto:/i, "")
}

/** Falls back to the address when the recipient carries no display name. */
export function labelOf(recipient: string): string {
  const named = recipient.match(/^\s*"?(.*?)"?\s*<[^>]+>\s*$/)
  return named?.[1]?.trim() || addressOf(recipient)
}

export function isValidRecipient(recipient: string): boolean {
  return ADDRESS_RE.test(addressOf(recipient))
}
