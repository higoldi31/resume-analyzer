import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export interface ResumeAnalysis {
  atsScore: number;
  strengths: string[];
  weaknesses: string[];
  missingSections: string[];
  keywordAnalysis: {
    keyword: string;
    relevance: "High" | "Medium" | "Low";
  }[];
  suggestions: string[];
  roleMatch?: {
    matchPercentage: number;
    missingKeywords: string[];
    tailoredSuggestions: string[];
  };
}

export async function analyzeResume(resumeText: string, jobDescription?: string): Promise<ResumeAnalysis> {
  const prompt = jobDescription 
    ? `Analyze this resume in the context of the following job description.
       
       Resume:
       """${resumeText}"""
       
       Job Description:
       """${jobDescription}"""`
    : `Analyze this resume and provide an ATS-focused evaluation.
       
       Resume:
       """${resumeText}"""`;

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      systemInstruction: `You are an expert ATS (Applicant Tracking System) specialist and career coach. 
      Analyze the provided resume and return a JSON object with the following structure:
      {
        "atsScore": number (0-100),
        "strengths": string[],
        "weaknesses": string[],
        "missingSections": string[],
        "keywordAnalysis": [{"keyword": string, "relevance": "High" | "Medium" | "Low"}],
        "suggestions": string[],
        "roleMatch": { // Only if a job description was provided
          "matchPercentage": number (0-100),
          "missingKeywords": string[],
          "tailoredSuggestions": string[]
        }
      }
      Ensure the analysis is professional, constructive, and highly accurate for modern recruitment standards.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          atsScore: { type: Type.NUMBER },
          strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
          weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingSections: { type: Type.ARRAY, items: { type: Type.STRING } },
          keywordAnalysis: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                keyword: { type: Type.STRING },
                relevance: { type: Type.STRING, enum: ["High", "Medium", "Low"] }
              },
              required: ["keyword", "relevance"]
            }
          },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          roleMatch: {
            type: Type.OBJECT,
            properties: {
              matchPercentage: { type: Type.NUMBER },
              missingKeywords: { type: Type.ARRAY, items: { type: Type.STRING } },
              tailoredSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } }
            }
          }
        },
        required: ["atsScore", "strengths", "weaknesses", "missingSections", "keywordAnalysis", "suggestions"]
      }
    }
  });

  return JSON.parse(response.text);
}
