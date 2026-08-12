import { AuthLayout } from "@/components/auth-layout"
import { SignupForm } from "@/components/signup-form"
import { WaitlistForm } from "@/components/waitlist-form"

// Public sign-up is disabled for now: invited users (arriving with an
// inviteToken) still get the real signup form, everyone else joins the
// waitlist.
function hasInviteToken(): boolean {
  return new URLSearchParams(window.location.search).has("inviteToken")
}

export function RegisterPage() {
  return (
    <AuthLayout>{hasInviteToken() ? <SignupForm /> : <WaitlistForm />}</AuthLayout>
  )
}
