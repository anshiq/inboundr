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
import { API_ORIGIN } from "@/lib/env"

export function WaitlistForm({
  className,
  ...props
}: React.ComponentProps<"form">) {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hasJoined, setHasJoined] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      const response = await fetch(`${API_ORIGIN}/api/v1/public/waitlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
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
              Thanks for your interest! We&apos;ll email {email} as soon as
              your spot opens up.
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
            Account creation is currently invite-only. Leave your email and
            we&apos;ll let you know when your spot opens up.
          </p>
        </div>
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
