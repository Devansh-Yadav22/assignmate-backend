import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ---------------- RATE LIMITING ----------------
const rewriteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // 5 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many requests. Please wait a minute and try again.",
  },
});

// Apply limiter ONLY to rewrite route
app.use("/api/rewrite", rewriteLimiter);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/* ---------- PROMPTS ---------- */

const ACADEMIC_PROMPT = (text) => `
You are an academic editor. Rewrite the following text to meet university standards.

Rules:
- Tone: Formal, objective, and precise.
- Structure: Clear paragraphs with logical flow.
- Vocabulary: Use standard academic terminology.
- Remove: Any conversational filler, slang, or redundancy.
- CONSTRAINT: Do NOT change the original meaning or facts.

Text:
${text}
`;

const BALANCED_STAGE_2_PROMPT = (text) => `
You are a professional editor. Your job is to "polish" the following draft without losing its voice.

Strict Rules:
1.  **Fix Grammar & Tone:** Remove slang, casual contractions (like "gonna"), and unprofessional phrasing.
2.  **PRESERVE STRUCTURE:** Do NOT combine short sentences. Do NOT smooth out the sentence rhythms. Keep the "choppy" feel of the original text.
3.  **No AI Words:** Do not insert words like "delve," "tapestry," or "moreover."
4.  **Goal:** The result should look like a college student wrote it—clear and formal, but not robotic.

Text to polish:
${text}
`;

const AGGRESSIVE_PROMPT = (text) => `
You are a professional ghostwriter. Rewrite this text to bypass AI detection filters while remaining professional.

CRITICAL TECHNIQUE: "High Burstiness"
1.  **Sentence Variance:** You MUST alternate between complex, multi-clause sentences and short, direct fragments. 
2.  **Vocabulary:** Avoid "AI buzzwords" (e.g., *delve, tapestry, realm, underscore, crucial*). Use simpler, punchier synonyms.
3.  **Structure:** Do not use standard 5-sentence paragraphs. Merge some, split others.
4.  **Tone:** Confident and direct. 
5.  **Constraint:** ZERO slang. It must sound like a professional writing an email or report, not a text message.

Text:
${text}
`;

/* ---------- HELPERS ---------- */

async function generateText(prompt) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

/* ---------- ROUTE ---------- */

app.post("/api/rewrite", async (req, res) => {
  try {
    const { text, mode } = req.body;

    if (!text || !mode) {
      return res.status(400).json({ error: "Text and mode are required" });
    }

    // ---------- INPUT CAP ----------
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount > 1000) {
      return res.status(413).json({
        error: "Text too long. Please limit input to 1000 words.",
      });
    }

    let rewrittenText = "";

    if (mode === "academic") {
      rewrittenText = await generateText(ACADEMIC_PROMPT(text));
    }

    if (mode === "balanced") {
      const stage1 = await generateText(AGGRESSIVE_PROMPT(text));
      rewrittenText = await generateText(BALANCED_STAGE_2_PROMPT(stage1));
    }

    if (mode === "aggressive") {
      rewrittenText = await generateText(AGGRESSIVE_PROMPT(text));
    }

    res.json({
      rewrittenText,
      riskNote:
        mode === "academic"
          ? "Professional tone, higher AI detection likelihood"
          : mode === "balanced"
          ? "Balanced tone and detector resistance"
          : "Lowest AI detection, less formal tone",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Rewrite failed" });
  }
});

app.get("/", (_, res) => {
  res.send("AssignMate API running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`Server running on port ${PORT}`)
);
