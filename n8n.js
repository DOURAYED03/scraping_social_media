'use strict';

const axios = require('axios');

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

/**
 * Send a single analysis result to n8n
 * @param {Object} analysis - Single video analysis
 * @param {string} eventType - Event type label for n8n routing
 */
async function sendToN8n(analysis, eventType = 'video_analysis') {
  if (!N8N_WEBHOOK_URL) {
    throw new Error('N8N_WEBHOOK_URL is not configured in environment variables.');
  }

  const payload = {
    event: eventType,
    timestamp: new Date().toISOString(),
    source: 'competitor-intel-api',
    data: analysis,
  };

  console.log(`[n8n] Sending ${eventType} for ${analysis.videoId || 'unknown'} to webhook...`);

  const { data, status } = await axios.post(N8N_WEBHOOK_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 15000,
  });

  console.log(`[n8n] Delivered — HTTP ${status}`);
  return { status, response: data };
}

/**
 * Send a full batch report (all analyses + strategy) to n8n
 * @param {Object[]} analyses - Array of video analysis results
 * @param {Object} strategyReport - Strategy report object
 * @param {Object} meta - Metadata about the scrape job
 */
async function sendBatchToN8n(analyses, strategyReport = null, meta = {}) {
  if (!N8N_WEBHOOK_URL) {
    throw new Error('N8N_WEBHOOK_URL is not configured in environment variables.');
  }

  const payload = {
    event: 'batch_analysis_complete',
    timestamp: new Date().toISOString(),
    source: 'competitor-intel-api',
    meta: {
      totalVideos: analyses.length,
      platforms: [...new Set(analyses.map(a => a.platform))],
      jobId: meta.jobId || `job_${Date.now()}`,
      niche: meta.niche || 'unspecified',
      ...meta,
    },
    analyses,
    strategy: strategyReport,
  };

  console.log(`[n8n] Sending batch of ${analyses.length} analyses to webhook...`);

  const { data, status } = await axios.post(N8N_WEBHOOK_URL, payload, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  console.log(`[n8n] Batch delivered — HTTP ${status}`);
  return { status, response: data };
}

/**
 * Send individual analyses one by one (useful for n8n streaming workflows)
 * @param {Object[]} analyses - Array of video analysis results
 * @param {number} delayMs - Delay between webhook calls
 */
async function streamToN8n(analyses, delayMs = 500) {
  const results = [];

  for (const analysis of analyses) {
    try {
      const result = await sendToN8n(analysis, 'video_analysis');
      results.push({ videoId: analysis.videoId, success: true, ...result });
    } catch (err) {
      console.error(`[n8n] Failed to send ${analysis.videoId}: ${err.message}`);
      results.push({ videoId: analysis.videoId, success: false, error: err.message });
    }
    if (analyses.indexOf(analysis) < analyses.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return results;
}

module.exports = { sendToN8n, sendBatchToN8n, streamToN8n };
