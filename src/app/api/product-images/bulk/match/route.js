// app/api/product-images/bulk/match/route.js
//
// Bulk product image upload, step 1: match photos to products. The admin page
// sends small previews (not the full photos) plus file/folder names; the
// AI (Claude) and the names decide which product each photo belongs to and
// which one is the main photo. Nothing is saved here - the admin reviews the
// result and then saves through POST /api/product-images/bulk/save.
//
// "groups" are product folders (every photo in one is the same product);
// "files" are loose photos matched one by one. See src/lib/productImageMatcher.mjs.
import { NextResponse } from 'next/server';
import { checkAdminToken } from '@/lib/adminAuth';
import { loadCatalog, productDetails } from '@/lib/productImageBulk';
import { getAiConfig, matchFiles, matchGroups } from '@/lib/productImageMatcher.mjs';

export const dynamic = 'force-dynamic';

const MAX_FILES = 20;
const MAX_GROUPS = 20;
const MAX_FILES_PER_GROUP = 60;
const MAX_PHOTOS = 80;
const BASE64 = /^[A-Za-z0-9+/=]+$/;

function cleanFile(f) {
  if (!f || typeof f !== 'object') return null;
  const key = String(f.key ?? '').slice(0, 60);
  const path = String(f.path ?? '').slice(0, 300);
  if (!key || !path) return null;
  let thumb = typeof f.thumb === 'string' ? f.thumb : null;
  // only plain base64 of a reasonable size goes to the AI
  if (thumb !== null && (thumb.length > 600000 || !BASE64.test(thumb))) thumb = null;
  return { key, path, thumb };
}

export async function POST(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawFiles = Array.isArray(body.files) ? body.files : [];
  const rawGroups = Array.isArray(body.groups) ? body.groups : [];
  if (rawFiles.length > MAX_FILES || rawGroups.length > MAX_GROUPS) {
    return NextResponse.json({ error: 'Too many photos in one request' }, { status: 422 });
  }

  const files = rawFiles.map(cleanFile);
  if (files.some((f) => !f)) return NextResponse.json({ error: 'Every photo needs a key and a path' }, { status: 422 });

  const groups = [];
  for (const g of rawGroups) {
    const key = String(g?.key ?? '').slice(0, 60);
    const folder = String(g?.folder ?? '').slice(0, 300);
    const list = Array.isArray(g?.files) ? g.files : [];
    if (!key || !folder || !list.length || list.length > MAX_FILES_PER_GROUP) {
      return NextResponse.json({ error: `Every folder needs a key, a name and 1 to ${MAX_FILES_PER_GROUP} photos` }, { status: 422 });
    }
    const cleaned = list.map(cleanFile);
    if (cleaned.some((f) => !f)) return NextResponse.json({ error: 'Every photo needs a key and a path' }, { status: 422 });
    groups.push({ key, folder, files: cleaned });
  }

  const total = files.length + groups.reduce((n, g) => n + g.files.length, 0);
  if (!total) return NextResponse.json({ error: 'No photos to match' }, { status: 422 });
  if (total > MAX_PHOTOS) return NextResponse.json({ error: 'Too many photos in one request' }, { status: 422 });

  try {
    const catalog = await loadCatalog();
    const ai = getAiConfig();

    let results = {};
    let aiProblem = null;
    if (groups.length) {
      const r = await matchGroups(groups, catalog, { ai });
      results = { ...results, ...r.results };
      aiProblem = r.aiProblem;
    }
    if (files.length) {
      const r = await matchFiles(files, catalog, { ai });
      results = { ...results, ...r.results };
      aiProblem = aiProblem || r.aiProblem;
    }

    const ids = [...new Set(Object.values(results).map((r) => r.product_id).filter(Boolean))];
    const products = await productDetails(ids);

    return NextResponse.json({ results, products, ai: { used: aiProblem === null, problem: aiProblem } });
  } catch (err) {
    console.error('[product-images/bulk/match] failed', err);
    return NextResponse.json({ error: 'Could not match the photos' }, { status: 500 });
  }
}
