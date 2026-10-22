// Run with: node --test test/
// Tests for src/lib/productImageMatcher.mjs. Claude is always faked (a client with messages.create).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseName, score, matchFiles, matchGroups, STRONG } from '../src/lib/productImageMatcher.mjs';

const MONEY = { id: '101', name: 'Money Box Piggy Bank', code: 'ZP-9001' };
const LAMP = { id: '102', name: 'Night Lamp', code: 'ZP-9002' };
const KIT = { id: '103', name: '7 in 1 Cleaning Kit', code: 'ZP-9003' };
const CATALOG = [MONEY, LAMP, KIT];

const THUMB = Buffer.from('fake-jpeg-bytes').toString('base64');

const files = (paths) => paths.map((p, i) => ({ key: `k${i}`, path: p, thumb: THUMB }));

function group(key, folder, names) {
  return { key, folder, files: names.map((n, i) => ({ key: `${key}_${i}`, path: `${folder}/${n}`, thumb: THUMB })) };
}

/** A fake Anthropic client that answers with a structured-output reply and records the requests. */
function fakeClaude(rows, { status = 200, stop_reason = 'end_turn' } = {}) {
  const calls = [];
  const client = {
    messages: {
      create: async (params) => {
        calls.push(params);
        if (status !== 200) throw Object.assign(new Error('API error'), { status });
        return { stop_reason, content: [{ type: 'text', text: JSON.stringify({ results: rows }) }] };
      },
    },
  };
  return { ai: { key: 'test-key', model: 'claude-test', client }, calls };
}

const NO_AI = { ai: { key: '', model: 'claude-test', client: { messages: { create: async () => assert.fail('the AI must not be called without a key') } } } };

const subset = (actual, expected) => assert.deepEqual(Object.fromEntries(Object.keys(expected).map((k) => [k, actual[k]])), expected);

// ------------------------------------------------------------------ names

test('parseName reads role, number and folder', () => {
  subset(parseName('moneybox main.jpg'), { base: 'moneybox', folder: '', role: 'main', number: null });
  subset(parseName('moneybox2.jpg'), { base: 'moneybox', folder: '', role: 'other', number: 2 });
  subset(parseName('Money_Box-3.PNG'), { base: 'money box', role: 'other', number: 3 });
  subset(parseName('Lamps/NightLamp_Main.webp'), { base: 'night lamp', folder: 'Lamps', role: 'main', number: null });
  subset(parseName('a\\Night Lamp\\1.jpg'), { base: '', folder: 'Night Lamp', role: 'other', number: 1 });
  subset(parseName('7 in 1 cleaning kit.jpg'), { base: '7 in 1 cleaning kit', role: null, number: null });
  subset(parseName('IMG_0345.jpg'), { base: '', role: null, number: 345 }); // camera names say nothing
  subset(parseName('ZP-9001 main.jpg'), { base: 'zp 9001', role: 'main', number: null }); // a long number is a code
});

test('score ranks the right product first', () => {
  assert.ok(score(parseName('moneybox main.jpg'), MONEY) >= STRONG);
  assert.ok(score(parseName('moneybox main.jpg'), LAMP) < 0.3);
  assert.equal(score(parseName('ZP-9002 front.jpg'), LAMP), 1); // product code
  assert.ok(score(parseName('Night Lamp/1.jpg'), LAMP) >= 0.85); // folder name
  assert.ok(score(parseName('IMG_0345.jpg'), LAMP) < 0.3);
});

// ------------------------------------------------------------------ loose photos

test('without the AI, matching uses file names and says so', async () => {
  const { results, aiProblem } = await matchFiles(files(['moneybox main.jpg', 'moneybox1.jpg', 'moneybox2.jpg', 'night lamp.png', 'IMG_0345.jpg']), CATALOG, NO_AI);

  assert.equal(aiProblem, 'not_configured');
  assert.equal(results.k0.product_id, '101');
  assert.equal(results.k0.role, 'main');
  assert.equal(results.k1.role, 'other');
  assert.equal(results.k1.number, 1);
  assert.equal(results.k2.number, 2);
  assert.equal(results.k3.product_id, '102');
  assert.equal(results.k3.source, 'name');
  assert.equal(results.k3.flagged, true); // file name only: asked to be checked
  assert.equal(results.k4.product_id, null);
  assert.equal(results.k4.source, 'none');
});

test('the AI matches photos with no useful file name and receives the catalog and previews', async () => {
  const { ai, calls } = fakeClaude([
    { key: 'k0', product_id: 102, role: 'main', confidence: 0.93, reason: 'lamp shade visible' },
    { key: 'k1', product_id: 103, role: 'other', confidence: 0.8, reason: 'kit box' },
  ]);

  const { results, aiProblem } = await matchFiles(files(['IMG_0001.jpg', 'IMG_0002.jpg']), CATALOG, { ai });

  assert.equal(aiProblem, null);
  assert.equal(results.k0.product_id, '102');
  assert.equal(results.k0.source, 'ai');
  assert.equal(results.k0.role, 'main');
  assert.equal(results.k0.confidence, 0.93);
  assert.equal(results.k1.product_id, '103');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, 'claude-test');
  assert.equal(calls[0].output_config.format.type, 'json_schema');
  const content = calls[0].messages[0].content;
  assert.ok(content[0].text.includes('Night Lamp'));
  const images = content.filter((b) => b.type === 'image');
  assert.equal(images.length, 2);
  assert.deepEqual(images[0].source, { type: 'base64', media_type: 'image/jpeg', data: THUMB });
});

test('AI and file name agreeing is high confidence and not flagged; the name decides main', async () => {
  const { ai } = fakeClaude([{ key: 'k0', product_id: 101, role: 'other', confidence: 0.9, reason: 'piggy bank' }]);
  const { results } = await matchFiles(files(['moneybox main.jpg']), CATALOG, { ai });

  assert.equal(results.k0.source, 'ai+name');
  assert.equal(results.k0.flagged, false);
  assert.equal(results.k0.role, 'main');
});

test('a disagreement is flagged and an exact product code in the name wins', async () => {
  const { ai } = fakeClaude([{ key: 'k0', product_id: 102, role: 'main', confidence: 0.7, reason: 'looks like a lamp' }]);
  const { results } = await matchFiles(files(['ZP-9001 main.jpg']), CATALOG, { ai });

  assert.equal(results.k0.product_id, '101');
  assert.equal(results.k0.flagged, true);
});

test('an id the AI made up, or a low confidence answer, is ignored', async () => {
  const { ai } = fakeClaude([
    { key: 'k0', product_id: 999999, role: 'main', confidence: 0.99, reason: 'invented' },
    { key: 'k1', product_id: 103, role: 'other', confidence: 0.2, reason: 'unsure' },
  ]);
  const { results } = await matchFiles(files(['IMG_1.jpg', 'IMG_2.jpg']), CATALOG, { ai });

  assert.equal(results.k0.product_id, null);
  assert.equal(results.k1.product_id, null);
});

test('when the AI fails, file names are still used', async () => {
  const { ai } = fakeClaude([], { status: 500 });
  const { results, aiProblem } = await matchFiles(files(['night lamp 2.jpg']), CATALOG, { ai });

  assert.equal(aiProblem, 'ai_failed');
  assert.equal(results.k0.product_id, '102');
  assert.equal(results.k0.flagged, true);
});

test('an exact name beats a longer name that contains it', async () => {
  const catalog = [...CATALOG, { id: '104', name: 'Night Lamp Pro', code: 'ZP-9004' }];
  const { results } = await matchFiles(files(['night lamp.jpg']), catalog, NO_AI);
  assert.equal(results.k0.product_id, '102');
});

// ------------------------------------------------------------------ folders

test('a folder is matched once and all its photos follow', async () => {
  const { results, aiProblem } = await matchGroups([group('g1', 'Products/Money Box', ['IMG_0003.jpg', 'IMG_0001.jpg', 'IMG_0002.jpg'])], CATALOG, NO_AI);

  assert.equal(aiProblem, 'not_configured');
  for (const k of ['g1_0', 'g1_1', 'g1_2']) {
    assert.equal(results[k].product_id, '101');
    assert.equal(results[k].group, 'g1');
  }
  // nothing says which is main: the first photo by name is
  assert.equal(results.g1_1.role, 'main'); // IMG_0001
  assert.equal(results.g1_2.role, 'other'); // IMG_0002
  assert.equal(results.g1_2.number, 1);
  assert.equal(results.g1_0.role, 'other'); // IMG_0003
  assert.equal(results.g1_0.number, 2);
  assert.equal(results.g1_0.flagged, true); // folder name only
});

test('the photo named main is the main one and the others keep default names', async () => {
  const { results } = await matchGroups([group('g1', 'Night Lamp', ['IMG_1.jpg', 'IMG_2.jpg', 'lamp main.jpg', 'IMG_3.jpg'])], CATALOG, NO_AI);

  assert.equal(results.g1_2.role, 'main');
  for (const k of ['g1_0', 'g1_1', 'g1_3']) {
    assert.equal(results[k].role, 'other');
    assert.equal(results[k].product_id, '102');
  }
  assert.deepEqual([results.g1_0.number, results.g1_1.number, results.g1_3.number], [1, 2, 3]);
});

test('the AI picks the product and the main photo for a folder of camera names', async () => {
  const { ai, calls } = fakeClaude([{ group_key: 'g1', product_id: 103, main_photo_key: 'g1_2', confidence: 0.92, reason: 'box says cleaning kit' }]);
  const { results, aiProblem } = await matchGroups([group('g1', 'Batch 14/Folder 7', ['IMG_1.jpg', 'IMG_2.jpg', 'IMG_3.jpg'])], CATALOG, { ai });

  assert.equal(aiProblem, null);
  for (const k of ['g1_0', 'g1_1', 'g1_2']) {
    assert.equal(results[k].product_id, '103');
    assert.equal(results[k].source, 'ai');
  }
  assert.equal(results.g1_2.role, 'main');
  assert.equal(results.g1_0.role, 'other');
  assert.equal(results.g1_0.flagged, false);

  const content = calls[0].messages[0].content;
  assert.ok(content.map((b) => b.text || '').join(' ').includes('Group key=g1 folder="Batch 14/Folder 7"'));
  assert.equal(content.filter((b) => b.type === 'image').length, 3);
  assert.ok(calls[0].output_config.format.schema.properties.results.items.properties.main_photo_key);
});

test('a refusal or a cut-off answer from the AI falls back to file names', async () => {
  for (const stop_reason of ['refusal', 'max_tokens']) {
    const { ai } = fakeClaude([], { stop_reason });
    const { results, aiProblem } = await matchFiles(files(['night lamp 2.jpg']), CATALOG, { ai });
    assert.equal(aiProblem, 'ai_failed');
    assert.equal(results.k0.product_id, '102');
  }
});

test('a file named main wins over the AI choice of main', async () => {
  const { ai } = fakeClaude([{ group_key: 'g1', product_id: 101, main_photo_key: 'g1_0', confidence: 0.9, reason: 'x' }]);
  const { results } = await matchGroups([group('g1', 'Money Box', ['IMG_1.jpg', 'main.jpg', 'IMG_2.jpg'])], CATALOG, { ai });

  assert.equal(results.g1_1.role, 'main');
  assert.equal(results.g1_0.role, 'other');
});

test('a folder the AI and name disagree on is flagged for every photo', async () => {
  const { ai } = fakeClaude([{ group_key: 'g1', product_id: 102, main_photo_key: null, confidence: 0.8, reason: 'x' }]);
  const { results } = await matchGroups([group('g1', 'Money Box', ['IMG_1.jpg', 'IMG_2.jpg'])], CATALOG, { ai });

  assert.equal(results.g1_0.flagged, true);
  assert.equal(results.g1_1.flagged, true);
  assert.equal(results.g1_0.product_id, results.g1_1.product_id);
});

test('an unknown folder leaves all its photos unmatched', async () => {
  const { results } = await matchGroups([group('g1', 'Zzz Unknown', ['a.jpg', 'b.jpg'])], CATALOG, NO_AI);
  assert.equal(results.g1_0.product_id, null);
  assert.equal(results.g1_1.product_id, null);
});

test('several folders in one request are decided separately', async () => {
  const { results } = await matchGroups(
    [group('g1', 'Root/Money Box', ['IMG_1.jpg', 'IMG_2.jpg']), group('g2', 'Root/Night Lamp', ['IMG_1.jpg', 'main.jpg'])],
    CATALOG,
    NO_AI
  );

  assert.equal(results.g1_0.product_id, '101');
  assert.equal(results.g2_0.product_id, '102');
  assert.equal(results.g1_0.role, 'main'); // first photo, nothing named main
  assert.equal(results.g2_1.role, 'main'); // the one named main
});
