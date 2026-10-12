
const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },

    text: {
      type: String,
      required: true,
      trim: true,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    _id: true,
  }
);

const chatSchema = new mongoose.Schema(
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

    messages: {
      type: [messageSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// One conversation per user per document
chatSchema.index(
  { owner: 1, document: 1 },
  { unique: true }
);

module.exports = mongoose.model("Chat", chatSchema);
