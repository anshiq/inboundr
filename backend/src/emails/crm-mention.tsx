import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from "react-email";
import { barebonesBoxedTailwindConfig } from "./theme";
import { BarebonesFonts } from "./theme-fonts";

export interface CrmMentionEmailProps {
  recipientName: string;
  actorName: string;
  organizationName: string;
  leadTitle: string;
  /** Plain-text excerpt of the note the recipient was mentioned in. */
  noteExcerpt: string;
  leadUrl: string;
  companyName?: string;
}

export function CrmMentionEmail({
  recipientName,
  actorName,
  organizationName,
  leadTitle,
  noteExcerpt,
  leadUrl,
  companyName = "Inboundr.co",
}: CrmMentionEmailProps) {
  const displayActor = actorName.trim() || "A teammate";
  const greetingName = recipientName.trim().split(/\s+/)[0] || "there";
  const preview = `${displayActor} mentioned you in a note on "${leadTitle}"`;

  return (
    <Tailwind config={barebonesBoxedTailwindConfig}>
      <Html lang="en">
        <Head>
          <BarebonesFonts />
        </Head>
        <Body className="bg-bg-2 m-0 text-center font-sans">
          <Preview>{preview}</Preview>
          <Container className="mobile:mt-0 mx-auto mt-8 w-full max-w-[640px]">
            <Section className="bg-bg mobile:px-2 px-6 py-4">
              <Section className="mb-3 px-6 text-left">
                <Img
                  src="https://inboundr.co/logo-black.png"
                  alt={companyName}
                  width={140}
                  className="block"
                />
              </Section>
              <Section className="bg-bg-2 mobile:px-6 mobile:py-12 rounded-[8px] px-[40px] py-[56px] text-center">
                <Img
                  src="https://inboundr.co/mark-black.png"
                  alt=""
                  width={44}
                  className="mx-auto mb-5 block"
                />
                <Heading as="h1" className="font-28 text-fg m-0 font-sans">
                  You were mentioned in a note
                </Heading>
                <Text className="font-16 text-fg-2 mx-auto mt-4 mb-4 max-w-[420px] text-center font-sans">
                  Hi {greetingName}, {displayActor} mentioned you in a note on
                  the lead "{leadTitle}" in {organizationName}.
                </Text>
                {noteExcerpt ? (
                  <Section className="bg-bg mx-auto mb-6 max-w-[440px] rounded-[8px] px-5 py-4 text-left">
                    <Text className="font-14 text-fg-2 m-0 font-sans">
                      {noteExcerpt}
                    </Text>
                  </Section>
                ) : null}
                <Button
                  href={leadUrl}
                  className="bg-fg font-16 text-fg-inverted inline-block rounded-lg px-7 py-4 text-center font-sans leading-6"
                >
                  View lead
                </Button>
                <Text className="font-13 text-fg-3 mx-auto mt-8 mb-0 max-w-[400px] text-center font-sans">
                  You are receiving this because a teammate mentioned you in{" "}
                  {organizationName}.
                </Text>
              </Section>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

CrmMentionEmail.PreviewProps = {
  recipientName: "Priya Sharma",
  actorName: "Tushar",
  organizationName: "Acme",
  leadTitle: "Salesforce CRM Migration",
  noteExcerpt:
    "Spoke to the buyer today — they want a revised quote by Friday. @Priya Sharma can you own the follow-up call?",
  leadUrl: "https://example.com/crm/1",
} satisfies CrmMentionEmailProps;

export default CrmMentionEmail;
