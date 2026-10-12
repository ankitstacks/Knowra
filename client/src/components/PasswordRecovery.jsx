
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import "./PasswordRecovery.css";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

async function postJson(endpoint, payload) {
  let response;

  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error(
      "Could not connect to Knowra. Make sure the backend is running."
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an invalid response.");
  }

  if (!response.ok || !data.success) {
    throw new Error(
      data.message || "Something went wrong. Please try again."
    );
  }

  return data;
}

export default function PasswordRecovery({ onBack }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const clearMessages = () => {
    setError("");
    setNotice("");
  };

  const sendCode = async (event) => {
    event?.preventDefault();
    clearMessages();

    const normalizedEmail = email.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);

    try {
      const data = await postJson("/auth/password/forgot", {
        email: normalizedEmail,
      });

      setEmail(normalizedEmail);
      setOtp("");
      setStep("otp");
      setNotice(
        data.message ||
          "If an account exists, a verification code will be sent."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    clearMessages();

    if (!/^\d{6}$/.test(otp.trim())) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    setLoading(true);

    try {
      const data = await postJson(
        "/auth/password/verify-otp",
        {
          email: email.trim().toLowerCase(),
          otp: otp.trim(),
        }
      );

      if (!data.resetToken) {
        throw new Error(
          "The server did not return a reset token. Please try again."
        );
      }

      setResetToken(data.resetToken);
      setPassword("");
      setConfirmPassword("");
      setStep("password");
      setNotice("Email verified. Choose a new password.");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const saveNewPassword = async (event) => {
    event.preventDefault();
    clearMessages();

    if (password.length < 8 || password.length > 128) {
      setError("Password must be between 8 and 128 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!resetToken) {
      setError("Your reset session is missing. Please start again.");
      return;
    }

    setLoading(true);

    try {
      const data = await postJson("/auth/password/reset", {
        email: email.trim().toLowerCase(),
        resetToken,
        password,
      });

      setStep("done");
      setOtp("");
      setPassword("");
      setConfirmPassword("");
      setResetToken("");
      setNotice(
        data.message || "Your password has been reset successfully."
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    clearMessages();

    if (step === "otp") {
      setStep("email");
      setOtp("");
      return;
    }

    if (step === "password") {
      setStep("otp");
      setResetToken("");
      setPassword("");
      setConfirmPassword("");
      return;
    }

    onBack();
  };

  return (
    <main className="recovery-page">
      <div className="recovery-glow recovery-glow-one" />
      <div className="recovery-glow recovery-glow-two" />

      <header className="recovery-nav">
        <a
          href="#home"
          className="recovery-brand"
          onClick={(event) => event.preventDefault()}
        >
          <span className="recovery-brand-icon">
            <BrainCircuit size={23} />
          </span>
          <span>
            knowra<span className="recovery-brand-dot">.</span>
          </span>
        </a>

        <span className="recovery-nav-label">
          Account recovery
        </span>
      </header>

      <section className="recovery-card">
        <div className="recovery-icon">
          {step === "email" && <Mail size={27} />}
          {step === "otp" && <ShieldCheck size={27} />}
          {step === "password" && <KeyRound size={27} />}
          {step === "done" && <CheckCircle2 size={27} />}
        </div>

        <span className="recovery-eyebrow">
          {step === "done" ? "ALL SET" : "ACCOUNT SECURITY"}
        </span>

        <h1>
          {step === "email" && "Forgot your password?"}
          {step === "otp" && "Verify your email"}
          {step === "password" && "Create a new password"}
          {step === "done" && "Password reset complete"}
        </h1>

        <p className="recovery-description">
          {step === "email" &&
            "Enter the email address linked to your Knowra account. We'll send a verification code if an account exists."}

          {step === "otp" &&
            `Enter the 6-digit code sent to ${email}. The code expires in 10 minutes.`}

          {step === "password" &&
            "Choose a strong password that you have not used for this account before."}

          {step === "done" &&
            "Your new password has been saved. You can now sign in using it."}
        </p>

        {error && (
          <div className="recovery-message recovery-error" role="alert">
            {error}
          </div>
        )}

        {notice && (
          <div
            className="recovery-message recovery-success"
            role="status"
          >
            {notice}
          </div>
        )}

        {step === "email" && (
          <form onSubmit={sendCode} className="recovery-form">
            <label className="recovery-field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  clearMessages();
                }}
                maxLength={254}
                required
              />
            </label>

            <button
              className="recovery-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <LoaderCircle className="recovery-spin" size={18} />
                  Sending code...
                </>
              ) : (
                <>
                  Send verification code
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={verifyCode} className="recovery-form">
            <label className="recovery-field">
              <span>6-digit verification code</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={otp}
                onChange={(event) => {
                  setOtp(
                    event.target.value
                      .replace(/\D/g, "")
                      .slice(0, 6)
                  );
                  clearMessages();
                }}
                maxLength={6}
                pattern="[0-9]{6}"
                required
              />
            </label>

            <button
              className="recovery-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <LoaderCircle className="recovery-spin" size={18} />
                  Verifying...
                </>
              ) : (
                <>
                  Verify code
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <button
              className="recovery-secondary"
              type="button"
              onClick={sendCode}
              disabled={loading}
            >
              Didn't receive it? Resend code
            </button>
          </form>
        )}

        {step === "password" && (
          <form
            onSubmit={saveNewPassword}
            className="recovery-form"
          >
            <label className="recovery-field">
              <span>New password</span>
              <div className="recovery-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    clearMessages();
                  }}
                  minLength={8}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  className="recovery-eye"
                  onClick={() =>
                    setShowPassword((previous) => !previous)
                  }
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </label>

            <label className="recovery-field">
              <span>Confirm new password</span>
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  clearMessages();
                }}
                minLength={8}
                maxLength={128}
                required
              />
            </label>

            <button
              className="recovery-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <LoaderCircle className="recovery-spin" size={18} />
                  Updating password...
                </>
              ) : (
                <>
                  Reset password
                  <LockKeyhole size={18} />
                </>
              )}
            </button>
          </form>
        )}

        {step === "done" && (
          <button
            className="recovery-submit"
            type="button"
            onClick={onBack}
          >
            Back to sign in
            <ArrowRight size={18} />
          </button>
        )}

        {step !== "done" && (
          <button
            type="button"
            className="recovery-back"
            onClick={goBack}
            disabled={loading}
          >
            <ArrowLeft size={16} />
            {step === "email" ? "Back to sign in" : "Go back"}
          </button>
        )}

        <div className="recovery-security">
          <ShieldCheck size={16} />
          <span>Your password is securely hashed before storage.</span>
        </div>
      </section>

      <footer className="recovery-footer">
        © 2026 Knowra · Account security
      </footer>
    </main>
  );
}
