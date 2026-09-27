// app/api/uploads/[...path]/route.js
//
// Serves files saved by src/lib/uploads.js (currently just product images -
// see /api/product-images) from wherever UPLOADS_DIR actually points, which
// on production is deliberately outside this git-managed app directory so a
// redeploy never wipes them. Public and unauthenticated on purpose: these
// are meant to be product photos shown on the public storefront.
import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { resolveUploadPath } from '@/lib/uploads';

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export async function GET(request, { params }) {
  const { path: segments } = await params;
  const relativePath = (segments || []).join('/');
  const fullPath = resolveUploadPath(relativePath);

  if (!fullPath) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    const buffer = await fs.readFile(fullPath);
    const ext = fullPath.slice(fullPath.lastIndexOf('.')).toLowerCase();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        // Uploaded filenames are random UUIDs and never reused - replacing a
        // photo always uploads a new file rather than overwriting one on
        // disk - so this is safe to cache hard.
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
