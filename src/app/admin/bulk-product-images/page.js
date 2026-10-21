'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminShell from '@/components/admin/AdminShell';
import { clearSessionToken } from '@/lib/adminSession';

// Bulk product image upload. The admin picks a folder that holds one
// sub-folder per product; the AI (Gemini) + the folder/file names decide
// which product each sub-folder is and which photo is the main one; the admin
// reviews every match and saves product by product (or all at once).
//
//   POST /api/product-images/bulk/match  - step 1, matches (saves nothing)
//   POST /api/product-images/bulk/save   - step 2, saves one product's images
//
// Only small previews (about 512px) go to the AI, never the full photos. Full
// photos are uploaded only when the admin presses Save, and are shrunk in the
// browser first if they are large (the VPS has little disk).

const BATCH = 12; // photos per match request
const THUMB = 512;
const KEEP_AS_IS_BYTES = 2 * 1024 * 1024; // larger photos are shrunk before upload
const SHRINK_TARGET_BYTES = 1.8 * 1024 * 1024;
const GIF_MAX_BYTES = 7 * 1024 * 1024;
const MAX_PER_PRODUCT = 12;
const ACCEPTED = ['jpg', 'jpeg', 'png', 'webp', 'gif'];

// ------------------------------------------------------------------ pure helpers

const natCompare = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });

function sortGroup(list) {
  list.sort((a, b) => {
    if (a.role === 'main' && b.role !== 'main') return -1;
    if (b.role === 'main' && a.role !== 'main') return 1;
    const an = a.number === null ? -1 : a.number;
    const bn = b.number === null ? -1 : b.number;
    if (an !== bn) return an - bn;
    return natCompare(a.path, b.path);
  });
}

/** exactly one main photo per product: the most confident one named main, or else the first. */
function normalizeMain(list) {
  const mains = list.filter((i) => i.role === 'main');
  if (mains.length > 1) {
    mains.sort((a, b) => b.confidence - a.confidence);
    mains.slice(1).forEach((i) => (i.role = 'other'));
  }
  sortGroup(list);
  if (!list.some((i) => i.role === 'main') && list.length) list[0].role = 'main';
  sortGroup(list);
}

function groupsOf(items) {
  const m = {};
  items.forEach((i) => {
    if (i.pid) (m[i.pid] = m[i.pid] || []).push(i);
  });
  return m;
}

function needsCheck(list) {
  return list.some((i) => i.flagged || i.source === 'name' || i.confidence < 0.7);
}

/**
 * A folder inside the chosen folder is one product: all its photos go to the AI together so it decides the product
 * once and picks the main photo. Photos lying directly in the chosen folder are matched one by one.
 */
function makeBatches(items) {
  const byFolder = {};
  const order = [];
  const loose = [];
  items.forEach((it) => {
    if (it.folder) {
      if (!byFolder[it.folder]) {
        byFolder[it.folder] = [];
        order.push(it.folder);
      }
      byFolder[it.folder].push(it);
    } else loose.push(it);
  });

  const batches = [];
  let cur = null;
  let gid = 1;
  const flushIf = (extra) => {
    if (cur && cur.items.length && cur.items.length + extra > BATCH) {
      batches.push(cur);
      cur = null;
    }
    if (!cur) cur = { groups: [], files: [], items: [] };
  };

  order.forEach((folder) => {
    const list = byFolder[folder];
    for (let k = 0; k < list.length; k += 60) {
      const part = list.slice(k, k + 60);
      flushIf(part.length);
      cur.groups.push({
        key: `g${gid++}`,
        folder,
        files: part.map((i, n) => ({ key: String(i.id), path: i.path, thumb: n < 10 ? i.thumb : null })),
      });
      part.forEach((i) => cur.items.push(i));
    }
  });
  loose.forEach((i) => {
    flushIf(1);
    cur.files.push({ key: String(i.id), path: i.path, thumb: i.thumb });
    cur.items.push(i);
  });
  if (cur && cur.items.length) batches.push(cur);
  return batches;
}

function loadBitmap(file) {
  return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
}

function canvasBlob(canvas, type, q) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, q));
}

function drawScaled(bmp, maxSide) {
  const s = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height); // transparent png on white
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

async function makeThumb(item) {
  try {
    const bmp = await loadBitmap(item.file);
    const c = drawScaled(bmp, THUMB);
    if (bmp.close) bmp.close();
    const blob = await canvasBlob(c, 'image/jpeg', 0.7);
    const url = URL.createObjectURL(blob);
    const b64 = await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || null);
      r.readAsDataURL(blob);
    });
    return { url, thumb: b64 };
  } catch (e) {
    return { url: URL.createObjectURL(item.file), thumb: null };
  }
}

/** The file to upload: the original when it is small enough, otherwise a shrunk jpg. */
async function prepareUpload(item) {
  const f = item.file;
  const ext = (f.name.split('.').pop() || '').toLowerCase();
  const base = f.name.replace(/\.[^.]+$/, '');
  if (ext === 'gif' && f.size <= GIF_MAX_BYTES) return f;
  if (ext !== 'gif' && f.size <= KEEP_AS_IS_BYTES && ACCEPTED.includes(ext)) return f;

  const bmp = await loadBitmap(f);
  let side = 2400;
  let q = 0.92;
  for (let n = 0; n < 15; n++) {
    const blob = await canvasBlob(drawScaled(bmp, side), 'image/jpeg', q);
    if (blob && blob.size <= SHRINK_TARGET_BYTES) return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
    q -= 0.07;
    if (q < 0.55) {
      q = 0.85;
      side = Math.round(side * 0.8);
    }
  }
  throw new Error('one of the photos could not be reduced to a small enough size');
}

async function runPool(list, limit, fn) {
  let i = 0;
  const worker = async () => {
    while (i < list.length) {
      const x = list[i++];
      try {
        await fn(x);
      } catch (e) {
        /* each task reports its own problem */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
}

// ------------------------------------------------------------------ small components

function MoveButton({ item, onAssign }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const t = setTimeout(() => {
      fetch(`/api/product-index?search=${encodeURIComponent(q.trim())}&per_page=10`)
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((d) => setResults(d.data || []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const choose = async (p) => {
    setBusy(true);
    let existing = [];
    try {
      const r = await fetch(`/api/product-images?productId=${encodeURIComponent(p.id)}`);
      if (r.ok) existing = (await r.json()).images || [];
    } catch (e) {
      /* the card just shows no current images */
    }
    setBusy(false);
    setOpen(false);
    onAssign(item.id, { id: String(p.id), name: p.name, existing });
  };

  return (
    <span ref={boxRef} className="relative">
      <button type="button" className="rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50" onClick={() => setOpen((o) => !o)}>
        {item.pid ? 'Move' : 'Assign'}
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-zinc-300 bg-white p-2 shadow-lg">
          <input autoFocus className="adm-input !py-1.5" placeholder="Search product name" value={q} onChange={(e) => setQ(e.target.value)} />
          {item.pid ? (
            <button type="button" className="mt-1 block w-full rounded px-2 py-1.5 text-left text-xs font-semibold text-red-600 hover:bg-red-50" onClick={() => { setOpen(false); onAssign(item.id, null); }}>
              Not this product (leave unmatched)
            </button>
          ) : null}
          <div className="max-h-56 overflow-auto">
            {busy ? <p className="adm-muted px-2 py-1">Loading…</p> : null}
            {results.map((p) => (
              <button key={p.id} type="button" className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-zinc-100" onClick={() => choose(p)}>
                {p.name} <span className="text-zinc-400">#{p.id}</span>
              </button>
            ))}
            {q.trim().length >= 2 && !results.length && !busy ? <p className="adm-muted px-2 py-1">No product found.</p> : null}
          </div>
        </div>
      ) : null}
    </span>
  );
}

function Tile({ item, locked, onKeep, onMakeMain, onAssign }) {
  const isMain = !!item.pid && item.role === 'main';
  return (
    <div className={`relative rounded-lg border bg-white p-1.5 ${isMain ? 'border-2 border-amber-400' : 'border-zinc-200'} ${item.pid && !item.keep ? 'opacity-40' : ''}`}>
      {isMain ? <span className="adm-pill adm-pill-warn absolute left-2.5 top-2.5 z-10">Main</span> : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.url || ''} alt={item.path} className="h-28 w-full rounded bg-zinc-100 object-contain" />
      <div className="mt-1 max-h-8 overflow-hidden break-all text-[11px] leading-tight text-zinc-500" title={`${item.path}${item.note ? `\n${item.note}` : ''}`}>
        {item.path.split('/').pop()}
      </div>
      {item.pid ? (
        <div className="text-[10px] text-zinc-400" title={item.note || ''}>
          {Math.round(item.confidence * 100)}% {item.flagged ? '- check' : ''}
        </div>
      ) : item.note ? (
        <div className="text-[10px] text-zinc-400">{item.note}</div>
      ) : null}
      {!locked ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {item.pid ? <input type="checkbox" checked={item.keep} disabled={isMain} onChange={(e) => onKeep(item.id, e.target.checked)} title="Include this photo" /> : null}
          {item.pid && !isMain ? (
            <button type="button" className="rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-50" onClick={() => onMakeMain(item.id)}>
              Make main
            </button>
          ) : null}
          <MoveButton item={item} onAssign={onAssign} />
        </div>
      ) : null}
    </div>
  );
}

function folderText(list) {
  const seen = {};
  const names = [];
  list.forEach((i) => {
    if (i.folder && !seen[i.folder]) {
      seen[i.folder] = 1;
      names.push(i.folder.split('/').pop());
    }
  });
  return names.length ? `  |  folder: ${names.join(', ')}` : '';
}

// ------------------------------------------------------------------ page

function BulkImages({ token }) {
  const [items, setItems] = useState([]);
  const [products, setProducts] = useState({});
  const [groupState, setGroupState] = useState({});
  const [skipped, setSkipped] = useState(0);
  const [phase, setPhase] = useState('idle'); // idle | running | done
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(0);
  const [notices, setNotices] = useState([]);
  const [onlyCheck, setOnlyCheck] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const inputRef = useRef(null);
  const nextId = useRef(1);
  const itemsRef = useRef([]);
  const groupStateRef = useRef({});
  const productsRef = useRef({});

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.setAttribute('webkitdirectory', '');
      inputRef.current.setAttribute('directory', '');
    }
  }, []);

  // keep refs in step with state so the async loops always see the latest values
  const commitItems = useCallback((next) => {
    itemsRef.current = next;
    setItems(next);
  }, []);
  const commitGroups = useCallback((next) => {
    groupStateRef.current = next;
    setGroupState(next);
  }, []);
  const commitProducts = useCallback((next) => {
    productsRef.current = next;
    setProducts(next);
  }, []);

  /** copy the items, let `fn` change the copy, store it */
  const change = useCallback(
    (fn) => {
      const next = itemsRef.current.map((i) => ({ ...i }));
      fn(next);
      commitItems(next);
    },
    [commitItems]
  );

  const setGroup = useCallback(
    (pid, patch) => {
      const cur = groupStateRef.current[pid] || { mode: 'add', saved: false, busy: false, message: null };
      commitGroups({ ...groupStateRef.current, [pid]: { ...cur, ...patch } });
    },
    [commitGroups]
  );

  const api = useCallback(
    async (url, { json, form } = {}) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'x-admin-token': token, ...(json ? { 'content-type': 'application/json' } : {}) },
        body: json ? JSON.stringify(json) : form,
      });
      let data = null;
      try {
        data = await res.json();
      } catch (e) {
        /* not json */
      }
      if (res.status === 401) {
        clearSessionToken();
        throw new Error('Your session ended. Please sign in again.');
      }
      if (!res.ok) throw new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
      return data;
    },
    [token]
  );

  // ---------------------------------------------------------- choosing the folder

  const onPick = (e) => {
    itemsRef.current.forEach((i) => i.url && URL.revokeObjectURL(i.url));
    const picked = [];
    let skip = 0;
    Array.from(e.target.files || []).forEach((f) => {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!ACCEPTED.includes(ext) || f.size === 0) {
        skip++;
        return;
      }
      const rel = f.webkitRelativePath || f.name;
      const segs = rel.split('/');
      picked.push({
        id: nextId.current++, file: f, path: rel, folder: segs.length >= 3 ? segs.slice(0, -1).join('/') : '',
        thumb: null, url: null, pid: null, role: 'other', number: null, confidence: 0, source: 'none', flagged: false, note: '', keep: true,
      });
    });
    picked.sort((a, b) => natCompare(a.path, b.path));
    commitItems(picked);
    commitProducts({});
    commitGroups({});
    setSkipped(skip);
    setNotices(picked.length ? [] : [{ type: 'warn', text: 'No jpg, png, webp or gif photos were found in that folder.' }]);
    setPhase('idle');
    setStatus('');
    setProgress(0);
  };

  // ---------------------------------------------------------- matching

  const runMatching = async () => {
    setPhase('running');
    setNotices([]);
    change((list) => list.forEach((i) => { i.pid = null; i.keep = true; i.note = ''; i.role = 'other'; i.number = null; i.source = 'none'; i.flagged = false; i.confidence = 0; }));
    commitProducts({});
    commitGroups({});

    const all = itemsRef.current;
    const total = all.length;
    let prepared = 0;
    setStatus('Preparing previews…');
    setProgress(0);

    const thumbs = {};
    await runPool(all, 4, async (it) => {
      thumbs[it.id] = await makeThumb(it);
      prepared++;
      setStatus(`Preparing previews… ${prepared} of ${total}`);
      setProgress(Math.round((prepared / total) * 40));
    });
    change((list) => list.forEach((i) => { if (thumbs[i.id]) { i.url = thumbs[i.id].url; i.thumb = thumbs[i.id].thumb; } }));

    const batches = makeBatches(itemsRef.current);
    let aiProblem = null;
    let failed = 0;
    let doneCount = 0;
    for (let idx = 0; idx < batches.length; idx++) {
      const b = batches[idx];
      setStatus(`Matching photos… ${doneCount} of ${total}`);
      setProgress(40 + Math.round((idx / batches.length) * 60));
      try {
        const res = await api('/api/product-images/bulk/match', { json: { groups: b.groups, files: b.files } });
        if (res.ai && !res.ai.used) aiProblem = res.ai.problem;
        commitProducts({ ...productsRef.current, ...(res.products || {}) });
        change((list) => {
          b.items.forEach((bi) => {
            const it = list.find((x) => x.id === bi.id);
            const r = res.results[String(bi.id)];
            if (!it || !r) return;
            it.pid = r.product_id ? String(r.product_id) : null;
            it.role = r.role;
            it.number = r.number;
            it.confidence = r.confidence;
            it.source = r.source;
            it.flagged = r.flagged;
            it.note = r.note || '';
          });
        });
      } catch (e) {
        failed += b.items.length;
        change((list) => list.forEach((i) => { if (b.items.some((bi) => bi.id === i.id)) i.note = `Could not be analysed: ${e.message}`; }));
      }
      doneCount += b.items.length;
    }

    // one main photo per product, in a sensible order
    change((list) => {
      const m = groupsOf(list);
      Object.keys(m).forEach((pid) => {
        normalizeMain(m[pid]);
        m[pid].forEach((i, idx) => (i.keep = idx < MAX_PER_PRODUCT));
      });
    });
    const gs = { ...groupStateRef.current };
    Object.keys(groupsOf(itemsRef.current)).forEach((pid) => {
      gs[pid] = gs[pid] || { mode: 'add', saved: false, busy: false, message: null };
    });
    commitGroups(gs);

    const n = [];
    if (aiProblem) {
      n.push({
        type: 'warn',
        text:
          aiProblem === 'not_configured'
            ? 'The AI is not set up (no Gemini API key on this server), so photos were matched by name only. Please check every match.'
            : 'The AI did not answer, so some or all photos were matched by name only. Please check every match.',
      });
    }
    if (failed) n.push({ type: 'bad', text: `${failed} photo${failed === 1 ? '' : 's'} could not be analysed and appear under "Not matched". Run the matching again, or assign them by hand.` });
    setNotices(n);
    setStatus('Done.');
    setProgress(100);
    setPhase('done');
  };

  // ---------------------------------------------------------- editing the review

  const onKeep = (id, keep) => change((list) => { const it = list.find((i) => i.id === id); if (it) it.keep = keep; });

  const onMakeMain = (id) =>
    change((list) => {
      const it = list.find((i) => i.id === id);
      if (!it) return;
      list.forEach((i) => { if (i.pid === it.pid && i.role === 'main') i.role = 'other'; });
      it.role = 'main';
      it.keep = true;
      normalizeMain(list.filter((i) => i.pid === it.pid));
    });

  const onAssign = (id, product) => {
    if (product) {
      commitProducts({ ...productsRef.current, [product.id]: productsRef.current[product.id] || product });
      const cur = groupStateRef.current[product.id];
      if (!cur || cur.saved) commitGroups({ ...groupStateRef.current, [product.id]: { mode: 'add', saved: false, busy: false, message: null } });
    }
    change((list) => {
      const it = list.find((i) => i.id === id);
      if (!it) return;
      const from = it.pid;
      if (product) {
        it.pid = product.id; it.source = 'manual'; it.confidence = 1; it.flagged = false; it.note = 'Assigned by hand';
      } else {
        it.pid = null; it.note = 'Left unmatched by you';
      }
      [from, it.pid].forEach((pid) => {
        if (!pid) return;
        const l = list.filter((i) => i.pid === pid);
        if (l.length) normalizeMain(l);
      });
    });
  };

  // ---------------------------------------------------------- saving

  const saveGroup = async (pid) => {
    const st = groupStateRef.current[pid];
    if (!st || st.busy || st.saved) return false;
    const list = itemsRef.current.filter((i) => i.pid === pid && i.keep);
    sortGroup(list);
    if (!list.length) return false;

    setGroup(pid, { busy: true, message: null });
    try {
      const files = [];
      for (const it of list) files.push(await prepareUpload(it));
      const form = new FormData();
      form.append('productId', pid);
      form.append('mode', st.mode);
      files.forEach((f) => form.append('files', f, f.name)); // the first file is the main image
      const res = await api('/api/product-images/bulk/save', { form });

      const p = productsRef.current[pid];
      commitProducts({ ...productsRef.current, [pid]: { ...p, existing: res.images || [] } });
      setGroup(pid, { busy: false, saved: true, message: { type: 'success', text: res.message } });
      return true;
    } catch (e) {
      setGroup(pid, { busy: false, message: { type: 'bad', text: e.message } });
      return false;
    }
  };

  const saveAll = async () => {
    const m = groupsOf(itemsRef.current);
    const todo = Object.keys(m).filter((p) => groupStateRef.current[p] && !groupStateRef.current[p].saved);
    if (!todo.length) return;
    const check = todo.filter((p) => needsCheck(m[p])).length;
    const msg = `Save the images of ${todo.length} product${todo.length === 1 ? '' : 's'}?${check ? `\n\n${check} of them still have matches marked "Check".` : ''}`;
    if (!window.confirm(msg)) return;
    setSavingAll(true);
    let ok = 0;
    let bad = 0;
    for (const pid of todo) {
      if (await saveGroup(pid)) ok++;
      else bad++;
    }
    setSavingAll(false);
    setNotices([{ type: bad ? 'warn' : 'ok', text: `${ok} product${ok === 1 ? '' : 's'} saved${bad ? `, ${bad} not saved (see the messages on their cards).` : '.'}` }]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handler = (e) => {
      const unsaved = itemsRef.current.some((i) => i.pid && groupStateRef.current[i.pid] && !groupStateRef.current[i.pid].saved);
      if (unsaved) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ---------------------------------------------------------- render

  const groups = useMemo(() => groupsOf(items), [items]);
  const pids = useMemo(() => Object.keys(groups).filter((p) => products[p]).sort((a, b) => natCompare(products[a].name, products[b].name)), [groups, products]);
  const unmatched = items.filter((i) => !i.pid);
  const photosMatched = items.length - unmatched.length;
  const toCheck = pids.filter((p) => !groupState[p]?.saved && needsCheck(groups[p])).length;
  const savedCount = pids.filter((p) => groupState[p]?.saved).length;
  const anyUnsaved = pids.some((p) => groupState[p] && !groupState[p].saved);
  const noticeClass = { warn: 'border-amber-300 bg-amber-50 text-amber-800', bad: 'border-red-300 bg-red-50 text-red-700', ok: 'border-emerald-300 bg-emerald-50 text-emerald-700' };

  return (
    <div>
      <div className="adm-card mb-5">
        <h3 className="mb-1 mt-0 font-semibold text-zinc-900">1. Choose the folder</h3>
        <p className="adm-hint">
          Choose the folder that contains one sub-folder per product. Everything inside a product&apos;s sub-folder is treated as that product: the photo named
          &quot;main&quot; (or front, cover) becomes the main photo, or the AI picks the clearest picture if none is named, and the other photos follow it.
          Photos lying loose in the chosen folder are matched one by one by their names (e.g. &quot;moneybox main.jpg&quot;, &quot;moneybox2.jpg&quot;) and by what the AI sees.
          JPG, PNG, WEBP or GIF; large photos are shrunk automatically before upload.
        </p>
        <input ref={inputRef} id="bpi-folder" type="file" multiple onChange={onPick} className="adm-input max-w-md" />
        {items.length ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-700">
              {items.length} photo{items.length === 1 ? '' : 's'} found{skipped ? ` (${skipped} other file${skipped === 1 ? '' : 's'} skipped)` : ''}.
            </span>
            <button type="button" id="bpi-run" className="adm-btn adm-btn-primary" onClick={runMatching} disabled={phase === 'running'}>
              {phase === 'running' ? 'Matching…' : '2. Match photos to products with AI'}
            </button>
          </div>
        ) : null}
        {phase !== 'idle' ? (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded bg-zinc-100">
              <div className="h-2 bg-brand-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p id="bpi-status" className="mt-1 text-xs text-zinc-500">{status}</p>
          </div>
        ) : null}
      </div>

      {notices.map((n, i) => (
        <div key={i} className={`mb-4 rounded-lg border px-4 py-3 text-sm ${noticeClass[n.type] || noticeClass.warn}`}>{n.text}</div>
      ))}

      {phase === 'done' ? (
        <>
          <div className="adm-card mb-5 flex flex-wrap items-center gap-4">
            <div className="mr-auto">
              <div id="bpi-summary" className="text-sm font-semibold text-zinc-900">
                {pids.length} product{pids.length === 1 ? '' : 's'} matched, {photosMatched} photo{photosMatched === 1 ? '' : 's'}
                {unmatched.length ? `, ${unmatched.length} not matched` : ''}
                {savedCount ? `, ${savedCount} saved` : ''}
              </div>
              {toCheck ? <div className="text-xs font-medium text-amber-700">{toCheck} product{toCheck === 1 ? '' : 's'} to check before saving</div> : null}
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input type="checkbox" checked={onlyCheck} onChange={(e) => setOnlyCheck(e.target.checked)} /> Only show products to check
            </label>
            <button type="button" id="bpi-save-all" className="adm-btn adm-btn-primary" onClick={saveAll} disabled={!anyUnsaved || savingAll}>
              {savingAll ? 'Saving…' : 'Save all products'}
            </button>
          </div>

          {!pids.length ? <p className="adm-muted mb-5">No photo could be matched to a product.</p> : null}

          {pids.map((pid) => {
            const list = groups[pid];
            const p = products[pid];
            const st = groupState[pid] || { mode: 'add', saved: false, busy: false, message: null };
            if (onlyCheck && (st.saved || !needsCheck(list))) return null;
            const kept = list.filter((i) => i.keep);
            const existingN = (p.existing || []).length;
            const sources = new Set(list.map((i) => i.source));
            const locked = st.saved || st.busy;
            const tooMany = kept.length > MAX_PER_PRODUCT;

            return (
              <div key={pid} className={`adm-card mb-5 ${st.saved ? 'border-emerald-400' : ''}`} data-pid={pid}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="mr-auto">
                    <div className="text-base font-semibold text-zinc-900">{p.name}</div>
                    <div className="text-xs text-zinc-500">#{pid}{folderText(list)}</div>
                  </div>
                  {st.saved ? <span className="adm-pill adm-pill-ok">Saved</span> : null}
                  {!st.saved && (sources.has('ai') || sources.has('ai+name')) ? <span className="adm-pill adm-pill-ok">AI</span> : null}
                  {!st.saved && sources.has('name') ? <span className="adm-pill adm-pill-warn">Name</span> : null}
                  {!st.saved && needsCheck(list) ? <span className="adm-pill adm-pill-bad">Check</span> : null}
                </div>

                {existingN ? (
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-zinc-500">Current images ({existingN}):</span>
                    {p.existing.map((e) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={e.id} src={e.url} alt="" className={`h-11 w-11 rounded border object-cover ${e.isPrimary ? 'border-2 border-amber-400' : 'border-zinc-200'}`} title={e.isPrimary ? 'Primary' : ''} />
                    ))}
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
                  {list.map((it) => (
                    <Tile key={it.id} item={it} locked={locked} onKeep={onKeep} onMakeMain={onMakeMain} onAssign={onAssign} />
                  ))}
                </div>

                {!st.saved ? (
                  <div className="mt-4 flex flex-wrap items-center gap-4">
                    {existingN ? (
                      <div className="flex flex-wrap gap-4 text-sm text-zinc-700">
                        {[
                          ['add', 'Add; the new main photo becomes primary'],
                          ['add_keep_primary', 'Add; keep the current primary'],
                          ['replace', 'Replace existing images'],
                        ].map(([value, label]) => (
                          <label key={value} className="flex items-center gap-1.5">
                            <input type="radio" name={`mode-${pid}`} checked={st.mode === value} disabled={st.busy} onChange={() => setGroup(pid, { mode: value })} /> {label}
                          </label>
                        ))}
                      </div>
                    ) : null}
                    <span className={`text-xs ${tooMany ? 'font-semibold text-red-600' : 'text-zinc-500'}`}>
                      {kept.length} selected{tooMany ? ` (limit is ${MAX_PER_PRODUCT} per product)` : ''}
                    </span>
                    <button type="button" className="adm-btn adm-btn-primary ml-auto" onClick={() => saveGroup(pid)} disabled={st.busy || !kept.length || tooMany}>
                      {st.busy ? 'Saving…' : 'Save images for this product'}
                    </button>
                  </div>
                ) : null}
                {st.message ? (
                  <div className={`mt-3 rounded-lg border px-3 py-2 text-sm ${noticeClass[st.message.type === 'success' ? 'ok' : 'bad']}`}>{st.message.text}</div>
                ) : null}
              </div>
            );
          })}

          {unmatched.length ? (
            <div className="adm-card mb-5">
              <h3 className="mb-1 mt-0 font-semibold text-zinc-900">Not matched ({unmatched.length})</h3>
              <p className="adm-hint">These photos are not saved unless you assign them to a product.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
                {unmatched.map((it) => (
                  <Tile key={it.id} item={it} locked={false} onKeep={onKeep} onMakeMain={onMakeMain} onAssign={onAssign} />
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function BulkProductImagesPage() {
  return (
    <AdminShell
      title="Bulk Product Images"
      subtitle="Pick a folder with one sub-folder per product. The AI matches each sub-folder to its product and chooses the main photo; you check the matches, then save."
    >
      {(token) => <BulkImages token={token} />}
    </AdminShell>
  );
}
