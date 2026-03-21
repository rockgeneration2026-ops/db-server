import { Router } from "express";
import { body } from "express-validator";
import { login, me, register, resendVerificationEmail, verifyEmail } from "../controllers/authController.js";
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

export default router;
