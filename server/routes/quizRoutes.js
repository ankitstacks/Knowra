
const express = require("express");

const {
  generateQuiz,
  submitQuiz,
  getQuizHistory,
  getQuizAnalytics,
} = require("../controllers/quizController");

const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// All quiz endpoints require authentication
router.use(authMiddleware);

// IMPORTANT: Register analytics before parameterized routes
router.get("/analytics/overview", getQuizAnalytics);

router.post("/:documentId/generate", generateQuiz);

router.post("/:quizId/submit", submitQuiz);

router.get("/:documentId/history", getQuizHistory);

module.exports = router;
