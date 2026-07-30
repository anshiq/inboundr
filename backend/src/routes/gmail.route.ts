import { Router } from "express";
import {
  connectGmail,
  disconnectGmailAccount,
  gmailCallback,
  listGmailAccounts,
  updateGmailSignature,
} from "../controllers/gmail.controller";
import {
  requireAuth,
  requireFeature,
  requireOrganization,
  requireOrganizationAdmin,
} from "../middleware/auth.middleware";

const router = Router();

router.get(
  "/connect",
  requireAuth,
  requireOrganization,
  requireFeature("rfq"),
  requireOrganizationAdmin(),
  connectGmail
);
router.get("/callback", gmailCallback);
router.get("/accounts", requireAuth, requireOrganization, requireFeature("rfq"), listGmailAccounts);
// A signature belongs to the connected identity, so its owner edits it without
// needing organization admin rights.
router.patch(
  "/accounts/:id/signature",
  requireAuth,
  requireOrganization,
  requireFeature("rfq"),
  updateGmailSignature
);
router.delete(
  "/accounts/:id",
  requireAuth,
  requireOrganization,
  requireFeature("rfq"),
  requireOrganizationAdmin(),
  disconnectGmailAccount
);

export default router;
