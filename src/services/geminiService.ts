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
    return HOSPITAL_DATABASE.slice(0, 5);
  }

  const prompt = `أنا أبحث عن مستشفيات مجهزة لذوي الهمم (المكفوفين أو الصم والبكم) في مصر.
  موقعي الحالي الدقيق هو: خط عرض ${lat}، خط طول ${lng}.
  
  المطلوب:
  1. استخدم أداة Google Maps للبحث حصرياً حول هذه الإحداثيات (خط عرض ${lat}، خط طول ${lng}) للعثور على أقرب 5 مستشفيات حقيقية.
  2. تأكد أن المستشفيات لديها خدمات مخصصة لذوي الإعاقة (مثل مترجمي لغة إشارة، مسارات للمكفوفين، أو وحدات تخاطب وسمعيات).
  3. رتب النتائج حسب المسافة الأقرب لموقعي الحالي (الأقرب فالأقرب).
  4. أرجع النتيجة بتنسيق JSON فقط كقائمة من الكائنات: [{"name": "...", "address": "...", "phone": "...", "services": ["...", "..."]}].
  
  ملاحظة: لا تقترح مستشفيات بعيدة في محافظات أخرى، التزم بالنطاق الجغرافي القريب من الإحداثيات المعطاة.`;
  
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        systemInstruction: `أنت مساعد طبي خبير في مصر. مهمتك هي العثور على أقرب مستشفيات للمستخدم بناءً على إحداثياته الجغرافية (${lat}, ${lng}). 
        يجب أن تستخدم أداة الخرائط للتحقق من المسافة الحقيقية. 
        إذا كان المستخدم في محافظة معينة (مثل سوهاج أو أسيوط)، لا تعرض له نتائج في القاهرة.`,
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
    
    const results = robustParseJSON(response.text || "[]");
    if (results && results.length > 0) {
      return results;
    }
    
    // If model returned empty or invalid, try to find something relevant in local DB
    // We'll try to get the governorate first for a better fallback
    const gov = await getGovernorateFromCoords(lat, lng);
    if (gov) {
      const localResults = HOSPITAL_DATABASE.filter(h => h.governorate === gov).slice(0, 5);
      if (localResults.length > 0) return localResults;
    }
    
    return HOSPITAL_DATABASE.slice(0, 5);
  } catch (e: any) {
    const errorStr = JSON.stringify(e);
    const isQuotaError = errorStr.includes("429") || errorStr.includes("RESOURCE_EXHAUSTED");
    
    if (isQuotaError) {
      isSearchQuotaExhausted = true;
      setTimeout(() => { isSearchQuotaExhausted = false; }, QUOTA_COOLDOWN);
    } else {
      console.error("Location Search Error:", e);
    }
    
    // Fallback to governorate-based local search
    try {
      const gov = await getGovernorateFromCoords(lat, lng);
      if (gov) {
        const localResults = HOSPITAL_DATABASE.filter(h => h.governorate === gov).slice(0, 5);
        if (localResults.length > 0) return localResults;
      }
    } catch (innerE) {}
    
    return HOSPITAL_DATABASE.slice(0, 5);
  }
}

export async function getGovernorateFromCoords(lat: number, lng: number): Promise<string | null> {
  const prompt = `أنا في الإحداثيات التالية: خط عرض ${lat}، خط طول ${lng}. ما هي المحافظة المصرية التي أتواجد فيها الآن؟ 
  أجب باسم المحافظة فقط (مثلاً: القاهرة، الجيزة، الإسكندرية، سوهاج، المنيا...).`;
  
  try {
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: lat, longitude: lng }
          }
        }
      }
    });
    
    const text = response.text?.trim() || "";
    // Clean up the response to get just the governorate name
    for (const gov of ["القاهرة", "الجيزة", "الإسكندرية", "الدقهلية", "البحر الأحمر", "البحيرة", "الفيوم", "الغربية", "الإسماعيلية", "المنوفية", "المنيا", "القليوبية", "الوادي الجديد", "السويس", "الشرقية", "دمياط", "بورسعيد", "جنوب سيناء", "كفر الشيخ", "مطروح", "الأقصر", "قنا", "شمال سيناء", "سوهاج", "بني سويف", "أسيوط", "أسوان"]) {
      if (text.includes(gov)) return gov;
    }
    return null;
  } catch (e) {
    console.error("Reverse Geocoding Error:", e);
    return null;
  }
}

