
import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  FileText,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Target,
  Trophy,
  XCircle,
  AlertCircle,
} from "lucide-react";
import "./QuizArena.css";

const API_URL = "http://localhost:5000/api";

async function readResponse(response) {
  const text = await response.text();

  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      `Server returned an invalid response (HTTP ${response.status}).`
    );
  }

  if (!response.ok || data.success === false) {
    throw new Error(
      data.message ||
        data.error ||
        `Request failed with status ${response.status}.`
    );
  }

  return data;
}

function getQuestionId(question, index) {
  return String(question?._id || question?.id || index);
}

function normalizeQuestion(question, index) {
  return {
    ...question,
    _id: getQuestionId(question, index),
    question: String(question?.question || ""),
    options: Array.isArray(question?.options)
      ? question.options.map((option) => String(option))
      : [],
  };
}

function normalizeResult(data, quiz, answers) {
  const raw = data?.result || data?.results || data?.quizResult || data;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("The server returned an invalid quiz result.");
  }

  const totalQuestions = Number(
    raw.totalQuestions ?? quiz.questions.length
  );

  const correctCount = Number(raw.correctCount ?? 0);
  const wrongCount = Number(raw.wrongCount ?? 0);
  const unansweredCount = Number(
    raw.unansweredCount ??
      Math.max(0, totalQuestions - correctCount - wrongCount)
  );

  const score = Number(
    raw.score ??
      (totalQuestions > 0
        ? Math.round((correctCount / totalQuestions) * 100)
        : 0)
  );

  if (
    !Number.isFinite(totalQuestions) ||
    !Number.isFinite(correctCount) ||
    !Number.isFinite(wrongCount) ||
    !Number.isFinite(unansweredCount) ||
    !Number.isFinite(score)
  ) {
    throw new Error("The server returned invalid scoring data.");
  }

  let reviewResults = Array.isArray(raw.results)
    ? raw.results
    : Array.isArray(raw.answers)
      ? raw.answers
      : [];

  // If the server did not return review entries, avoid crashing
  // and still show the score summary.
  if (reviewResults.length === 0) {
    reviewResults = quiz.questions.map((question, index) => ({
      questionId: question._id,
      question: question.question,
      options: question.options,
      selectedAnswer: answers[question._id] ?? null,
      explanation: "",
      topic: question.topic || "General",
    }));
  }

  return {
    ...raw,
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    score,
    weakTopics: Array.isArray(raw.weakTopics) ? raw.weakTopics : [],
    results: reviewResults,
  };
}

export default function QuizArena({
  documents = [],
  authHeaders,
}) {
  const [selectedDocument, setSelectedDocument] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [questionCount, setQuestionCount] = useState("5");

  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [result, setResult] = useState(null);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("setup");

  const currentQuestion = quiz?.questions?.[currentIndex];

  const answeredCount = useMemo(
    () => Object.keys(answers).length,
    [answers]
  );

  const progress = quiz?.questions?.length
    ? ((currentIndex + 1) / quiz.questions.length) * 100
    : 0;

  function getHeaders() {
    const suppliedHeaders =
      typeof authHeaders === "function"
        ? authHeaders()
        : authHeaders;

    return {
      "Content-Type": "application/json",
      ...(suppliedHeaders || {}),
    };
  }

  async function apiRequest(url, options = {}) {
    let response;

    try {
      response = await fetch(url, {
        ...options,
        headers: {
          ...getHeaders(),
          ...(options.headers || {}),
        },
      });
    } catch {
      throw new Error(
        "Cannot connect to the server. Check that your backend is running on port 5000."
      );
    }

    return readResponse(response);
  }

  async function generateQuiz(event) {
    event?.preventDefault();

    if (loading || submitting) return;

    if (!selectedDocument) {
      setError("Please select a PDF document first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);
    setQuiz(null);
    setAnswers({});
    setCurrentIndex(0);

    try {
      const data = await apiRequest(
        `${API_URL}/quizzes/${encodeURIComponent(
          selectedDocument
        )}/generate`,
        {
          method: "POST",
          body: JSON.stringify({
            difficulty,
            count: Number(questionCount),
          }),
        }
      );

      const generatedQuiz = data.quiz;

      if (
        !generatedQuiz ||
        !generatedQuiz._id ||
        !Array.isArray(generatedQuiz.questions) ||
        generatedQuiz.questions.length === 0
      ) {
        throw new Error(
          "The server did not return a valid quiz. Please try again."
        );
      }

      const questions = generatedQuiz.questions.map(
        normalizeQuestion
      );

      const invalidQuestion = questions.some(
        (question) =>
          !question.question ||
          question.options.length !== 4 ||
          question.options.some((option) => !option)
      );

      if (invalidQuestion) {
        throw new Error(
          "The generated quiz contains an invalid question. Please generate it again."
        );
      }

      setQuiz({
        ...generatedQuiz,
        questions,
      });

      setView("quiz");
    } catch (err) {
      console.error("[QuizArena] Generate failed:", err);
      setError(
        err.message || "Could not generate the quiz. Please try again."
      );
      setView("setup");
    } finally {
      setLoading(false);
    }
  }

  function selectAnswer(questionId, optionIndex) {
    if (view !== "quiz" || submitting) return;

    setAnswers((previous) => ({
      ...previous,
      [questionId]: optionIndex,
    }));

    setError("");
  }

  function goToPrevious() {
    setCurrentIndex((index) => Math.max(0, index - 1));
    setError("");
  }

  function goToNext() {
    setCurrentIndex((index) =>
      Math.min((quiz?.questions?.length || 1) - 1, index + 1)
    );
    setError("");
  }

  async function submitQuiz() {
    if (submitting || loading) return;

    if (!quiz?._id || !Array.isArray(quiz.questions)) {
      setError("Quiz data is missing. Please generate a new quiz.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // IMPORTANT:
      // Send an object keyed by question ID.
      // This matches the backend controller's expected format.
      const formattedAnswers = {};

      quiz.questions.forEach((question, index) => {
        const questionId = getQuestionId(question, index);

        formattedAnswers[questionId] =
          answers[questionId] === undefined
            ? null
            : answers[questionId];
      });

      const data = await apiRequest(
        `${API_URL}/quizzes/${encodeURIComponent(quiz._id)}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            answers: formattedAnswers,
          }),
        }
      );

      const submittedResult = normalizeResult(
        data,
        quiz,
        answers
      );

      // Set a validated result before switching the view.
      setResult(submittedResult);
      setView("result");
      setError("");
    } catch (err) {
      console.error("[QuizArena] Submit failed:", err);

      setError(
        err.message ||
          "Could not submit your quiz. Your selected answers are preserved; you can retry."
      );

      // Keep the quiz and answers visible if submission fails.
      setView("quiz");
    } finally {
      setSubmitting(false);
    }
  }

  function resetArena() {
    setQuiz(null);
    setAnswers({});
    setCurrentIndex(0);
    setResult(null);
    setError("");
    setView("setup");
  }

  const totalQuestions = Number(
    result?.totalQuestions ?? quiz?.questions?.length ?? 0
  );

  const score = Number(result?.score ?? 0);
  const correctCount = Number(result?.correctCount ?? 0);
  const wrongCount = Number(result?.wrongCount ?? 0);

  const unansweredCount = Number(
    result?.unansweredCount ??
      Math.max(0, totalQuestions - answeredCount)
  );

  const weakTopics = Array.isArray(result?.weakTopics)
    ? result.weakTopics
    : [];

  const reviewResults = Array.isArray(result?.results)
    ? result.results
    : [];

  return (
    <section className="quiz-arena" id="quiz-arena">
      <div className="quiz-arena-header">
        <div className="quiz-arena-heading">
          <div className="quiz-arena-icon">
            <Brain size={25} />
          </div>

          <div>
            <div className="quiz-eyebrow">
              <Sparkles size={13} />
              AI-POWERED LEARNING
            </div>

            <h2>Quiz Arena</h2>

            <p>
              Test your understanding, discover knowledge gaps, and
              improve your preparation.
            </p>
          </div>
        </div>

        <div className="quiz-header-badge">
          <Target size={15} />
          Knowledge Gap Detector
        </div>
      </div>

      {error && (
        <motion.div
          className="quiz-error"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
        >
          <AlertCircle size={18} />
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Dismiss error"
          >
            <XCircle size={17} />
          </button>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {view === "setup" && (
          <motion.div
            key="setup"
            className="quiz-setup-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <div className="quiz-card-top">
              <div className="quiz-card-title-icon">
                <BookOpen size={21} />
              </div>

              <div>
                <h3>Create your practice quiz</h3>
                <p>
                  Questions are generated from the content of your
                  uploaded PDF.
                </p>
              </div>
            </div>

            <form onSubmit={generateQuiz}>
              <div className="quiz-form-group">
                <label htmlFor="quiz-document">
                  <FileText size={15} />
                  Select study material
                </label>

                <select
                  id="quiz-document"
                  value={selectedDocument}
                  onChange={(event) =>
                    setSelectedDocument(event.target.value)
                  }
                  required
                >
                  <option value="">Choose an uploaded PDF</option>

                  {documents.map((document) => (
                    <option
                      key={document._id}
                      value={document._id}
                    >
                      {document.originalName}
                    </option>
                  ))}
                </select>

                {documents.length === 0 && (
                  <p className="quiz-field-hint">
                    Upload a PDF in your document library first.
                  </p>
                )}
              </div>

              <div className="quiz-form-grid">
                <div className="quiz-form-group">
                  <label htmlFor="quiz-difficulty">
                    <Brain size={15} />
                    Difficulty
                  </label>

                  <select
                    id="quiz-difficulty"
                    value={difficulty}
                    onChange={(event) =>
                      setDifficulty(event.target.value)
                    }
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div className="quiz-form-group">
                  <label htmlFor="quiz-count">
                    <CircleHelp size={15} />
                    Number of questions
                  </label>

                  <select
                    id="quiz-count"
                    value={questionCount}
                    onChange={(event) =>
                      setQuestionCount(event.target.value)
                    }
                  >
                    {[5, 6, 7, 8, 9, 10].map((count) => (
                      <option key={count} value={String(count)}>
                        {count} Questions
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="quiz-feature-row">
                <div>
                  <CheckCircle2 size={17} />
                  <span>PDF-based questions</span>
                </div>

                <div>
                  <Target size={17} />
                  <span>Weak-topic analysis</span>
                </div>

                <div>
                  <Trophy size={17} />
                  <span>Instant results</span>
                </div>
              </div>

              <button
                className="quiz-primary-button"
                type="submit"
                disabled={loading || documents.length === 0}
              >
                {loading ? (
                  <>
                    <LoaderCircle
                      className="quiz-spinner"
                      size={19}
                    />
                    Generating questions...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} />
                    Generate AI Quiz
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>
          </motion.div>
        )}

        {view === "quiz" && quiz && currentQuestion && (
          <motion.div
            key="quiz"
            className="quiz-question-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="quiz-question-topline">
              <span className="quiz-difficulty-pill">
                {quiz.difficulty || difficulty}
              </span>

              <span className="quiz-question-counter">
                Question {currentIndex + 1} of {quiz.questions.length}
              </span>

              <span className="quiz-answered-count">
                {answeredCount} answered
              </span>
            </div>

            <div className="quiz-progress-track">
              <motion.div
                className="quiz-progress-fill"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.25 }}
              />
            </div>

            <div className="quiz-question-body">
              <div className="quiz-question-label">
                QUESTION {String(currentIndex + 1).padStart(2, "0")}
              </div>

              <h3>{currentQuestion.question}</h3>

              <div className="quiz-options-list">
                {currentQuestion.options.map((option, optionIndex) => {
                  const isSelected =
                    answers[currentQuestion._id] === optionIndex;

                  return (
                    <button
                      key={`${currentQuestion._id}-${optionIndex}`}
                      type="button"
                      className={`quiz-option ${
                        isSelected ? "selected" : ""
                      }`}
                      onClick={() =>
                        selectAnswer(
                          currentQuestion._id,
                          optionIndex
                        )
                      }
                      aria-pressed={isSelected}
                      disabled={submitting}
                    >
                      <span className="quiz-option-letter">
                        {String.fromCharCode(65 + optionIndex)}
                      </span>

                      <span className="quiz-option-text">
                        {option}
                      </span>

                      {isSelected && (
                        <CheckCircle2
                          className="quiz-option-check"
                          size={19}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="quiz-question-footer">
              <button
                type="button"
                className="quiz-secondary-button"
                onClick={goToPrevious}
                disabled={currentIndex === 0 || submitting}
              >
                <ChevronLeft size={18} />
                Previous
              </button>

              <span className="quiz-skip-hint">
                You can skip a question and return later.
              </span>

              {currentIndex < quiz.questions.length - 1 ? (
                <button
                  type="button"
                  className="quiz-primary-button quiz-nav-button"
                  onClick={goToNext}
                  disabled={submitting}
                >
                  Next
                  <ChevronRight size={18} />
                </button>
              ) : (
                <button
                  type="button"
                  className="quiz-primary-button quiz-submit-button"
                  onClick={submitQuiz}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <LoaderCircle
                        className="quiz-spinner"
                        size={18}
                      />
                      Submitting...
                    </>
                  ) : (
                    <>
                      Submit Quiz
                      <CheckCircle2 size={18} />
                    </>
                  )}
                </button>
              )}
            </div>
          </motion.div>
        )}

        {view === "result" && result && (
          <motion.div
            key="result"
            className="quiz-result-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="quiz-result-hero">
              <div className="quiz-result-trophy">
                <Trophy size={30} />
              </div>

              <div className="quiz-result-eyebrow">
                QUIZ COMPLETED
              </div>

              <h3>Here is your performance</h3>

              <p>
                {score >= 80
                  ? "Excellent work! You have a strong understanding of this material."
                  : score >= 50
                    ? "Good effort! Review the topics below to strengthen your understanding."
                    : "Keep practising! Review your explanations and focus on the weak topics below."}
              </p>

              <div className="quiz-score-circle">
                <strong>{score}%</strong>
                <span>YOUR SCORE</span>
              </div>
            </div>

            <div className="quiz-result-stats">
              <div className="quiz-stat-item correct">
                <CheckCircle2 size={20} />
                <strong>{correctCount}</strong>
                <span>Correct</span>
              </div>

              <div className="quiz-stat-item wrong">
                <XCircle size={20} />
                <strong>{wrongCount}</strong>
                <span>Incorrect</span>
              </div>

              <div className="quiz-stat-item skipped">
                <Clock3 size={20} />
                <strong>{unansweredCount}</strong>
                <span>Unanswered</span>
              </div>

              <div className="quiz-stat-item total">
                <CircleHelp size={20} />
                <strong>{totalQuestions}</strong>
                <span>Total</span>
              </div>
            </div>

            {weakTopics.length > 0 && (
              <div className="quiz-weak-topics">
                <div className="quiz-review-heading">
                  <div className="quiz-review-icon">
                    <Target size={19} />
                  </div>

                  <div>
                    <h4>Knowledge gaps detected</h4>
                    <p>
                      Focus on these topics in your next study session.
                    </p>
                  </div>
                </div>

                <div className="quiz-topic-tags">
                  {weakTopics.map((topic, index) => {
                    const topicName =
                      typeof topic === "string"
                        ? topic
                        : topic?.topic || topic?.name || "General";

                    return (
                      <span key={`${topicName}-${index}`}>
                        {topicName}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {reviewResults.length > 0 && (
              <div className="quiz-answer-review">
                <div className="quiz-review-heading">
                  <div className="quiz-review-icon">
                    <BookOpen size={19} />
                  </div>

                  <div>
                    <h4>Answer review</h4>
                    <p>Learn from the answers and explanations.</p>
                  </div>
                </div>

                {reviewResults.map((item, index) => {
                  const questionText =
                    item?.question ||
                    item?.questionText ||
                    `Question ${index + 1}`;

                  const explanation =
                    item?.explanation || item?.reason || "";

                  const correctAnswer =
                    item?.correctAnswerText ??
                    item?.correctAnswer ??
                    item?.correctOption;

                  const selectedAnswer =
                    item?.selectedAnswerText ??
                    item?.selectedAnswer;

                  const isCorrect =
                    typeof item?.isCorrect === "boolean"
                      ? item.isCorrect
                      : typeof item?.correct === "boolean"
                        ? item.correct
                        : typeof item?.selectedAnswer === "number" &&
                            typeof item?.correctAnswer === "number"
                          ? item.selectedAnswer === item.correctAnswer
                          : undefined;

                  function displayAnswer(value, options) {
                    if (value === undefined || value === null) {
                      return "Not answered";
                    }

                    if (
                      typeof value === "number" &&
                      Array.isArray(options) &&
                      value >= 0 &&
                      value < options.length
                    ) {
                      return `${String.fromCharCode(65 + value)}. ${options[value]}`;
                    }

                    return String(value);
                  }

                  return (
                    <div
                      className="quiz-review-item"
                      key={item?.questionId || item?._id || index}
                    >
                      <div className="quiz-review-question">
                        <span className="quiz-review-number">
                          {String(index + 1).padStart(2, "0")}
                        </span>

                        <p>{questionText}</p>

                        {isCorrect === true ? (
                          <CheckCircle2
                            className="quiz-review-correct"
                            size={19}
                          />
                        ) : isCorrect === false ? (
                          <XCircle
                            className="quiz-review-wrong"
                            size={19}
                          />
                        ) : null}
                      </div>

                      <p className="quiz-review-answer">
                        <strong>Your answer:</strong>{" "}
                        {displayAnswer(selectedAnswer, item?.options)}
                      </p>

                      {correctAnswer !== undefined &&
                        correctAnswer !== null && (
                          <p className="quiz-review-answer">
                            <strong>Correct answer:</strong>{" "}
                            {displayAnswer(correctAnswer, item?.options)}
                          </p>
                        )}

                      {explanation && (
                        <div className="quiz-explanation">
                          <Sparkles size={15} />
                          <span>{explanation}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="quiz-result-actions">
              <button
                type="button"
                className="quiz-secondary-button"
                onClick={resetArena}
              >
                <RotateCcw size={17} />
                Create Another Quiz
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
