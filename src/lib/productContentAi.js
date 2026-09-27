// src/lib/productContentAi.js
//
// Drafts the product_content fields (Features/Highlights/Key Features/
// Ideal For/Why You'll Love It/Specifications - see product-content-
// schema.sql) from a product's name/CRM description/category, using
// Claude. This only ever returns a draft for the admin UI to fill the
// existing form with - nothing here writes to the database directly, and
// nothing goes live until an admin reviews it and clicks the existing
// Save button (same PUT /api/product-content/[productId] every manual
// edit already goes through).
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.PRODUCT_CONTENT_AI_MODEL || 'claude-sonnet-5';

const TOOL_SCHEMA = {
  name: 'draft_product_content',
  description: 'Draft structured product detail page content for an e-commerce listing.',
  input_schema: {
    type: 'object',
    properties: {
      features: {
        type: 'array',
        items: { type: 'string' },
        description: 'Short bullet points shown right under the price. 2-5 items, each under 15 words.',
      },
      highlights: {
        type: 'array',
        items: { type: 'string' },
        description: 'A second, shorter set of standout points shown further down the page. 2-4 items, each under 12 words.',
      },
      keyFeatures: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Short feature name, 2-4 words.' },
            desc: { type: 'string', description: 'One sentence expanding on the feature.' },
          },
          required: ['title', 'desc'],
        },
        description: 'Boxed feature cards shown in the description tab. 2-4 items.',
      },
      idealFor: {
        type: 'string',
        description: 'One sentence describing who this product suits best.',
      },
      loveIt: {
        type: 'array',
        items: { type: 'string' },
        description: 'Very short pill-style phrases (3-6 words each), 3-5 items.',
      },
      specifications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            value: { type: 'string' },
          },
          required: ['label', 'value'],
        },
        description:
          'Label/value spec rows. Only include specs that are reasonably inferable from the product name/description/category (e.g. "Type", "Recommended For") - never invent precise numbers (exact dimensions, weight, materials, certifications) that were not in the source text.',
      },
    },
    required: ['features', 'highlights', 'keyFeatures', 'idealFor', 'loveIt', 'specifications'],
  },
};

export async function draftProductContent({ name, description, category, subcategory, price }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set - see .env.local');

  const client = new Anthropic({ apiKey });

  const contextLines = [
    `Product name: ${name}`,
    category ? `Category: ${category}${subcategory ? ` / ${subcategory}` : ''}` : null,
    price != null ? `Price: Rs. ${price}` : null,
    description ? `Existing CRM description: ${description}` : 'Existing CRM description: (none provided)',
  ].filter(Boolean);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system:
      'You write concise, honest e-commerce product page copy for ShopQ, a Sri Lankan online store. ' +
      'Base every claim on the product name, category, and description given - never invent specific ' +
      'technical facts (exact materials, certifications, warranty terms, precise measurements) that are ' +
      "not present in what you were given. When unsure, write more general, still-true statements " +
      "instead of guessing specifics. This is a first draft an admin will review and edit before it's " +
      'published, not final copy.',
    messages: [{ role: 'user', content: contextLines.join('\n') }],
    tools: [TOOL_SCHEMA],
    tool_choice: { type: 'tool', name: 'draft_product_content' },
  });

  const toolUse = message.content.find((block) => block.type === 'tool_use');
  if (!toolUse) throw new Error('Model did not return structured content');

  const draft = toolUse.input;
  return {
    features: Array.isArray(draft.features) ? draft.features.filter(Boolean) : [],
    highlights: Array.isArray(draft.highlights) ? draft.highlights.filter(Boolean) : [],
    keyFeatures: Array.isArray(draft.keyFeatures) ? draft.keyFeatures.filter((f) => f?.title) : [],
    idealFor: typeof draft.idealFor === 'string' ? draft.idealFor : '',
    loveIt: Array.isArray(draft.loveIt) ? draft.loveIt.filter(Boolean) : [],
    specifications: Array.isArray(draft.specifications) ? draft.specifications.filter((s) => s?.label) : [],
  };
}
