import { useCallback, useState } from "react"
import { XIcon } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  addressOf,
  isValidRecipient,
  labelOf,
  splitRecipients,
} from "@/lib/email-recipients"
import { cn } from "@/lib/utils"

export function RecipientChips({
  label,
  value,
  onChange,
  placeholder,
  autoFocus,
  disabled,
  actions,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  disabled?: boolean
  actions?: React.ReactNode
}) {
  const [pending, setPending] = useState("")
  const recipients = splitRecipients(value)

  const commit = useCallback(
    (raw: string) => {
      const additions = splitRecipients(raw).filter(Boolean)
      if (additions.length === 0) return

      const existing = new Set(recipients.map((item) => addressOf(item).toLowerCase()))
      const next = [...recipients]
      for (const addition of additions) {
        const address = addressOf(addition).toLowerCase()
        if (existing.has(address)) continue
        existing.add(address)
        next.push(addition)
      }

      onChange(next.join(", "))
      setPending("")
    },
    [onChange, recipients]
  )

  const remove = useCallback(
    (index: number) => {
      onChange(recipients.filter((_, position) => position !== index).join(", "))
    },
    [onChange, recipients]
  )

  return (
    <div className="flex items-start gap-2 border-b border-border/40 px-4 py-2">
      <span className="mt-1 w-10 shrink-0 text-[11px] font-medium text-muted-foreground/70">
        {label}
      </span>

      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
        {recipients.map((recipient, index) => (
          <Tooltip key={`${recipient}-${index}`}>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-full py-0.5 pl-2 pr-1 text-[12px]",
                  isValidRecipient(recipient)
                    ? "bg-muted text-foreground"
                    : "bg-destructive/10 text-destructive"
                )}
              >
                <span className="truncate">{labelOf(recipient)}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => remove(index)}
                  aria-label={`Remove ${addressOf(recipient)}`}
                  className="rounded-full p-0.5 text-current/60 hover:bg-black/10 hover:text-current disabled:opacity-50 dark:hover:bg-white/10"
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isValidRecipient(recipient)
                ? addressOf(recipient)
                : `${addressOf(recipient)} is not a valid address`}
            </TooltipContent>
          </Tooltip>
        ))}

        <input
          type="text"
          value={pending}
          autoFocus={autoFocus}
          disabled={disabled}
          placeholder={recipients.length === 0 ? placeholder : undefined}
          onChange={(event) => {
            // Typing a delimiter is the usual way to finish an address.
            if (/[,;]/.test(event.target.value)) {
              commit(event.target.value)
              return
            }
            setPending(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Tab") {
              if (!pending.trim()) return
              event.preventDefault()
              commit(pending)
              return
            }
            if (event.key === "Backspace" && !pending && recipients.length > 0) {
              event.preventDefault()
              remove(recipients.length - 1)
            }
          }}
          onBlur={() => commit(pending)}
          className="min-w-24 flex-1 bg-transparent py-0.5 text-[12px] outline-none placeholder:text-muted-foreground/50 disabled:opacity-60"
        />
      </div>

      {actions && <div className="mt-0.5 flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  )
}
