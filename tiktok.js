'use strict';

const axios = require('axios');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'tiktok-api23.p.rapidapi.com';

/**
 * Extract TikTok video ID from URL
 */
function extractVideoId(url) {
  const match = url.match(/\/video\/(\d+)/);
  if (match) return match[1];

  // Handle short URLs like vm.tiktok.com
  const shortMatch = url.match(/tiktok\.com\/[^/]+\/(\d+)/);
  if (shortMatch) return shortMatch[1];

  throw new Error(`Cannot extract TikTok video ID from: ${url}`);
}

/**
 * Extract username from TikTok URL
 */
function extractUsername(url) {
  const match = url.match(/tiktok\.com\/@([^/?&]+)/);
  if (match) return match[1];
  throw new Error(`Cannot extract TikTok username from: ${url}`);
}

/**
 * Scrape a single TikTok video via RapidAPI
 */
async function scrapeVideo(url) {
  if (!RAPIDAPI_KEY) {
    throw new Error('RAPIDAPI_KEY is not set. Required for TikTok scraping.');
  }

  const videoId = extractVideoId(url);

  const { data } = await axios.get(`https://${RAPIDAPI_HOST}/api/post/detail`, {
    params: { videoId },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
    timeout: 15000,
  });

  const item = data?.itemInfo?.itemStruct;
  if (!item) throw new Error('No video data returned from TikTok API');

  const desc = item.desc || '';
  const hashtags = (desc.match(/#\w+/g) || []).map(h => h.slice(1));
  const cleanCaption = desc.replace(/#\w+/g, '').trim();

  return {
    platform: 'tiktok',
    videoId: item.id,
    url,
    caption: cleanCaption,
    hashtags,
    author: item.author?.uniqueId || '',
    authorNickname: item.author?.nickname || '',
    authorFollowers: item.authorStats?.followerCount || 0,
    duration: item.video?.duration || 0,
    views: item.stats?.playCount || 0,
    likes: item.stats?.diggCount || 0,
    comments: item.stats?.commentCount || 0,
    shares: item.stats?.shareCount || 0,
    sound: item.music?.title || '',
    soundAuthor: item.music?.authorName || '',
    createdAt: item.createTime ? new Date(item.createTime * 1000).toISOString() : null,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Scrape latest videos from a TikTok user profile
 */
async function scrapeUserVideos(username, limit = 5) {
  if (!RAPIDAPI_KEY) {
    throw new Error('RAPIDAPI_KEY is not set. Required for TikTok scraping.');
  }

  const { data } = await axios.get(`https://${RAPIDAPI_HOST}/api/user/posts`, {
    params: { uniqueId: username, count: limit },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
    timeout: 15000,
  });

  const items = data?.itemList || [];
  const results = [];
  const errors = [];

  for (const item of items.slice(0, limit)) {
    try {
      const desc = item.desc || '';
      const hashtags = (desc.match(/#\w+/g) || []).map(h => h.slice(1));

      results.push({
        platform: 'tiktok',
        videoId: item.id,
        url: `https://www.tiktok.com/@${item.author?.uniqueId}/video/${item.id}`,
        caption: desc.replace(/#\w+/g, '').trim(),
        hashtags,
        author: item.author?.uniqueId || username,
        authorNickname: item.author?.nickname || '',
        authorFollowers: item.authorStats?.followerCount || 0,
        duration: item.video?.duration || 0,
        views: item.stats?.playCount || 0,
        likes: item.stats?.diggCount || 0,
        comments: item.stats?.commentCount || 0,
        shares: item.stats?.shareCount || 0,
        sound: item.music?.title || '',
        soundAuthor: item.music?.authorName || '',
        createdAt: item.createTime ? new Date(item.createTime * 1000).toISOString() : null,
        scrapedAt: new Date().toISOString(),
      });

      console.log(`[TikTok] Scraped video ${item.id} from @${username}`);
    } catch (err) {
      errors.push({ videoId: item.id, error: err.message });
    }
  }

  return { results, errors };
}

/**
 * Scrape multiple TikTok video URLs
 */
async function scrapeVideos(urls, delayMs = 1500) {
  const results = [];
  const errors = [];

  for (const url of urls) {
    try {
      const video = await scrapeVideo(url);
      results.push(video);
      console.log(`[TikTok] Scraped: ${video.videoId}`);
    } catch (err) {
      console.error(`[TikTok] Failed for ${url}: ${err.message}`);
      errors.push({ url, error: err.message });
    }
    if (urls.indexOf(url) < urls.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { results, errors };
}

module.exports = { scrapeVideo, scrapeVideos, scrapeUserVideos, extractVideoId, extractUsername };
