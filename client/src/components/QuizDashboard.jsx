
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  Award,
  BookOpen,
  Brain,
  CheckCircle2,
  RefreshCw,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./QuizDashboard.css";

const API_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

function StatCard({ icon: Icon, label, value, subtitle }) {
  return (
    <div className="qd-stat-card">
      <div className="qd-stat-icon">
        <Icon size={21} />
      </div>
      <div className="qd-stat-label">{label}</div>
      <div className="qd-stat-value">{value}</div>
      <div className="qd-stat-subtitle">{subtitle}</div>
    </div>
  );
}

function formatDate(date) {
  if (!date) return "Not available";

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) return "Not available";

  return parsed.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeAnalytics(payload) {
  // Support both { analytics: {...} } and direct analytics objects.
  const source = payload?.analytics ?? payload?.data?.analytics ??
    payload?.data ?? payload;

  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error("The server returned an invalid analytics response.");
  }

  return {
    totalAttempts: asNumber(source.totalAttempts),
    averageScore: asNumber(source.averageScore),
    bestScore: asNumber(source.bestScore),
    accuracy: asNumber(source.accuracy),
    totalQuestions: asNumber(source.totalQuestions),
    totalCorrect: asNumber(source.totalCorrect),
    totalWrong: asNumber(source.totalWrong),
    totalUnanswered: asNumber(source.totalUnanswered),
    weakTopics: Array.isArray(source.weakTopics)
      ? source.weakTopics
      : [],
    scoreTrend: Array.isArray(source.scoreTrend)
      ? source.scoreTrend
      : [],
    recentQuizzes: Array.isArray(source.recentQuizzes)
      ? source.recentQuizzes
      : [],
  };
}

export default function QuizDashboard({ authHeaders }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const authHeadersRef = useRef(authHeaders);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(false);

  useEffect(() => {
    authHeadersRef.current = authHeaders;
  }, [authHeaders]);

  const loadAnalytics = useCallback(async (showLoading = false) => {
    const requestId = ++requestIdRef.current;

    if (showLoading) {
      setRefreshing(true);
    }

    if (!analytics) {
      setLoading(true);
    }

    setError("");

    try {
      const currentHeaders = authHeadersRef.current;
      const headers =
        typeof currentHeaders === "function"
          ? currentHeaders()
          : currentHeaders;

      const token =
        typeof localStorage !== "undefined"
          ? localStorage.getItem("knowra_token")
          : null;

      const response = await fetch(
        `${API_URL}/quizzes/analytics/overview`,
        {
          method: "GET",
          headers: {
            ...(headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          cache: "no-store",
        }
      );

      let payload;

      try {
        payload = await response.json();
      } catch {
        throw new Error(
          `The server returned an invalid response (HTTP ${response.status}).`
        );
      }

      if (!response.ok || payload?.success !== true) {
        if (response.status === 401) {
          throw new Error("Your session has expired. Please sign in again.");
        }

        if (response.status === 404) {
          throw new Error(
            "Analytics endpoint not found. Check the backend quiz routes."
          );
        }

        throw new Error(
          payload?.message ||
            `Could not load quiz analytics (HTTP ${response.status}).`
        );
      }

      const normalized = normalizeAnalytics(payload);

      // Ignore outdated responses when a newer request has started.
      if (requestId !== requestIdRef.current || !mountedRef.current) {
        return;
      }

      setAnalytics(normalized);
      setError("");
    } catch (err) {
      if (requestId !== requestIdRef.current || !mountedRef.current) {
        return;
      }

      setError(err?.message || "Unable to load quiz analytics.");
    } finally {
      if (requestId === requestIdRef.current && mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [analytics]);

  useEffect(() => {
    mountedRef.current = true;
    loadAnalytics();

    // Refresh when the user returns to the dashboard tab.
    const handleFocus = () => {
      if (document.visibilityState === "visible") {
        loadAnalytics();
      }
    };

    const handleQuizCompleted = () => {
      loadAnalytics(true);
    };

    const handleStorage = (event) => {
      if (
        event.key === "knowra_token" ||
        event.key === "knowra_user"
      ) {
        loadAnalytics(true);
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("knowra:quiz-completed", handleQuizCompleted);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleFocus);

    // Periodically update analytics while this tab is visible.
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadAnalytics();
      }
    }, 15000);

    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener(
        "knowra:quiz-completed",
        handleQuizCompleted
      );
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [loadAnalytics]);

  if (loading && !analytics) {
    return (
      <section className="qd-section">
        <div className="qd-loading">
          <RefreshCw className="qd-spin" size={24} />
          <p>Loading your learning analytics...</p>
        </div>
      </section>
    );
  }

  if (error && !analytics) {
    return (
      <section className="qd-section" id="quiz-dashboard">
        <div className="qd-error">
          <h3>Unable to load analytics</h3>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => loadAnalytics(true)}
            className="qd-retry-btn"
            disabled={refreshing}
          >
            <RefreshCw
              size={16}
              className={refreshing ? "qd-spin" : ""}
            />
            {refreshing ? "Retrying..." : "Try again"}
          </button>
        </div>
      </section>
    );
  }

  const data = analytics || {
    totalAttempts: 0,
    averageScore: 0,
    bestScore: 0,
    accuracy: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    totalWrong: 0,
    totalUnanswered: 0,
    weakTopics: [],
    scoreTrend: [],
    recentQuizzes: [],
  };

  const {
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
  } = data;

  const chartData = scoreTrend.map((item, index) => ({
    ...item,
    label: item.title || `Quiz ${index + 1}`,
    score: asNumber(item.score),
  }));

  return (
    <section className="qd-section" id="quiz-dashboard">
      <div className="qd-heading">
        <div>
          <div className="qd-eyebrow">
            <Activity size={15} />
            LEARNING INSIGHTS
          </div>
          <h2>Quiz Performance</h2>
          <p>
            Track your progress, discover weak topics and improve
            with every quiz.
          </p>
        </div>

        <button
          type="button"
          className="qd-refresh-btn"
          onClick={() => loadAnalytics(true)}
          disabled={refreshing}
        >
          <RefreshCw
            size={16}
            className={refreshing ? "qd-spin" : ""}
          />
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="qd-error" role="alert">
          <p>Could not refresh the latest analytics: {error}</p>
          <button
            type="button"
            className="qd-retry-btn"
            onClick={() => loadAnalytics(true)}
          >
            Try again
          </button>
        </div>
      )}

      <div className="qd-stats-grid">
        <StatCard
          icon={BookOpen}
          label="Quiz Attempts"
          value={totalAttempts}
          subtitle="Completed quizzes"
        />
        <StatCard
          icon={TrendingUp}
          label="Average Score"
          value={`${averageScore}%`}
          subtitle="Across completed quizzes"
        />
        <StatCard
          icon={Award}
          label="Best Score"
          value={`${bestScore}%`}
          subtitle="Your highest result"
        />
        <StatCard
          icon={Target}
          label="Overall Accuracy"
          value={`${accuracy}%`}
          subtitle="Correct answers overall"
        />
      </div>

      <div className="qd-overview-grid">
        <div className="qd-panel qd-chart-panel">
          <div className="qd-panel-heading">
            <div>
              <h3>Score Progress</h3>
              <p>Your results across completed quizzes</p>
            </div>
            <TrendingUp size={21} />
          </div>

          {chartData.length > 0 ? (
            <div className="qd-chart">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{
                    top: 12,
                    right: 12,
                    left: -15,
                    bottom: 4,
                  }}
                >
                  <CartesianGrid
                    strokeDasharray="4 4"
                    stroke="rgba(148,163,184,0.16)"
                  />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    ticks={[0, 20, 40, 60, 80, 100]}
                    tick={{ fill: "#a1a1aa", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "#171725",
                      border: "1px solid rgba(167,139,250,0.3)",
                      borderRadius: 12,
                      color: "#fff",
                    }}
                    formatter={(value) => [`${value}%`, "Score"]}
                    labelFormatter={(label, items) =>
                      items?.[0]?.payload?.title || label
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="score"
                    stroke="#a78bfa"
                    strokeWidth={3}
                    dot={{
                      r: 4,
                      fill: "#a78bfa",
                      stroke: "#171725",
                      strokeWidth: 2,
                    }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="qd-empty">
              <TrendingUp size={32} />
              <p>Your score trend will appear here.</p>
              <span>
                Complete a quiz to start tracking progress.
              </span>
            </div>
          )}
        </div>

        <div className="qd-panel qd-topics-panel">
          <div className="qd-panel-heading">
            <div>
              <h3>Revision Priorities</h3>
              <p>Topics that need more practice</p>
            </div>
            <Brain size={21} />
          </div>

          {weakTopics.length > 0 ? (
            <div className="qd-topic-list">
              {weakTopics.map((item, index) => {
                const topic =
                  typeof item === "string"
                    ? item
                    : item.topic || item.name || "Unknown topic";

                const occurrences =
                  typeof item === "object"
                    ? asNumber(item.occurrences)
                    : 0;

                return (
                  <div
                    className="qd-topic-item"
                    key={`${topic}-${index}`}
                  >
                    <div className="qd-topic-number">
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="qd-topic-info">
                      <strong>{topic}</strong>
                      <span>
                        {occurrences > 0
                          ? `Flagged in ${occurrences} quiz${
                              occurrences > 1 ? "zes" : ""
                            }`
                          : "Needs more practice"}
                      </span>
                    </div>
                    <Brain size={17} className="qd-topic-icon" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="qd-empty qd-topics-empty">
              <CheckCircle2 size={32} />
              <p>No weak topics identified yet.</p>
              <span>
                Complete quizzes to identify revision priorities.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="qd-panel qd-breakdown-panel">
        <div className="qd-panel-heading">
          <div>
            <h3>Answer Breakdown</h3>
            <p>All answers from your completed quizzes</p>
          </div>
        </div>

        <div className="qd-breakdown-grid">
          <div className="qd-breakdown-item">
            <CheckCircle2 size={20} />
            <span>Correct</span>
            <strong>{totalCorrect}</strong>
          </div>
          <div className="qd-breakdown-item qd-wrong">
            <XCircle size={20} />
            <span>Incorrect</span>
            <strong>{totalWrong}</strong>
          </div>
          <div className="qd-breakdown-item qd-unanswered">
            <BookOpen size={20} />
            <span>Unanswered</span>
            <strong>{totalUnanswered}</strong>
          </div>
          <div className="qd-breakdown-item qd-total">
            <Target size={20} />
            <span>Total questions</span>
            <strong>{totalQuestions}</strong>
          </div>
        </div>
      </div>

      <div className="qd-panel qd-history-panel">
        <div className="qd-panel-heading">
          <div>
            <h3>Recent Quiz Results</h3>
            <p>Your latest completed quizzes</p>
          </div>
        </div>

        {recentQuizzes.length > 0 ? (
          <div className="qd-table-wrapper">
            <table className="qd-table">
              <thead>
                <tr>
                  <th>Quiz</th>
                  <th>Difficulty</th>
                  <th>Score</th>
                  <th>Correct</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {recentQuizzes.map((quiz, index) => (
                  <tr key={quiz._id || `${quiz.title}-${index}`}>
                    <td className="qd-quiz-title">
                      {quiz.title || "Untitled quiz"}
                    </td>
                    <td>
                      <span
                        className={`qd-difficulty qd-${String(
                          quiz.difficulty || "medium"
                        ).toLowerCase()}`}
                      >
                        {quiz.difficulty || "Medium"}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {quiz.score == null
                          ? "—"
                          : `${asNumber(quiz.score)}%`}
                      </strong>
                    </td>
                    <td>
                      {asNumber(quiz.correctCount)}/
                      {asNumber(quiz.totalQuestions)}
                    </td>
                    <td>
                      {formatDate(quiz.completedAt || quiz.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="qd-empty">
            <BookOpen size={30} />
            <p>No completed quizzes yet.</p>
            <span>
              Your quiz results will appear here after submission.
            </span>
          </div>
        )}
      </div>

      <div className="qd-footer-note">
        <Brain size={17} />
        <span>
          Your dashboard refreshes automatically while this page is
          active. You can also use Refresh to fetch the latest results.
        </span>
      </div>
    </section>
  );
}
