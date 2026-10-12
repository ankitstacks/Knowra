
const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    extractedText: {
      type: String,
      required: true,
      select: false,
    },

    pageCount: {
      type: Number,
      default: 1,
      min: 1,
    },

    fileSize: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Document", documentSchema);
