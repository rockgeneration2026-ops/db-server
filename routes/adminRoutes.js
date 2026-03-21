import { Router } from "express";
import {
  createUser,
  getDashboardStats,
  getSiteSetting,
  listUsers,
  updateCommentStatus,
  upsertSiteSetting,
  updateUserAccess,
  updateSubmissionStatus
} from "../controllers/adminController.js";
import { authenticate, authorize } from "../middlewares/auth.js";

const router = Router();

router.use(authenticate, authorize("admin", "editor"));
router.get("/dashboard", getDashboardStats);
router.get("/users", authorize("admin"), listUsers);
router.post("/users", authorize("admin"), createUser);
router.patch("/users/:id", authorize("admin"), updateUserAccess);
router.get("/settings/:key", getSiteSetting);
router.put("/settings/:key", upsertSiteSetting);
router.patch("/submissions/:id", updateSubmissionStatus);
router.patch("/comments/:id", updateCommentStatus);

export default router;
