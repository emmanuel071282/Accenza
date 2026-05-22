/**
 * ACCENZA AI Beauty & Style Advisor — conversational assistant for
 * jewellery, cosmetics, handbags, and accessories.
 */

import type { Product, StylistConversation } from "@shared/schema";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const SITE_URL = process.env.SITE_URL || "https://accenza.in";

export function isAIStylistConfigured(): boolean {
  return !!OPENAI_API_KEY && OPENAI_API_KEY.length > 10;
}

const SYSTEM_PROMPT = `You are ACCENZA's AI Beauty & Style Advisor — a friendly expert in jewellery, cosmetics, handbags, and accessories.

PERSONALITY:
- Warm, knowledgeable, and elegant — like a trusted beauty consultant
- Use casual Indian English (professional yet friendly)
- Keep messages concise (WhatsApp format)
- Use emojis naturally 💎✨💄👜

CATEGORIES YOU COVER:
- Jewellery: Earrings, necklaces, bangles, rings, sets
- Cosmetics: Makeup, skincare, haircare, fragrances
- Handbags: Tote bags, clutches, sling bags, potli bags
- Accessories: Scarves, sunglasses, hairbands, watches

CAPABILITIES:
- Suggest complete looks (jewellery + bag + accessories) for any occasion
- Recommend cosmetics for skin tone, occasion, or season
- Work within customer's budget
- Know Indian occasions — weddings, festivals, office, casual, parties

RULES:
1. ALWAYS ask for: occasion, budget — if not provided
2. NEVER make up products. ONLY recommend from the CATALOG provided
3. When recommending, format EXACTLY like this for each product:
   *[Product Name]* — ₹[price]
   ${((): string => "")()}🔗 ${SITE_URL}/product/[id]
4. Group as "LOOK 1", "LOOK 2" etc.
5. Show total look price
6. Maximum 2-3 looks per response
7. Ask follow-up: "Want to see more options?" or "Shall I suggest a different style?"

CONVERSATION FLOW:
- First message: Warm greeting, ask what they're looking for
- Gathering info: Ask occasion and budget
- Recommendation: Show 2-3 curated looks with links
- Follow-up: Refine based on feedback`;

function buildCatalogContext(products: Product[]): string {
  if (products.length === 0) return "CATALOG: No products available currently.";

  const lines = products.map(
    (p) =>
      `ID:${p.id} | ${p.name} | ₹${p.price} | ${p.category}/${p.subcategory} | Sizes: ${(p.sizes || []).join(", ") || "Free Size"}`
  );
  return `CATALOG (${products.length} products):\n${lines.join("\n")}`;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callOpenAI(messages: ChatMessage[]): Promise<string> {
  if (!OPENAI_API_KEY) {
    return "I'm having a technical issue right now. Please try again in a few minutes! 🙏";
  }

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        max_tokens: 800,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[AI Advisor] OpenAI error ${res.status}:`, errText);
      return "Oops, I'm having trouble right now! Try again in a moment 🙏";
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
  } catch (err) {
    console.error("[AI Advisor] OpenAI call failed:", err);
    return "Something went wrong on my end. Please try again! 🙏";
  }
}

function extractProductIds(response: string, products: Product[]): number[] {
  const ids: number[] = [];
  for (const p of products) {
    if (response.includes(`/product/${p.id}`)) {
      ids.push(p.id);
    }
  }
  return ids;
}

export async function processStylistMessage(
  mobile: string,
  userMessage: string,
  conversationHistory: StylistConversation[],
  products: Product[]
): Promise<{ reply: string; productIds: number[] }> {
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT + "\n\n" + buildCatalogContext(products),
    },
  ];

  const recentHistory = conversationHistory.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.message,
    });
  }

  messages.push({ role: "user", content: userMessage });

  const reply = await callOpenAI(messages);
  const productIds = extractProductIds(reply, products);

  return { reply, productIds };
}

export function getDemoResponse(userMessage: string): string {
  const lower = userMessage.toLowerCase();

  if (lower.includes("hi") || lower.includes("hello") || lower.includes("hey")) {
    return (
      `Hey there! 👋 Welcome to *ACCENZA Style Studio* ✨\n\n` +
      `I'm your personal Beauty & Style Advisor. Tell me:\n` +
      `1️⃣ What's the occasion?\n` +
      `2️⃣ What are you looking for? (Jewellery/Cosmetics/Handbags/Accessories)\n` +
      `3️⃣ What's your budget?\n\n` +
      `For example: "Need jewellery for a wedding under ₹3000" 💎`
    );
  }

  return (
    `Thanks for your message! 🙏\n\n` +
    `Our AI Advisor is being set up. In the meantime, browse our collection at ${SITE_URL}\n\n` +
    `We'll be live with personalized recommendations soon! ✨`
  );
}
