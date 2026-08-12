import { useState, type FormEvent } from "react"
import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { API_ORIGIN } from "@/lib/env"

// Values must match WAITLIST_REFERRAL_SOURCES on the backend.
const REFERRAL_SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: "search", label: "Search engine" },
  { value: "social_media", label: "Social media" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "friend_colleague", label: "Friend or colleague" },
  { value: "newsletter_blog", label: "Newsletter or blog" },
  { value: "event", label: "Event or conference" },
  { value: "other", label: "Other" },
]

export function WaitlistForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [referralSource, setReferralSource] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasJoined, setHasJoined] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (!referralSource) {
      setError("Please tell us where you heard about us.")
      return
    }

    setIsSubmitting(true)

    try {
      const response = await fetch(`${API_ORIGIN}/api/v1/public/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, companyName, referralSource }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          body?.error ?? "Something went wrong. Please try again.",
        )
      }

      setHasJoined(true)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (hasJoined) {
    return (
      <div className={cn("flex flex-col gap-6 text-center", className)}>
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <svg
              aria-hidden="true"
              className="size-6"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">You&apos;re on the List</h1>
            <p className="text-sm text-balance text-muted-foreground">
              We&apos;ve captured your interest and sent a confirmation to{" "}
              {email}. Our team will contact you soon.
            </p>
          </div>
        </div>
        <Button asChild variant="outline">
          <Link to="/login">Back to Sign In</Link>
        </Button>
      </div>
    )
  }

  return (
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={handleSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">Join the Waitlist</h1>
          <p className="text-sm text-balance text-muted-foreground">
            Account creation is currently invite-only. Leave your details and
            we&apos;ll let you know when your spot opens up.
          </p>
        </div>
        <Field>
          <FieldLabel htmlFor="name">Full name</FieldLabel>
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="John Doe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="m@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <FieldDescription>
            We&apos;ll only use this to contact you about access. We will not
            share your email with anyone else.
          </FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="company-name">Company name</FieldLabel>
          <Input
            id="company-name"
            type="text"
            autoComplete="organization"
            placeholder="Acme Exports"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="referral-source">
            Where did you hear about us?
          </FieldLabel>
          <Select value={referralSource} onValueChange={setReferralSource}>
            <SelectTrigger id="referral-source" className="w-full">
              <SelectValue placeholder="Select an option" />
            </SelectTrigger>
            <SelectContent>
              {REFERRAL_SOURCE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {error ? (
          <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Field>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Please wait…" : "Join Waitlist"}
          </Button>
          <FieldDescription className="px-6 text-center">
            Already have an account?{" "}
            <Link to="/login" className="underline underline-offset-4">
              Sign In
            </Link>
          </FieldDescription>
        </Field>
      </FieldGroup>
    </form>
  )
}
