import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, "../uploads");
const blogUploadsDir = path.join(uploadsRoot, "blogs");
const adUploadsDir = path.join(uploadsRoot, "ads");
const galleryUploadsDir = path.join(uploadsRoot, "gallery");

fs.mkdirSync(blogUploadsDir, { recursive: true });
fs.mkdirSync(adUploadsDir, { recursive: true });
fs.mkdirSync(galleryUploadsDir, { recursive: true });

const createStorage = (targetDir) =>
  multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, targetDir);
    },
    filename: (req, file, cb) => {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "-").toLowerCase();
      cb(null, `${Date.now()}-${safeName}`);
    }
  });

const imageFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith("image/")) {
    cb(new Error("Only image uploads are allowed."));
    return;
  }
  cb(null, true);
};

export const uploadBlogImage = multer({
  storage: createStorage(blogUploadsDir),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

export const uploadAdImage = multer({
  storage: createStorage(adUploadsDir),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

export const uploadGalleryImage = multer({
  storage: createStorage(galleryUploadsDir),
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});
