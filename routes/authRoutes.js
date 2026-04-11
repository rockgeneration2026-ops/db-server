import { Router } from "express";
import { body } from "express-validator";
import { login, me, register, resendVerificationEmail, updateMe, verifyEmail } from "../controllers/authController.js";
import { authenticate } from "../middlewares/auth.js";
import { handleValidation } from "../middlewares/validate.js";

const router = Router();

router.post(
  "/register",
  [body("name").trim().notEmpty(), body("email").isEmail(), body("password").isLength({ min: 8 }), handleValidation],
  register
);

router.post("/login", [body("email").isEmail(), body("password").notEmpty(), handleValidation], login);
router.post("/verify-email", [body("token").notEmpty(), handleValidation], verifyEmail);
router.post("/resend-verification", [body("email").isEmail(), handleValidation], resendVerificationEmail);
router.get("/me", authenticate, me);
router.patch(
  "/me",
  authenticate,
  [
    body("name").optional().isString().trim().isLength({ min: 1, max: 120 }),
    body("bio").optional().isString().isLength({ max: 2000 }),
    body("avatarUrl").optional().isString().isLength({ max: 255 }),
    handleValidation
  ],
  updateMe
);

export default router;
