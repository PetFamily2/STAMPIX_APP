
import { GoogleGenAI } from "@google/genai";

export async function generateMarketingMessage(businessName: string, reward: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `אתה עוזר שיווקי לאפליקציית כרטיסי נאמנות בשם STAMPIX. 
  כתוב הודעת הצטרפות קצרה ומזמינה בעברית עבור העסק "${businessName}". 
  הלקוח הרגע הצטרף למועדון והפרס הוא "${reward}".
  השתמש באימוג'ים מתאימים והיה לבבי וקצר.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "ברוכים הבאים למועדון שלנו! מחכים לכם עם הטבות שוות 🎁";
  }
}

export async function generateWinBackMessage(customerName: string, businessName: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `אתה עוזר שיווקי חכם. כתוב הודעת SMS קצרה ומרגשת בעברית ללקוח בשם "${customerName}" שלא ביקר בעסק "${businessName}" הרבה זמן.
  המטרה היא להחזיר אותו. הצעה: "קפה חינם בביקור הבא" או "פינוק על חשבון הבית".
  היה אישי, חם, והשתמש באימוג'י אחד או שניים. מקסימום 20 מילים.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return `היי ${customerName}, התגעגענו אליך ב-${businessName}! מחכה לך פינוק בביקור הבא 🎁`;
  }
}

export async function suggestRewardNames(businessType: string) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `תן לי 3 רעיונות קצרים וקליטים להטבות נאמנות לעסק מסוג "${businessType}". 
  לדוגמה: "קפה שישי חינם" או "10% הנחה על הקנייה הבאה". 
  החזר רק את השמות כרשימה מופרדת בפסיקים.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "קפה חינם, 10% הנחה, קינוח במתנה";
  }
}

export async function createPromoVideo(prompt: string, onProgress: (status: string) => void) {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    onProgress("מתחילים בתהליך היצירה...");
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '9:16'
      }
    });

    const statusMessages = [
      "מנתח את הקונספט...",
      "מפיק פריימים באיכות גבוהה...",
      "מעבד את התנועה...",
      "מוסיף נגיעות אחרונות...",
      "הווידאו כמעט מוכן..."
    ];
    let msgIndex = 0;

    while (!operation.done) {
      onProgress(statusMessages[msgIndex % statusMessages.length]);
      msgIndex++;
      await new Promise(resolve => setTimeout(resolve, 10000));
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (!downloadLink) throw new Error("Video generation failed - no URI");
    
    const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error("Video Generation Error:", error);
    throw error;
  }
}
