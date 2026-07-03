const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const sharp = require("sharp");

const app = express();

// --- CATCH-ALL REQUEST LOGGER ---
app.use((req, res, next) => {
    console.log(`\n\n--- INCOMING REQUEST ---`);
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    console.log("Request Headers:", JSON.stringify(req.headers, null, 2));
    next();
});

app.use((req, res, next) => {
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src * data: blob:;"
    );
    next();
});

const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_VEO_MODEL = process.env.GEMINI_VEO_MODEL;
console.log("GEMINI_API_KEY loaded:", GEMINI_API_KEY ? `${GEMINI_API_KEY.slice(0, 8)}...` : "MISSING");
console.log("GEMINI_VEO_MODEL configured:", GEMINI_VEO_MODEL);
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

// ─── Robust Fetch Helper ───────────────────────────────────────────────────────
async function fetchWithRetry(url, options, retries = 4, backoff = 4000) {
    const retryStatusCodes = [429, 503];
    for (let i = 0; i < retries; i++) {
        let res;
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60-second timeout
            res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId);

            if (!retryStatusCodes.includes(res.status)) {
                return res; // Success or non-retryable error
            }

            const errorText = await res.text();
            console.warn(`API returned retryable status ${res.status} (attempt ${i + 1}/${retries}): ${errorText}`);

        } catch (error) {
            console.warn(`Fetch failed (attempt ${i + 1}/${retries}). Retrying in ${backoff}ms...`, error.message);
        }

        if (i === retries - 1) {
            // If it's the last attempt, return the problematic response or throw the last error
            if (res) return res;
            throw new Error(`Request failed after ${retries} attempts.`);
        }

        await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, i)));
    }
}

// ─── Storage & Feature Config ──────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
const CREATE_PASSWORD = process.env.CREATE_PASSWORD || "research2025";
const MAX_VIDEOS_PER_DEVICE = parseInt(process.env.MAX_VIDEOS_PER_DEVICE || "0", 10);
const MAX_IMAGES_PER_DEVICE = parseInt(process.env.MAX_IMAGES_PER_DEVICE || "10", 10);

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve built React client in production
const CLIENT_BUILD = path.join(__dirname, "../client/dist");
if (fsSync.existsSync(CLIENT_BUILD)) {
    app.use(express.static(CLIENT_BUILD));
}

// ─── File Upload Config ────────────────────────────────────────────────────────
const storage = multer.memoryStorage(); // Use memory storage to process with sharp
const upload = multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith("image/")) cb(null, true);
        else cb(new Error("Only images are allowed"), false);
    },
});

// ─── Storage Helpers ───────────────────────────────────────────────────────────
const SURVEYS_FILE = path.join(DATA_DIR, "surveys.json");
const RESPONSES_DIR = path.join(DATA_DIR, "responses");

async function initStorage() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(RESPONSES_DIR, { recursive: true });
    await fs.mkdir(path.join(__dirname, "uploads"), { recursive: true });
    await fs.mkdir(path.join(DATA_DIR, "videos"), { recursive: true }); // Use DATA_DIR for videos
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
app.post("/api/auth/verify", (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Password required" });
    if (password === CREATE_PASSWORD) {
        res.json({ ok: true });
    } else {
        res.status(403).json({ ok: false, error: "Incorrect password" });
    }
});

app.get("/api/usage", async (req, res) => {
    const deviceId = req.headers["x-device-id"];
    const { surveyId } = req.query;
    let limitVideos = MAX_VIDEOS_PER_DEVICE;
    let limitImages = MAX_IMAGES_PER_DEVICE;
    if (surveyId) {
        const surveys = await getSurveys();
        const survey = surveys[surveyId];
        if (survey && survey.deviceLimitEnabled === false) {
            limitVideos = 0;
            limitImages = 0;
        }
    }
    if (!deviceId) return res.json({ videos: 0, images: 0, limits: { videos: limitVideos, images: limitImages } });
    const usage = await getUsage();
    const d = usage[deviceId] || { videos: 0, images: 0 };
    res.json({
        videos: d.videos || 0,
        images: d.images || 0,
        limits: { videos: limitVideos, images: limitImages },
    });
});

// ─── Survey Routes ─────────────────────────────────────────────────────────────
app.post("/api/surveys", async (req, res) => {
    try {
        const { title, description, pages, completionMessage, redirectUrl, deviceLimitEnabled } = req.body;
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
            deviceLimitEnabled: deviceLimitEnabled !== false,
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
        surveys[req.params.id].responseCount = (surveys[req.params.id].responseCount || 0) + 1;
        await saveSurveys(surveys);
        res.json({ success: true, responseId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

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
app.post("/api/generate-video", upload.single("image"), async (req, res) => {
    try {
        if (!GEMINI_API_KEY) {
            return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
        }
        const deviceId = req.headers["x-device-id"];
        const { prompt, surveyId, model } = req.body;
        const targetModel = model || GEMINI_VEO_MODEL;

        let limitEnabled = true;
        if (surveyId) {
            const surveys = await getSurveys();
            const survey = surveys[surveyId];
            if (survey && survey.deviceLimitEnabled === false) limitEnabled = false;
        }
        if (limitEnabled) {
            const limitCheck = await checkLimit(deviceId, "videos");
            if (!limitCheck.allowed) {
                return res.status(429).json({ error: "Generation limit reached" });
            }
        }
        if (!req.file) return res.status(400).json({ error: "No image uploaded" });
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        // Step 1: Resize and compress the image
        const processedImageBuffer = await sharp(req.file.buffer)
            .resize(1024, 1024, { fit: 'inside' })
            .jpeg({ quality: 80 })
            .toBuffer();
        const originalBase64Image = processedImageBuffer.toString("base64");
        const originalMimeType = 'image/jpeg';

        console.log(`[PIPELINE] Step 1: Pre-processing uploaded image via Gemini Image Generation...`);

        const imageGenRes = await fetchWithRetry(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: "This is for a virtual try-on. " + prompt },
                                { inline_data: { mime_type: originalMimeType, data: originalBase64Image } }
                            ]
                        }
                    ],
                    generationConfig: { responseModalities: ["image"] },
                }),
            }
        );

        const imageGenText = await imageGenRes.text();
        if (!imageGenRes.ok) {
            console.error("[PIPELINE] Image generation failed:", imageGenText);
            return res.status(502).json({ error: "Gemini image pre-processing error: " + imageGenText });
        }

        const imageGenData = JSON.parse(imageGenText);
        const generatedImagePart = imageGenData.candidates?.[0]?.content?.parts?.find(p => p.inlineData);

        if (!generatedImagePart) {
            console.error("[PIPELINE] No image part in response:", imageGenData);
            return res.status(502).json({ error: "No pre-processed image returned by Gemini" });
        }

        const processedBase64Image = generatedImagePart.inlineData.data;
        const processedMimeType = generatedImagePart.inlineData.mimeType;

        console.log(`[PIPELINE] Step 2: Image pre-processing successful. Sending edited image to VEO...`);

        const veoRes = await fetchWithRetry(
            `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:predictLongRunning?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    instances: [{ prompt, image: { bytesBase64Encoded: processedBase64Image, mimeType: processedMimeType } }],
                    generationConfig: {
                        durationSeconds: 6,
                        personGeneration: "allow_adult",
                    },
                }),
            }
        );

        const veoText = await veoRes.text();
        if (!veoRes.ok) {
            console.error(`[VEO] API error with model ${targetModel}:`, veoText);
            return res.status(502).json({ error: `Gemini VEO API error: ${veoText}` });
        }

        const operation = JSON.parse(veoText);
        console.log(`[VEO] Successfully initiated generation with ${targetModel}`);

        if (deviceId) await recordUsage(deviceId, "videos");
        res.json({ operationName: operation.name, status: "processing" });
    } catch (err) {
        console.error("Generate video error:", err);
        res.status(500).json({ error: err.message });
    }
});

const SIMULATED_DELAY_MS = 45000; // 45 seconds, matching VEO timing
const TEST_VIDEO_URL = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_5MB.mp4";

// Test endpoint — mimics get-video-result but uses a free public video
const TEST_OPERATION = "test-operation";

app.get("/api/test-video-result", async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    console.log(`[TEST] Blocking for ${SIMULATED_DELAY_MS}ms then downloading...`);
    await new Promise(r => setTimeout(r, SIMULATED_DELAY_MS));
    const dl = await fetch(TEST_VIDEO_URL);
    const buf = Buffer.from(await dl.arrayBuffer());
    console.log(`[TEST] Downloaded ${buf.length} bytes, sending response...`);
    res.json({ status: "complete", videoBase64: buf.toString("base64") });
});

// This endpoint ONLY checks the status. It does not download the video.
app.get("/api/video-status", async (req, res) => {
    try {
        const { operationName } = req.query;
        if (!operationName) return res.status(400).json({ error: "operationName is required" });

        const pollRes = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GEMINI_API_KEY}`);
        if (!pollRes.ok) {
            return res.status(502).json({ error: "Poll error" });
        }
        const data = await pollRes.json();

        if (data.error) {
            return res.json({ status: "error", error: data.error.message });
        }
        if (data.done) {
            return res.json({ status: "complete" });
        }
        return res.json({ status: "processing" });

    } catch (err) {
        console.error("Video status check error:", err);
        res.status(500).json({ error: err.message });
    }
});

// This new endpoint is called ONCE by the client to get the final video.
app.get("/api/get-video-result", async (req, res) => {
    try {
        const { operationName } = req.query;
        if (!operationName) return res.status(400).json({ error: "operationName is required" });

        let data;
        let videoUri;
        let sawPopulatedResponse = false; // true once data.response itself is present (not just done:true)

        for (let i = 0; i < 3; i++) { // Retry up to 3 times
            const pollRes = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${GEMINI_API_KEY}`);
            if (!pollRes.ok) return res.status(502).json({ error: "Final poll error" });

            data = await pollRes.json();
            if (!data.done || data.error) {
                return res.status(404).json({ error: "Video not ready or failed", details: data.error });
            }

            // Log the FULL raw operation object so we can see the actual shape Google returned,
            // not just the fields we assumed would be there.
            console.log(`[GET-VIDEO] Raw operation response (attempt ${i + 1}):`, JSON.stringify(data));

            const genResponse = data.response?.generateVideoResponse;
            sawPopulatedResponse = sawPopulatedResponse || !!data.response;

            const samples = genResponse?.generatedSamples || [];
            videoUri = samples[0]?.video?.uri;
            if (videoUri) break; // Found it, exit loop

            // The RAI (safety) filter fields live INSIDE generateVideoResponse, not at the
            // top level of `response`. Check both places defensively.
            const filteredCount = genResponse?.raiMediaFilteredCount ?? data.response?.raiMediaFilteredCount;
            const filteredReasons = genResponse?.raiMediaFilteredReasons ?? data.response?.raiMediaFilteredReasons;

            if (filteredCount || (filteredReasons && filteredReasons.length)) {
                console.error("[GET-VIDEO] Blocked by Gemini safety filter:", filteredReasons);
                return res.status(422).json({
                    error: "Your photo could not be used to generate a video because it was flagged by the AI provider's content safety filter.",
                    code: "RAI_FILTERED",
                    filteredReasons,
                });
            }

            if (!data.response) {
                // Operation is done but Google hasn't finished populating the response yet —
                // this is the case actually worth retrying.
                console.log(`[GET-VIDEO] Attempt ${i + 1}: operation done but response not yet populated. Retrying in 3s...`);
            } else {
                // Response object exists, but there are no samples and no filter reason given.
                // Retrying the same completed operation will not change this — but we still
                // give it one more shot in case Google is writing the response in two stages.
                console.log(`[GET-VIDEO] Attempt ${i + 1}: response present but no samples and no filter reason. Retrying in 3s...`);
            }
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log("[GET-VIDEO] Final videoUri:", videoUri);

        if (!videoUri) {
            // Distinguish the two failure modes for the client/logs instead of one opaque error.
            if (!sawPopulatedResponse) {
                return res.status(502).json({
                    error: "The video finished processing but its result never became available. This is usually a transient issue on Google's side — please try again.",
                    code: "RESPONSE_NEVER_POPULATED",
                });
            }
            return res.status(502).json({
                error: "The video operation completed but returned no video and no filter reason. Check server logs for the raw response.",
                code: "EMPTY_RESULT_UNKNOWN_CAUSE",
                rawResponse: data.response ?? null,
            });
        }

        // Try adding the API key — Google file URIs often require it
        const fetchUri = videoUri.includes("?")
            ? `${videoUri}&key=${GEMINI_API_KEY}`
            : `${videoUri}?key=${GEMINI_API_KEY}`;

        const videoDownload = await fetchWithRetry(fetchUri);
        console.log("[GET-VIDEO] download status:", videoDownload.status);
        console.log("[GET-VIDEO] download content-type:", videoDownload.headers.get("content-type"));

        const videoBuffer = Buffer.from(await videoDownload.arrayBuffer());
        console.log("[GET-VIDEO] buffer size:", videoBuffer.length);
        console.log("[GET-VIDEO] first bytes (hex):", videoBuffer.slice(0, 16).toString("hex"));
        // A valid MP4 will show: 00000020667479... (the "ftyp" box)
        // An error JSON/HTML will show readable ASCII like: 7b226572726f72... = {"error"

        res.json({ status: "complete", videoBase64: videoBuffer.toString("base64") });
    } catch (err) {
        console.error("[GET-VIDEO] error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Gemini Image Generation ──────────────────────────────────────────────────
app.post("/api/generate-image", upload.single("image"), async (req, res) => {
    try {
        if (!GEMINI_API_KEY) {
            return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
        }
        const deviceId = req.headers["x-device-id"];
        const { prompt, surveyId } = req.body;
        let limitEnabled = true;
        if (surveyId) {
            const surveys = await getSurveys();
            const survey = surveys[surveyId];
            if (survey && survey.deviceLimitEnabled === false) limitEnabled = false;
        }
        if (limitEnabled) {
            const limitCheck = await checkLimit(deviceId, "images");
            if (!limitCheck.allowed) {
                return res.status(429).json({ error: "Generation limit reached" });
            }
        }
        if (!req.file) return res.status(400).json({ error: "No image uploaded" });
        if (!prompt) return res.status(400).json({ error: "Prompt is required" });

        // Resize and compress the image
        const processedImageBuffer = await sharp(req.file.buffer)
            .resize(1024, 1024, { fit: 'inside' })
            .jpeg({ quality: 80 })
            .toBuffer();
        const base64ImageInput = processedImageBuffer.toString("base64");
        const mimeTypeInput = 'image/jpeg';

        const genRes = await fetchWithRetry(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${GEMINI_API_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeTypeInput, data: base64ImageInput } }] }],
                    generationConfig: { responseModalities: ["image"] },
                }),
            }
        );

        const genText = await genRes.text();
        if (!genRes.ok) {
            console.error("Gemini image generation error:", genRes.status, genText);
            return res.status(502).json({ error: "Gemini image generation error", details: genText });
        }

        let data;
        try {
            data = JSON.parse(genText);
        } catch (e) {
            console.error("Failed to parse Gemini JSON response:", genText);
            return res.status(502).json({ error: "Invalid JSON response from Gemini", details: genText });
        }

        const imagePart = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
        if (!imagePart) {
            console.error("No image part in Gemini response:", data);
            return res.status(502).json({ error: "No image returned by Gemini" });
        }
        if (deviceId) await recordUsage(deviceId, "images");
        res.json({
            status: "complete",
            imageBase64: `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`,
        });
    } catch (err) {
        console.error("Generate image error:", err);
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/health", (req, res) => {
    res.json({ status: "ok", veoEnabled: !!GEMINI_API_KEY });
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