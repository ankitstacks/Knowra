
const express = require("express");

const {
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
} = require("../controllers/passwordResetController");

const router = express.Router();

router.post("/forgot", requestPasswordReset);
router.post("/verify-otp", verifyResetOtp);
router.post("/reset", resetPassword);

module.exports = router;
