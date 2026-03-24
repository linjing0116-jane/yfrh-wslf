import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const extractArticleInfo = async (url: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `请分析以下媒体报道的URL内容，并提取相关信息：${url}。
    请务必根据链接中的实际内容进行分析，不要凭空想象。
    如果是视频，请注明。
    请返回JSON格式，包含：title (标题), summary (100字以内的摘要), type (text, image-text, media-draft, video), category (disease, vaccine, video, shingles-month, other), source (媒体来源), publishDate (发布日期 YYYY-MM-DD)。`,
    config: {
      tools: [{ urlContext: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          summary: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["text", "image-text", "media-draft", "video"] },
          category: { type: Type.STRING, enum: ["disease", "vaccine", "video", "shingles-month", "other"] },
          source: { type: Type.STRING },
          publishDate: { type: Type.STRING }
        },
        required: ["title", "summary", "type", "category", "source", "publishDate"]
      }
    }
  });

  return JSON.parse(response.text);
};
