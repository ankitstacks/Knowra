
const express = require("express");
const multer = require("multer");

const authMiddleware = require("../middleware/authMiddleware");

const {
  uploadDocument,
  getDocuments,
  deleteDocument,
} = require("../controllers/documentController");

const router = express.Router();

// Store PDF in memory before sending it to the controller.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // Maximum 10 MB
    files: 1,
  },
  fileFilter: (req, file, callback) => {
    const isPdf =
      file.mimetype === "application/pdf" &&
      file.originalname.toLowerCase().endsWith(".pdf");

    if (!isPdf) {
      return callback(
        new Error("Only PDF files are allowed.")
      );
    }

    callback(null, true);
  },
});

// Consistent error handling for PDF uploads.
const handlePdfUpload = (req, res, next) => {
  upload.single("pdf")(req, res, (error) => {
    if (!error) {
      return next();
    }

    const message =
      error instanceof multer.MulterError
        ? error.code === "LIMIT_FILE_SIZE"
          ? "PDF size must not exceed 10 MB."
          : error.message
        : error.message || "PDF upload failed.";

    return res.status(400).json({
      success: false,
      message,
    });
  });
};

// Upload a PDF.
// Authentication must succeed before file processing.
router.post(
  "/",
  authMiddleware,
  handlePdfUpload,
  uploadDocument
);

// Get documents belonging to the logged-in user.
router.get(
  "/",
  authMiddleware,
  getDocuments
);

// Delete a document belonging to the logged-in user.
router.delete(
  "/:id",
  authMiddleware,
  deleteDocument
);

module.exports = router;
