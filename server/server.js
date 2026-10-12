
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const documentRoutes = require("./routes/documentRoutes");
const chatRoutes = require("./routes/chatRoutes");
const quizRoutes = require("./routes/quizRoutes");
const passwordResetRoutes = require("./routes/passwordResetRoutes");

const app = express();

// Allowed frontend origins
const allowedOrigins = [
  "https://knowra-lyart.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  process.env.CLIENT_URL,
].filter(Boolean);

// CORS middleware
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error("CORS blocked origin:", origin);
      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  })
);

// Request body middleware
app.use(express.json({ limit: "10kb" }));

// Root route
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Knowra API is running!",
  });
});

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    app: "Knowra",
    status: "healthy",
  });
});

// Authentication routes
app.use("/api/auth", authRoutes);

// PDF document routes
app.use("/api/documents", documentRoutes);

// Chat routes
app.use("/api/chat", chatRoutes);

// Quiz routes
app.use("/api/quizzes", quizRoutes);

// Password reset routes
app.use("/api/auth/password", passwordResetRoutes);

// Handle unknown routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found.",
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  res.status(err.status || 500).json({
    success: false,
    message:
      err.status && err.status < 500
        ? err.message
        : "Internal server error.",
  });
});

// Start server after database connection
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Knowra API running on port ${PORT}`);
      console.log("Allowed frontend origins:", allowedOrigins);
      console.log("Authentication routes: /api/auth");
      console.log("Document routes: /api/documents");
      console.log("Chat routes: /api/chat");
      console.log("Quiz routes: /api/quizzes");
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
