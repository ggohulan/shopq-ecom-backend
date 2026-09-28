// app/api/seo-meta/route.js
//
// Per-entity SEO overrides (products, categories, static pages) - see
// HANDOVER-seo-management.md for the full spec and scripts/seo-meta-schema.sql
// for the table. GET is public and unauthenticated (read-only, called on
// every page render); PUT is the only write path, admin-gated. Follows the
// same "no row = no override, not an error" convention as product_content's
// GET route.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

export const dynamic = 'force-dynamic';

const ENTITY_TYPES = ['product', 'category', 'page'];

const EMPTY = { metaTitle: null, metaDescription: null, ogImageUrl: null, canonicalUrl: null, isNoindex: false };

function serialize(row) {
  if (!row) return EMPTY;
  return {
    metaTitle: row.meta_title || null,
    metaDescription: row.meta_description || null,
    ogImageUrl: row.og_image_url || null,
    canonicalUrl: row.canonical_url || null,
    isNoindex: !!row.is_noindex,
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entityType');
  const entityId = searchParams.get('entityId');

  if (!ENTITY_TYPES.includes(entityType) || !entityId) {
    return NextResponse.json({ error: 'entityType (product|category|page) and entityId are required' }, { status: 400 });
  }

  try {
    const pool = getDbPool();
    const [rows] = await pool.query(
      'SELECT meta_title, meta_description, og_image_url, canonical_url, is_noindex FROM seo_meta WHERE entity_type = ? AND entity_id = ?',
      [entityType, entityId]
    );
    return NextResponse.json(serialize(rows[0]));
  } catch (err) {
    console.error('[seo-meta] GET failed', err);
    return NextResponse.json(EMPTY);
  }
}

export async function PUT(request) {
  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const entityType = body.entityType;
  const entityId = String(body.entityId || '').trim();
  if (!ENTITY_TYPES.includes(entityType) || !entityId) {
    return NextResponse.json({ error: 'entityType (product|category|page) and entityId are required' }, { status: 400 });
  }

  // Truncated in code, not left to the DB - MySQL's strict mode rejects an
  // over-length VARCHAR insert outright rather than silently truncating it.
  const metaTitle = typeof body.metaTitle === 'string' ? body.metaTitle.trim().slice(0, 70) : null;
  const metaDescription = typeof body.metaDescription === 'string' ? body.metaDescription.trim().slice(0, 160) : null;
  const ogImageUrl = typeof body.ogImageUrl === 'string' ? body.ogImageUrl.trim().slice(0, 500) : null;
  const canonicalUrl = typeof body.canonicalUrl === 'string' ? body.canonicalUrl.trim().slice(0, 500) : null;
  const isNoindex = body.isNoindex ? 1 : 0;

  try {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO seo_meta (entity_type, entity_id, meta_title, meta_description, og_image_url, canonical_url, is_noindex)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         meta_title = VALUES(meta_title),
         meta_description = VALUES(meta_description),
         og_image_url = VALUES(og_image_url),
         canonical_url = VALUES(canonical_url),
         is_noindex = VALUES(is_noindex)`,
      [entityType, entityId, metaTitle || null, metaDescription || null, ogImageUrl || null, canonicalUrl || null, isNoindex]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[seo-meta] PUT failed', err);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
