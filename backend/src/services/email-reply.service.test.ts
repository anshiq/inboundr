import { describe, expect, test } from "bun:test";
import { canReplyAll, deriveRecipients } from "./email-reply.service";
import type { IEmail } from "../models/email.model";

const ME = "me@acme.com";

type Anchor = Parameters<typeof deriveRecipients>[0];

function anchor(overrides: Partial<Record<keyof Anchor, unknown>>): Anchor {
  return {
    from: "",
    to: "",
    cc: null,
    replyTo: null,
    subject: "Quote request",
    direction: "inbound",
    ...overrides,
  } as unknown as Pick<
    IEmail,
    "from" | "to" | "cc" | "replyTo" | "subject" | "direction"
  >;
}

describe("deriveRecipients", () => {
  test("replies to the sender", () => {
    const derived = deriveRecipients(
      anchor({ from: "Ana <ana@buyer.com>", to: ME }),
      "reply",
      ME
    );
    expect(derived.to).toBe("Ana <ana@buyer.com>");
    expect(derived.cc).toBeNull();
  });

  test("prefers Reply-To over From", () => {
    const derived = deriveRecipients(
      anchor({ from: "noreply@list.com", replyTo: "list@list.com", to: ME }),
      "reply",
      ME
    );
    expect(derived.to).toBe("list@list.com");
  });

  test("reply-all copies the other recipients but never the account itself", () => {
    const derived = deriveRecipients(
      anchor({
        from: "ana@buyer.com",
        to: `${ME}, bob@buyer.com`,
        cc: "carol@buyer.com",
      }),
      "reply_all",
      ME
    );
    expect(derived.to).toBe("ana@buyer.com");
    expect(derived.cc).toBe("bob@buyer.com, carol@buyer.com");
  });

  test("reply-all drops the sender from Cc and de-duplicates", () => {
    const derived = deriveRecipients(
      anchor({
        from: "ana@buyer.com",
        to: `${ME}, ana@buyer.com`,
        cc: "bob@buyer.com, BOB@buyer.com",
      }),
      "reply_all",
      ME
    );
    expect(derived.cc).toBe("bob@buyer.com");
  });

  test("forward starts with no recipients", () => {
    const derived = deriveRecipients(
      anchor({ from: "ana@buyer.com", to: ME, cc: "bob@buyer.com" }),
      "forward",
      ME
    );
    expect(derived.to).toBe("");
    expect(derived.cc).toBeNull();
  });

  // Regression: a legacy row stored before the direction field existed has no
  // such key, and lean() reads skip schema defaults, so it must not be mistaken
  // for one of our own sent messages.
  test("treats a missing direction as inbound", () => {
    const legacy = anchor({ from: "ana@buyer.com", to: ME });
    delete (legacy as Record<string, unknown>).direction;

    expect(deriveRecipients(legacy, "reply", ME).to).toBe("ana@buyer.com");
  });

  // Regression: replying to the thread when the newest message is our own must
  // reach the people we wrote to, not loop back to the account.
  describe("when the anchor is one of our own sent messages", () => {
    test("reply addresses who that message was sent to", () => {
      const derived = deriveRecipients(
        anchor({ from: ME, to: "ana@buyer.com", direction: "outbound" }),
        "reply",
        ME
      );
      expect(derived.to).toBe("ana@buyer.com");
      expect(derived.cc).toBeNull();
    });

    test("reply ignores our own Reply-To", () => {
      const derived = deriveRecipients(
        anchor({
          from: ME,
          replyTo: "sales@acme.com",
          to: "ana@buyer.com",
          direction: "outbound",
        }),
        "reply",
        ME
      );
      expect(derived.to).toBe("ana@buyer.com");
    });

    test("reply-all keeps every recipient and carries the Cc", () => {
      const derived = deriveRecipients(
        anchor({
          from: ME,
          to: "ana@buyer.com, bob@buyer.com",
          cc: `carol@buyer.com, ${ME}`,
          direction: "outbound",
        }),
        "reply_all",
        ME
      );
      expect(derived.to).toBe("ana@buyer.com, bob@buyer.com");
      expect(derived.cc).toBe("carol@buyer.com");
    });
  });
});

describe("canReplyAll", () => {
  test("is false for a lone sender with no Cc", () => {
    expect(canReplyAll(anchor({ from: "ana@buyer.com", to: ME }), ME)).toBe(false);
  });

  test("is false when the only other recipient is the account itself", () => {
    expect(
      canReplyAll(anchor({ from: "ana@buyer.com", to: `${ME}, me@acme.com` }), ME)
    ).toBe(false);
  });

  test("is true when another recipient is on To", () => {
    expect(
      canReplyAll(anchor({ from: "ana@buyer.com", to: `${ME}, bob@buyer.com` }), ME)
    ).toBe(true);
  });

  test("is true when someone is on Cc", () => {
    expect(
      canReplyAll(
        anchor({ from: "ana@buyer.com", to: ME, cc: "bob@buyer.com" }),
        ME
      )
    ).toBe(true);
  });

  test("is false for our own sent message with a single recipient", () => {
    expect(
      canReplyAll(
        anchor({ from: ME, to: "ana@buyer.com", direction: "outbound" }),
        ME
      )
    ).toBe(false);
  });

  test("is true for our own sent message that had a Cc", () => {
    expect(
      canReplyAll(
        anchor({
          from: ME,
          to: "ana@buyer.com",
          cc: "bob@buyer.com",
          direction: "outbound",
        }),
        ME
      )
    ).toBe(true);
  });
});
