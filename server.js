'use strict';

require('dotenv').config();

const express = require('express');
const cron = require('node-cron');

const youtube = require('./scrapers/youtube');
const tiktok = require('./scrapers/tiktok');
const instagram = require('./scrapers/instagram');
const { analyzeVideos, generateStrategyReport } = require('./analysis/storytelling');
const { sendBatchToN8n, streamToN8n } = require('./n8n');

const app = express();
app.use(express.json());

// ─── Health check ────────────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    services: {
      anthropic: !!process.env.ANTHROPIC_API_KEY,
      n8n: !!process.env.N8N_WEBHOOK_URL,
      rapidapi: !!process.env.RAPIDAPI_KEY,
    },
    timestamp: new Date().toISOString(),
  });
});

// ─── Scrape routes ────────────────────────────────────────────────────────────

/**
 * POST /scrape/youtube
 * Body: { urls: ["https://youtube.com/watch?v=..."], channelUrl: "optional" }
 */
app.post('/scrape/youtube', async (req, res) => {
  try {
    const { urls = [], channelUrl, limit = 5 } = req.body;

    let result;
    if (channelUrl) {
      result = await youtube.scrapeChannel(channelUrl, limit);
    } else if (urls.length) {
      result = await youtube.scrapeVideos(urls);
    } else {
      return res.status(400).json({ error: 'Provide urls[] or channelUrl' });
    }

    res.json({ platform: 'youtube', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /scrape/tiktok
 * Body: { urls: [...], username: "optional", limit: 5 }
 */
app.post('/scrape/tiktok', async (req, res) => {
  try {
    const { urls = [], username, limit = 5 } = req.body;

    let result;
    if (username) {
      result = await tiktok.scrapeUserVideos(username, limit);
    } else if (urls.length) {
      result = await tiktok.scrapeVideos(urls);
    } else {
      return res.status(400).json({ error: 'Provide urls[] or username' });
    }

    res.json({ platform: 'tiktok', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /scrape/instagram
 * Body: { urls: [...], username: "optional", limit: 5 }
 */
app.post('/scrape/instagram', async (req, res) => {
  try {
    const { urls = [], username, limit = 5 } = req.body;

    let result;
    if (username) {
      result = await instagram.scrapeUserReels(username, limit);
    } else if (urls.length) {
      result = await instagram.scrapeReels(urls);
    } else {
      return res.status(400).json({ error: 'Provide urls[] or username' });
    }

    res.json({ platform: 'instagram', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analysis routes ──────────────────────────────────────────────────────────

/**
 * POST /analyze
 * Body: { videos: [...scraped video objects] }
 * Analyze already-scraped videos
 */
app.post('/analyze', async (req, res) => {
  try {
    const { videos, niche = 'general' } = req.body;
    if (!videos?.length) return res.status(400).json({ error: 'Provide videos[] array' });

    const { results, errors } = await analyzeVideos(videos);
    const strategy = results.length ? await generateStrategyReport(results, niche) : null;

    res.json({ analyses: results, strategy, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Full pipeline routes ─────────────────────────────────────────────────────

/**
 * POST /pipeline/run
 * Scrape + Analyze + Send to n8n in one call
 *
 * Body:
 * {
 *   niche: "fitness",
 *   sendMode: "batch" | "stream",
 *   youtube: { urls: [], channelUrl: "", limit: 5 },
 *   tiktok:  { urls: [], username: "", limit: 5 },
 *   instagram: { urls: [], username: "", limit: 5 }
 * }
 */
app.post('/pipeline/run', async (req, res) => {
  const { niche = 'general', sendMode = 'batch' } = req.body;
  const jobId = `job_${Date.now()}`;
  const log = [];

  const push = (msg) => { log.push(msg); console.log(`[Pipeline][${jobId}] ${msg}`); };

  try {
    push('Pipeline started');
    const allVideos = [];

    // ── Scrape YouTube ──
    if (req.body.youtube) {
      const { urls = [], channelUrl, limit = 5 } = req.body.youtube;
      push(`Scraping YouTube (${channelUrl ? 'channel' : urls.length + ' URLs'})`);
      try {
        const ytResult = channelUrl
          ? await youtube.scrapeChannel(channelUrl, limit)
          : await youtube.scrapeVideos(urls);
        allVideos.push(...ytResult.results);
        push(`YouTube: ${ytResult.results.length} videos scraped, ${ytResult.errors.length} errors`);
      } catch (e) { push(`YouTube scrape failed: ${e.message}`); }
    }

    // ── Scrape TikTok ──
    if (req.body.tiktok) {
      const { urls = [], username, limit = 5 } = req.body.tiktok;
      push(`Scraping TikTok (${username ? '@' + username : urls.length + ' URLs'})`);
      try {
        const ttResult = username
          ? await tiktok.scrapeUserVideos(username, limit)
          : await tiktok.scrapeVideos(urls);
        allVideos.push(...ttResult.results);
        push(`TikTok: ${ttResult.results.length} videos scraped, ${ttResult.errors.length} errors`);
      } catch (e) { push(`TikTok scrape failed: ${e.message}`); }
    }

    // ── Scrape Instagram ──
    if (req.body.instagram) {
      const { urls = [], username, limit = 5 } = req.body.instagram;
      push(`Scraping Instagram (${username ? '@' + username : urls.length + ' URLs'})`);
      try {
        const igResult = username
          ? await instagram.scrapeUserReels(username, limit)
          : await instagram.scrapeReels(urls);
        allVideos.push(...igResult.results);
        push(`Instagram: ${igResult.results.length} reels scraped, ${igResult.errors.length} errors`);
      } catch (e) { push(`Instagram scrape failed: ${e.message}`); }
    }

    if (!allVideos.length) {
      return res.status(400).json({ error: 'No videos scraped. Check your URLs/usernames and API keys.', log });
    }

    push(`Total scraped: ${allVideos.length} videos across all platforms`);

    // ── Analyze ──
    push('Starting storytelling analysis with Claude AI...');
    const { results: analyses, errors: analysisErrors } = await analyzeVideos(allVideos);
    push(`Analysis complete: ${analyses.length} analyzed, ${analysisErrors.length} errors`);

    // ── Strategy report ──
    let strategy = null;
    if (analyses.length) {
      push('Generating cross-platform strategy report...');
      strategy = await generateStrategyReport(analyses, niche);
      push('Strategy report generated');
    }

    // ── Send to n8n ──
    push(`Sending to n8n via ${sendMode} mode...`);
    let n8nResult;
    if (process.env.N8N_WEBHOOK_URL) {
      n8nResult = sendMode === 'stream'
        ? await streamToN8n(analyses)
        : await sendBatchToN8n(analyses, strategy, { jobId, niche });
      push('n8n delivery complete');
    } else {
      push('N8N_WEBHOOK_URL not set — skipping delivery');
    }

    res.json({
      jobId,
      status: 'complete',
      summary: {
        videosScraped: allVideos.length,
        videosAnalyzed: analyses.length,
        platforms: [...new Set(allVideos.map(v => v.platform))],
        niche,
      },
      analyses,
      strategy,
      n8nResult,
      log,
    });

  } catch (err) {
    push(`Fatal error: ${err.message}`);
    res.status(500).json({ error: err.message, jobId, log });
  }
});

/**
 * POST /pipeline/schedule
 * Schedule a recurring pipeline run
 *
 * Body: { cronExpression: "0 9 * * 1", ...same as /pipeline/run }
 */
const scheduledJobs = new Map();

app.post('/pipeline/schedule', (req, res) => {
  const { cronExpression = '0 9 * * 1', jobName = 'default', ...pipelineBody } = req.body;

  if (!cron.validate(cronExpression)) {
    return res.status(400).json({ error: 'Invalid cron expression' });
  }

  if (scheduledJobs.has(jobName)) {
    scheduledJobs.get(jobName).stop();
  }

  const task = cron.schedule(cronExpression, async () => {
    console.log(`[Scheduler] Running job "${jobName}" at ${new Date().toISOString()}`);
    try {
      const fakeReq = { body: pipelineBody };
      const fakeRes = {
        json: (data) => console.log(`[Scheduler] Job "${jobName}" complete:`, JSON.stringify(data).slice(0, 200)),
        status: () => ({ json: (d) => console.error('[Scheduler] Error:', d) }),
      };
      // Re-use the pipeline route handler logic inline
      await fetch(`http://localhost:${process.env.PORT || 3000}/pipeline/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pipelineBody),
      });
    } catch (err) {
      console.error(`[Scheduler] Job "${jobName}" failed:`, err.message);
    }
  });

  scheduledJobs.set(jobName, task);

  res.json({
    success: true,
    jobName,
    cronExpression,
    message: `Job "${jobName}" scheduled. Runs: ${cronExpression}`,
  });
});

app.delete('/pipeline/schedule/:jobName', (req, res) => {
  const { jobName } = req.params;
  if (scheduledJobs.has(jobName)) {
    scheduledJobs.get(jobName).stop();
    scheduledJobs.delete(jobName);
    res.json({ success: true, message: `Job "${jobName}" stopped` });
  } else {
    res.status(404).json({ error: `No scheduled job named "${jobName}"` });
  }
});

app.get('/pipeline/schedule', (req, res) => {
  res.json({ scheduledJobs: [...scheduledJobs.keys()] });
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n Competitor Intelligence API running on http://localhost:${PORT}`);
  console.log(` Health check: http://localhost:${PORT}/health\n`);
  console.log(' Routes:');
  console.log('  POST /scrape/youtube');
  console.log('  POST /scrape/tiktok');
  console.log('  POST /scrape/instagram');
  console.log('  POST /analyze');
  console.log('  POST /pipeline/run       ← Full pipeline: scrape + analyze + send to n8n');
  console.log('  POST /pipeline/schedule  ← Schedule recurring pipeline');
  console.log('  GET  /pipeline/schedule  ← List scheduled jobs');
  console.log('  DELETE /pipeline/schedule/:name ← Cancel a job\n');
});

module.exports = app;
