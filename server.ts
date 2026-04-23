import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import mammoth from "mammoth";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use memory storage for multer as we only need the text and don't want to persist files
  const upload = multer({ storage: multer.memoryStorage() });

  app.use(express.json());

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Route for text extraction
  app.post("/api/extract-text", upload.single("resume"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      let text = "";
      const buffer = req.file.buffer;
      const mimetype = req.file.mimetype;
      const fileName = req.file.originalname.toLowerCase();

      console.log(`Extracting text from: ${fileName} (${mimetype})`);

      if (
        mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        fileName.endsWith(".docx")
      ) {
        console.log("Starting DOCX extraction...");
        const result = await mammoth.extractRawText({ buffer });
        text = result.value;
        console.log(`Extracted ${text?.length || 0} characters from DOCX.`);
      } else {
        console.error(`Unsupported file type: ${mimetype}`);
        return res.status(400).json({ error: "Only DOCX files are supported." });
      }

      if (!text || text.trim().length === 0) {
        console.warn("Extraction yielded no text.");
        return res.status(422).json({ error: "Could not extract readable text from this DOCX file." });
      }

      res.json({ text });
    } catch (error) {
      console.error("Extraction error:", error);
      res.status(500).json({ error: "Failed to extract text from DOCX file." });
    }
  });

  // Special JSON error for non-existent /api routes
  // This prevents the HTML (<!doctype) from being served when an API call fails
  app.use("/api/*", (req, res) => {
    res.status(404).json({ 
      error: "API endpoint not found", 
      path: req.originalUrl,
      method: req.method 
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
