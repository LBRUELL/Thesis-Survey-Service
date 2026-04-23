# Forma — Research Survey Application

A full-stack survey platform for research: multi-page flows, Likert scales, image uploads, and AI-powered try-on video generation via **Gemini VEO 2** — with dynamic prompt interpolation from participant answers.

---

## What's new in v2

| Feature | Details |
|---|---|
| **Dynamic VEO prompt** | Use `{{variable_name}}` placeholders — replaced with participant's earlier answers at runtime |
| **Must-watch video gate** | Cannot advance until the video has played in full; skipping triggers an animated shake warning |
| **Privacy-first video** | Server file deleted immediately after browser loads it; 1-hour sweep as safety net |
| **Privacy note** | Shown under upload box and again after video loads |
| **One-click deploy** | `railway.json` + `render.yaml` included |

---

## Prompt Interpolation

Give each question a **Variable name** in the builder (e.g. `height`, `weight`). Reference them in the VEO prompt as `{{variable_name}}`:

```
Attached please find a selfie of a person, who is {{height}} cm tall, weighs
{{weight}} kg, and has {{body_fat_min}}% – {{body_fat_max}}% body fat.
Additionally, please find pictures of {{clothing_item}} in color {{clothing_color}}.
Please generate a video of the person wearing {{clothing_item}} in size
{{clothing_size}} in a setting of a try-on stall that one would find in a
typical mall. The person should not be speaking.
```

The builder shows clickable chips for every defined variable — click to append it. At runtime each `{{…}}` is substituted before the request goes to VEO.

---

## Gemini VEO 2 Setup

1. [Google AI Studio](https://aistudio.google.com/) → create an API key
2. Ensure Veo 2 access (apply at [ai.google.dev](https://ai.google.dev/gemini-api/docs/video))
3. Set `GEMINI_API_KEY` in your environment

Without the key all other question types still work; VEO questions show a configuration notice.

---

## Deploy Online — Railway (recommended)

Railway gives you a public HTTPS URL in ~2 minutes.

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "initial"
gh repo create forma-survey --public --push

# 2. railway.app → New Project → Deploy from GitHub repo
#    (Railway auto-detects the Dockerfile)

# 3. Add environment variable in Railway dashboard:
#    GEMINI_API_KEY = your_key_here

# 4. Add a persistent volume:
#    Service → Settings → Volumes → Add Volume
#    Mount path: /app/backend/data

# 5. Generate a domain:
#    Service → Settings → Networking → Generate Domain
```

Your app is now live at `https://your-app.railway.app`.

---

## Deploy Online — Render

```bash
# Push to GitHub, then:
# render.com → New → Blueprint → connect repo
# Set GEMINI_API_KEY in the Render Environment tab
# Deploy — public URL shown in dashboard
```

The included `render.yaml` configures everything including a 1 GB persistent disk.

---

## Local Development

```bash
cd backend && npm install
cd ../client && npm install

cp .env.example .env   # add GEMINI_API_KEY

# Two terminals:
cd backend && node server.js    # → http://localhost:3001
cd client  && npm run dev       # → http://localhost:5173
```

---

## Docker

```bash
cp .env.example .env
docker compose up -d   # → http://localhost:3001
```

---

## Question Types

| Type | Use for |
|---|---|
| Short Text | Single-line free text — name, number, measurement |
| Long Text | Multi-line textarea |
| Likert (1–5) | 5-point agreement scale |
| Likert (1–7) | 7-point agreement scale |
| Image Upload + AI Video | Selfie → Gemini VEO try-on video |

**Variable names** — lowercase + underscores only (auto-enforced). Examples: `height`, `weight`, `clothing_item`, `clothing_color`, `clothing_size`, `body_fat_min`, `body_fat_max`.

---

## Privacy & Data

- Generated videos are never written to a database
- The server `.mp4` is deleted immediately once the browser has fetched it
- A 15-minute background sweep removes any files older than 1 hour
- Text / Likert answers stored in JSON files in `backend/data/responses/`
- Uploaded images stored temporarily in `backend/uploads/` (not linked to responses)
