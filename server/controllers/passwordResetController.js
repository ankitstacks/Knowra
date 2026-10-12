
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");

const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const RESET_TOKEN_EXPIRY_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function normalizeEmail(email) {
  return typeof email === "string"
    ? email.trim().toLowerCase()
    : "";
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_APP_PASSWORD;

  if (!host || !user || !pass) {
    throw new Error(
      "SMTP configuration is missing. Check SMTP_HOST, SMTP_USER and SMTP_APP_PASSWORD."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure:
      String(process.env.SMTP_SECURE).toLowerCase() === "true" ||
      port === 465,
    auth: {
      user,
      pass: pass.replace(/\s/g, ""),
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

async function sendOtpEmail(email, otp) {
  const transporter = createTransporter();

  const from =
    process.env.MAIL_FROM || process.env.SMTP_USER;

  await transporter.sendMail({
    from,
    to: email,
    subject: "Your Knowra password reset code",
    text: [
      "You requested a password reset for your Knowra account.",
      "",
      `Your verification code is: ${otp}`,
      "",
      "This code expires in 10 minutes.",
      "You can request another code after 60 seconds.",
      "If you did not request this, ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:28px;color:#202033">
        <h2 style="margin-bottom:8px">Reset your Knowra password</h2>
        <p>Use this verification code to continue:</p>
        <div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:20px;background:#f1edff;border-radius:12px;text-align:center">
          ${otp}
        </div>
        <p>This code expires in <strong>10 minutes</strong>.</p>
        <p style="color:#666">If you did not request a password reset, you can safely ignore this email.</p>
        <p>— Knowra Security</p>
      </div>
    `,
  });
}

// POST /api/auth/password/forgot
async function requestPasswordReset(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);

    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
      });
    }

    // Same public response for existing and unknown accounts.
    // This prevents revealing which emails have accounts.
    const genericResponse = {
      success: true,
      message:
        "If an account exists for this email, a verification code will be sent.",
    };

    const user = await User.findOne({ email }).select("_id email");

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    let reset = await PasswordReset.findOne({ email });

    const now = Date.now();

    if (
      reset?.lastSentAt &&
      now - reset.lastSentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      const waitSeconds = Math.ceil(
        (RESEND_COOLDOWN_MS -
          (now - reset.lastSentAt.getTime())) /
          1000
      );

      return res.status(429).json({
        success: false,
        message: `Please wait ${waitSeconds} seconds before requesting another code.`,
        retryAfterSeconds: waitSeconds,
      });
    }

    const otp = crypto
      .randomInt(0, 1000000)
      .toString()
      .padStart(6, "0");

    // Store only a bcrypt hash of the OTP.
    const otpHash = await bcrypt.hash(otp, 10);

    if (!reset) {
      reset = new PasswordReset({ email });
    }

    reset.otpHash = otpHash;
    reset.otpExpiresAt = new Date(now + OTP_EXPIRY_MS);
    reset.attempts = 0;
    reset.lastSentAt = new Date(now);
    reset.resetTokenHash = null;
    reset.resetTokenExpiresAt = null;

    await reset.save();

    try {
      await sendOtpEmail(email, otp);
    } catch (mailError) {
      // Do not leave a usable code when delivery fails.
      await PasswordReset.deleteOne({ _id: reset._id });

      console.error(
        "[Password Reset] Email delivery failed:",
        mailError.message
      );

      return res.status(503).json({
        success: false,
        message:
          "Could not send the verification email. Check SMTP settings and try again.",
      });
    }

    return res.status(200).json(genericResponse);
  } catch (error) {
    console.error(
      "[Password Reset] Request error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Could not start password recovery. Please try again.",
    });
  }
}

// POST /api/auth/password/verify-otp
async function verifyResetOtp(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const otp =
      typeof req.body?.otp === "string"
        ? req.body.otp.trim()
        : "";

    if (!validEmail(email) || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email and 6-digit verification code.",
      });
    }

    const reset = await PasswordReset.findOne({ email })
      .select("+otpHash +resetTokenHash");

    if (!reset || !reset.otpHash || !reset.otpExpiresAt) {
      return res.status(400).json({
        success: false,
        message: "Code is invalid or expired. Request a new code.",
      });
    }

    if (reset.otpExpiresAt.getTime() <= Date.now()) {
      await PasswordReset.deleteOne({ _id: reset._id });

      return res.status(400).json({
        success: false,
        message: "Code has expired. Request a new code.",
      });
    }

    if (reset.attempts >= MAX_OTP_ATTEMPTS) {
      await PasswordReset.deleteOne({ _id: reset._id });

      return res.status(429).json({
        success: false,
        message: "Too many incorrect attempts. Request a new code.",
      });
    }

    const matches = await bcrypt.compare(otp, reset.otpHash);

    if (!matches) {
      reset.attempts += 1;

      const attemptsLeft = Math.max(
        0,
        MAX_OTP_ATTEMPTS - reset.attempts
      );

      if (attemptsLeft === 0) {
        await PasswordReset.deleteOne({ _id: reset._id });

        return res.status(429).json({
          success: false,
          message: "Too many incorrect attempts. Request a new code.",
        });
      }

      await reset.save();

      return res.status(400).json({
        success: false,
        message: `Incorrect code. ${attemptsLeft} attempt(s) remaining.`,
        attemptsLeft,
      });
    }

    // OTP is one-time: clear it as soon as it is verified.
    const resetToken = crypto.randomBytes(32).toString("hex");

    reset.otpHash = null;
    reset.otpExpiresAt = null;
    reset.attempts = 0;
    reset.resetTokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    reset.resetTokenExpiresAt = new Date(
      Date.now() + RESET_TOKEN_EXPIRY_MS
    );

    await reset.save();

    return res.status(200).json({
      success: true,
      message: "Code verified. You can now set a new password.",
      resetToken,
    });
  } catch (error) {
    console.error(
      "[Password Reset] OTP verification error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Could not verify the code. Please try again.",
    });
  }
}

// POST /api/auth/password/reset
async function resetPassword(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const resetToken =
      typeof req.body?.resetToken === "string"
        ? req.body.resetToken.trim()
        : "";
    const password =
      typeof req.body?.password === "string"
        ? req.body.password
        : "";

    if (!validEmail(email) || !resetToken) {
      return res.status(400).json({
        success: false,
        message: "The password reset session is invalid. Start again.",
      });
    }

    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Password must be between 8 and 128 characters.",
      });
    }

    const reset = await PasswordReset.findOne({ email })
      .select("+resetTokenHash");

    if (
      !reset ||
      !reset.resetTokenHash ||
      !reset.resetTokenExpiresAt ||
      reset.resetTokenExpiresAt.getTime() <= Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message: "Reset session expired. Verify your email again.",
      });
    }

    const providedHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const expected = Buffer.from(reset.resetTokenHash, "hex");
    const provided = Buffer.from(providedHash, "hex");

    if (
      expected.length !== provided.length ||
      !crypto.timingSafeEqual(expected, provided)
    ) {
      return res.status(400).json({
        success: false,
        message: "Reset session is invalid. Verify your email again.",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      await PasswordReset.deleteOne({ _id: reset._id });

      return res.status(400).json({
        success: false,
        message: "Account not found. Please sign up again.",
      });
    }

    // Existing Knowra auth stores the bcrypt hash in user.password.
    user.password = await bcrypt.hash(password, 12);
    await user.save();

    // A reset token can only be used once.
    await PasswordReset.deleteOne({ _id: reset._id });

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. Please sign in with your new password.",
    });
  } catch (error) {
    console.error(
      "[Password Reset] Save error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Could not reset the password. Please try again.",
    });
  }
}

module.exports = {
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
};
