const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const fetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// ─── Feature Config ────────────────────────────────────────────────────────────
// Set CREATE_PASSWORD in .env to restrict who can publish surveys
const CREATE_PASSWORD = process.env.CREATE_PASSWORD || "research2025";

// Per-device generation limits — 0 = unlimited
const MAX_VIDEOS_PER_DEVICE = parseInt(process.env.MAX_VIDEOS_PER_DEVICE || "2", 10);
const MAX_IMAGES_PER_DEVICE = parseInt(process.env.MAX_IMAGES_PER_DEVICE || "10", 10);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/videos", express.static(path.join(__dirname, "videos")));

// Serve built React client in production
const CLIENT_BUILD = path.join(__dirname, "../client/dist");
if (fsSync.existsSync(CLIENT_BUILD)) {
  app.use(express.static(CLIENT_BUILD));
}

// ─── File Upload Config ────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) =>
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only images are allowed"), false);
  },
});

// ─── Storage Helpers ───────────────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
const SURVEYS_FILE = path.join(DATA_DIR, "surveys.json");
const RESPONSES_DIR = path.join(DATA_DIR, "responses");

async function initStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(RESPONSES_DIR, { recursive: true });
  await fs.mkdir(path.join(__dirname, "uploads"), { recursive: true });
  await fs.mkdir(path.join(__dirname, "videos"), { recursive: true });
  try {
    await fs.access(SURVEYS_FILE);
  } catch {
    await fs.writeFile(SURVEYS_FILE, JSON.stringify({}, null, 2));
  }
}

async function getSurveys() {
  const data = await fs.readFile(SURVEYS_FILE, "utf8");
  return JSON.parse(data);
}

async function saveSurveys(surveys) {
  await fs.writeFile(SURVEYS_FILE, JSON.stringify(surveys, null, 2));
}

async function getResponses(surveyId) {
  const file = path.join(RESPONSES_DIR, `${surveyId}.json`);
  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveResponse(surveyId, response) {
  const file = path.join(RESPONSES_DIR, `${surveyId}.json`);
  const responses = await getResponses(surveyId);
  responses.push(response);
  await fs.writeFile(file, JSON.stringify(responses, null, 2));
}

// ─── Device Usage Helpers ─────────────────────────────────────────────────────
const USAGE_FILE = path.join(DATA_DIR, "device_usage.json");

async function getUsage() {
  try {
    const data = await fs.readFile(USAGE_FILE, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveUsage(usage) {
  await fs.writeFile(USAGE_FILE, JSON.stringify(usage, null, 2));
}

async function recordUsage(deviceId, type) {
  const usage = await getUsage();
  if (!usage[deviceId]) usage[deviceId] = { videos: 0, images: 0, firstSeen: new Date().toISOString() };
  usage[deviceId][type] = (usage[deviceId][type] || 0) + 1;
  usage[deviceId].lastSeen = new Date().toISOString();
  await saveUsage(usage);
}

async function checkLimit(deviceId, type) {
  if (!deviceId) return { allowed: true };
  const limit = type === "videos" ? MAX_VIDEOS_PER_DEVICE : MAX_IMAGES_PER_DEVICE;
  if (limit === 0) return { allowed: true };
  const usage = await getUsage();
  const count = usage[deviceId]?.[type] || 0;
  return { allowed: count < limit, used: count, limit };
}

// ─── Auth Routes ───────────────────────────────────────────────────────────────

// Verify the create-survey password
app.post("/api/auth/verify", (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password required" });
  if (password === CREATE_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(403).json({ ok: false, error: "Incorrect password" });
  }
});

// Get current device usage (so the client can show remaining quota)
app.get("/api/usage", async (req, res) => {
  const deviceId = req.headers["x-device-id"];
  if (!deviceId) return res.json({ videos: 0, images: 0, limits: { videos: MAX_VIDEOS_PER_DEVICE, images: MAX_IMAGES_PER_DEVICE } });
  const usage = await getUsage();
  const d = usage[deviceId] || { videos: 0, images: 0 };
  res.json({
    videos: d.videos || 0,
    images: d.images || 0,
    limits: { videos: MAX_VIDEOS_PER_DEVICE, images: MAX_IMAGES_PER_DEVICE },
  });
});

// ─── Survey Routes ─────────────────────────────────────────────────────────────

// Create a new survey
app.post("/api/surveys", async (req, res) => {
  try {
    const { title, description, pages, completionMessage, redirectUrl } = req.body;
    if (!title || !pages?.length) {
      return res.status(400).json({ error: "Title and at least one page are required" });
    }

    const id = uuidv4();
    const adminToken = uuidv4();
    const survey = {
      id,
      adminToken,
      title,
      description: description || "",
      completionMessage: completionMessage || "",
      redirectUrl: redirectUrl || "",
      pages,
      createdAt: new Date().toISOString(),
      responseCount: 0,
    };

    const surveys = await getSurveys();
    surveys[id] = survey;
    await saveSurveys(surveys);

    res.json({
      id,
      adminToken,
      shareLink: `/survey/${id}`,
      adminLink: `/admin/${id}?token=${adminToken}`,
    });
  } catch (err) {
    console.error("Create survey error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Get a survey (public — strips admin token)
app.get("/api/surveys/:id", async (req, res) => {
  try {
    const surveys = await getSurveys();
    const survey = surveys[req.params.id];
    if (!survey) return res.status(404).json({ error: "Survey not found" });
    const { adminToken, ...publicSurvey } = survey;
    res.json(publicSurvey);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Submit a response
app.post("/api/surveys/:id/responses", async (req, res) => {
  try {
    const surveys = await getSurveys();
    if (!surveys[req.params.id])
      return res.status(404).json({ error: "Survey not found" });

    const responseId = uuidv4();
    const response = {
      id: responseId,
      surveyId: req.params.id,
      answers: req.body.answers,
      submittedAt: new Date().toISOString(),
    };

    await saveResponse(req.params.id, response);

    // Increment counter
    surveys[req.params.id].responseCount =
      (surveys[req.params.id].responseCount || 0) + 1;
    await saveSurveys(surveys);

    res.json({ success: true, responseId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get responses (admin only)
app.get("/api/surveys/:id/responses", async (req, res) => {
  try {
    const { token } = req.query;
    const surveys = await getSurveys();
    const survey = surveys[req.params.id];
    if (!survey) return res.status(404).json({ error: "Survey not found" });
    if (survey.adminToken !== token)
      return res.status(403).json({ error: "Invalid admin token" });

    const responses = await getResponses(req.params.id);
    res.json({ survey: { title: survey.title }, responses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Gemini VEO Routes ─────────────────────────────────────────────────────────

// Upload image and start video generation
app.post("/api/generate-video", upload.single("image"), async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: "GEMINI_API_KEY not configured",
        message: "Set the GEMINI_API_KEY environment variable to enable video generation.",
      });
    }

    const deviceId = req.headers["x-device-id"];
    const limitCheck = await checkLimit(deviceId, "videos");
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: "Generation limit reached",
        message: `You have reached the maximum of ${limitCheck.limit} video generations allowed per device.`,
        used: limitCheck.used,
        limit: limitCheck.limit,
      });
    }

    const { prompt } = req.body;
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    // Read uploaded image as base64
    const imageBuffer = await fs.readFile(req.file.path);
    const base64Image = imageBuffer.toString("base64");
    const mimeType = req.file.mimetype;

    // Call Gemini VEO 2 API (long-running operation)
    const veoRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predictLongRunning?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [
            {
              prompt,
              image: {
                bytesBase64Encoded: base64Image,
                mimeType,
              },
            },
          ],
          parameters: {
            aspectRatio: "16:9",
            sampleCount: 1,
            durationSeconds: 5,
          },
        }),
      }
    );

    if (!veoRes.ok) {
      const errBody = await veoRes.json().catch(() => ({}));
      console.error("VEO API error:", errBody);
      return res.status(502).json({
        error: "Gemini VEO API error",
        details: errBody?.error?.message || "Unknown error from VEO API",
      });
    }

    const operation = await veoRes.json();
    // Record usage now — operation is queued
    if (deviceId) await recordUsage(deviceId, "videos");
    res.json({ operationName: operation.name, status: "processing" });
  } catch (err) {
    console.error("Generate video error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/video-status", async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
    }

    const { operationName } = req.query;
    if (!operationName) return res.status(400).json({ error: "operationName is required" });

    const pollRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GEMINI_API_KEY}`
    );

    if (!pollRes.ok) {
      const errBody = await pollRes.json().catch(() => ({}));
      return res.status(502).json({ error: "Poll error", details: errBody });
    }

    const data = await pollRes.json();

    if (!data.done) return res.json({ status: "processing" });
    if (data.error) return res.json({ status: "error", error: data.error.message });

    const samples = data.response?.generateVideoResponse?.generatedSamples || [];
    if (!samples.length) return res.json({ status: "error", error: "No video generated" });

    const videoUri = samples[0]?.video?.uri;
    if (!videoUri) return res.json({ status: "error", error: "No video URI in response" });

    // --- THE CHANGE IS HERE ---
    // Instead of saving to a file, we download the video into a Buffer
    const videoDownload = await fetch(videoUri);
    const arrayBuffer = await videoDownload.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Convert the buffer directly to a Base64 string
    const base64Video = buffer.toString("base64");

    res.json({
      status: "complete",
      // Send the video data directly back to the browser
      videoBase64: `data:video/mp4;base64,${base64Video}`
    });

  } catch (err) {
    console.error("Video status error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ─── Gemini Image Generation ──────────────────────────────────────────────────

app.post("/api/generate-image", upload.single("image"), async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({
        error: "GEMINI_API_KEY not configured",
        message: "Set the GEMINI_API_KEY environment variable to enable image generation.",
      });
    }

    const deviceId = req.headers["x-device-id"];
    const limitCheck = await checkLimit(deviceId, "images");
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: "Generation limit reached",
        message: `You have reached the maximum of ${limitCheck.limit} image generations allowed per device.`,
        used: limitCheck.used,
        limit: limitCheck.limit,
      });
    }

    const { prompt } = req.body;
    if (!req.file) return res.status(400).json({ error: "No image uploaded" });
    if (!prompt) return res.status(400).json({ error: "Prompt is required" });

    const imageBuffer = await fs.readFile(req.file.path);
    const base64ImageInput = imageBuffer.toString("base64");
    const mimeTypeInput = req.file.mimetype;

    // Clean up the user's uploaded selfie immediately
    await fs.unlink(req.file.path).catch(() => {});

    const genRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mimeTypeInput, data: base64ImageInput } },
                ],
              },
            ],
            generationConfig: {
              responseModalities: ["image"],
            },
          }),
        }
    );

    if (!genRes.ok) {
      const errBody = await genRes.json().catch(() => ({}));
      return res.status(502).json({
        error: "Gemini image generation error",
        details: errBody?.error?.message || "Unknown error",
      });
    }

    const data = await genRes.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((p) => p.inlineData?.mimeType?.startsWith("image/"));

    if (!imagePart) {
      return res.status(502).json({ error: "No image returned by Gemini" });
    }

    if (deviceId) await recordUsage(deviceId, "images");

    // SUCCESS: Send the data directly as a Base64 string
    // This removes the need for a temporary file and the cleanup call
    res.json({
      status: "complete",
      imageBase64: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
    });

  } catch (err) {
    console.error("Generate image error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Sweep videos older than 1 hour (safety net for any that slipped through)
async function sweepOldVideos() {
  try {
    const videosDir = path.join(__dirname, "videos");
    const files = await fs.readdir(videosDir);
    const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
    for (const file of files) {
      const filePath = path.join(videosDir, file);
      const stat = await fs.stat(filePath).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) {
        await fs.unlink(filePath).catch(() => {});
      }
    }
  } catch {}
}

// Run sweep every 15 minutes
setInterval(sweepOldVideos, 15 * 60 * 1000);


app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    veoEnabled: !!GEMINI_API_KEY,
    timestamp: new Date().toISOString(),
  });
});

// ─── Catch-all for React SPA ───────────────────────────────────────────────────
if (fsSync.existsSync(CLIENT_BUILD)) {
  app.get("*", (req, res) => {
    res.sendFile(path.join(CLIENT_BUILD, "index.html"));
  });
}

// ─── Start ─────────────────────────────────────────────────────────────────────
initStorage().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🚀 Survey API running on http://localhost:${PORT}`);
    console.log(`   VEO video generation: ${GEMINI_API_KEY ? "✅ enabled" : "❌ disabled (set GEMINI_API_KEY)"}\n`);
  });
});
