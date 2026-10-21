// src/lib/productImageMatcher.mjs
//
// Matches uploaded product photos to products for the bulk image upload
// (/admin/bulk-product-images). Plain ES module with no imports so it can be
// unit-tested with `node --test` (see test/productImageMatcher.test.mjs).
//
// Two signals are combined:
//   1. file / folder names ("moneybox main.jpg", "moneybox2.jpg",
//      "Money Box/IMG_0001.jpg"), scored against the product name;
//   2. Gemini, which sees small previews of the photos plus the file names and
//      a short list of candidate products, and may only answer with one of
//      those products (or none).
// If Gemini is not configured or fails, the name match alone is used and the
// result says so. Nothing here writes to the database or the disk: the admin
// reviews the result and saves it.
//
// A folder inside the chosen folder is ONE product (matchGroups): the product
// is decided once for the whole folder and the main photo is the one named
// main (or front/cover...), else the one Gemini picks, else the first.

export const MAIN_WORDS = ['main', 'primary', 'cover', 'front', 'thumbnail', 'thumb', 'first', 'hero'];
export const GENERIC_WORDS = ['img', 'image', 'images', 'photo', 'photos', 'pic', 'pics', 'picture', 'dsc', 'dscn', 'dcim', 'screenshot', 'whatsapp', 'copy', 'untitled', 'new'];
export const STRONG = 0.85; // a name match this good is used without the AI
export const WEAK = 0.6; // used only when the AI is not available
export const AI_MIN_CONFIDENCE = 0.5;
export const FULL_CATALOG_LIMIT = 400;

// ------------------------------------------------------------------ names

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function compact(text) {
  return tokens(text).join('');
}

function isDigits(s) {
  return /^\d+$/.test(s);
}

/** Reads "Root/Money Box/moneybox main.jpg" into what it says about the product. */
export function parseName(path) {
  const parts = String(path || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  const file = parts.pop() || '';
  const folder = parts.length ? parts[parts.length - 1] : '';

  let stem = file.replace(/\.[A-Za-z0-9]{2,5}$/, '');
  // split camelCase and letter/digit joins: MoneyBox2 -> Money Box 2
  stem = stem.replace(/(?<=\p{Ll})(?=\p{Lu})|(?<=\p{L})(?=\d)|(?<=\d)(?=\p{L})/gu, ' ');
  const toks = tokens(stem);

  let role = null;
  let number = null;
  let kept = [];
  for (const t of toks) {
    if (MAIN_WORDS.includes(t)) {
      role = 'main';
      continue;
    }
    kept.push(t);
  }
  const raw = toks.join(' ');

  // a trailing number is the photo number (moneybox 2: other photo number 2); long numbers are product codes
  if (kept.length && isDigits(kept[kept.length - 1]) && (kept.length > 1 || folder !== '')) {
    const digits = kept[kept.length - 1];
    const rest = kept.slice(0, -1);
    const generic = rest.every((t) => GENERIC_WORDS.includes(t));
    if (digits.length <= 3 || (generic && digits.length <= 6)) {
      kept = rest;
      number = parseInt(digits, 10);
      if (!generic || rest.length === 0) role = role || 'other';
    }
  }
  // IMG_0345, DSC 12: camera names say nothing about the product
  if (kept.length && kept.every((t) => GENERIC_WORDS.includes(t))) kept = [];

  return { base: kept.join(' '), folder, role, number, raw };
}

// PHP-compatible similar_text(): returns the number of matching characters
function similarChars(a, b) {
  if (!a.length || !b.length) return 0;
  let max = 0;
  let posA = 0;
  let posB = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      let k = 0;
      while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > max) {
        max = k;
        posA = i;
        posB = j;
      }
    }
  }
  if (!max) return 0;
  return max + similarChars(a.slice(0, posA), b.slice(0, posB)) + similarChars(a.slice(posA + max), b.slice(posB + max));
}

function similarPercent(a, b) {
  const total = a.length + b.length;
  return total ? (similarChars(a, b) * 2 * 100) / total : 0;
}

/** 0 to 1: how well a file name (and its folder) points at this product. product = { id, name, names?, code? } */
export function score(parsed, product) {
  const code = compact(product.code || '');
  if (code.length >= 5 && compact(parsed.raw || '').includes(code)) return 1;

  let best = 0;
  for (const raw of [parsed.base, parsed.folder]) {
    if (!raw) continue;
    const hint = tokens(raw)
      .filter((t) => !MAIN_WORDS.includes(t))
      .join(' ');
    if (!hint) continue;
    best = Math.max(best, scoreHint(hint, product));
  }
  return Math.round(best * 1000) / 1000;
}

function scoreHint(hint, product) {
  const hintCompact = hint.replace(/ /g, '');
  let best = 0;
  const names = product.names && product.names.length ? product.names : [product.name];

  for (const name of names) {
    const nameCompact = compact(name);
    if (!nameCompact || !hintCompact) continue;
    if (nameCompact === hintCompact) return 1;

    // "moneybox" inside "money box piggy bank" (or the other way round)
    const short = hintCompact.length <= nameCompact.length ? hintCompact : nameCompact;
    const long = short === hintCompact ? nameCompact : hintCompact;
    if (short.length >= 4 && long.includes(short)) best = Math.max(best, 0.7 + 0.3 * (short.length / long.length));

    // the hint is a run of whole words of the name written together: "moneybox" for "Money Box Piggy Bank"
    const words = tokens(name);
    for (let i = 0; i < words.length; i++) {
      let run = '';
      for (let j = i; j < words.length; j++) {
        run += words[j];
        if (run === hintCompact && hintCompact.length >= 4) best = Math.max(best, j > i || words.length === 1 ? 0.92 : 0.9);
        if (run.length > hintCompact.length) break;
      }
    }

    // shared words
    const a = tokens(hint);
    const b = words;
    if (a.length && b.length) {
      const common = a.filter((t) => b.includes(t)).length;
      if (common) best = Math.max(best, 0.9 * (common / Math.max(a.length, b.length)) + 0.1 * (common / a.length));
    }

    // small spelling differences (moneyboks / money box)
    if (
      hintCompact.length >= 5 &&
      nameCompact.length <= 60 &&
      Math.abs(hintCompact.length - nameCompact.length) <= 0.4 * Math.max(hintCompact.length, nameCompact.length)
    ) {
      const pct = similarPercent(hintCompact, nameCompact);
      if (pct >= 80) best = Math.max(best, (pct / 100) * 0.9);
    }
  }
  return Math.min(best, 1);
}

function scoresFor(parsedList, catalog, weight = 1) {
  const scores = {};
  for (const p of catalog) {
    let s = 0;
    for (const parsed of parsedList) s = Math.max(s, score(parsed, p) * weight);
    if (s >= 0.3) scores[p.id] = Math.round(s * 1000) / 1000;
  }
  return scores;
}

function pickByName(scores) {
  const ids = Object.keys(scores).sort((x, y) => scores[y] - scores[x]);
  const top = ids.length ? scores[ids[0]] : 0;
  const second = ids.length > 1 ? scores[ids[1]] : 0;
  const clear = top >= WEAK && (top - second >= 0.05 || (top >= 1 && second < 1));
  return { nameId: clear ? ids[0] : null, nameScore: top, ambiguous: top >= WEAK && !clear };
}

function natCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function basename(path) {
  const parts = String(path).replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

// ------------------------------------------------------------------ catalog helpers

/** Candidate products for a batch: best name matches per item, plus the whole catalog (up to a limit) when some item has no hint. */
function candidatesFor(infoList, catalog) {
  const ids = new Set();
  let needsCatalog = false;
  for (const info of infoList) {
    const top = Object.keys(info.scores).sort((x, y) => info.scores[y] - info.scores[x]);
    if (!top.length) {
      needsCatalog = true;
      continue;
    }
    top.slice(0, 6).forEach((id) => ids.add(String(id)));
  }
  const out = {};
  for (const p of catalog) if (ids.has(String(p.id))) out[p.id] = p;
  if (needsCatalog || Object.keys(out).length < 3) {
    for (const p of catalog.slice(0, FULL_CATALOG_LIMIT)) out[p.id] = p;
  }
  return out;
}

function productList(candidates) {
  return Object.values(candidates)
    .map((p) => `${p.id} | ${p.name}${p.code ? ` | ${p.code}` : ''}`)
    .join('\n');
}

// ------------------------------------------------------------------ Gemini

export function getGeminiConfig(env = process.env) {
  return { key: env.GEMINI_API_KEY || '', model: env.GEMINI_VISION_MODEL || 'gemini-3.1-flash-lite' };
}

/** Sends the request (two retries on a busy service) and returns the decoded JSON array. Throws Error('not_configured' | 'ai_failed'). */
export async function callGemini(payload, { key, model, fetchImpl = globalThis.fetch } = {}) {
  if (!key || !model) throw new Error('not_configured');

  let response = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90000),
      });
    } catch (e) {
      console.warn('[product-image-match] request failed', e && e.message);
      response = null;
      continue;
    }
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) break;
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
  if (!response || !response.ok) {
    console.warn('[product-image-match] HTTP error', response && response.status, model);
    throw new Error('ai_failed');
  }

  let text = '';
  try {
    const json = await response.json();
    text = String(json?.candidates?.[0]?.content?.parts?.[0]?.text || '');
  } catch (e) {
    throw new Error('ai_failed');
  }
  text = text.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '');
  let decoded;
  try {
    decoded = JSON.parse(text);
  } catch (e) {
    console.warn('[product-image-match] reply was not valid JSON');
    throw new Error('ai_failed');
  }
  if (!Array.isArray(decoded)) throw new Error('ai_failed');
  return decoded;
}

const PHOTO_INSTRUCTION = `You match product photos to products for an online shop's catalog.

You get a list of PRODUCTS (id | name | code) and a list of PHOTOS. Each photo has its file name (and folder), sometimes what the file name suggests, and a small preview of the picture.

For every photo return:
- product_id: the id of the product shown in the photo, chosen ONLY from the PRODUCTS list, or null if none of them fits.
- role: "main" if this is the product's main photo (the file name says main, primary, cover or front, or it is the clearest picture of the whole product on its own), otherwise "other" (extra angles, packaging, details, in use).
- confidence: 0 to 1.
- reason: a few words.

Rules:
- Use the file name and folder name as strong evidence: "moneybox main.jpg", "moneybox2.jpg" and "moneybox3.jpg" belong to the same product, the one called money box.
- Use the picture to confirm or to decide when the file name says little (for example IMG_0345.jpg). Read any text or branding visible on the product or its box.
- Never invent an id. If you are not sure, return null with a low confidence.
- Return one entry for every photo, using the same key you were given.`;

const GROUP_INSTRUCTION = `You match folders of product photos to products for an online shop's catalog.

You get a list of PRODUCTS (id | name | code) and a list of GROUPS. Each group is ONE folder, and every photo in it shows the SAME product (the folder is named after it, or close to it). Each photo has its file name and a small preview. File names are often just camera names like IMG_0345.jpg, which say nothing.

For every group return:
- product_id: the id of the product the photos show, chosen ONLY from the PRODUCTS list, or null if none of them fits.
- main_photo_key: the key of the photo that should be the product's main photo. If a photo's file name says main (marked file-name-says-main), choose it. Otherwise choose the clearest, best-lit picture of the whole product on its own, usually a front view on a plain background, not packaging details, close-ups or the product in use.
- confidence: 0 to 1 for the product match.
- reason: a few words.

Rules:
- Use the folder name as strong evidence, and use the photos to confirm it. Read any text or branding visible on the product or its box.
- Never invent an id. If you are not sure, return null with a low confidence.
- Return one entry for every group, using the same group key you were given.`;

function payloadFor(instruction, parts, schemaItems, required) {
  return {
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: { type: 'ARRAY', items: { type: 'OBJECT', properties: schemaItems, required } },
    },
  };
}

function cleanReason(v) {
  return String(v || '').trim().slice(0, 200);
}

function clamp01(n) {
  const x = Number(n);
  return Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
}

// ------------------------------------------------------------------ matching: loose photos

/**
 * @param files   [{ key, path, thumb (base64 jpeg | null) }]
 * @param catalog [{ id, name, names?, code? }]
 * @returns { results: { [key]: { product_id, role, number, confidence, source, flagged, note } }, aiProblem: null | 'not_configured' | 'ai_failed' }
 */
export async function matchFiles(files, catalog, { gemini } = {}) {
  const byId = {};
  catalog.forEach((p) => (byId[String(p.id)] = p));

  const info = {};
  for (const f of files) {
    const parsed = parseName(f.path);
    const scores = scoresFor([parsed], catalog);
    const pick = pickByName(scores);
    info[f.key] = { parsed, scores, ...pick };
  }

  let ai = {};
  let aiRan = false;
  let aiProblem = null;
  if (catalog.length && files.length) {
    try {
      ai = await askPhotos(files, info, catalog, gemini);
      aiRan = true;
    } catch (e) {
      aiProblem = e.message === 'not_configured' ? 'not_configured' : 'ai_failed';
    }
  }

  const results = {};
  for (const f of files) {
    const n = info[f.key];
    const a = ai[f.key] || null;
    const aiId = a && a.productId && byId[String(a.productId)] && a.confidence >= AI_MIN_CONFIDENCE ? String(a.productId) : null;
    const nameId = n.nameId ? String(n.nameId) : null;
    const nameStrong = nameId && n.nameScore >= STRONG;

    const d = decide({ aiId, nameId, nameStrong, nameScore: n.nameScore, a, aiRan, ambiguous: n.ambiguous, what: 'file name' });
    const role = n.parsed.role || (a && a.role === 'main' ? 'main' : 'other');
    results[f.key] = { product_id: d.productId, role, number: n.parsed.number, confidence: d.confidence, source: d.source, flagged: d.flagged, note: d.note };
  }
  return { results, aiProblem };
}

/** The shared decision between the AI's product and the name's product. */
function decide({ aiId, nameId, nameStrong, nameScore, a, aiRan, ambiguous, what }) {
  let productId = null;
  let source = 'none';
  let confidence = 0;
  let flagged = false;
  let note = '';

  if (aiId && nameId && aiId === nameId) {
    productId = aiId;
    source = 'ai+name';
    confidence = Math.max(a.confidence, nameScore);
    note = a.reason;
  } else if (aiId && nameId && aiId !== nameId) {
    flagged = true;
    if (nameScore >= 0.9) {
      productId = nameId;
      source = 'name';
      confidence = nameScore * 0.8;
      note = `The ${what} points to this product but the AI chose another. Please check.`;
    } else {
      productId = aiId;
      source = 'ai';
      confidence = a.confidence * 0.8;
      note = `The AI and the ${what} disagree. Please check.`;
    }
  } else if (aiId) {
    productId = aiId;
    source = 'ai';
    confidence = a.confidence;
    note = a.reason;
  } else if (nameStrong || (nameId && !aiRan)) {
    productId = nameId;
    source = 'name';
    confidence = nameScore;
    flagged = !nameStrong || !aiRan;
    note = aiRan ? `Matched by ${what} only (the AI found no match).` : `Matched by ${what} only (the AI was not used).`;
  } else {
    note = ambiguous ? `The ${what} fits more than one product.` : `No product found for this ${what === 'folder name' ? 'folder' : 'photo'}.`;
  }
  return { productId, source, confidence: Math.round(confidence * 100) / 100, flagged, note };
}

async function askPhotos(files, info, catalog, gemini) {
  const cfg = gemini || {};
  const candidates = candidatesFor(Object.values(info), catalog);

  const parts = [{ text: `PRODUCTS (id | name | code):\n${productList(candidates)}\n\nPHOTOS:` }];
  for (const f of files) {
    const n = info[f.key];
    const hint = Object.keys(n.scores)
      .sort((x, y) => n.scores[y] - n.scores[x])
      .slice(0, 3)
      .filter((id) => candidates[id])
      .map((id) => `${id} (${n.scores[id].toFixed(2)})`);
    parts.push({
      text: `\nPhoto key=${f.key} file="${f.path}"${n.parsed.role ? ` file-name-role=${n.parsed.role}` : ''}${hint.length ? ` file-name-suggests=${hint.join(', ')}` : ''}`,
    });
    if (f.thumb) parts.push({ inlineData: { mimeType: 'image/jpeg', data: f.thumb } });
  }

  const payload = payloadFor(
    PHOTO_INSTRUCTION,
    parts,
    {
      key: { type: 'STRING' },
      product_id: { type: 'INTEGER', nullable: true },
      role: { type: 'STRING' },
      confidence: { type: 'NUMBER' },
      reason: { type: 'STRING' },
    },
    ['key', 'product_id', 'role', 'confidence']
  );

  const decoded = await callGemini(payload, cfg);
  const out = {};
  for (const row of decoded) {
    if (!row || typeof row !== 'object' || row.key === undefined) continue;
    const id = row.product_id !== null && row.product_id !== undefined && row.product_id !== '' ? String(row.product_id) : null;
    out[String(row.key)] = {
      productId: id && candidates[id] ? id : null, // only products we offered are accepted
      role: row.role === 'main' ? 'main' : 'other',
      confidence: clamp01(row.confidence),
      reason: cleanReason(row.reason),
    };
  }
  return out;
}

// ------------------------------------------------------------------ matching: folders (one folder = one product)

/**
 * @param groups  [{ key, folder: 'Root/Money Box', files: [{ key, path, thumb }] }]
 * @returns same shape as matchFiles, plus `group` on each result
 */
export async function matchGroups(groups, catalog, { gemini } = {}) {
  const byId = {};
  catalog.forEach((p) => (byId[String(p.id)] = p));

  const info = {};
  for (const g of groups) {
    const segs = String(g.folder || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean);
    const folderName = segs.length ? segs[segs.length - 1] : '';
    const folderTokens = tokens(folderName);
    const folderParsed = { base: folderTokens.join(' '), folder: '', role: null, number: null, raw: folderTokens.join(' ') };

    const fileInfo = {};
    for (const f of g.files) fileInfo[f.key] = parseName(basename(f.path));

    const scores = {};
    for (const p of catalog) {
      let s = score(folderParsed, p);
      for (const fp of Object.values(fileInfo)) s = Math.max(s, 0.95 * score(fp, p));
      if (s >= 0.3) scores[p.id] = Math.round(s * 1000) / 1000;
    }
    info[g.key] = { folder: folderName, files: fileInfo, scores, ...pickByName(scores) };
  }

  let ai = {};
  let aiRan = false;
  let aiProblem = null;
  if (catalog.length && groups.length) {
    try {
      ai = await askGroups(groups, info, catalog, gemini);
      aiRan = true;
    } catch (e) {
      aiProblem = e.message === 'not_configured' ? 'not_configured' : 'ai_failed';
    }
  }

  const results = {};
  for (const g of groups) {
    const n = info[g.key];
    const a = ai[g.key] || null;
    const aiId = a && a.productId && byId[String(a.productId)] && a.confidence >= AI_MIN_CONFIDENCE ? String(a.productId) : null;
    const nameId = n.nameId ? String(n.nameId) : null;
    const nameStrong = nameId && n.nameScore >= STRONG;
    const d = decide({ aiId, nameId, nameStrong, nameScore: n.nameScore, a, aiRan, ambiguous: n.ambiguous, what: 'folder name' });

    // the main photo of the folder
    const keys = g.files.map((f) => f.key);
    const paths = {};
    g.files.forEach((f) => (paths[f.key] = f.path));
    keys.sort((x, y) => natCompare(basename(paths[x]), basename(paths[y])));
    const named = keys.filter((k) => n.files[k].role === 'main');
    const aiMain = a && a.mainKey && keys.map(String).includes(String(a.mainKey)) ? String(a.mainKey) : null;
    let main;
    if (named.length) main = aiMain && named.map(String).includes(aiMain) ? aiMain : String(named[0]);
    else main = aiMain || (keys.length ? String(keys[0]) : null);

    let i = 0;
    for (const k of keys) {
      const isMain = String(k) === String(main);
      results[k] = {
        product_id: d.productId,
        role: isMain ? 'main' : 'other',
        number: isMain ? null : ++i,
        confidence: d.confidence,
        source: d.source,
        flagged: d.flagged,
        note: d.note,
        group: g.key,
      };
    }
  }
  return { results, aiProblem };
}

async function askGroups(groups, info, catalog, gemini) {
  const cfg = gemini || {};
  const candidates = candidatesFor(Object.values(info), catalog);

  const parts = [{ text: `PRODUCTS (id | name | code):\n${productList(candidates)}\n\nGROUPS (each group is one folder = one product):` }];
  for (const g of groups) {
    const n = info[g.key];
    const hint = Object.keys(n.scores)
      .sort((x, y) => n.scores[y] - n.scores[x])
      .slice(0, 3)
      .filter((id) => candidates[id])
      .map((id) => `${id} (${n.scores[id].toFixed(2)})`);
    parts.push({ text: `\n\nGroup key=${g.key} folder="${g.folder}"${hint.length ? ` folder-name-suggests=${hint.join(', ')}` : ''}` });
    for (const f of g.files) {
      const role = n.files[f.key] && n.files[f.key].role;
      parts.push({ text: `\nPhoto key=${f.key} file="${basename(f.path)}"${role === 'main' ? ' file-name-says-main' : ''}` });
      if (f.thumb) parts.push({ inlineData: { mimeType: 'image/jpeg', data: f.thumb } });
    }
  }

  const payload = payloadFor(
    GROUP_INSTRUCTION,
    parts,
    {
      group_key: { type: 'STRING' },
      product_id: { type: 'INTEGER', nullable: true },
      main_photo_key: { type: 'STRING', nullable: true },
      confidence: { type: 'NUMBER' },
      reason: { type: 'STRING' },
    },
    ['group_key', 'product_id', 'confidence']
  );

  const decoded = await callGemini(payload, cfg);
  const out = {};
  for (const row of decoded) {
    if (!row || typeof row !== 'object' || row.group_key === undefined) continue;
    const id = row.product_id !== null && row.product_id !== undefined && row.product_id !== '' ? String(row.product_id) : null;
    out[String(row.group_key)] = {
      productId: id && candidates[id] ? id : null,
      mainKey: row.main_photo_key !== null && row.main_photo_key !== undefined ? String(row.main_photo_key) : null,
      confidence: clamp01(row.confidence),
      reason: cleanReason(row.reason),
    };
  }
  return out;
}
