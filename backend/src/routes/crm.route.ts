import { Router } from "express";
import {
  addNote,
  archiveLead,
  convertLead,
  createActivity,
  createLead,
  createStage,
  deleteActivity,
  deleteStage,
  getBoard,
  getLead,
  listActivities,
  listAllActivities,
  listStages,
  listTimeline,
  markActivityDone,
  markLeadLost,
  moveLead,
  reorderStages,
  restoreLead,
  sendLeadEmail,
  updateActivity,
  updateLead,
  updateStage,
} from "../controllers/crm.controller";
import {
  requireAuth,
  requireEmployeeModule,
  requireFeature,
  requireOrganization,
  requireOrganizationAdmin,
} from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth);
router.use(requireOrganization);
router.use(requireFeature("crm"));
router.use(requireEmployeeModule("crm"));

router.get("/board", getBoard);
router.get("/activities", listAllActivities);

router.get("/stages", listStages);
router.post("/stages", requireOrganizationAdmin(), createStage);
router.put("/stages/reorder", requireOrganizationAdmin(), reorderStages);
router.put("/stages/:stageId", requireOrganizationAdmin(), updateStage);
router.delete("/stages/:stageId", requireOrganizationAdmin(), deleteStage);

router.post("/leads", createLead);
router.get("/leads/:id", getLead);
router.put("/leads/:id", updateLead);
router.patch("/leads/:id/archive", archiveLead);
router.patch("/leads/:id/move", moveLead);
router.post("/leads/:id/convert", convertLead);
router.post("/leads/:id/mark-lost", markLeadLost);
router.post("/leads/:id/restore", restoreLead);

router.get("/leads/:id/activities", listActivities);
router.post("/leads/:id/activities", createActivity);
router.put("/activities/:activityId", updateActivity);
router.patch("/activities/:activityId/done", markActivityDone);
router.delete("/activities/:activityId", deleteActivity);

router.get("/leads/:id/timeline", listTimeline);
router.post("/leads/:id/notes", addNote);
router.post("/leads/:id/send-email", sendLeadEmail);

export default router;
