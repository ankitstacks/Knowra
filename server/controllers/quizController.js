
const mongoose = require("mongoose");
const { GoogleGenAI } = require("@google/genai");

const Quiz = require("../models/Quiz");
const Document = require("../models/Document");

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const GEMINI_MODEL =
  process.env.GEMINI_QUIZ_MODEL ||
  process.env.GEMINI_MODEL ||
  "gemini-3.1-flash-lite";

const MIN_QUESTIONS = 5;
const MAX_QUESTIONS = 10;
const MAX_CONTEXT_LENGTH = 10000;

// --------------------------------------------------
// Helpers
// --------------------------------------------------

function getUserId(req) {
  return (
    req.userId ||
    req.user?.userId ||
    req.user?.id ||
    req.user?._id ||
    null
  );
}

function validId(id) {
  return (
    typeof id === "string" &&
    mongoose.Types.ObjectId.isValid(id) &&
    String(new mongoose.Types.ObjectId(id)) === id
  );
}

function normalizeTopics(topics) {
  if (!Array.isArray(topics)) return [];

  return [
    ...new Set(
      topics
        .map((topic) =>
          typeof topic === "string"
            ? topic.trim()
            : String(topic?.topic || topic?.name || "").trim()
        )
        .filter(Boolean)
    ),
  ];
}

function parseJSON(text) {
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Gemini returned an empty response.");
  }

  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start === -1 || end <= start) {
    throw new Error("Gemini returned invalid or incomplete JSON.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function prepareContext(text) {
  const content = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();

  if (content.length <= MAX_CONTEXT_LENGTH) {
    return content;
  }

  // Select portions from across the document.
  const segmentSize = Math.floor(MAX_CONTEXT_LENGTH / 5);
  const lastStart = Math.max(0, content.length - segmentSize);
  const starts = [
    0,
    Math.floor(content.length * 0.25),
    Math.floor(content.length * 0.5),
    Math.floor(content.length * 0.75),
    lastStart,
  ];

  return starts
    .map((start) => content.slice(start, start + segmentSize).trim())
    .filter(Boolean)
    .join("\n\n[Document excerpt]\n\n")
    .slice(0, MAX_CONTEXT_LENGTH);
}

function publicQuestion(question) {
  return {
    _id: question._id,
    question: question.question,
    options: question.options,
    topic: question.topic,
  };
}

function errorResponse(res, message, error, status = 500) {
  return res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === "development"
      ? { error: error?.message }
      : {}),
  });
}

// --------------------------------------------------
// Generate quiz
// POST /api/quizzes/:documentId/generate
// --------------------------------------------------

const generateQuiz = async (req, res) => {
  const startedAt = Date.now();
  let stage = "validation";

  try {
    const userId = getUserId(req);
    const { documentId } = req.params;

    if (!userId || !validId(String(userId))) {
      return res.status(401).json({
        success: false,
        message: "Please sign in again.",
      });
    }

    if (!validId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    if (!ai) {
      return res.status(500).json({
        success: false,
        message: "GEMINI_API_KEY is missing from server configuration.",
      });
    }

    let {
      difficulty = "medium",
      count = 5,
      focusTopics = [],
    } = req.body || {};

    difficulty = String(difficulty).toLowerCase();
    count = Number(count);
    focusTopics = normalizeTopics(focusTopics).slice(0, 10);

    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return res.status(400).json({
        success: false,
        message: "Difficulty must be easy, medium, or hard.",
      });
    }

    if (
      !Number.isInteger(count) ||
      count < MIN_QUESTIONS ||
      count > MAX_QUESTIONS
    ) {
      return res.status(400).json({
        success: false,
        message: "Choose between 5 and 10 questions.",
      });
    }

    // Find a document owned by the signed-in user.
    stage = "document lookup";
    const dbStartedAt = Date.now();

    const document = await Document.findOne({
      _id: documentId,
      owner: userId,
    })
      .select("originalName +extractedText")
      .lean();

    console.log(
      `[Knowra Quiz] Document lookup: ${Date.now() - dbStartedAt}ms`
    );

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found in your account.",
      });
    }

    if (!document.extractedText?.trim()) {
      return res.status(422).json({
        success: false,
        message: "This PDF has no extracted text.",
      });
    }

    stage = "context preparation";

    const context = prepareContext(document.extractedText);

    const focusInstruction = focusTopics.length
      ? `Prioritize these topics:\n${focusTopics.join(", ")}\n`
      : "";

    const prompt = `
Generate exactly ${count} ${difficulty}-difficulty multiple-choice
questions for an academic quiz based only on the supplied document.

${focusInstruction}

Requirements:
- Exactly four distinct options per question.
- Exactly one correct option per question.
- correctAnswer must be an integer from 0 to 3.
- Every question needs a short explanation and topic.
- Do not repeat questions.
- Do not invent facts not supported by the document.
- Return JSON only, without Markdown.

JSON structure:
{
  "title": "Short quiz title",
  "questions": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Why the answer is correct",
      "topic": "Topic name"
    }
  ]
}

DOCUMENT:
${context}
`.trim();

    // Generate questions.
    stage = "Gemini generation";
    const geminiStartedAt = Date.now();

    let response;

    try {
      response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: Math.min(3000, count * 300),
        },
      });
    } finally {
      console.log(
        `[Knowra Quiz] Gemini generation: ${
          Date.now() - geminiStartedAt
        }ms`
      );
    }

    stage = "response validation";

    const generated = parseJSON(response.text);

    if (
      !Array.isArray(generated.questions) ||
      generated.questions.length !== count
    ) {
      return res.status(502).json({
        success: false,
        message: "AI generated an unexpected number of questions. Please retry.",
      });
    }

    const questions = [];

    for (const item of generated.questions) {
      const question = String(item?.question || "").trim();

      const options = Array.isArray(item?.options)
        ? item.options.map((option) => String(option).trim())
        : [];

      const correctAnswer = Number(item?.correctAnswer);
      const explanation = String(item?.explanation || "").trim();
      const topic = String(item?.topic || "General").trim();

      if (
        !question ||
        options.length !== 4 ||
        options.some((option) => !option) ||
        new Set(options.map((option) => option.toLowerCase())).size !== 4 ||
        !Number.isInteger(correctAnswer) ||
        correctAnswer < 0 ||
        correctAnswer > 3 ||
        !explanation
      ) {
        return res.status(502).json({
          success: false,
          message: "AI generated an invalid question. Please retry.",
        });
      }

      questions.push({
        question,
        options,
        correctAnswer,
        explanation,
        topic: topic || "General",
      });
    }

    // IMPORTANT:
    // Quiz.js requires totalQuestions.
    // Its allowed statuses are "generated" and "completed".
    stage = "quiz database save";
    const saveStartedAt = Date.now();

    const quiz = await Quiz.create({
      owner: userId,
      document: document._id,
      title:
        String(generated.title || "").trim() ||
        `${document.originalName || "Document"} Quiz`,
      difficulty,
      questions,
      totalQuestions: questions.length,
      status: "generated",
    });

    console.log(
      `[Knowra Quiz] Database save: ${Date.now() - saveStartedAt}ms`
    );

    console.log(
      `[Knowra Quiz] Total generation time: ${Date.now() - startedAt}ms`
    );

    return res.status(201).json({
      success: true,
      message: "Quiz generated successfully.",
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        difficulty: quiz.difficulty,
        totalQuestions: quiz.totalQuestions,
        createdAt: quiz.createdAt,
        questions: quiz.questions.map(publicQuestion),
      },
    });
  } catch (error) {
    console.error(
      `[Knowra Quiz] Failed during ${stage}:`,
      error.message
    );

    const status = Number(error.status || error.statusCode);

    if (status === 429) {
      return errorResponse(
        res,
        "Gemini rate limit reached. Wait and retry.",
        error,
        429
      );
    }

    if (status === 401 || status === 403) {
      return errorResponse(
        res,
        "Gemini authentication failed. Check the API key.",
        error,
        502
      );
    }

    if (status === 404) {
      return errorResponse(
        res,
        "Gemini model not found. Check GEMINI_QUIZ_MODEL.",
        error,
        502
      );
    }

    return errorResponse(res, "Failed to generate quiz.", error);
  }
};

// --------------------------------------------------
// Submit quiz
// POST /api/quizzes/:quizId/submit
// --------------------------------------------------

const submitQuiz = async (req, res) => {
  const startedAt = Date.now();

  try {
    const userId = getUserId(req);
    const { quizId } = req.params;
    const submittedAnswers = req.body?.answers;

    if (!userId || !validId(String(userId))) {
      return res.status(401).json({
        success: false,
        message: "Please sign in again.",
      });
    }

    if (!validId(quizId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid quiz ID.",
      });
    }

    // Accept both object and array answer formats.
    if (
      submittedAnswers === undefined ||
      submittedAnswers === null ||
      typeof submittedAnswers !== "object"
    ) {
      return res.status(400).json({
        success: false,
        message: "Please submit your selected answers.",
      });
    }

    const quiz = await Quiz.findOne({
      _id: quizId,
      owner: userId,
    }).select("+questions.correctAnswer");

    if (!quiz) {
      return res.status(404).json({
        success: false,
        message: "Quiz not found.",
      });
    }

    if (quiz.status === "completed") {
      return res.status(409).json({
        success: false,
        message: "This quiz has already been submitted.",
      });
    }

    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    const topicStats = {};
    const results = [];

    for (let index = 0; index < quiz.questions.length; index++) {
      const question = quiz.questions[index];
      const questionId = question._id.toString();

      let rawAnswer;

      if (Array.isArray(submittedAnswers)) {
        const entry = submittedAnswers[index];

        rawAnswer =
          entry && typeof entry === "object"
            ? entry.selectedAnswer ?? entry.answer ?? entry.value
            : entry;
      } else {
        rawAnswer =
          submittedAnswers[questionId] ??
          submittedAnswers[index];
      }

      const hasAnswer =
        rawAnswer !== undefined &&
        rawAnswer !== null &&
        rawAnswer !== "";

      let selectedAnswer = null;

      if (hasAnswer) {
        if (
          typeof rawAnswer === "string" &&
          /^[A-D]$/i.test(rawAnswer.trim())
        ) {
          selectedAnswer =
            rawAnswer.trim().toUpperCase().charCodeAt(0) - 65;
        } else {
          selectedAnswer = Number(rawAnswer);
        }

        if (
          !Number.isInteger(selectedAnswer) ||
          selectedAnswer < 0 ||
          selectedAnswer > 3
        ) {
          return res.status(400).json({
            success: false,
            message: `Invalid answer for question ${index + 1}.`,
          });
        }
      }

      const correctAnswer = Number(question.correctAnswer);
      const topic = String(question.topic || "General").trim();

      if (!topicStats[topic]) {
        topicStats[topic] = {
          topic,
          total: 0,
          correct: 0,
          wrong: 0,
          unanswered: 0,
        };
      }

      topicStats[topic].total++;

      let isCorrect = false;

      if (!hasAnswer) {
        unansweredCount++;
        topicStats[topic].unanswered++;
      } else if (selectedAnswer === correctAnswer) {
        correctCount++;
        topicStats[topic].correct++;
        isCorrect = true;
      } else {
        wrongCount++;
        topicStats[topic].wrong++;
      }

      results.push({
        questionId,
        question: question.question,
        options: question.options,
        selectedAnswer,
        correctAnswer,
        isCorrect,
        explanation: question.explanation || "",
        topic,
        status: !hasAnswer
          ? "unanswered"
          : isCorrect
            ? "correct"
            : "wrong",
      });
    }

    const totalQuestions = quiz.questions.length;

    const score =
      totalQuestions > 0
        ? Math.round((correctCount / totalQuestions) * 100)
        : 0;

    const weakTopics = Object.values(topicStats)
      .map((item) => ({
        ...item,
        accuracy: item.total
          ? Math.round((item.correct / item.total) * 100)
          : 0,
      }))
      .filter((item) => item.accuracy < 60)
      .sort((a, b) => a.accuracy - b.accuracy);

    quiz.score = score;
    quiz.totalQuestions = totalQuestions;
    quiz.correctCount = correctCount;
    quiz.wrongCount = wrongCount;
    quiz.unansweredCount = unansweredCount;
    quiz.weakTopics = weakTopics.map((item) => item.topic);
    quiz.status = "completed";
    quiz.completedAt = new Date();

    await quiz.save();

    console.log(
      `[Knowra Quiz] Submission completed: ${Date.now() - startedAt}ms`
    );

    return res.status(200).json({
      success: true,
      message: "Quiz submitted successfully.",
      result: {
        quizId: quiz._id,
        title: quiz.title,
        difficulty: quiz.difficulty,
        score,
        correctCount,
        wrongCount,
        unansweredCount,
        totalQuestions,
        accuracy: score,
        weakTopics,
        topicStats: Object.values(topicStats),
        results,
        completedAt: quiz.completedAt,
      },
    });
  } catch (error) {
    console.error("[Knowra Quiz] Submit failed:", error.message);

    return errorResponse(res, "Failed to submit quiz.", error);
  }
};

// --------------------------------------------------
// Quiz history
// GET /api/quizzes/:documentId/history
// --------------------------------------------------

const getQuizHistory = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { documentId } = req.params;

    if (!userId || !validId(String(userId))) {
      return res.status(401).json({
        success: false,
        message: "Please sign in again.",
      });
    }

    if (!validId(documentId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    const document = await Document.findOne({
      _id: documentId,
      owner: userId,
    })
      .select("_id")
      .lean();

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found in your account.",
      });
    }

    const quizzes = await Quiz.find({
      owner: userId,
      document: documentId,
    })
      .select(
        "title difficulty status score totalQuestions correctCount wrongCount unansweredCount weakTopics completedAt createdAt questions"
      )
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();

    const history = quizzes.map((quiz) => ({
      _id: quiz._id,
      title: quiz.title,
      difficulty: quiz.difficulty,
      status: quiz.status,
      score: quiz.score ?? null,
      correctCount: quiz.correctCount ?? 0,
      wrongCount: quiz.wrongCount ?? 0,
      unansweredCount: quiz.unansweredCount ?? 0,
      totalQuestions: quiz.totalQuestions ?? quiz.questions?.length ?? 0,
      weakTopics: normalizeTopics(quiz.weakTopics),
      completedAt: quiz.completedAt || null,
      createdAt: quiz.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: history.length,
      quizzes: history,
    });
  } catch (error) {
    console.error("[Knowra Quiz] History failed:", error.message);
    return errorResponse(res, "Failed to load quiz history.", error);
  }
};

// --------------------------------------------------
// Quiz analytics
// GET /api/quizzes/analytics/overview
// --------------------------------------------------

const getQuizAnalytics = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId || !validId(String(userId))) {
      return res.status(401).json({
        success: false,
        message: "Please sign in again.",
      });
    }

    const quizzes = await Quiz.find({
      owner: userId,
      status: "completed",
    })
      .select(
        "title difficulty score totalQuestions correctCount wrongCount unansweredCount weakTopics document completedAt createdAt"
      )
      .sort({ completedAt: -1, createdAt: -1 })
      .lean();

    const totalAttempts = quizzes.length;

    const totalQuestions = quizzes.reduce(
      (sum, quiz) => sum + (quiz.totalQuestions || 0),
      0
    );

    const totalCorrect = quizzes.reduce(
      (sum, quiz) => sum + (quiz.correctCount || 0),
      0
    );

    const totalWrong = quizzes.reduce(
      (sum, quiz) => sum + (quiz.wrongCount || 0),
      0
    );

    const totalUnanswered = quizzes.reduce(
      (sum, quiz) => sum + (quiz.unansweredCount || 0),
      0
    );

    const averageScore = totalAttempts
      ? Math.round(
          quizzes.reduce((sum, quiz) => sum + (quiz.score || 0), 0) /
            totalAttempts
        )
      : 0;

    const bestScore = totalAttempts
      ? Math.max(...quizzes.map((quiz) => quiz.score || 0))
      : 0;

    const accuracy = totalQuestions
      ? Math.round((totalCorrect / totalQuestions) * 100)
      : 0;

    const topicCounts = {};

    for (const quiz of quizzes) {
      for (const topic of normalizeTopics(quiz.weakTopics)) {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
      }
    }

    const weakTopics = Object.entries(topicCounts)
      .map(([topic, occurrences]) => ({ topic, occurrences }))
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10);

    const scoreTrend = [...quizzes].reverse().map((quiz) => ({
      quizId: quiz._id,
      title: quiz.title,
      score: quiz.score || 0,
      difficulty: quiz.difficulty,
      date: quiz.completedAt || quiz.createdAt,
    }));

    const recentQuizzes = quizzes.slice(0, 10).map((quiz) => ({
      _id: quiz._id,
      title: quiz.title,
      difficulty: quiz.difficulty,
      score: quiz.score || 0,
      correctCount: quiz.correctCount || 0,
      wrongCount: quiz.wrongCount || 0,
      unansweredCount: quiz.unansweredCount || 0,
      totalQuestions: quiz.totalQuestions || 0,
      weakTopics: normalizeTopics(quiz.weakTopics),
      completedAt: quiz.completedAt || null,
      createdAt: quiz.createdAt,
    }));

    return res.status(200).json({
      success: true,
      analytics: {
        totalAttempts,
        averageScore,
        bestScore,
        accuracy,
        totalQuestions,
        totalCorrect,
        totalWrong,
        totalUnanswered,
        weakTopics,
        scoreTrend,
        recentQuizzes,
      },
    });
  } catch (error) {
    console.error("[Knowra Quiz] Analytics failed:", error.message);

    return errorResponse(res, "Failed to load quiz analytics.", error);
  }
};

module.exports = {
  generateQuiz,
  submitQuiz,
  getQuizHistory,
  getQuizAnalytics,
};
