
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

// Middleware

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
    ],
  })
);


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

app.use("/api/chat", chatRoutes);

app.use("/api/quizzes", quizRoutes);

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

    app.listen(PORT, () => {
      console.log(`Knowra API running at http://localhost:${PORT}`);
      console.log("Authentication routes: /api/auth");
      console.log("Document routes: /api/documents");
    });
  } catch (error) {
    console.error("Server startup failed:", error.message);
    process.exit(1);
  }
};

startServer();
