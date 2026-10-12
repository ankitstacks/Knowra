
const mongoose = require("mongoose");

const quizQuestionSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (options) =>
          Array.isArray(options) && options.length === 4,
        message: "Every question must have exactly four options.",
      },
    },
    correctAnswer: {
      type: Number,
      required: true,
      min: 0,
      max: 3,
      select: false,
    },
    explanation: {
      type: String,
      required: true,
    },
    topic: {
      type: String,
      required: true,
    },
  },
  { _id: true }
);

const quizSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    document: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Document",
      required: true,
      index: true,
    },
    title: {
      type: String,
      default: "AI Practice Exam",
    },
    difficulty: {
      type: String,
      enum: ["easy", "medium", "hard"],
      default: "medium",
    },
    questions: {
      type: [quizQuestionSchema],
      required: true,
    },
    status: {
      type: String,
      enum: ["generated", "completed"],
      default: "generated",
    },
    score: {
      type: Number,
      default: null,
    },
    totalQuestions: {
      type: Number,
      required: true,
    },
    correctCount: {
      type: Number,
      default: null,
    },
    wrongCount: {
      type: Number,
      default: null,
    },
    unansweredCount: {
      type: Number,
      default: null,
    },
    weakTopics: {
      type: [String],
      default: [],
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

quizSchema.index({ owner: 1, document: 1, createdAt: -1 });

module.exports = mongoose.model("Quiz", quizSchema);
