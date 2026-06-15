'use strict';

const axios = require('axios');

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const RAPIDAPI_HOST = 'instagram-scraper-api2.p.rapidapi.com';

/**
 * Extract shortcode from Instagram Reel URL
 */
function extractShortcode(url) {
  const match = url.match(/instagram\.com\/(?:reel|p|reels)\/([A-Za-z0-9_-]+)/);
  if (match) return match[1];
  throw new Error(`Cannot extract Instagram shortcode from: ${url}`);
}

/**
 * Extract username from Instagram URL
 */
function extractUsername(url) {
  const match = url.match(/instagram\.com\/([^/?&]+)/);
  if (match && !['reel', 'p', 'reels', 'explore'].includes(match[1])) {
    return match[1];
  }
  throw new Error(`Cannot extract Instagram username from: ${url}`);
}

/**
 * Scrape a single Instagram Reel by URL
 */
async function scrapeReel(url) {
  if (!RAPIDAPI_KEY) {
    throw new Error('RAPIDAPI_KEY is not set. Required for Instagram scraping.');
  }

  const shortcode = extractShortcode(url);

  const { data } = await axios.get(`https://${RAPIDAPI_HOST}/v1/post_info`, {
    params: { code_or_id_or_url: shortcode },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
    timeout: 15000,
  });

  const item = data?.data;
  if (!item) throw new Error('No reel data returned from Instagram API');

  const caption = item.caption?.text || '';
  const hashtags = (caption.match(/#\w+/g) || []).map(h => h.slice(1));
  const mentions = (caption.match(/@\w+/g) || []).map(m => m.slice(1));

  return {
    platform: 'instagram',
    shortcode,
    url: `https://www.instagram.com/reel/${shortcode}/`,
    caption: caption.replace(/#\w+|@\w+/g, '').trim(),
    hashtags,
    mentions,
    author: item.owner?.username || '',
    authorFullName: item.owner?.full_name || '',
    authorFollowers: item.owner?.edge_followed_by?.count || 0,
    duration: item.video_duration || 0,
    views: item.video_view_count || 0,
    likes: item.like_count || 0,
    comments: item.comment_count || 0,
    plays: item.play_count || 0,
    musicTitle: item.clips_music_attribution_info?.song_name || '',
    musicArtist: item.clips_music_attribution_info?.artist_name || '',
    thumbnail: item.thumbnail_src || '',
    createdAt: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : null,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Scrape latest Reels from an Instagram profile
 */
async function scrapeUserReels(username, limit = 5) {
  if (!RAPIDAPI_KEY) {
    throw new Error('RAPIDAPI_KEY is not set. Required for Instagram scraping.');
  }

  const { data } = await axios.get(`https://${RAPIDAPI_HOST}/v1.2/posts`, {
    params: { username_or_id_or_url: username, only_reels: true },
    headers: {
      'X-RapidAPI-Key': RAPIDAPI_KEY,
      'X-RapidAPI-Host': RAPIDAPI_HOST,
    },
    timeout: 15000,
  });

  const items = data?.data?.items || [];
  const results = [];
  const errors = [];

  for (const item of items.slice(0, limit)) {
    try {
      const caption = item.caption?.text || '';
      const hashtags = (caption.match(/#\w+/g) || []).map(h => h.slice(1));
      const mentions = (caption.match(/@\w+/g) || []).map(m => m.slice(1));
      const shortcode = item.code || item.shortcode || '';

      results.push({
        platform: 'instagram',
        shortcode,
        url: `https://www.instagram.com/reel/${shortcode}/`,
        caption: caption.replace(/#\w+|@\w+/g, '').trim(),
        hashtags,
        mentions,
        author: username,
        authorFullName: item.user?.full_name || '',
        authorFollowers: item.user?.follower_count || 0,
        duration: item.video_duration || 0,
        views: item.view_count || 0,
        likes: item.like_count || 0,
        comments: item.comment_count || 0,
        plays: item.play_count || 0,
        musicTitle: item.music_metadata?.music_info?.music_asset_info?.display_artist || '',
        musicArtist: item.music_metadata?.music_info?.music_asset_info?.title || '',
        thumbnail: item.thumbnail_url || '',
        createdAt: item.taken_at ? new Date(item.taken_at * 1000).toISOString() : null,
        scrapedAt: new Date().toISOString(),
      });

      console.log(`[Instagram] Scraped reel ${shortcode} from @${username}`);
    } catch (err) {
      errors.push({ item: item.id, error: err.message });
    }
  }

  return { results, errors };
}

/**
 * Scrape multiple Instagram Reel URLs
 */
async function scrapeReels(urls, delayMs = 2000) {
  const results = [];
  const errors = [];

  for (const url of urls) {
    try {
      const reel = await scrapeReel(url);
      results.push(reel);
      console.log(`[Instagram] Scraped: ${reel.shortcode}`);
    } catch (err) {
      console.error(`[Instagram] Failed for ${url}: ${err.message}`);
      errors.push({ url, error: err.message });
    }
    if (urls.indexOf(url) < urls.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { results, errors };
}

module.exports = { scrapeReel, scrapeReels, scrapeUserReels, extractShortcode, extractUsername };
