import { Router } from "express";
import {
  dnsLookup,
  hashGenerator,
  ipLookup,
  passwordStrength,
  whoisLookup
} from "../controllers/cyberController.js";

const router = Router();

router.post("/password-strength", passwordStrength);
router.post("/hash-generator", hashGenerator);
router.post("/dns-lookup", dnsLookup);
router.post("/ip-lookup", ipLookup);
router.post("/whois", whoisLookup);

export default router;
