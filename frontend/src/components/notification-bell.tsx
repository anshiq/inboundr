import { useMemo, useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  BellIcon,
  ContactIcon,
  LandmarkIcon,
  MegaphoneIcon,
  MessageCircleIcon,
  PackageIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  WifiOffIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Spinner } from "@/components/ui/spinner"
import { formatRelativeTime } from "@/lib/format"
import { useNotifications } from "@/lib/notifications-context"
import type { AppNotification } from "@/lib/notifications-api"
import { cn } from "@/lib/utils"

type NotificationTab = "all" | "unread"

function unreadLabel(count: number) {
  if (count <= 0) return "No unread notifications"
  if (count === 1) return "1 unread notification"
  return `${count} unread notifications`
}

function displayCount(count: number) {
  return count > 99 ? "99+" : String(count)
}

const TYPE_META: Record<string, { icon: LucideIcon; source: string | null }> = {
  asset: { icon: PackageIcon, source: "Assets" },
  crm: { icon: ContactIcon, source: "Contacts" },
  support: { icon: MessageCircleIcon, source: "Support" },
  admin: { icon: MegaphoneIcon, source: null },
  invoice: { icon: LandmarkIcon, source: "Invoices" },
  payment: { icon: LandmarkIcon, source: "Payments" },
  workflow: { icon: SparklesIcon, source: "Workflows" },
}

function typeMeta(type: string) {
  const prefix = type.split(".")[0] ?? ""
  return TYPE_META[prefix] ?? { icon: BellIcon, source: null }
}

function NotificationItem({
  notification,
  onOpen,
  onToggleRead,
}: {
  notification: AppNotification
  onOpen: (notification: AppNotification) => void
  onToggleRead: (notification: AppNotification) => void
}) {
  const unread = !notification.readAt
  const { icon: Icon, source } = typeMeta(notification.type)

  return (
    <div
      role="button"
      tabIndex={0}
      className={cn(
        "group flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
        unread && "bg-primary/[0.04]"
      )}
      onClick={() => onOpen(notification)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault()
          onOpen(notification)
        }
      }}
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-foreground/80">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("line-clamp-3 text-sm leading-snug", unread ? "font-medium" : "font-normal")}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
        )}
        <div className="mt-1.5 space-y-0.5">
          {source && <p className="text-[11px] text-muted-foreground">{source}</p>}
          <p className="text-[11px] tracking-wide text-muted-foreground/80 uppercase">
            {formatRelativeTime(notification.createdAt)}
          </p>
        </div>
      </div>
      <button
        type="button"
        className="mt-1.5 shrink-0 rounded-full p-1 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={unread ? "Mark as read" : "Mark as unread"}
        onClick={(event) => {
          event.stopPropagation()
          onToggleRead(notification)
        }}
      >
        <span
          className={cn(
            "block size-2 rounded-full transition-colors",
            unread
              ? "bg-primary"
              : "bg-transparent group-hover:bg-muted-foreground/25 hover:bg-muted-foreground/40"
          )}
        />
      </button>
    </div>
  )
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<NotificationTab>("all")
  const navigate = useNavigate()
  const {
    notifications,
    unreadCount,
    loading,
    connectionStatus,
    error,
    refresh,
    markRead,
    markUnread,
    markAllRead,
  } = useNotifications()

  const visibleNotifications = useMemo(
    () => (tab === "unread" ? notifications.filter((notification) => !notification.readAt) : notifications),
    [notifications, tab]
  )

  async function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) await refresh()
  }

  async function handleOpenNotification(notification: AppNotification) {
    try {
      if (!notification.readAt) await markRead(notification._id)
      if (notification.actionUrl) {
        window.location.assign(notification.actionUrl)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open notification")
    }
  }

  async function handleToggleRead(notification: AppNotification) {
    try {
      if (notification.readAt) {
        await markUnread(notification._id)
      } else {
        await markRead(notification._id)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update notification")
    }
  }

  async function handleMarkAllRead() {
    try {
      await markAllRead()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark notifications read")
    }
  }

  return (
    <Popover open={open} onOpenChange={(nextOpen) => void handleOpenChange(nextOpen)}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" aria-label={unreadLabel(unreadCount)}>
          <BellIcon className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {displayCount(unreadCount)}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(400px,calc(100vw-2rem))] overflow-hidden p-0">
        <div className="relative flex items-center justify-center px-12 pt-4 pb-3">
          <h2 className="text-base font-semibold">Notifications Center</h2>
          <div className="absolute right-3 flex items-center gap-1">
            {connectionStatus === "disconnected" && (
              <WifiOffIcon className="size-4 text-muted-foreground" aria-label="Notifications disconnected" />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Notification settings"
              onClick={() => {
                setOpen(false)
                void navigate({ to: "/settings", search: { tab: "notifications" } })
              }}
            >
              <SlidersHorizontalIcon className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-end justify-between border-b px-4">
          <div className="flex gap-5" role="tablist" aria-label="Filter notifications">
            {(
              [
                { id: "all", label: "All" },
                { id: "unread", label: "Unread" },
              ] as const
            ).map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={cn(
                  "-mb-px border-b-2 pb-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  tab === id
                    ? "border-primary font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="pb-2 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
            onClick={() => void handleMarkAllRead()}
            disabled={unreadCount === 0}
          >
            Mark All as Read
          </button>
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner />
            </div>
          ) : error ? (
            <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : visibleNotifications.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center px-6 text-center">
              <BellIcon className="size-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">
                {tab === "unread" ? "You're All Caught Up" : "No Notifications Yet"}
              </p>
              <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                {tab === "unread"
                  ? "New unread notifications will appear here."
                  : "Important updates for this organization will appear here."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {visibleNotifications.map((notification) => (
                <NotificationItem
                  key={notification._id}
                  notification={notification}
                  onOpen={handleOpenNotification}
                  onToggleRead={handleToggleRead}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
