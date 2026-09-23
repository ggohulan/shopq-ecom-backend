// app/api/product-content/[productId]/route.js
//
// Supplemental product content (Features / Highlights / Key Features /
// Ideal For / Why You'll Love It / Specifications) that isn't available
// from the CRM - see src/utils/customFunctions/useParsedProductDescription.js
// and src/components/productDetails/common/ProductFeaturesList.jsx for how
// each field is used, and the "product-content" plan doc for full context.
import { NextResponse } from 'next/server';
import { getDbPool } from '@/lib/db';
import { checkAdminToken } from '@/lib/adminAuth';

const EMPTY = { features: null, highlights: null, keyFeatures: null, idealFor: null, loveIt: null, specifications: null };

// GET is public and unauthenticated on purpose: it's read-only, non-
// sensitive, and called on every product detail page view. Returns a 200
// with all-null fields when no row exists yet - "no supplemental data" is a
// normal state here, not an error, so callers don't need error handling.
export async function GET(request, { params }) {
  const { productId } = await params;

  try {
    const pool = getDbPool();
    const [rows] = await pool.query(
      'SELECT features, highlights, key_features, ideal_for, love_it, specifications FROM product_content WHERE product_id = ?',
      [productId]
    );

    if (!rows.length) {
      return NextResponse.json(EMPTY);
    }

    const row = rows[0];
    return NextResponse.json({
      features: row.features ? JSON.parse(row.features) : null,
      highlights: row.highlights ? JSON.parse(row.highlights) : null,
      keyFeatures: row.key_features ? JSON.parse(row.key_features) : null,
      idealFor: row.ideal_for || null,
      loveIt: row.love_it ? JSON.parse(row.love_it) : null,
      specifications: row.specifications ? JSON.parse(row.specifications) : null,
    });
  } catch (err) {
    console.error('Error reading product-content:', err);
    return NextResponse.json(EMPTY);
  }
}

// PUT is the only write path, protected by an admin login session.
export async function PUT(request, { params }) {
  const { productId } = await params;

  const auth = checkAdminToken(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const features = Array.isArray(body.features) ? body.features.filter(Boolean) : [];
  const highlights = Array.isArray(body.highlights) ? body.highlights.filter(Boolean) : [];
  const keyFeatures = Array.isArray(body.keyFeatures) ? body.keyFeatures.filter((f) => f?.title?.trim()) : [];
  const idealFor = typeof body.idealFor === 'string' ? body.idealFor.trim() : '';
  const loveIt = Array.isArray(body.loveIt) ? body.loveIt.filter(Boolean) : [];
  const specifications = Array.isArray(body.specifications) ? body.specifications.filter((s) => s?.label?.trim()) : [];

  try {
    const pool = getDbPool();
    await pool.query(
      `INSERT INTO product_content (product_id, features, highlights, key_features, ideal_for, love_it, specifications)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         features = VALUES(features),
         highlights = VALUES(highlights),
         key_features = VALUES(key_features),
         ideal_for = VALUES(ideal_for),
         love_it = VALUES(love_it),
         specifications = VALUES(specifications)`,
      [
        productId,
        features.length ? JSON.stringify(features) : null,
        highlights.length ? JSON.stringify(highlights) : null,
        keyFeatures.length ? JSON.stringify(keyFeatures) : null,
        idealFor || null,
        loveIt.length ? JSON.stringify(loveIt) : null,
        specifications.length ? JSON.stringify(specifications) : null,
      ]
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Error saving product-content:', err);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
