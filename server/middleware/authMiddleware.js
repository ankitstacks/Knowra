
const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        code: "TOKEN_MISSING",
        message: "Authentication required. Please sign in again.",
      });
    }

    const token = authHeader.slice(7).trim();

    if (!token) {
      return res.status(401).json({
        success: false,
        code: "TOKEN_EMPTY",
        message: "Authentication token is missing.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("[AUTH] JWT_SECRET is missing.");

      return res.status(500).json({
        success: false,
        message: "Server authentication configuration error.",
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      console.error("[AUTH] Token verification failed:", error.message);

      return res.status(401).json({
        success: false,
        code:
          error.name === "TokenExpiredError"
            ? "TOKEN_EXPIRED"
            : "TOKEN_INVALID",
        message:
          error.name === "TokenExpiredError"
            ? "Your session has expired. Please sign in again."
            : "Invalid session. Please sign in again.",
      });
    }

    const userId = decoded.userId || decoded.id || decoded._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        code: "TOKEN_USER_MISSING",
        message: "User information is missing. Please sign in again.",
      });
    }

    // Support all existing controllers using any of these properties.
    req.userId = String(userId);

    req.user = {
      ...decoded,
      userId: String(userId),
      id: String(userId),
    };

    console.log(
      `[AUTH] Verified ${req.method} ${req.originalUrl}`
    );

    return next();
  } catch (error) {
    console.error("[AUTH] Middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication failed due to a server error.",
    });
  }
};

module.exports = authMiddleware;
