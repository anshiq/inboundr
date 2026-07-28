import { createElement, type ReactElement } from "react";
import type { Response } from "express";
import { renderToBuffer, renderToStream, type DocumentProps } from "@react-pdf/renderer";
import { safePdfFilename, type PdfOrganizationBranding } from "./pdf-branding.service";
import { EmailDocument } from "./email-pdf/EmailDocument";
import type { PdfEmail, PdfEmailAttachment, PdfEmailClassification } from "./email-pdf/types";

export type { PdfEmail, PdfEmailAttachment, PdfEmailClassification };

function createEmailElement(
  email: PdfEmail,
  branding: PdfOrganizationBranding,
  classification: PdfEmailClassification | null
): ReactElement<DocumentProps> {
  // EmailDocument renders a <Document>; cast so the react-pdf renderers, which
  // are typed to accept a Document element specifically, accept it.
  return createElement(EmailDocument, {
    email,
    branding,
    classification,
  }) as unknown as ReactElement<DocumentProps>;
}

export function renderEmailPdfBuffer(
  email: PdfEmail,
  branding: PdfOrganizationBranding,
  classification: PdfEmailClassification | null = null
): Promise<Buffer> {
  return renderToBuffer(createEmailElement(email, branding, classification));
}

export async function streamEmailPdf(
  email: PdfEmail,
  branding: PdfOrganizationBranding,
  classification: PdfEmailClassification | null,
  res: Response,
  options: { inline?: boolean } = {}
): Promise<void> {
  const stream = await renderToStream(createEmailElement(email, branding, classification));
  const disposition = options.inline ? "inline" : "attachment";
  const filename = safePdfFilename(email.subject || `email_${String(email._id)}`, "email");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${filename}.pdf"`);

  stream.on("error", (err) => {
    console.error("Error streaming email PDF:", err);
    res.destroy(err);
  });
  stream.pipe(res);
}
