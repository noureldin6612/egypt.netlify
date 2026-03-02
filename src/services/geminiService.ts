import { GoogleGenAI } from "@google/genai";
import { HOSPITAL_DATABASE } from "../data/hospitals";

let aiInstance: GoogleGenAI | null = null;

function getAI() {
  if (!aiInstance) {
    // Try platform-specific process.env first, then Vite-specific import.meta.env
    const apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) 
                  || (import.meta as any).env?.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please set it in your environment variables (as GEMINI_API_KEY or VITE_GEMINI_API_KEY).");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

/**
 * Robustly parses JSON from a string, handling potential markdown blocks and trailing commas.
 */
function robustParseJSON(text: string) {
  try {
    let cleanText = text.trim();
    // Remove markdown code blocks if present
    if (cleanText.includes("```")) {
      const match = cleanText.match(/```(?:json)?([\s\S]*?)```/);
      if (match) cleanText = match[1].trim();
    }
    
    // Replace Arabic commas with standard commas
    cleanText = cleanText.replace(/،/g, ',');
    
    // Replace smart quotes with standard quotes
    cleanText = cleanText.replace(/[“”]/g, '"');
    
    // Remove potential trailing commas in arrays/objects which JSON.parse doesn't like
    cleanText = cleanText.replace(/,\s*([\]}])/g, '$1');
    
    return JSON.parse(cleanText);
  } catch (e) {
    console.error("Failed to parse JSON:", e, "Original text:", text);
    return [];
  }
}

let isSearchQuotaExhausted = false;
const QUOTA_COOLDOWN = 60000; // 1 minute

export async function getHospitalsNearMe(lat: number, lng: number) {
  if (isSearchQuotaExhausted) {
    return HOSPITAL_DATABASE.slice(0, 3);
  }

  const prompt = `أنا حالياً في الموقع الجغرافي ذو الإحداثيات (خط العرض: ${lat}، خط الطول: ${lng}). 
  ابحث لي عن أقرب 5 مستشفيات حقيقية وموثوقة في مصر تكون مجهزة لاستقبال ذوي الإعاقة (المكفوفين أو الصم والبكم).
  يجب أن تكون النتائج مرتبة حسب الأقرب لموقعي الحالي.
  أريد النتيجة بتنسيق JSON كقائمة من الكائنات تحتوي على: name, address, phone, services (array of strings).
  تأكد من أن العناوين دقيقة وأرقام الهواتف صحيحة وتعمل.`;
  
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: {
              latitude: lat,
              longitude: lng
            }
          }
        }
      }
    });
    return robustParseJSON(response.text || "[]");
  } catch (e: any) {
    const errorStr = JSON.stringify(e);
    const isQuotaError = errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED");
    
    if (isQuotaError) {
      isSearchQuotaExhausted = true;
      setTimeout(() => { isSearchQuotaExhausted = false; }, QUOTA_COOLDOWN);
      return HOSPITAL_DATABASE.slice(0, 3);
    } else {
      console.error("Location Search Error:", e);
    }
    return HOSPITAL_DATABASE.slice(0, 3); // Fallback to local data on error
  }
}

