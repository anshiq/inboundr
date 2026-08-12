import { useEffect, useState } from "react"
import { HourglassIcon, RefreshCwIcon } from "lucide-react"
import { toast } from "sonner"

import { AppLayout } from "@/components/app-layout"
import { PageHeader } from "@/components/page-header"
import { SiteHeader } from "@/components/site-header"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDateTime } from "@/lib/format"
import { listAdminWaitlist, type WaitlistEntry } from "@/lib/admin"

export default function AdminWaitlistPage() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const result = await listAdminWaitlist()
      setEntries(result.entries)
      setTotal(result.total)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load the waitlist",
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  return (
    <AppLayout>
      <SiteHeader
        breadcrumbs={[
          { label: "Super Admin", href: "/admin" },
          { label: "Waitlist" },
        ]}
      />
      <main className="h-full overflow-y-auto bg-muted/20 p-4 md:p-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-6">
          <PageHeader
            title="Waitlist"
            description="People who requested access while public sign-up is disabled."
            actions={
              <Button variant="outline" onClick={() => void load()}>
                <RefreshCwIcon className="mr-2 size-4" />
                Refresh
              </Button>
            }
          />

          <section className="rounded-2xl border bg-background">
            <div className="p-5">
              <h2 className="font-semibold">Requests</h2>
              <p className="text-sm text-muted-foreground">
                {total} total signup {total === 1 ? "request" : "requests"}
              </p>
            </div>
            <Separator />
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <Spinner />
              </div>
            ) : entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                <HourglassIcon className="size-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No One Is on the Waitlist Yet
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Heard About Us</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry._id}>
                      <TableCell className="pl-5">
                        <div className="text-sm">{entry.name || "-"}</div>
                        <div className="text-xs text-muted-foreground">
                          {entry.email}
                        </div>
                      </TableCell>
                      <TableCell>{entry.companyName || "-"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.referralSourceLabel || "-"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDateTime(entry.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      </main>
    </AppLayout>
  )
}
