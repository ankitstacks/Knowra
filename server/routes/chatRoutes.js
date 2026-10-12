
const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");

const {
  chatWithDocument,
  getChatHistory,
} = require("../controllers/chatController");

const router = express.Router();

// Load saved conversation for a document
router.get("/:documentId/history", authMiddleware, getChatHistory);

// Ask a question and save the question + AI answer
router.post("/:documentId", authMiddleware, chatWithDocument);

module.exports = router;
