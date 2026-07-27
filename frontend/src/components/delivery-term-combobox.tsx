import { useEffect, useState } from "react"
import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface DeliveryTermOption {
  id: string
  name: string
  text: string
  isDefault: boolean
}

interface DeliveryTermComboboxProps {
  value: string
  onChange: (value: string) => void
  templates: DeliveryTermOption[]
  placeholder?: string
  className?: string
}

/**
 * A line stores the delivery term's full text, but the templates are prose that
 * will not fit an inline cell, so the trigger shows the matching template's
 * name and falls back to the raw text for one-off values typed by hand.
 */
export function DeliveryTermCombobox({
  value,
  onChange,
  templates,
  placeholder = "Select delivery",
  className,
}: DeliveryTermComboboxProps) {
  const [open, setOpen] = useState(false)
  const [customDraft, setCustomDraft] = useState("")

  const matched = templates.find((template) => template.text === value)
  const hasValue = value.trim() !== ""

  useEffect(() => {
    setCustomDraft(templates.some((template) => template.text === value) ? "" : value)
  }, [value, templates])

  const selectTemplate = (template: DeliveryTermOption) => {
    onChange(template.text)
    setOpen(false)
  }

  const clear = () => {
    onChange("")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          title={hasValue ? value : undefined}
          data-empty={!hasValue}
          className={cn(
            "h-7 min-w-0 flex-1 shrink justify-between gap-1 border-muted-foreground/15 bg-transparent px-2 text-xs font-normal data-[empty=true]:text-muted-foreground",
            className
          )}
        >
          <span className="truncate">{matched ? matched.name : hasValue ? value : placeholder}</span>
          <ChevronsUpDownIcon className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        {templates.length > 0 && (
          <div className="max-h-56 overflow-y-auto p-1">
            {templates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => selectTemplate(template)}
                className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent hover:text-accent-foreground"
              >
                <CheckIcon
                  className={cn(
                    "mt-0.5 size-3 shrink-0",
                    matched?.id === template.id ? "opacity-100" : "opacity-0"
                  )}
                />
                <span className="min-w-0">
                  <span className="block font-medium">
                    {template.name}
                    {template.isDefault ? " (default)" : ""}
                  </span>
                  <span className="mt-0.5 block line-clamp-2 text-[10px] text-muted-foreground">
                    {template.text}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="border-t p-2">
          <label className="mb-1 block text-[10px] font-medium text-muted-foreground">
            Custom delivery
          </label>
          <Input
            value={customDraft}
            onChange={(event) => {
              setCustomDraft(event.target.value)
              onChange(event.target.value)
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                setOpen(false)
              }
            }}
            placeholder="e.g. 2 weeks"
            className="h-7 text-xs"
          />
          {hasValue && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clear}
              className="mt-1 h-6 w-full justify-start gap-1 px-1 text-[10px] text-muted-foreground"
            >
              <XIcon className="size-3" />
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
