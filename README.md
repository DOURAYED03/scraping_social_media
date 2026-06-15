# Competitor Intelligence API

An Express.js API that scrapes competitor videos from YouTube, TikTok, and Instagram Reels, analyzes their storytelling techniques using Claude AI, and sends structured data to n8n for content strategy automation.

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```
ANTHROPIC_API_KEY=your_key_here
N8N_WEBHOOK_URL=https://your-n8n.com/webhook/your-id
PORT=3000
RAPIDAPI_KEY=your_key_here   # needed for TikTok + Instagram
```

**Where to get API keys:**
- Anthropic: https://console.anthropic.com
- RapidAPI (TikTok): https://rapidapi.com/api/tiktok-api23
- RapidAPI (Instagram): https://rapidapi.com/api/instagram-scraper-api2
- n8n: Create a Webhook node in your workflow and copy the URL

### 3. Start the server

```bash
node server.js
```

---

## API Reference

### `GET /health`
Check server status and API key configuration.

---

### `POST /scrape/youtube`

Scrape YouTube videos.

```json
// By URLs
{ "urls": ["https://youtube.com/watch?v=abc123", "https://youtu.be/xyz456"] }

// By channel
{ "channelUrl": "https://www.youtube.com/@channelname", "limit": 5 }
```

**Response:**
```json
{
  "platform": "youtube",
  "results": [
    {
      "platform": "youtube",
      "videoId": "abc123",
      "url": "https://youtube.com/watch?v=abc123",
      "title": "Video title",
      "channel": "Channel name",
      "transcript": "Full video transcript...",
      "hasTranscript": true,
      "scrapedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "errors": []
}
```

---

### `POST /scrape/tiktok`

Requires `RAPIDAPI_KEY`.

```json
// By URLs
{ "urls": ["https://www.tiktok.com/@user/video/123"] }

// By username
{ "username": "competitorname", "limit": 5 }
```

---

### `POST /scrape/instagram`

Requires `RAPIDAPI_KEY`.

```json
// By URLs
{ "urls": ["https://www.instagram.com/reel/ABC123/"] }

// By username
{ "username": "competitorname", "limit": 5 }
```

---

### `POST /analyze`

Analyze already-scraped videos for storytelling patterns.

```json
{
  "videos": [...scraped video objects],
  "niche": "fitness"
}
```

**Response includes for each video:**
- Hook type, strength, technique
- Narrative arc structure and acts
- Emotional journey map
- CTA analysis
- Virality scores
- Replication strategy

---

### `POST /pipeline/run` ← Main endpoint

Full pipeline: scrape + analyze + send to n8n in one call.

```json
{
  "niche": "fitness coaching",
  "sendMode": "batch",
  "youtube": {
    "channelUrl": "https://www.youtube.com/@competitor1",
    "limit": 3
  },
  "tiktok": {
    "username": "competitor2",
    "limit": 3
  },
  "instagram": {
    "username": "competitor3",
    "limit": 3
  }
}
```

`sendMode`:
- `"batch"` — sends one webhook with all results (default)
- `"stream"` — sends one webhook per video

---

### `POST /pipeline/schedule`

Schedule recurring pipeline runs.

```json
{
  "cronExpression": "0 9 * * 1",
  "jobName": "weekly-competitor-scan",
  "niche": "fitness",
  "youtube": { "channelUrl": "https://www.youtube.com/@competitor", "limit": 5 }
}
```

Common cron expressions:
- `"0 9 * * 1"` — Every Monday at 9am
- `"0 8 * * *"` — Every day at 8am
- `"0 */6 * * *"` — Every 6 hours

### `GET /pipeline/schedule`
List active scheduled jobs.

### `DELETE /pipeline/schedule/:jobName`
Stop a scheduled job.

---

## n8n Webhook Payload Structure

The data sent to your n8n webhook:

```json
{
  "event": "batch_analysis_complete",
  "timestamp": "2024-01-01T09:00:00.000Z",
  "source": "competitor-intel-api",
  "meta": {
    "totalVideos": 9,
    "platforms": ["youtube", "tiktok", "instagram"],
    "jobId": "job_1234567890",
    "niche": "fitness coaching"
  },
  "analyses": [
    {
      "videoId": "abc123",
      "platform": "youtube",
      "url": "...",
      "title": "...",
      "metrics": { "views": 50000, "likes": 2000, "comments": 150 },
      "storytelling": {
        "hook": { "type": "pain_point", "strength": 8, "technique": "Agitation opener" },
        "narrative_arc": { "structure": "problem_solution", "pacing": "fast" },
        "emotional_journey": { "opening_emotion": "fear", "peak_emotion": "excitement" },
        "cta": { "present": true, "type": "subscribe", "placement": "end" },
        "virality_elements": { "shareability_score": 7, "entertainment_score": 8 },
        "replication_strategy": {
          "what_to_copy": "Fast-paced hook with immediate pain point",
          "what_to_improve": "Add more social proof early",
          "suggested_angle": "Same topic but from beginner perspective"
        },
        "overall_score": 8,
        "key_insight": "Opens with fear, resolves with authority — strong conversion pattern"
      }
    }
  ],
  "strategy": {
    "top_patterns": ["Pain-point hook", "Before/after structure", "End-screen CTA"],
    "content_calendar": [...],
    "gaps_to_exploit": ["No competitor covers beginner mistakes"],
    "priority_actions": ["Post 3x/week on TikTok", "Mirror problem_solution format"]
  }
}
```

---

## Example: curl test

```bash
# Health check
curl http://localhost:3000/health

# Run full pipeline
curl -X POST http://localhost:3000/pipeline/run \
  -H "Content-Type: application/json" \
  -d '{
    "niche": "personal finance",
    "youtube": { "urls": ["https://youtu.be/dQw4w9WgXcQ"] },
    "tiktok": { "username": "somecompetitor", "limit": 2 }
  }'
```
