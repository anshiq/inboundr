import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

type ScrollAreaProps = React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  orientation?: "vertical" | "horizontal" | "both"
}

function ScrollArea({
  className,
  children,
  orientation = "vertical",
  ...props
}: ScrollAreaProps) {
  const horizontal = orientation === "horizontal" || orientation === "both"
  const vertical = orientation === "vertical" || orientation === "both"

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type="auto"
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit]",
          // Radix wraps children in a `display: table` div, which breaks
          // full-height layouts (e.g. kanban columns). Force it to a
          // full-height flex container for horizontal scroll areas.
          horizontal && !vertical && "[&>div]:flex! [&>div]:h-full"
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {vertical && <ScrollBar orientation="vertical" />}
      {horizontal && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner className="bg-transparent" />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        // Rest: slim faint rail. Hover: rail tints and thumb grows (padding
        // shrinks). Drag (:active bubbles up from the thumb): stronger tint.
        "z-10 flex touch-none select-none rounded-full p-[3px] transition-[padding,background-color] duration-200 ease-out",
        "group/scrollbar hover:bg-muted/60 hover:p-px active:bg-muted/80 active:p-px",
        orientation === "vertical" && "h-full w-2.5",
        orientation === "horizontal" && "h-2.5 w-full flex-col",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border/70 transition-colors duration-200 ease-out group-hover/scrollbar:bg-muted-foreground/60 group-active/scrollbar:bg-primary/70"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
