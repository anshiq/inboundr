import { useCallback, useEffect, useState } from "react"
import { Link, useParams } from "@tanstack/react-router"

import { AuthLayout } from "@/components/auth-layout"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { getSession } from "@/lib/auth-client"
import { setActiveOrganizationId } from "@/lib/organization-context"

import { API_ORIGIN } from "@/lib/env"
import { formatDate } from "@/lib/format"

interface InvitationPreview {
  email: string
  role: "owner" | "admin" | "member"
  accessGroups: {
    _id: string
    name: string
  }[]
  status: "pending" | "accepted" | "cancelled" | "expired"
  expiresAt: string
  organization: {
    _id: string
    name: string
  }
  inviter: {
    name: string
    email: string
  }
}

function inviterLabel(invitation: InvitationPreview): string {
  return invitation.inviter.name || invitation.inviter.email || "A teammate"
}

function roleLabel(role: InvitationPreview["role"]): string {
  return role === "admin" ? "Admin" : role === "owner" ? "Owner" : "Member"
}

function invitationAccessLabel(invitation: InvitationPreview): string {
  if (invitation.accessGroups?.length) {
    return invitation.accessGroups.map((group) => group.name).join(", ")
  }
  return roleLabel(invitation.role)
}

function InvitationDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-medium">{value}</dd>
    </div>
  )
}

export function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" })
  const [invitation, setInvitation] = useState<InvitationPreview | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadInvitation = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [previewRes, sessionRes] = await Promise.all([
        fetch(`${API_ORIGIN}/api/v1/organization/invitations/preview?token=${encodeURIComponent(token)}`),
        getSession(),
      ])

      const data = await previewRes.json().catch(() => null)
      if (!previewRes.ok) throw new Error(data?.error || "Invitation not found")

      setInvitation(data.invitation)
      setSessionEmail(sessionRes.data?.user?.email?.toLowerCase() ?? null)
    } catch (err: any) {
      setError(err.message || "Failed to load invitation")
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void loadInvitation()
  }, [loadInvitation])

  const acceptInvitation = async () => {
    setAccepting(true)
    setError(null)
    setMessage(null)
    try {
      const res = await fetch(`${API_ORIGIN}/api/v1/organization/invitations/accept`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || "Failed to accept invitation")
      if (data?.organizationId) setActiveOrganizationId(String(data.organizationId))
      setMessage("Invitation accepted. Taking you to your workspace...")
      window.setTimeout(() => {
        window.location.href = "/settings"
      }, 700)
    } catch (err: any) {
      setError(err.message || "Failed to accept invitation")
    } finally {
      setAccepting(false)
    }
  }

  const signedInWithWrongEmail =
    invitation && sessionEmail && sessionEmail !== invitation.email.toLowerCase()
  const authSearch = invitation
    ? { inviteToken: token, email: invitation.email }
    : { inviteToken: token }

  return (
    <AuthLayout>
      {loading ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-56" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : error && !invitation ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <h1 className="text-2xl font-bold">Invitation Unavailable</h1>
            <p className="text-sm text-balance text-muted-foreground">{error}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/login">Go to Login</Link>
          </Button>
        </div>
      ) : invitation ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-1 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              You&apos;ve been invited to join
            </p>
            <h1 className="text-2xl font-bold text-balance">
              {invitation.organization.name}
            </h1>
            <p className="text-sm text-balance text-muted-foreground">
              {inviterLabel(invitation)} invited you to collaborate on Inboundr.
            </p>
          </div>

          <dl className="divide-y rounded-lg border px-4 py-1">
            <InvitationDetailRow label="Invited email" value={invitation.email} />
            <InvitationDetailRow label="Access" value={invitationAccessLabel(invitation)} />
            <InvitationDetailRow label="Expires" value={formatDate(invitation.expiresAt)} />
          </dl>

          {invitation.status !== "pending" ? (
            <p className="rounded-lg border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-warning">
              This invitation is {invitation.status}. Ask {inviterLabel(invitation)} to
              send a new one.
            </p>
          ) : signedInWithWrongEmail ? (
            <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              You are signed in as {sessionEmail}. Sign in with {invitation.email} to
              accept this invitation.
            </p>
          ) : error ? (
            <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : message ? (
            <p className="rounded-lg border border-success/25 bg-success/10 px-4 py-3 text-sm text-success">
              {message}
            </p>
          ) : null}

          {invitation.status === "pending" && (
            <div className="flex flex-col gap-3">
              {sessionEmail && !signedInWithWrongEmail ? (
                <Button onClick={acceptInvitation} disabled={accepting}>
                  {accepting && <Spinner data-icon="inline-start" />}
                  Accept Invitation
                </Button>
              ) : (
                <>
                  <Button asChild>
                    <Link to="/register" search={authSearch}>
                      Create Account
                    </Link>
                  </Button>
                  <p className="text-center text-sm text-muted-foreground">
                    Already have an account?{" "}
                    <Link
                      to="/login"
                      search={authSearch}
                      className="underline underline-offset-4"
                    >
                      Sign In
                    </Link>
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      ) : null}
    </AuthLayout>
  )
}

export default InvitePage
