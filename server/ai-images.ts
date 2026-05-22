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

function getModelPrompt(subcategory: string, productName: string): string {
  const base = BODY_PLACEMENT[subcategory] || `beautiful Indian woman with the ${productName}, white background, professional studio lighting`;
  return `Photorealistic image: ${base}. The product should be clearly visible and look exactly like the reference. High quality fashion photography.`;
}

function getProductPrompt(productName: string): string {
  return `Professional product photography of the ${productName} on a pure white background. Studio lighting, sharp focus, no shadows, clean minimal look. The product should be centered and fill most of the frame. High quality e-commerce product shot.`;
}

async function callOpenAIImageEdit(imageBase64: string, mimeType: string, prompt: string): Promise<string | null> {
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_API_KEY) return null;

  try {
    // Strip data URL prefix if present
    const base64Data = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
    const imageBuffer = Buffer.from(base64Data, "base64");

    const formData = new FormData();
    const blob = new Blob([imageBuffer], { type: mimeType || "image/jpeg" });
    formData.append("image", blob, "product.jpg");
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
      const err = await res.json().catch(() => ({}));
      console.error("[AI Images] OpenAI error:", err);
      return null;
    }

    const data = await res.json() as { data: { b64_json?: string; url?: string }[] };
    return data.data[0]?.b64_json || null;
  } catch (err) {
    console.error("[AI Images] Error calling OpenAI:", err);
    return null;
  }
}

export function isAIImagesConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export async function generateProductImages(
  imageBase64: string,
  mimeType: string,
  category: string,
  subcategory: string,
  productName: string
): Promise<{ productShot: string | null; modelShot: string | null }> {
  const [productShot, modelShot] = await Promise.all([
    callOpenAIImageEdit(imageBase64, mimeType, getProductPrompt(productName)),
    callOpenAIImageEdit(imageBase64, mimeType, getModelPrompt(subcategory, productName)),
  ]);
  return { productShot, modelShot };
}
