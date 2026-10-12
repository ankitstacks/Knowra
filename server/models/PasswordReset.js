
const mongoose = require("mongoose");

const passwordResetSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },

    otpHash: {
      type: String,
      default: null,
      select: false,
    },

    otpExpiresAt: {
      type: Date,
      default: null,
    },

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastSentAt: {
      type: Date,
      default: null,
    },

    resetTokenHash: {
      type: String,
      default: null,
      select: false,
    },

    resetTokenExpiresAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model(
  "PasswordReset",
  passwordResetSchema
);
