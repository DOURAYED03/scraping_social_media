'use strict';

const axios = require('axios');
const { YoutubeTranscript } = require('youtube-transcript');

/**
 * Extract video ID from various YouTube URL formats
 */
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  throw new Error(`Cannot extract video ID from URL: ${url}`);
}

/**
 * Extract channel ID or handle from URL
 */
function extractChannelIdentifier(url) {
  const patterns = [
    /youtube\.com\/@([^/?&]+)/,
    /youtube\.com\/channel\/([^/?&]+)/,
    /youtube\.com\/c\/([^/?&]+)/,
    /youtube\.com\/user\/([^/?&]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Fetch YouTube oEmbed metadata (no API key required)
 */
async function fetchVideoMeta(videoId) {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  try {
    const { data } = await axios.get(oembedUrl, { timeout: 10000 });
    return {
      title: data.title || 'Unknown title',
      channel: data.author_name || 'Unknown channel',
      channelUrl: data.author_url || '',
      thumbnail: data.thumbnail_url || '',
    };
  } catch {
    return { title: 'Unknown', channel: 'Unknown', channelUrl: '', thumbnail: '' };
  }
}

/**
 * Fetch transcript for a single video
 */
async function fetchTranscript(videoId) {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    return segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}

/**
 * Scrape a single YouTube video by URL
 */
async function scrapeVideo(url) {
  const videoId = extractVideoId(url);
  const [meta, transcript] = await Promise.all([
    fetchVideoMeta(videoId),
    fetchTranscript(videoId),
  ]);

  return {
    platform: 'youtube',
    videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: meta.title,
    channel: meta.channel,
    channelUrl: meta.channelUrl,
    thumbnail: meta.thumbnail,
    transcript: transcript || '',
    hasTranscript: !!transcript,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Scrape multiple YouTube videos
 * @param {string[]} urls - Array of YouTube video URLs
 * @param {number} delayMs - Delay between requests (ms)
 */
async function scrapeVideos(urls, delayMs = 1500) {
  const results = [];
  const errors = [];

  for (const url of urls) {
    try {
      const video = await scrapeVideo(url);
      results.push(video);
      console.log(`[YouTube] Scraped: ${video.title}`);
    } catch (err) {
      console.error(`[YouTube] Failed for ${url}: ${err.message}`);
      errors.push({ url, error: err.message });
    }
    if (urls.indexOf(url) < urls.length - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  return { results, errors };
}

/**
 * Scrape latest videos from a YouTube channel page (no API key)
 * Uses oEmbed + public page parsing via axios + cheerio
 * @param {string} channelUrl - YouTube channel URL
 * @param {number} limit - Max number of videos to return
 */
async function scrapeChannel(channelUrl, limit = 5) {
  const cheerio = require('cheerio');

  try {
    const videosUrl = channelUrl.replace(/\/?$/, '/videos');
    const { data: html } = await axios.get(videosUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    // Extract initial data JSON embedded in the page
    const match = html.match(/var ytInitialData = ({.+?});<\/script>/s);
    if (!match) throw new Error('Could not parse YouTube page data');

    const ytData = JSON.parse(match[1]);
    const tabs = ytData?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];
    const videosTab = tabs.find(t => t?.tabRenderer?.title === 'Videos');
    const items = videosTab?.tabRenderer?.content?.richGridRenderer?.contents || [];

    const videoIds = [];
    for (const item of items) {
      const vid = item?.richItemRenderer?.content?.videoRenderer?.videoId;
      if (vid) videoIds.push(vid);
      if (videoIds.length >= limit) break;
    }

    if (!videoIds.length) throw new Error('No video IDs found on channel page');

    const urls = videoIds.map(id => `https://www.youtube.com/watch?v=${id}`);
    return scrapeVideos(urls);
  } catch (err) {
    throw new Error(`Channel scrape failed: ${err.message}`);
  }
}

module.exports = { scrapeVideo, scrapeVideos, scrapeChannel, extractVideoId };
