
const pdfParse = require("pdf-parse");
const mongoose = require("mongoose");
const Document = require("../models/Document");

// Get authenticated user ID from the middleware.
const getAuthenticatedUserId = (req) => {
  return req.user?.userId || req.user?.id || req.userId || null;
};

// POST /api/documents
// Upload a PDF, extract its text, and save it in MongoDB.
const uploadDocument = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please sign in again.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid user session. Please sign in again.",
      });
    }

    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: "Please select a PDF file using the pdf field.",
      });
    }

    const file = req.file;

    // Validate the actual PDF file signature.
    if (file.buffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return res.status(400).json({
        success: false,
        message: "The selected file is not a valid PDF.",
      });
    }

    // Extract text from the PDF.
    let parsedData;

    try {
      parsedData = await pdfParse(file.buffer);
    } catch (error) {
      console.error("PDF PARSING ERROR:", error.message);

      return res.status(400).json({
        success: false,
        message:
          "Could not read this PDF. Please try another PDF file.",
      });
    }

    const extractedText = (parsedData.text || "").trim();

    if (!extractedText) {
      return res.status(422).json({
        success: false,
        message:
          "No readable text found. This PDF may be scanned and require OCR.",
      });
    }

    // Save the document against the authenticated user.
    const document = await Document.create({
      owner: userId,
      originalName: file.originalname,
      extractedText,
      pageCount: parsedData.numpages || 1,
      fileSize: file.size,
    });

    console.log(
      `PDF uploaded successfully: ${document.originalName} (${document._id})`
    );

    return res.status(201).json({
      success: true,
      message: "PDF uploaded and processed successfully.",
      document: {
        _id: document._id,
        originalName: document.originalName,
        pageCount: document.pageCount,
        fileSize: document.fileSize,
        createdAt: document.createdAt,
        textLength: extractedText.length,
      },
    });
  } catch (error) {
    console.error("UPLOAD DOCUMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while uploading the PDF.",
    });
  }
};

// GET /api/documents
// Return documents belonging to the logged-in user.
const getDocuments = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please sign in again.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid user session. Please sign in again.",
      });
    }

    const documents = await Document.find({
      owner: userId,
    })
      .select("-extractedText")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: documents.length,
      documents,
    });
  } catch (error) {
    console.error("GET DOCUMENTS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Could not retrieve documents.",
    });
  }
};

// DELETE /api/documents/:id
// Delete only a document owned by the authenticated user.
const deleteDocument = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please sign in again.",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid user session. Please sign in again.",
      });
    }

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid document ID.",
      });
    }

    const document = await Document.findOneAndDelete({
      _id: id,
      owner: userId,
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: "Document not found or you do not have permission to delete it.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Document deleted successfully.",
    });
  } catch (error) {
    console.error("DELETE DOCUMENT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Could not delete the document.",
    });
  }
};

module.exports = {
  uploadDocument,
  getDocuments,
  deleteDocument,
};
