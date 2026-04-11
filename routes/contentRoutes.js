import { Router } from "express";
import {
  createComment,
  createContent,
  createSubmission,
  deleteContent,
  getContentBySlug,
  getHomepage,
  getPublicSetting,
  listCategories,
  listComments,
  listContent,
  listUploadedImages,
  listSubmissions,
  submitUserBlog,
  trackAnalytics,
  uploadAdImage,
  uploadGalleryImageAsset,
  uploadEditorImage,
  updateContent
} from "../controllers/contentController.js";
import { attachUserIfAuthenticated, authenticate, authorize } from "../middlewares/auth.js";
import { uploadAdImage as uploadAdImageFile, uploadBlogImage, uploadGalleryImage } from "../middlewares/upload.js";

const router = Router();

router.use(attachUserIfAuthenticated);

router.get("/home", getHomepage);
router.get("/categories", listCategories);
router.get("/settings/:key", getPublicSetting);

router.get("/tools", listContent("tools"));
router.get("/tools/:slug", getContentBySlug("tools"));
router.post("/tools", authenticate, authorize("admin", "editor"), createContent("tools"));
router.put("/tools/:id", authenticate, authorize("admin", "editor"), updateContent("tools"));
router.delete("/tools/:id", authenticate, authorize("admin"), deleteContent("tools"));

router.get("/calculators", listContent("calculators"));
router.get("/calculators/:slug", getContentBySlug("calculators"));
router.post("/calculators", authenticate, authorize("admin", "editor"), createContent("calculators"));
router.put("/calculators/:id", authenticate, authorize("admin", "editor"), updateContent("calculators"));
router.delete("/calculators/:id", authenticate, authorize("admin"), deleteContent("calculators"));

router.get("/ai-tools", listContent("ai-tools"));
router.get("/ai-tools/:slug", getContentBySlug("ai-tools"));
router.post("/ai-tools", authenticate, authorize("admin", "editor"), createContent("ai-tools"));
router.put("/ai-tools/:id", authenticate, authorize("admin", "editor"), updateContent("ai-tools"));
router.delete("/ai-tools/:id", authenticate, authorize("admin"), deleteContent("ai-tools"));

router.get("/blogs", listContent("blogs"));
router.get("/blogs/:slug", getContentBySlug("blogs"));
router.post("/blogs", authenticate, authorize("admin", "editor"), createContent("blogs"));
router.post("/blogs/user-submit", authenticate, submitUserBlog);
router.put("/blogs/:id", authenticate, authorize("admin", "editor"), updateContent("blogs"));
router.delete("/blogs/:id", authenticate, authorize("admin"), deleteContent("blogs"));

router.get("/ads", listContent("ads"));
router.post("/ads", authenticate, authorize("admin"), createContent("ads"));
router.put("/ads/:id", authenticate, authorize("admin"), updateContent("ads"));
router.delete("/ads/:id", authenticate, authorize("admin"), deleteContent("ads"));

router.get("/comments", listComments);
router.post("/comments", createComment);

router.get("/submissions", authenticate, authorize("admin", "editor"), listSubmissions);
router.post("/submissions", createSubmission);

router.post("/analytics", trackAnalytics);
router.post(
  "/uploads/blog-image",
  authenticate,
  authorize("admin", "editor"),
  uploadBlogImage.single("image"),
  uploadEditorImage
);
router.post(
  "/uploads/ad-image",
  authenticate,
  authorize("admin"),
  uploadAdImageFile.single("image"),
  uploadAdImage
);
router.get(
  "/uploads/gallery",
  authenticate,
  authorize("admin", "editor"),
  listUploadedImages
);
router.post(
  "/uploads/image",
  authenticate,
  authorize("admin", "editor"),
  uploadGalleryImage.single("image"),
  uploadGalleryImageAsset
);

export default router;
