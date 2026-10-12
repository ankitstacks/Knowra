import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  BrainCircuit,
  BookOpen,
  FileText,
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  ShieldCheck,
  LogOut,
  Upload,
  Search,
  Layers3,
  X,
  MessageCircle,
  Send,
  Trash2,
  Plus,
  LoaderCircle,
  CheckCircle2,
  AlertCircle,
  FileUp,
  Bot,
  UserRound,
  RefreshCw,
} from "lucide-react";

import "./App.css";
import QuizArena from "./components/QuizArena";
import QuizDashboard from "./components/QuizDashboard";
import PasswordRecovery from "./components/PasswordRecovery";
import MarkdownMessage from "./components/MarkdownMessage";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000/api";

function App() {
  // AUTH STATE
  const [mode, setMode] = useState("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("knowra_user");
      const token = localStorage.getItem("knowra_token");

      return saved && token ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
  });

  // DOCUMENT LIBRARY STATE
  const [documents, setDocuments] = useState([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [documentNotice, setDocumentNotice] = useState("");
  const [search, setSearch] = useState("");
  const [selectedDocument, setSelectedDocument] = useState(null);

  // PDF CHAT STATE
  const [question, setQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");

  const fileInputRef = useRef(null);
  const chatEndRef = useRef(null);

  const isSignup = mode === "signup";

  // AUTH HEADERS
  const authHeaders = useCallback(() => {
    const token = localStorage.getItem("knowra_token");

    return token
      ? { Authorization: `Bearer ${token}` }
      : {};
  }, []);

  // UPDATE AUTH FORM
  const updateForm = (event) => {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value,
    }));

    setError("");
    setNotice("");
  };

  // SIGNUP / LOGIN
  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setNotice("");

    const email = form.email.trim().toLowerCase();

    if (isSignup && form.name.trim().length < 2) {
      setError("Please enter your full name.");
      return;
    }

    // Correct email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (form.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setLoading(true);

    try {
      const endpoint = isSignup ? "signup" : "login";

      const payload = isSignup
        ? {
            name: form.name.trim(),
            email,
            password: form.password,
          }
        : {
            email,
            password: form.password,
          };

      const response = await fetch(
        `${API_URL}/auth/${endpoint}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Authentication failed."
        );
      }

      if (!data.token || !data.user) {
        throw new Error(
          "Server response is missing account details."
        );
      }

      localStorage.setItem("knowra_token", data.token);
      localStorage.setItem(
        "knowra_user",
        JSON.stringify(data.user)
      );

      setUser(data.user);
      setForm({
        name: "",
        email: "",
        password: "",
      });

      setShowPassword(false);
      setError("");
      setNotice("");
    } catch (err) {
      setError(
        err.message ||
          "Could not connect to Knowra. Make sure the backend is running."
      );
    } finally {
      setLoading(false);
    }
  };

  // LOAD DOCUMENTS
  const loadDocuments = useCallback(async () => {
    const token = localStorage.getItem("knowra_token");

    if (!token) return;

    setDocumentsLoading(true);
    setDocumentError("");

    try {
      const response = await fetch(`${API_URL}/documents`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (response.status === 401) {
        throw new Error(
          "Your session expired. Please sign in again."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Could not load documents."
        );
      }

      const latestDocuments = data.documents || [];

      setDocuments(latestDocuments);

      setSelectedDocument((current) => {
        if (!current) return null;

        return (
          latestDocuments.find(
            (item) => item._id === current._id
          ) || null
        );
      });
    } catch (err) {
      setDocumentError(
        err.message || "Could not load documents."
      );
    } finally {
      setDocumentsLoading(false);
    }
  }, []);

  // LOAD DOCUMENTS WHEN USER LOGS IN
  useEffect(() => {
    if (user) {
      loadDocuments();
    }
  }, [user, loadDocuments]);

  // SCROLL TO LATEST CHAT MESSAGE
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [chatMessages, chatLoading]);

  // UPLOAD PDF
  const handleUpload = async (event) => {
    const file = event.target.files?.[0];

    // Allow selecting the same file again
    event.target.value = "";

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setDocumentError("Please choose a PDF file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setDocumentError("PDF must be 10 MB or smaller.");
      return;
    }

    setUploading(true);
    setDocumentError("");
    setDocumentNotice("");

    try {
      const body = new FormData();
      body.append("pdf", file);

      const response = await fetch(`${API_URL}/documents`, {
        method: "POST",
        headers: authHeaders(),
        body,
      });

      const data = await response.json();

      if (response.status === 401) {
        throw new Error(
          "Your session expired. Please sign in again."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "PDF upload failed."
        );
      }

      setDocumentNotice(
        `${data.document?.originalName || file.name} uploaded successfully.`
      );

      await loadDocuments();
    } catch (err) {
      setDocumentError(
        err.message || "Could not upload the PDF."
      );
    } finally {
      setUploading(false);
    }
  };

  // DELETE PDF
  const handleDeleteDocument = async (document) => {
    const confirmed = window.confirm(
      `Delete "${document.originalName}" from your workspace?`
    );

    if (!confirmed) return;

    setDocumentError("");
    setDocumentNotice("");

    try {
      const response = await fetch(
        `${API_URL}/documents/${document._id}`,
        {
          method: "DELETE",
          headers: authHeaders(),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Could not delete document."
        );
      }

      setDocuments((previous) =>
        previous.filter((item) => item._id !== document._id)
      );

      if (selectedDocument?._id === document._id) {
        setSelectedDocument(null);
        setChatMessages([]);
        setQuestion("");
        setChatError("");
      }

      setDocumentNotice("Document deleted successfully.");
    } catch (err) {
      setDocumentError(
        err.message || "Could not delete document."
      );
    }
  };

  // LOAD SAVED CHAT HISTORY
  const loadChatHistory = useCallback(async (documentId) => {
    const token = localStorage.getItem("knowra_token");

    if (!token || !documentId) return;

    setChatLoading(true);
    setChatError("");

    try {
      const response = await fetch(
        `${API_URL}/chat/${documentId}/history`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (response.status === 401) {
        throw new Error(
          "Your session expired. Please sign in again."
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.message || "Could not load saved chat history."
        );
      }

      const savedMessages = Array.isArray(data.messages)
        ? data.messages
        : [];

      setChatMessages(
        savedMessages
          .filter(
            (message) =>
              message &&
              (message.role === "user" ||
                message.role === "assistant")
          )
          .map((message) => ({
            role: message.role,
            text: message.text || message.content || "",
          }))
          .filter((message) => message.text.trim().length > 0)
      );
    } catch (err) {
      setChatError(
        err.message || "Could not load saved chat history."
      );
      setChatMessages([]);
    } finally {
      setChatLoading(false);
    }
  }, []);

  
  // OPEN DOCUMENT CHAT
  const openDocumentChat = (document) => {
    if (!document?._id) {
      setChatError("Could not open this document. Please refresh your library.");
      return;
    }

    setSelectedDocument(document);
    setChatMessages([]);
    setQuestion("");
    setChatError("");
    setDocumentError("");

    loadChatHistory(document._id);

    window.setTimeout(() => {
      window.document.getElementById("knowra-chat")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
  };

  // ASK GEMINI ABOUT PDF
  const handleAskQuestion = async (event) => {
    event?.preventDefault();

    const currentQuestion = question.trim();

    if (!selectedDocument) {
      setChatError("Select a document before asking a question.");
      return;
    }

    if (!currentQuestion || chatLoading) return;

    setChatError("");
    setQuestion("");

    setChatMessages((previous) => [
      ...previous,
      {
        role: "user",
        text: currentQuestion,
      },
    ]);

    setChatLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/chat/${selectedDocument._id}`,
        {
          method: "POST",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            question: currentQuestion,
          }),
        },
      );

      const data = await response.json();

      if (response.status === 401) {
        throw new Error("Your session expired. Please sign in again.");
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not generate an answer.");
      }

      setChatMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          text: data.answer,
        },
      ]);
    } catch (err) {
      setChatError(
        err.message || "Could not contact the AI assistant.",
      );
    } finally {
      setChatLoading(false);
    }
  };


  // END OF CHUNK 1
  // LOGOUT
  const handleLogout = () => {
    localStorage.removeItem("knowra_token");
    localStorage.removeItem("knowra_user");

    setUser(null);
    setMode("login");
    setDocuments([]);
    setSelectedDocument(null);
    setChatMessages([]);
    setQuestion("");
    setError("");
    setNotice("You have been signed out.");
    setDocumentError("");
    setDocumentNotice("");
    setChatError("");
  };

  // SWITCH LOGIN / SIGNUP
  const switchMode = () => {
    setMode(isSignup ? "login" : "signup");
    setError("");
    setNotice("");

    setForm({
      name: "",
      email: "",
      password: "",
    });
  };

  const filteredDocuments = documents.filter((document) =>
    document.originalName?.toLowerCase().includes(search.toLowerCase()),
  );

  // FORGOT PASSWORD
  if (!user && mode === "forgot") {
    return (
      <PasswordRecovery
        onBack={() => {
          setMode("login");
          setError("");
          setNotice("");
          setForm({
            name: "",
            email: "",
            password: "",
          });
        }}
      />
    );
  }

  // DASHBOARD
  if (user) {
    return (
      <main className="dashboard-page">
        <header className="dashboard-nav">
          <a className="brand" href="#home">
            <span className="brand-icon">
              <BrainCircuit size={23} />
            </span>
            <span>
              knowra<span className="brand-dot">.</span>
            </span>
          </a>

          <div className="nav-right">
            <span className="online-indicator">Workspace ready</span>
            <button className="logout-button" onClick={handleLogout}>
              <LogOut size={16} />
              Sign out
            </button>
          </div>
        </header>

        <section className="dashboard-content">
          <motion.div
            className="welcome-section"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="eyebrow">
              <Sparkles size={14} />
              YOUR AI STUDY WORKSPACE
            </span>

            <h1>
              Welcome back,{" "}
              <span>{user.name?.split(" ")[0] || "Learner"}.</span>
            </h1>

            <p>
              Turn your study material into understanding with your personal AI
              knowledge hub.
            </p>
          </motion.div>

          <div className="dashboard-banner">
            <div className="banner-orb">
              <BrainCircuit size={44} />
            </div>

            <div className="banner-copy">
              <span className="banner-label">
                MEET YOUR AI STUDY PARTNER
              </span>
              <h2>Learn smarter, not harder.</h2>
              <p>
                Upload notes, ask questions, and explore your own study material
                with AI.
              </p>
            </div>

            <span className="banner-sparkle">
              <Sparkles size={22} />
            </span>
          </div>

          {/* AI QUIZ ARENA */}
          <QuizArena documents={documents} authHeaders={authHeaders} />

          {/* QUIZ PERFORMANCE DASHBOARD */}
          <QuizDashboard authHeaders={authHeaders} />

          <div className="section-heading">
            <div>
              <h2>Your workspace</h2>
              <p>Manage your documents and study with Knowra AI.</p>
            </div>
          </div>

          <div className="feature-grid">
            <article className="feature-card">
              <span className="feature-icon purple">
                <Upload size={22} />
              </span>
              <h3>Study Materials</h3>
              <p>Upload and organize your lecture notes and PDFs.</p>
              <span className="feature-status">
                {documents.length} document
                {documents.length === 1 ? "" : "s"}
              </span>
            </article>

            <article className="feature-card">
              <span className="feature-icon blue">
                <BrainCircuit size={22} />
              </span>
              <h3>Ask your documents</h3>
              <p>Get answers grounded in your uploaded study material.</p>
              <span className="feature-status">AI chat enabled</span>
            </article>

            <article className="feature-card">
              <span className="feature-icon orange">
                <Layers3 size={22} />
              </span>
              <h3>Exam preparation</h3>
              <p>Use your notes to revise concepts and understand topics.</p>
              <span className="feature-status">Ready to study</span>
            </article>
          </div>

          {/* DOCUMENT LIBRARY */}
          <section className="knowra-library" id="documents">
            <div className="knowra-section-heading">
              <div>
                <span className="eyebrow">
                  <BookOpen size={14} />
                  YOUR PERSONAL LIBRARY
                </span>
                <h2>My Documents</h2>
                <p>Upload a PDF to start asking questions about it.</p>
              </div>

              <button
                type="button"
                className="knowra-primary-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <LoaderCircle size={17} className="knowra-spin" />
                ) : (
                  <FileUp size={17} />
                )}
                {uploading ? "Uploading..." : "Upload PDF"}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                hidden
                onChange={handleUpload}
              />
            </div>

            <div className="knowra-search">
              <Search size={17} />
              <input
                type="search"
                placeholder="Search your documents..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button
                type="button"
                title="Refresh documents"
                onClick={loadDocuments}
                disabled={documentsLoading}
              >
                <RefreshCw
                  size={16}
                  className={documentsLoading ? "knowra-spin" : ""}
                />
              </button>
            </div>

            <AnimatePresence>
              {documentError && (
                <motion.div
                  className="knowra-alert knowra-alert-error"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <AlertCircle size={17} />
                  <span>{documentError}</span>
                  <button
                    type="button"
                    onClick={() => setDocumentError("")}
                    aria-label="Dismiss error"
                  >
                    <X size={15} />
                  </button>
                </motion.div>
              )}

              {documentNotice && (
                <motion.div
                  className="knowra-alert knowra-alert-success"
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <CheckCircle2 size={17} />
                  <span>{documentNotice}</span>
                  <button
                    type="button"
                    onClick={() => setDocumentNotice("")}
                    aria-label="Dismiss notice"
                  >
                    <X size={15} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {documentsLoading && documents.length === 0 ? (
              <div className="knowra-empty-state">
                <LoaderCircle size={28} className="knowra-spin" />
                <p>Loading your documents...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="knowra-empty-state">
                <div className="knowra-empty-icon">
                  <FileText size={28} />
                </div>
                <h3>
                  {search ? "No matching documents" : "Your library is empty"}
                </h3>
                <p>
                  {search
                    ? "Try a different document name."
                    : "Upload your first PDF to start learning with Knowra AI."}
                </p>

                {!search && (
                  <button
                    type="button"
                    className="knowra-secondary-button"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus size={16} />
                    Add your first PDF
                  </button>
                )}
              </div>
            ) : (
              <div className="knowra-document-grid">
                {filteredDocuments.map((document) => (
                  <motion.article
                    layout
                    key={document._id}
                    className={`knowra-document-card ${
                      selectedDocument?._id === document._id
                        ? "is-selected"
                        : ""
                    }`}
                  >
                    <div className="knowra-document-top">
                      <div className="knowra-pdf-icon">
                        <FileText size={23} />
                      </div>

                      <button
                        type="button"
                        className="knowra-icon-button danger"
                        title="Delete document"
                        onClick={() => handleDeleteDocument(document)}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <h3 title={document.originalName}>
                      {document.originalName}
                    </h3>

                    <p className="knowra-document-meta">
                      {document.pageCount || 1} page
                      {(document.pageCount || 1) === 1 ? "" : "s"}
                      {typeof document.fileSize === "number" &&
                        ` · ${(document.fileSize / 1024).toFixed(1)} KB`}
                    </p>

                    <p className="knowra-document-date">
                      {document.createdAt
                        ? new Date(document.createdAt).toLocaleDateString()
                        : "Recently added"}
                    </p>

                    <button
                      type="button"
                      className="knowra-chat-document-button"
                      onClick={() => openDocumentChat(document)}
                    >
                      <MessageCircle size={16} />
                      {selectedDocument?._id === document._id
                        ? "Selected for chat"
                        : "Ask this PDF"}
                    </button>
                  </motion.article>
                ))}
              </div>
            )}
          </section>

                    {/* PDF CHAT SECTION */}
          <AnimatePresence>
            {selectedDocument && (
              <motion.section
                id="knowra-chat"
                className="knowra-chat-panel"
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
              >
                <div className="knowra-chat-header">
                  <div className="knowra-chat-heading-icon">
                    <BrainCircuit size={22} />
                  </div>

                  <div className="knowra-chat-heading-copy">
                    <span className="eyebrow">KNOWRA AI ASSISTANT</span>
                    <h2>Chat with your PDF</h2>
                    <p title={selectedDocument.originalName}>
                      <FileText size={13} />
                      {selectedDocument.originalName}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="knowra-icon-button"
                    title="Close chat"
                    onClick={() => {
                      setSelectedDocument(null);
                      setChatMessages([]);
                      setChatError("");
                    }}
                  >
                    <X size={19} />
                  </button>
                </div>

                <div className="knowra-chat-messages">
                  {chatMessages.length === 0 && !chatLoading && (
                    <div className="knowra-chat-welcome">
                      <div className="knowra-chat-welcome-icon">
                        <Sparkles size={24} />
                      </div>

                      <h3>What would you like to learn?</h3>
                      <p>
                        Ask a question about this document. Knowra AI will use
                        its extracted content to prepare an answer.
                      </p>

                      <div className="knowra-suggestions">
                        {[
                          "Summarize this document in simple words.",
                          "Explain the most important concepts.",
                          "Create 5 revision questions from this document.",
                        ].map((suggestion) => (
                          <button
                            type="button"
                            key={suggestion}
                            onClick={() => setQuestion(suggestion)}
                          >
                            <Sparkles size={14} />
                            {suggestion}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatMessages.map((message, index) => (
                    <div
                      key={`${index}-${message.role}`}
                      className={`knowra-message ${
                        message.role === "user"
                          ? "knowra-message-user"
                          : "knowra-message-ai"
                      }`}
                    >
                      <div className="knowra-message-avatar">
                        {message.role === "user" ? (
                          <UserRound size={17} />
                        ) : (
                          <Bot size={18} />
                        )}
                      </div>

                      <div className="knowra-message-content">
                        <span className="knowra-message-author">
                          {message.role === "user" ? "You" : "Knowra AI"}
                        </span>

                        <MarkdownMessage
                          text={message.text}
                          role={message.role}
                        />
                      </div>
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="knowra-message knowra-message-ai">
                      <div className="knowra-message-avatar">
                        <Bot size={18} />
                      </div>

                      <div className="knowra-message-content">
                        <span className="knowra-message-author">
                          Knowra AI
                        </span>

                        <div className="knowra-typing">
                          <span />
                          <span />
                          <span />
                          <small>Reading your document...</small>
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {chatError && (
                  <div className="knowra-alert knowra-alert-error">
                    <AlertCircle size={17} />
                    <span>{chatError}</span>

                    <button
                      type="button"
                      onClick={() => setChatError("")}
                      aria-label="Dismiss error"
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}

                <form
                  className="knowra-chat-composer"
                  onSubmit={handleAskQuestion}
                >
                  <textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="Ask anything about your PDF..."
                    rows={2}
                    maxLength={2000}
                    disabled={chatLoading}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />

                  <div className="knowra-composer-footer">
                    <span>AI answers may need verification.</span>

                    <button
                      type="submit"
                      className="knowra-send-button"
                      disabled={chatLoading || !question.trim()}
                    >
                      {chatLoading ? (
                        <LoaderCircle
                          size={17}
                          className="knowra-spin"
                        />
                      ) : (
                        <Send size={17} />
                      )}
                      Ask AI
                    </button>
                  </div>
                </form>
              </motion.section>
            )}
          </AnimatePresence>

          <div className="dashboard-note">
            <ShieldCheck size={18} />
            <span>
              Signed in as <strong>{user.email}</strong>
            </span>
          </div>
        </section>
      </main>
    );
  }


  // LOGIN / SIGNUP PAGE
  return (
    <main className="auth-page">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="auth-nav">
        <a className="brand" href="#home">
          <span className="brand-icon">
            <BrainCircuit size={23} />
          </span>
          <span>
            knowra<span className="brand-dot">.</span>
          </span>
        </a>

        <div className="nav-right">
          <span className="nav-question">
            {isSignup ? "Already have an account?" : "New to Knowra?"}
          </span>

          <button className="nav-cta" onClick={switchMode}>
            {isSignup ? "Sign in" : "Create account"}
            <ArrowRight size={15} />
          </button>
        </div>
      </header>

      <section className="auth-layout">
        <motion.div
          className="hero-panel"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="hero-badge">
            <span className="badge-dot" />
            YOUR PERSONAL AI KNOWLEDGE HUB
          </div>

          <h1>
            Your ideas.
            <br />
            Your notes.
            <br />
            <span>Your intelligence.</span>
          </h1>

          <p className="hero-description">
            Turn scattered study material into organized knowledge.
            Understand concepts, explore your notes, and prepare with purpose.
          </p>

          <div className="hero-visual">
            <div className="visual-grid" />
            <div className="visual-glow" />

            <motion.div
              className="floating-card card-left"
              animate={{ y: [0, -7, 0] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <span className="mini-icon purple">
                <FileText size={17} />
              </span>
              <span>
                <strong>Lecture notes</strong>
                <small>PDF · Study material</small>
              </span>
            </motion.div>

            <motion.div
              className="brain-orbit"
              animate={{ rotate: 360 }}
              transition={{
                duration: 36,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              <div className="orbit-dot orbit-dot-one" />
              <div className="orbit-dot orbit-dot-two" />
            </motion.div>

            <div className="brain-core">
              <BrainCircuit size={66} strokeWidth={1.2} />
              <span>KNOWRA AI</span>
            </div>

            <motion.div
              className="floating-card card-right"
              animate={{ y: [0, 7, 0] }}
              transition={{
                duration: 4.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <span className="mini-icon blue">
                <Sparkles size={17} />
              </span>
              <span>
                <strong>Smart insights</strong>
                <small>Learn · Understand</small>
              </span>
            </motion.div>

            <div className="visual-caption">
              <span className="caption-line" />
              <span>FROM INFORMATION TO UNDERSTANDING</span>
            </div>
          </div>

          <div className="trust-row">
            <div className="trust-item">
              <ShieldCheck size={17} />
              <span>Secure authentication</span>
            </div>

            <div className="trust-item">
              <GraduationCap size={18} />
              <span>Built for learners</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          className="auth-panel"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.1 }}
        >
          <div className="form-top-icon">
            {isSignup ? (
              <GraduationCap size={25} />
            ) : (
              <BookOpen size={25} />
            )}
          </div>

          <span className="form-eyebrow">
            {isSignup ? "START YOUR JOURNEY" : "WELCOME BACK"}
          </span>

          <h2>
            {isSignup ? "Create your account" : "Sign in to Knowra"}
          </h2>

          <p className="form-description">
            {isSignup
              ? "A smarter study routine starts with one small step."
              : "Your personal knowledge workspace is waiting."}
          </p>

          <AnimatePresence>
            {notice && (
              <motion.div
                className="message success-message"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
              >
                {notice}
              </motion.div>
            )}

            {error && (
              <motion.div
                className="message error-message"
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form className="auth-form" onSubmit={handleSubmit}>
            {isSignup && (
              <label className="field">
                <span>Full name</span>
                <input
                  type="text"
                  name="name"
                  placeholder="Enter your full name"
                  value={form.name}
                  onChange={updateForm}
                  autoComplete="name"
                  minLength={2}
                  maxLength={60}
                  required
                />
              </label>
            )}

            <label className="field">
              <span>Email address</span>
              <input
                type="email"
                name="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={updateForm}
                autoComplete="email"
                required
              />
            </label>

            <label className="field">
              <span>Password</span>

              <div className="password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={updateForm}
                  autoComplete={
                    isSignup ? "new-password" : "current-password"
                  }
                  minLength={8}
                  required
                />

                <button
                  className="password-toggle"
                  type="button"
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

              {isSignup && (
                <small className="field-hint">
                  Use at least 8 characters for your password.
                </small>
              )}
            </label>

            {!isSignup && (
              <button
                type="button"
                className="forgot-password-link"
                onClick={() => {
                  setError("");
                  setNotice("");
                  setMode("forgot");

                  setForm((previous) => ({
                    ...previous,
                    password: "",
                  }));
                }}
              >
                Forgot password?
              </button>
            )}

            <button
              className="submit-button"
              type="submit"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Please wait...
                </>
              ) : (
                <>
                  {isSignup ? "Create my account" : "Sign in to Knowra"}
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <div className="form-divider">
            <span>YOUR LEARNING SPACE</span>
          </div>

          <div className="secure-note">
            <ShieldCheck size={16} />
            <span>
              Your account is protected with secure authentication.
            </span>
          </div>

          <p className="switch-mode">
            {isSignup ? "Already a member?" : "Don't have an account?"}

            <button type="button" onClick={switchMode}>
              {isSignup ? "Sign in" : "Create account"}
            </button>
          </p>
        </motion.div>
      </section>

      <footer className="auth-footer">
        <span>© 2026 Knowra</span>
        <span>
          Made for curious minds <Sparkles size={13} />
        </span>
      </footer>
    </main>
  );
}

export default App;


