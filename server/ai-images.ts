/**
 * AI Image Generation for product photos.
 * Uses OpenAI gpt-image-1 image edit API to produce:
 *  1. A clean product-on-white-background shot
 *  2. A model/body shot showing how the product looks when worn
 */

// Body placement map: subcategory → prompt for the model shot
const BODY_PLACEMENT: Record<string, string> = {
  // Jewellery - Earrings
  "Studs": "close-up of a beautiful Indian woman's ear with the earring, white background, professional studio lighting",
  "Danglers": "close-up of a beautiful Indian woman's ear wearing the earring, white background, professional studio lighting",
  "Hoops": "close-up of a beautiful Indian woman's ear with the hoop earring, white background, professional studio lighting",
  "Jhumkas": "beautiful Indian woman wearing the jhumka earring, white background, professional studio lighting",
  "Chandbalis": "beautiful Indian woman wearing the chandbali earring, white background, professional studio lighting",
  // Jewellery - Necklaces
  "Necklaces": "beautiful Indian woman's neck and décolletage with the necklace, white background, professional studio lighting",
  "Chokers": "beautiful Indian woman's neck with the choker necklace, white background, professional studio lighting",
  "Layered Sets": "beautiful Indian woman wearing the layered necklace set, white background, professional studio lighting",
  "Mangalsutra": "beautiful Indian woman wearing the mangalsutra necklace, white background, professional studio lighting",
  // Jewellery - Bangles & Bracelets
  "Bangles": "beautiful Indian woman's wrist with the bangles, white background, professional studio lighting",
  "Bracelets": "close-up of a beautiful Indian woman's wrist with the bracelet, white background, professional studio lighting",
  "Kada": "beautiful Indian woman's wrist with the kada, white background, professional studio lighting",
  // Jewellery - Rings
  "Rings": "close-up of a beautiful Indian woman's hand with the ring on her finger, white background, professional studio lighting",
  "Thumb Rings": "close-up of a beautiful Indian woman's hand with the ring on her thumb, white background, professional studio lighting",
  "Midi Rings": "close-up of a beautiful Indian woman's fingers with midi rings, white background, professional studio lighting",
  // Jewellery - Sets & Others
  "Jewellery Sets": "beautiful Indian woman wearing the complete jewellery set with necklace and earrings, white background, professional studio lighting",
  "Maang Tikka": "beautiful Indian woman wearing the maang tikka on her forehead, white background, professional studio lighting",
  "Nose Pins": "close-up of a beautiful Indian woman's face with the nose pin, white background, professional studio lighting",
  "Anklets": "beautiful Indian woman's feet and ankles with the anklets (payal), white background, professional studio lighting",
  "Brooches": "beautiful Indian woman's outfit with the brooch pinned, white background, professional studio lighting",
  // Cosmetics
  "Lip Colour": "close-up of beautiful Indian woman's lips wearing the lip colour, white background, professional studio lighting",
  "Foundation": "beautiful Indian woman's face with the foundation applied, white background, professional studio lighting",
  "Blush": "beautiful Indian woman's cheeks with the blush applied, white background, professional studio lighting",
  "Eyeshadow": "close-up of beautiful Indian woman's eyes with the eyeshadow look, white background, professional studio lighting",
  "Kajal": "close-up of beautiful Indian woman's eyes with kajal applied, white background, professional studio lighting",
  "Mascara": "close-up of beautiful Indian woman's lashes with mascara, white background, professional studio lighting",
  // Handbags
  "Tote Bags": "beautiful Indian woman carrying the tote bag on her shoulder, white background, professional studio lighting",
  "Sling Bags": "beautiful Indian woman wearing the sling bag crossbody, white background, professional studio lighting",
  "Clutches": "beautiful Indian woman holding the clutch in her hand, white background, professional studio lighting",
  "Potli Bags": "beautiful Indian woman holding the potli bag in her hand, white background, professional studio lighting",
  "Backpacks": "beautiful Indian woman wearing the backpack, white background, professional studio lighting",
  // Accessories
  "Sunglasses": "beautiful Indian woman wearing the sunglasses, white background, professional studio lighting",
  "Scarves": "beautiful Indian woman wearing the scarf around her neck, white background, professional studio lighting",
  "Watches": "close-up of a beautiful Indian woman's wrist with the watch, white background, professional studio lighting",
  "Belts": "beautiful Indian woman wearing the belt around her waist, white background, professional studio lighting",
  "Hair Accessories": "beautiful Indian woman with the hair accessory in her hair, white background, professional studio lighting",
};

// How the product should be displayed in the "product shot" (stand / box / bust)
// per jewellery & accessory presentation standards. Keyed by subcategory.
const PRODUCT_DISPLAY: Record<string, string> = {
  // Jewellery - Earrings
  "Studs": "displayed on an elegant earring display stand",
  "Danglers": "hanging on an elegant earring display stand",
  "Hoops": "hanging on an elegant earring display stand",
  "Jhumkas": "hanging on an elegant earring display stand",
  "Chandbalis": "hanging on an elegant earring display stand",
  "Earrings": "displayed on an elegant earring display stand",
  // Jewellery - Necklaces
  "Necklaces": "displayed on a velvet necklace bust display",
  "Chokers": "displayed on a velvet necklace bust display",
  "Layered Sets": "displayed on a velvet necklace bust display",
  "Mangalsutra": "displayed on a velvet necklace bust display",
  // Jewellery - Bangles & Bracelets
  "Bangles": "displayed on a bangle holder stand",
  "Bracelets": "displayed on a velvet bracelet display ramp",
  "Kada": "displayed on a bangle holder stand",
  // Jewellery - Rings
  "Rings": "displayed on an elegant ring display stand",
  "Thumb Rings": "displayed on an elegant ring display stand",
  "Midi Rings": "displayed on an elegant ring display stand",
  // Jewellery - Sets & Others
  "Jewellery Sets": "arranged elegantly in an open jewellery box",
  "Maang Tikka": "displayed on a velvet jewellery display",
  "Nose Pins": "displayed on a small velvet jewellery display",
  "Anklets": "displayed on a velvet jewellery display ramp",
  "Brooches": "displayed on a velvet jewellery pad",
  // Cosmetics
  "Lip Colour": "standing upright on a clean reflective surface",
  "Foundation": "standing upright on a clean reflective surface",
  "Fragrance": "standing upright on a clean reflective surface",
  // Handbags
  "Tote Bags": "displayed standing on a clean surface",
  "Clutches": "displayed standing on a clean surface",
  "Sling Bags": "displayed standing on a clean surface",
  // Accessories
  "Watches": "displayed on a watch display stand",
  "Sunglasses": "displayed on a clean surface",
};

const PRESERVE = "CRITICAL: keep the product EXACTLY as it appears in the reference image — same design, shape, colour, gemstones/stones, metal tone, finish, pattern, text, engraving, and every single detail. Do NOT redesign, restyle, recolour, simplify, or invent a different product. Do NOT change the product itself in any way. Only the background and environmental presentation may change.";

function getModelPrompt(subcategory: string, productName: string): string {
  const base = BODY_PLACEMENT[subcategory] || `beautiful Indian woman with the ${productName}, white background, professional studio lighting`;
  return `Photorealistic fashion photograph: ${base}. ${PRESERVE} The product must look identical to the reference. High quality fashion photography.`;
}

function getProductPrompt(subcategory: string, productName: string): string {
  const display = PRODUCT_DISPLAY[subcategory] || "displayed on an elegant display stand";
  return `Professional e-commerce product photograph of the ${productName} ${display}, on a clean soft neutral background. Studio lighting, sharp focus, premium luxury catalogue look, product centered and filling most of the frame. ${PRESERVE}`;
}

async function callOpenAIImageEdit(imageBase64: string, prompt: string): Promise<{ b64: string | null; error?: string }> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return { b64: null, error: "OPENAI_API_KEY not set" };

  try {
    const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const imageBuffer = Buffer.from(base64Data, "base64");

    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: "image/png" });
    formData.append("image", blob, "product.png");
    formData.append("prompt", prompt);
    formData.append("model", "gpt-image-1");
    formData.append("n", "1");
    formData.append("size", "1024x1024");

    const res = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      const msg = err?.error?.message || `OpenAI error ${res.status}`;
      console.error("[AI Images] OpenAI error:", err);
      return { b64: null, error: msg };
    }

    const data = await res.json() as { data: { b64_json?: string }[] };
    return { b64: data.data[0]?.b64_json || null };
  } catch (err) {
    console.error("[AI Images] Error calling OpenAI:", err);
    return { b64: null, error: String(err) };
  }
}

export function isAIImagesConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function generateProductImages(
  imageBase64: string,
  _mimeType: string,
  category: string,
  subcategory: string,
  productName: string
): Promise<{ productShot: string | null; modelShot: string | null; error?: string }> {
  const [productResult, modelResult] = await Promise.all([
    callOpenAIImageEdit(imageBase64, getProductPrompt(subcategory, productName)),
    callOpenAIImageEdit(imageBase64, getModelPrompt(subcategory, productName)),
  ]);
  return {
    productShot: productResult.b64,
    modelShot: modelResult.b64,
    error: productResult.error || modelResult.error,
  };
}
