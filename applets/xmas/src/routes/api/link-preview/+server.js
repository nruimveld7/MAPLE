import { json } from '@sveltejs/kit';

const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function normalizeUrl(raw) {
	if (!raw) return null;
	try {
		const parsed = new URL(raw);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
		return parsed;
	} catch {
		return null;
	}
}

function decodeHtml(value = '') {
	return value
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.trim();
}

function readMeta(html, key, attr = 'property') {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const regex = new RegExp(
		`<meta[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>|<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escaped}["'][^>]*>`,
		'i'
	);
	const match = html.match(regex);
	return decodeHtml(match?.[1] || match?.[2] || '');
}

function readTitle(html) {
	const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
	return decodeHtml(match?.[1] || '');
}

function readJsonLdProductName(html) {
	const blocks =
		html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
	for (const block of blocks) {
		const content = block.replace(/^.*?>/s, '').replace(/<\/script>$/i, '').trim();
		if (!content) continue;
		try {
			const parsed = JSON.parse(content);
			const values = Array.isArray(parsed) ? parsed : [parsed];
			for (const value of values) {
				if (value?.['@type'] === 'Product' && typeof value?.name === 'string') {
					return value.name.trim();
				}
			}
		} catch {
			continue;
		}
	}
	return '';
}

function parseAmazonAsin(url) {
	return url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i)?.[1]?.toUpperCase() || '';
}

function isLikelyTinyAmazonFallback(imageUrl) {
	if (!imageUrl) return false;
	return /images-na\.ssl-images-amazon\.com\/images\/P\/[A-Z0-9]{10}\.01\._SCLZZZZZZZ__SX\d+_\.jpg/i.test(
		imageUrl
	);
}

function readAmazonImage(html) {
	const patterns = [
		/"landingImageUrl"\s*:\s*"([^"]+)"/i,
		/"large"\s*:\s*"([^"]+m\.media-amazon\.com[^"]+)"/i,
		/id=["']landingImage["'][^>]*src=["']([^"']+)["']/i,
		/data-old-hires=["']([^"']+)["']/i
	];

	for (const pattern of patterns) {
		const match = html.match(pattern);
		if (!match?.[1]) continue;
		const candidate = decodeHtml(match[1]).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
		if (/^https?:\/\//i.test(candidate) && candidate.includes('media-amazon.com')) {
			return candidate;
		}
	}

	return '';
}

function extractPreview(html, finalUrl) {
	const url = new URL(finalUrl);
	const isAmazon = url.hostname.includes('amazon.');

	const ogTitle = readMeta(html, 'og:title');
	const twitterTitle = readMeta(html, 'twitter:title', 'name');
	const jsonLdTitle = readJsonLdProductName(html);
	const title = ogTitle || twitterTitle || jsonLdTitle || readTitle(html);

	const ogDescription = readMeta(html, 'og:description');
	const twitterDescription = readMeta(html, 'twitter:description', 'name');
	const description = ogDescription || twitterDescription || readMeta(html, 'description', 'name');

	const ogImage = readMeta(html, 'og:image');
	const twitterImage = readMeta(html, 'twitter:image', 'name');
	let image = ogImage || twitterImage;
	let imageSource = image ? 'meta' : 'none';

	if (isAmazon) {
		const amazonImage = readAmazonImage(html);
		if (amazonImage) {
			image = amazonImage;
			imageSource = 'amazon-page';
		}
	}

	if ((!image || (isAmazon && isLikelyTinyAmazonFallback(image))) && isAmazon) {
		const asin = parseAmazonAsin(url);
		if (asin) {
			image = `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SCLZZZZZZZ__SX500_.jpg`;
			imageSource = 'amazon-asin-fallback';
		}
	}

	const site = readMeta(html, 'og:site_name') || url.hostname;
	return { title, description, image, imageSource, site, finalUrl };
}

export async function GET({ url, fetch }) {
	const targetRaw = url.searchParams.get('url') || '';
	const target = normalizeUrl(targetRaw);
	if (!target) {
		return json({ error: 'Invalid URL' }, { status: 400 });
	}

	try {
		const response = await fetch(target.toString(), {
			headers: {
				'User-Agent': USER_AGENT,
				Accept:
					'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
				'Accept-Language': 'en-US,en;q=0.9',
				'Cache-Control': 'no-cache'
			}
		});

		if (!response.ok) {
			return json({ error: `Upstream request failed (${response.status})` }, { status: 502 });
		}

		const html = await response.text();
		const preview = extractPreview(html, response.url || target.toString());
		return json(preview);
	} catch {
		return json({ error: 'Failed to fetch preview' }, { status: 502 });
	}
}
