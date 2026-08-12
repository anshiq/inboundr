import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Row,
  Section,
  Tailwind,
  Text,
} from "react-email";
import { barebonesBoxedTailwindConfig } from "./theme";
import { BarebonesFonts } from "./theme-fonts";

export interface WaitlistNotificationEmailProps {
  name: string;
  email: string;
  waitlistCompany: string;
  referralSourceLabel: string;
  adminWaitlistUrl: string;
  companyName?: string;
}

export function WaitlistNotificationEmail({
  name,
  email,
  waitlistCompany,
  referralSourceLabel,
  adminWaitlistUrl,
  companyName = "Inboundr.co",
}: WaitlistNotificationEmailProps) {
  return (
    <Tailwind config={barebonesBoxedTailwindConfig}>
      <Html lang="en">
        <Head>
          <BarebonesFonts />
        </Head>

        <Body className="bg-bg-2 m-0 text-center font-sans">
          <Preview>New waitlist signup from {name}</Preview>
          <Container className="mobile:mt-0 mx-auto mt-8 w-full max-w-[640px]">
            <Section>
              <Section className="bg-bg mobile:px-2 px-6 py-4">
                <Section className="mb-3 px-6">
                  <Row>
                    <Column className="w-1/2 py-[7px] align-middle">
                      <Img
                        src="https://inboundr.co/logo-black.png"
                        alt=""
                        width={140}
                        className="block"
                      />
                    </Column>
                    <Column align="right" className="w-1/2 py-[7px] align-middle">
                      <Text className="font-13 m-0 text-right font-sans">
                        <span className="text-fg-3">{companyName}</span>
                      </Text>
                    </Column>
                  </Row>
                </Section>

                <Section className="bg-bg-2 mobile:px-6 mobile:py-12 rounded-[8px] px-[40px] py-[64px] text-left">
                  <Heading as="h1" className="font-28 text-fg m-0 font-sans">
                    New waitlist signup
                  </Heading>
                  <Section className="bg-bg mt-8 rounded-lg px-5 py-4">
                    <Text className="font-13 text-fg-2 mt-0 mb-2 font-sans">
                      <strong>Name:</strong> {name}
                    </Text>
                    <Text className="font-13 text-fg-2 mt-0 mb-2 font-sans">
                      <strong>Email:</strong> {email}
                    </Text>
                    <Text className="font-13 text-fg-2 mt-0 mb-2 font-sans">
                      <strong>Company:</strong> {waitlistCompany}
                    </Text>
                    <Text className="font-13 text-fg-2 mt-0 mb-0 font-sans">
                      <strong>Heard about us via:</strong> {referralSourceLabel}
                    </Text>
                  </Section>
                  <Text className="font-13 text-fg-2 mt-6 mb-0 font-sans">
                    View the full waitlist in the{" "}
                    <Link
                      href={adminWaitlistUrl}
                      className="text-fg underline underline-offset-2"
                    >
                      Super Admin panel
                    </Link>
                    .
                  </Text>
                </Section>
              </Section>
            </Section>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
}

WaitlistNotificationEmail.PreviewProps = {
  adminWaitlistUrl: "https://app.inboundr.co/admin/waitlist",
  companyName: "Inboundr.co",
  email: "person@example.com",
  name: "Prospect",
  referralSourceLabel: "Friend or colleague",
  waitlistCompany: "Acme Exports",
} satisfies WaitlistNotificationEmailProps;

export default WaitlistNotificationEmail;
