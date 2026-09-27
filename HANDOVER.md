# ShopQ Admin Backend — Handover & Next-Steps Plan
*Written 27 Sep 2026, after a full read-through of the codebase your developer built. Bring this file into a new chat rooted at this folder to continue.*

**Note on the folder:** the actual project (package.json, src/, etc.) lives one level down, in
`C:\Users\Vel\Documents\ShopQ-Admin-Backend\ShopQ-Admin-Backend\` — a folder nested inside itself.
Point a new chat at that inner folder, or mention this quirk so it isn't confusing.

---

## 1. What this backend actually is, in plain terms

This is a small, separate Next.js app — not your storefront, not your CRM. It talks to your real
CRM (the Laravel system at shopqhub.com) to read product info, but never writes to it. What it
*does* own:

- A simple login-gated admin area (six pages) where staff can edit a handful of things
- Extra product content (Features, Highlights, Key Features, "Ideal For", "Why You'll Love It",
  Specifications) — this is the data your product pages have been pulling in throughout this
  session's redesign work
- Homepage promo banners and sidebar promo cards
- One site-wide discount code
- Shopping-funnel tracking (views, add-to-cart, checkout starts, purchases) and two reports built
  from it: a funnel report and an abandoned-cart list

It's a real, working system — not a stub. The admin forms are plain (no fancy design), but they
function.

---

## 2. Product images and descriptions — how they actually work today

**Descriptions/content:** the extra fields (Features, Highlights, etc.) live in THIS backend, in a
`product_content` table, edited through `/admin/product-content`. The core description, name,
price, and stock still live in your CRM — this backend only supplies the *extra* stuff.

**Images: this backend does not handle them at all.** I checked carefully — there is no upload
button anywhere, no file storage, nothing. Every product photo on your site comes from the CRM
(shopqhub.com). Even the two places THIS backend has its own images (promo banners, sidebar
cards), the admin form is just a plain text box where staff paste a URL — they still need an
already-hosted image somewhere else first.

### Your idea: bring product images into this backend

This is worth doing, but it's really two different-sized decisions, and I'd treat them separately:

- **Small, clear win: add real upload (not paste-a-URL) for the banners and sidebar cards this
  backend already owns.** Low risk, contained, useful immediately — staff could drag-and-drop an
  image instead of hunting for a URL first.
- **Bigger decision: should PRODUCT photos move here too, taking that job away from the CRM?**
  This is a real architecture change, not a quick add. Things to weigh:
  - Your CRM is presumably still where inventory/stock/orders are managed — if products are
    entered there, it may be more natural for photos to stay attached to that same product record.
  - A hybrid is possible: keep the CRM as the source for the *main* catalog photo, but let this
    backend hold *extra* images (lifestyle shots, size charts, "why you'll love it" callout
    images) alongside the extra content it already owns. That fits the system's current shape
    without a risky full migration.
  - A full migration (this backend becomes the single source of truth for every product photo)
    is possible but bigger: needs real storage (not just the local disk — a 1GB VPS with no
    upload folder today), a migration of all existing images, and a change to how the frontend
    decides which image to show.

**My recommendation:** start with the small win (upload for banners/cards) and the hybrid
(extra product images live here) rather than a full photo migration on day one. Revisit a full
migration later if the hybrid still feels limiting.

---

## 3. Real issues worth fixing first (found while reading the code)

1. **A seed admin password may still be live.** The setup script inserts a starter account —
   username `admin`, email `admin@gmail.com`, password `admin123` — with a comment telling
   whoever set it up to change it. If this was ever pointed at a real database, confirm that
   password was actually changed. This is the single most important thing to check before
   anything else.
2. **CORS only allows your live site.** The backend only accepts requests from `https://shopq.lk`
   by default — which is why testing it from a local computer doesn't work out of the box. It's a
   one-line fix (an environment variable), but right now it's one-origin-at-a-time, meaning you
   have to toggle it depending on whether you're testing locally or it's live. Worth making it
   accept a list of allowed addresses instead, so both work at once.
3. **Unclear if this is actually live yet.** An earlier note in the project says the address
   `manage.shopq.lk` was still pointed at a different hosting service (Vercel), not the server
   this backend is meant to run on. Worth confirming with your developer whether this backend is
   genuinely serving real traffic today, or still needs to be switched on.
4. **A hosting quirk to know about:** the server this runs on has a firewall that can silently
   block save/edit requests without any error showing up in the logs. If edits ever mysteriously
   stop saving, this is the first thing to check (someone with hosting panel access needs to turn
   it off for this one address).

None of these are things I'm asking you to act on right now — they're for the new chat, working
directly with (or handing to) your developer.

---

## 4. Feature ideas — for this backend

Roughly ordered by how much value they'd add for how little work:

- **Real image upload** for banners/sidebar cards (see section 2) — clear, contained win.
- **A "what's missing" dashboard.** Right now there's no way to see, at a glance, which products
  have Features/Highlights content filled in and which don't. With 138 products, a simple
  checklist view (product name → has content? yes/no) would save a lot of manual checking.
- **Bulk content entry.** Typing Features/Highlights one product at a time through a form doesn't
  scale. A spreadsheet-style import (upload a CSV, it fills in many products at once) would help
  a lot once you're past the first handful of products.
- **A real home for Reviews & Q&A.** The storefront currently shows the theme's placeholder 2023
  sample reviews on every product — a known gap from the frontend work. This backend already has
  the shape (structured content, admin-editable, tied to a product ID) to become the real home
  for genuine reviews and Q&A instead of building a third system for it.
- **Payment comparison rules.** The storefront has a "tap to compare" payment options link that
  isn't wired to anything real yet — this backend's admin area is a natural place to maintain
  those bank/installment rules once you decide what they should say.
- **More than one discount code.** Right now there's exactly one site-wide code. Real coupon
  codes (multiple, with their own rules — percentage off, minimum spend, expiry) would be a
  bigger but valuable addition.
- **Scheduled content.** Promo banners and the site offer can be turned on/off, but nothing
  currently turns itself on automatically on a date (e.g. "start this banner on Black Friday").
  Small addition, useful for planning campaigns ahead of time.
- **More than one admin account, with roles.** Right now everyone shares one login. If you ever
  want a staff member to edit content without being able to touch funnel reports or delete
  banners, that needs separate accounts with permissions — not built today.
- **A live preview** in the admin content form, so whoever is typing Features/Specifications can
  see roughly how it'll look on the actual product page before saving, instead of filling in a
  blind form.

---

## 5. The "build the frontend first, mark it Coming Soon" idea

This is a good idea, and it's exactly the process that worked well for the product page redesign
this session: build and show the real design first, get it approved, and only then wire it to
real data.

Suggested way to use it here: for any of the features above that don't exist yet (Reviews/Q&A,
payment comparison, bulk-content dashboard), we could build the **storefront-facing or admin-facing
screens first**, with realistic layout and a clear "Coming Soon" label where real data would go.
That gives your developer an exact target to build the backend logic against, instead of guessing
what shape the data should be — and lets you approve the look before any backend work starts.

This would be a piece of frontend work (in the `ShopQ-Frontend-Ecom-Website` project, not this
backend), so it's really a project-3 task that connects the other two — worth deciding, in the new
chat, whether to do it there or here.

---

## 6. Suggested order of work for the new chat

1. Confirm the seed admin password situation (section 3.1) — quick, important.
2. Confirm whether this backend is actually live yet (section 3.3).
3. Fix CORS to support a list of allowed addresses (section 3.2) — needed for any further local
   testing anyway.
4. Add real image upload for banners/sidebar cards.
5. Decide on the product-image hybrid approach (section 2) and scope it properly.
6. Pick 1–2 feature ideas from section 4 to start on, based on what matters most to you.

---

*This file was written after a full code read-through by an AI assistant (no code was changed).
Everything above reflects what's actually in the codebase as of 27 Sep 2026, not assumptions.*
