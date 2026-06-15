'use strict';

const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STORYTELLING_SYSTEM_PROMPT = `You are an expert content strategist and storytelling analyst. 
Your job is to analyze competitor video content and extract deep storytelling insights that can be used to build better content strategies.

You always respond with valid JSON only. No markdown, no prose outside the JSON.`;

const STORYTELLING_PROMPT = (video) => `Analyze this competitor video and extract storytelling patterns. Return a JSON object exactly matching this schema:

{
  "hook": {
    "type": "question|statement|shock|story|pain_point|curiosity_gap|social_proof",
    "text": "First 10-15 words of the hook or inferred hook",
    "strength": 1-10,
    "technique": "Brief name of the hook technique used"
  },
  "narrative_arc": {
    "structure": "problem_solution|hero_journey|before_after|listicle|tutorial|story|rant|revelation",
    "acts": ["Act 1 description", "Act 2 description", "Act 3 description"],
    "pacing": "slow|medium|fast|varied"
  },
  "emotional_journey": {
    "opening_emotion": "curiosity|fear|excitement|empathy|humor|anger|inspiration",
    "peak_emotion": "curiosity|fear|excitement|empathy|humor|anger|inspiration",
    "closing_emotion": "hope|satisfaction|urgency|connection|motivation|entertainment",
    "tension_moments": ["Moment 1", "Moment 2"]
  },
  "cta": {
    "present": true|false,
    "type": "subscribe|follow|comment|link_in_bio|purchase|share|save|none",
    "placement": "beginning|middle|end|throughout|none",
    "text": "Exact or approximate CTA text"
  },
  "content_pillars": ["pillar1", "pillar2"],
  "target_audience": {
    "pain_points": ["pain1", "pain2"],
    "desires": ["desire1", "desire2"],
    "awareness_level": "unaware|problem_aware|solution_aware|product_aware|most_aware"
  },
  "persuasion_techniques": ["technique1", "technique2", "technique3"],
  "virality_elements": {
    "shareability_score": 1-10,
    "relatability_score": 1-10,
    "entertainment_score": 1-10,
    "educational_value": 1-10,
    "factors": ["factor1", "factor2"]
  },
  "content_gaps": ["gap1", "gap2"],
  "replication_strategy": {
    "what_to_copy": "What elements you should replicate",
    "what_to_improve": "What you could do better",
    "suggested_angle": "Your unique angle on this topic"
  },
  "overall_score": 1-10,
  "key_insight": "One sentence: the single most important lesson from this video"
}

VIDEO DATA:
Platform: ${video.platform}
Title/Caption: ${video.title || video.caption || 'N/A'}
Channel/Author: ${video.channel || video.author || 'N/A'}
Duration: ${video.duration ? video.duration + 's' : 'N/A'}
Views: ${video.views ? video.views.toLocaleString() : 'N/A'}
Likes: ${video.likes ? video.likes.toLocaleString() : 'N/A'}
Comments: ${video.comments ? video.comments.toLocaleString() : 'N/A'}
Shares: ${video.shares ? video.shares.toLocaleString() : 'N/A'}
Hashtags: ${(video.hashtags || []).join(', ') || 'N/A'}
Sound/Music: ${video.sound || video.musicTitle || 'N/A'}
Transcript/Caption text: ${video.transcript || video.caption || 'No transcript available'}

Analyze and return valid JSON only.`;

/**
 * Analyze a single video for storytelling patterns
 * @param {Object} video - Scraped video object
 * @returns {Object} Analysis result
 */
async function analyzeVideo(video) {
  console.log(`[Analysis] Analyzing ${video.platform} video: ${video.videoId || video.shortcode}`);

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: STORYTELLING_SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: STORYTELLING_PROMPT(video) }
    ],
  });

  const raw = message.content[0]?.text || '{}';

  let analysis;
  try {
    analysis = JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }

  return {
    videoId: video.videoId || video.shortcode,
    platform: video.platform,
    url: video.url,
    title: video.title || video.caption?.slice(0, 80) || '',
    author: video.channel || video.author || '',
    metrics: {
      views: video.views || 0,
      likes: video.likes || 0,
      comments: video.comments || 0,
      shares: video.shares || 0,
    },
    storytelling: analysis,
    analyzedAt: new Date().toISOString(),
  };
}

/**
 * Analyze multiple videos with rate limiting
 * @param {Object[]} videos - Array of scraped video objects
 * @param {number} delayMs - Delay between API calls
 */
async function analyzeVideos(videos, delayMs = 2000) {
  const results = [];
  const errors = [];

  for (let i = 0; i < videos.length; i++) {
    try {
      const result = await analyzeVideo(videos[i]);
      results.push(result);
      console.log(`[Analysis] Done ${i + 1}/${videos.length}: score ${result.storytelling.overall_score}/10`);
    } catch (err) {
      console.error(`[Analysis] Failed for video ${videos[i].videoId || i}: ${err.message}`);
      errors.push({ video: videos[i].videoId || videos[i].shortcode, error: err.message });
    }

    if (i < videos.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { results, errors };
}

/**
 * Generate a cross-platform competitor report with strategic recommendations
 * @param {Object[]} analyses - Array of analysis results
 * @param {string} yourNiche - Your content niche/topic
 */
async function generateStrategyReport(analyses, yourNiche = 'your niche') {
  const summary = analyses.map(a => ({
    platform: a.platform,
    title: a.title,
    score: a.storytelling?.overall_score,
    hook_type: a.storytelling?.hook?.type,
    structure: a.storytelling?.narrative_arc?.structure,
    virality: a.storytelling?.virality_elements?.shareability_score,
    key_insight: a.storytelling?.key_insight,
    replication: a.storytelling?.replication_strategy,
  }));

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: STORYTELLING_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: `Based on these competitor video analyses for the niche "${yourNiche}", generate a strategic content plan.

ANALYSES SUMMARY:
${JSON.stringify(summary, null, 2)}

Return JSON:
{
  "top_patterns": ["pattern1", "pattern2", "pattern3"],
  "winning_hook_types": ["hook1", "hook2"],
  "dominant_structures": ["structure1", "structure2"],
  "content_calendar": [
    {
      "day": 1,
      "platform": "youtube|tiktok|instagram",
      "hook_type": "...",
      "structure": "...",
      "topic_angle": "...",
      "format": "short|long|reel"
    }
  ],
  "gaps_to_exploit": ["gap1", "gap2", "gap3"],
  "differentiators": ["what makes you stand out"],
  "priority_actions": ["action1", "action2", "action3"]
}`
    }],
  });

  const raw = message.content[0]?.text || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  }
}

module.exports = { analyzeVideo, analyzeVideos, generateStrategyReport };
