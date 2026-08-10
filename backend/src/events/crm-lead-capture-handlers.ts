import { registerDomainEventHandler } from "./domain-events";
import { Form } from "../models/form.model";
import { FormSubmission } from "../models/form-submission.model";
import { Organization } from "../models/organization.model";
import { hasEffectiveFeature } from "../services/entitlement.service";
import { createCapturedLead } from "../services/crm.service";

function submissionValue(values: Record<string, unknown>, fieldId: string | null): string | null {
  if (!fieldId) return null;
  const raw = values[fieldId];
  if (raw === null || raw === undefined) return null;
  const text = Array.isArray(raw) ? raw.map(String).join(", ") : String(raw);
  return text.trim().slice(0, 300) || null;
}

export function registerCrmLeadCaptureHandlers(): void {
  registerDomainEventHandler("form.submitted", async ({ formId, submissionId, organizationId }) => {
    const form = await Form.findById(formId).lean();
    if (!form?.leadCapture?.enabled) return;
    if (String(form.organizationId) !== organizationId) return;

    const organization = await Organization.findById(organizationId).lean();
    if (!organization || !hasEffectiveFeature(organization, "crm")) return;

    const submission = await FormSubmission.findById(submissionId).lean();
    if (!submission) return;

    const values = (submission.values ?? {}) as Record<string, unknown>;
    const contactName = submissionValue(values, form.leadCapture.nameFieldId);
    const email = submissionValue(values, form.leadCapture.emailFieldId);
    const phone = submissionValue(values, form.leadCapture.phoneFieldId);
    const company = submissionValue(values, form.leadCapture.companyFieldId);

    // Without any identifying detail there is nothing worth tracking as a lead.
    if (!contactName && !email && !phone) return;

    await createCapturedLead({
      organizationId: form.organizationId,
      title: `${form.title}: ${contactName ?? email ?? phone}`,
      contactName,
      company,
      email,
      phone,
      source: "form",
      captureNote: `Lead captured from form "${form.title}"`,
      metadata: { formId: String(form._id), submissionId: String(submission._id) },
    });
  });
}
