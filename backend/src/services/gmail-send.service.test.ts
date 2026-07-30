import { describe, expect, test } from "bun:test";
import { buildReferences } from "./gmail-send.service";
import type { IEmail } from "../models/email.model";

type Parent = Parameters<typeof buildReferences>[0];

const A = "<a@mail.gmail.com>";
const B = "<b@mail.gmail.com>";
const C = "<c@mail.gmail.com>";

function parent(overrides: Partial<Record<keyof Parent, unknown>>): Parent {
  return {
    references: null,
    inReplyTo: null,
    rfcMessageId: null,
    ...overrides,
  } as unknown as Pick<IEmail, "references" | "inReplyTo" | "rfcMessageId">;
}

describe("buildReferences", () => {
  test("appends the parent's message id to its references chain", () => {
    expect(
      buildReferences(parent({ references: `${A} ${B}`, rfcMessageId: C }))
    ).toBe(`${A} ${B} ${C}`);
  });

  test("does not repeat an in-reply-to already ending the chain", () => {
    // The shape of essentially every real inbound reply: In-Reply-To is the
    // last id of References.
    expect(
      buildReferences(
        parent({ references: `${A} ${B}`, inReplyTo: B, rfcMessageId: C })
      )
    ).toBe(`${A} ${B} ${C}`);
  });

  test("falls back to in-reply-to when the parent has no references", () => {
    expect(buildReferences(parent({ inReplyTo: B, rfcMessageId: C }))).toBe(
      `${B} ${C}`
    );
  });

  test("keeps an in-reply-to that is missing from the references chain", () => {
    expect(
      buildReferences(
        parent({ references: `${A} ${B}`, inReplyTo: C, rfcMessageId: C })
      )
    ).toBe(`${A} ${B} ${C}`);
  });

  test("starts a chain from a parent that is the first message", () => {
    expect(buildReferences(parent({ rfcMessageId: A }))).toBe(A);
  });

  test("drops duplicates from a malformed inbound chain", () => {
    expect(
      buildReferences(parent({ references: `${A} ${B} ${A}`, rfcMessageId: C }))
    ).toBe(`${A} ${B} ${C}`);
  });

  test("does not re-append a message id already in the chain", () => {
    expect(
      buildReferences(parent({ references: `${A} ${B}`, rfcMessageId: B }))
    ).toBe(`${A} ${B}`);
  });

  test("normalizes folded and padded header whitespace", () => {
    expect(
      buildReferences(parent({ references: `  ${A}\r\n  ${B} `, rfcMessageId: C }))
    ).toBe(`${A} ${B} ${C}`);
  });

  test("returns undefined when there is nothing to reference", () => {
    expect(buildReferences(parent({ references: "", inReplyTo: "  " }))).toBeUndefined();
  });
});
