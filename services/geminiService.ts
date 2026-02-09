
import { GoogleGenAI, Type, Modality, GenerateContentResponse } from "@google/genai";
import { AnalysisResult, MeetingContext, ThinkingLevel, GPTMessage } from "../types";

const THINKING_LEVEL_MAP: Record<ThinkingLevel, number> = {
  'Minimal': 0,
  'Low': 4000,
  'Medium': 16000,
  'High': 32768
};

/**
 * Robustly parses JSON from a string, handling markdown wrappers, prefix/suffix text,
 * and the specific 'Unexpected non-whitespace character after JSON' error.
 */
function safeJsonParse(str: string) {
  let trimmed = str.trim();
  if (!trimmed) return {};

  const tryParse = (input: string) => {
    try {
      return JSON.parse(input);
    } catch (e: any) {
      const posMatch = e.message.match(/at position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1], 10);
        try {
          return JSON.parse(input.substring(0, pos));
        } catch (innerE) {
          return null;
        }
      }
      return null;
    }
  };

  let result = tryParse(trimmed);
  if (result) return result;

  if (trimmed.includes("```")) {
    const clean = trimmed.replace(/```(?:json)?([\s\S]*?)```/g, '$1').trim();
    result = tryParse(clean);
    if (result) return result;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    result = tryParse(trimmed.substring(firstBrace, lastBrace + 1));
    if (result) return result;
  }

  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    result = tryParse(trimmed.substring(firstBracket, lastBracket + 1));
    if (result) return result;
  }

  const match = trimmed.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (match) {
    result = tryParse(match[0]);
    if (result) return result;
  }

  throw new Error("Failed to parse cognitive intelligence response as valid JSON.");
}

// Fix: Use 'gemini-2.5-flash-image' for vision-capable OCR tasks and instantiate inside function
export async function performVisionOcr(base64Data: string, mimeType: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-2.5-flash-image'; 
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [
          { inlineData: { data: base64Data, mimeType: mimeType } },
          { 
            text: `Act as a high-precision Cognitive OCR engine. 
            TRANSCRIPTION TASK: Extract ALL text from this image exactly as written. Maintain layout. Output ONLY text.` 
          },
        ],
      },
    });
    return response.text || "";
  } catch (error) {
    console.error("Vision OCR failed:", error);
    return "";
  }
}

/**
 * Converts internal GPTMessage history to Gemini Content format.
 */
function formatHistory(history: GPTMessage[]) {
  return history.map(msg => ({
    role: msg.role === 'user' ? 'user' : 'model',
    parts: [{ text: msg.content }]
  }));
}

// Sales GPT: Fast Standard Chat with History and Context
export async function* streamSalesGPT(prompt: string, history: GPTMessage[], context?: string): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview';
  
  const contents = [
    ...formatHistory(history),
    { role: 'user', parts: [{ text: prompt }] }
  ];

  const systemInstruction = `You are Sales GPT, an elite sales intelligence agent. 
  ${context ? `GROUNDING DATA PROVIDED: Below is the content of the relevant documents. 
  PRIORITIZE using this information to answer user queries. If the answer is contained in the documents, cite the document name or section if possible.
  
  --- DOCUMENT CONTEXT ---
  ${context}
  -----------------------` : ""}
  
  Be concise, authoritative, and strategic. If asked something unrelated to the documents, you may answer using your general knowledge but clearly state if the information was not found in the provided files.`;

  try {
    const result = await ai.models.generateContentStream({
      model: modelName,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });

    for await (const chunk of result) {
      yield chunk.text || "";
    }
  } catch (error) {
    console.error("GPT stream failed:", error);
    yield "Error: Failed to connect to Sales GPT core.";
  }
}

// Pineapple: Image Generation
export async function generatePineappleImage(prompt: string): Promise<string | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-2.5-flash-image';
  try {
    const strategicPrompt = `Create a high-fidelity, enterprise-grade strategic visual asset for: "${prompt}". 
    The style should be a modern 3D render, minimalist, with soft cinematic lighting and a professional color palette. 
    Avoid cluttered details. Ensure it looks like a slide from a top-tier executive presentation.`;

    const response = await ai.models.generateContent({
      model: modelName,
      contents: {
        parts: [{ text: strategicPrompt }],
      },
      config: {
        imageConfig: { aspectRatio: "16:9" }
      }
    });

    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return `data:image/png;base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Image generation failed:", error);
    return null;
  }
}

// Deep Study: Heavy Reasoning with History and Context
export async function* streamDeepStudy(prompt: string, history: GPTMessage[], context?: string): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  
  const contents = [
    ...formatHistory(history),
    { role: 'user', parts: [{ text: prompt }] }
  ];

  const systemInstruction = `You are a world-class Strategic Research Lead. 
  TASK: Conduct an exhaustive Deep Study on the provided topic, synthesizing multiple data points from the grounded context.
  
  STYLE: Thorough, professional, academic but accessible. 
  
  ${context ? `--- GROUNDED DOCUMENT CONTEXT ---
  ${context}
  -----------------------` : ""}
  
  Always leverage the thinking budget to find non-obvious connections.`;

  try {
    const result = await ai.models.generateContentStream({
      model: modelName,
      contents: contents,
      config: {
        systemInstruction: systemInstruction,
        thinkingConfig: { thinkingBudget: 32768 }
      }
    });

    for await (const chunk of result) {
      yield chunk.text || "";
    }
  } catch (error) {
    console.error("Deep Study failed:", error);
    yield "Error: Deep Study reasoning module is unresponsive.";
  }
}

export interface CognitiveSearchResult {
  answer: string;
  briefExplanation: string;
  articularSoundbite: string; 
  psychologicalProjection: {
    buyerFear: string;
    buyerIncentive: string;
    strategicLever: string;
  };
  citations: { snippet: string; source: string }[];
  reasoningChain: {
    painPoint: string;
    capability: string;
    strategicValue: string;
  };
}

export async function* performCognitiveSearchStream(
  question: string, 
  filesContent: string, 
  context: MeetingContext
): AsyncGenerator<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  const styleDirectives = context.answerStyles.map(style => `- Create a section exactly titled "### ${style}" and provide EXHAUSTIVE, multi-paragraph detail.`).join('\n');

  // Explicit responseSchema for structured search output
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      articularSoundbite: { type: Type.STRING },
      briefExplanation: { type: Type.STRING },
      answer: { type: Type.STRING },
      psychologicalProjection: {
        type: Type.OBJECT,
        properties: {
          buyerFear: { type: Type.STRING },
          buyerIncentive: { type: Type.STRING },
          strategicLever: { type: Type.STRING }
        },
        required: ["buyerFear", "buyerIncentive", "strategicLever"]
      },
      citations: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            snippet: { type: Type.STRING },
            source: { type: Type.STRING }
          },
          required: ["snippet", "source"]
        }
      },
      reasoningChain: {
        type: Type.OBJECT,
        properties: {
          painPoint: { type: Type.STRING },
          capability: { type: Type.STRING },
          strategicValue: { type: Type.STRING }
        },
        required: ["painPoint", "capability", "strategicValue"]
      }
    },
    required: ["articularSoundbite", "briefExplanation", "answer", "psychologicalProjection", "citations", "reasoningChain"]
  };

  const prompt = `TASK: Synthesize a maximum-depth response to: "${question}". 
  REQUIRED STRUCTURE:
  ${styleDirectives}

  SOURCE DOCUMENTS:
  ${filesContent}`;

  try {
    const result = await ai.models.generateContentStream({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: `You are a world-class Senior Cognitive Sales Strategist. Produce technical rigor and exhaustive depth.`,
        responseMimeType: "application/json",
        responseSchema,
        thinkingConfig: { thinkingBudget: 32768 }
      }
    });

    for await (const chunk of result) {
      yield chunk.text || "";
    }
  } catch (error) {
    console.error("Streaming search failed:", error);
    throw new Error("Cognitive Engine failed to synthesize deep reasoning.");
  }
}

export async function performCognitiveSearch(
  question: string, 
  filesContent: string, 
  context: MeetingContext
): Promise<CognitiveSearchResult> {
  const stream = performCognitiveSearchStream(question, filesContent, context);
  let fullText = "";
  for await (const chunk of stream) {
    fullText += chunk;
  }
  return safeJsonParse(fullText || "{}");
}

// Fix: Adding responseSchema to dynamic suggestions for improved output stability
export async function generateDynamicSuggestions(filesContent: string, context: MeetingContext): Promise<string[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-flash-preview';
  const prompt = `Suggest 3 highly strategic sales questions for ${context.clientCompany || 'the prospect'}. Return as a JSON array of strings.`;
  const response = await ai.models.generateContent({ 
    model: modelName, 
    contents: prompt, 
    config: { 
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      },
      thinkingConfig: { thinkingBudget: 0 }
    } 
  });
  return safeJsonParse(response.text || "[]");
}

export function decode(base64: string) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
}

export async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
  }
  return buffer;
}

export async function generateExplanation(question: string, context: AnalysisResult): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Explain the deep sales strategy behind: "${question}" based on the buyer snapshot: ${JSON.stringify(context.snapshot)}.`,
    config: { thinkingConfig: { thinkingBudget: 0 } }
  });
  return response.text || "";
}

export async function generatePitchAudio(text: string, voiceName: string = 'Kore'): Promise<Uint8Array | null> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName } } },
    },
  });
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  return base64Audio ? decode(base64Audio) : null;
}

export async function analyzeSalesContext(filesContent: string, context: MeetingContext): Promise<AnalysisResult> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const modelName = 'gemini-3-pro-preview';
  const citationSchema = {
    type: Type.OBJECT,
    properties: { snippet: { type: Type.STRING }, sourceFile: { type: Type.STRING } },
    required: ["snippet", "sourceFile"],
  };

  const competitorSchema = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING },
      overview: { type: Type.STRING },
      threatProfile: { type: Type.STRING },
      strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
      weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
      opportunities: { type: Type.ARRAY, items: { type: Type.STRING } },
      threats: { type: Type.ARRAY, items: { type: Type.STRING } },
      ourWedge: { type: Type.STRING },
      citation: citationSchema
    },
    required: ["name", "overview", "threatProfile", "strengths", "weaknesses", "opportunities", "threats", "ourWedge", "citation"]
  };

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      snapshot: {
        type: Type.OBJECT,
        properties: {
          role: { type: Type.STRING },
          roleCitation: citationSchema,
          priorities: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, citation: citationSchema }, required: ["text", "citation"] } },
          likelyObjections: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, citation: citationSchema }, required: ["text", "citation"] } },
          decisionStyle: { type: Type.STRING },
          decisionStyleCitation: citationSchema,
          riskTolerance: { type: Type.STRING },
          riskToleranceCitation: citationSchema,
          tone: { type: Type.STRING },
          metrics: {
            type: Type.OBJECT,
            properties: {
              riskToleranceValue: { type: Type.NUMBER },
              strategicPriorityFocus: { type: Type.NUMBER },
              analyticalDepth: { type: Type.NUMBER },
              directness: { type: Type.NUMBER },
              innovationAppetite: { type: Type.NUMBER }
            },
            required: ["riskToleranceValue", "strategicPriorityFocus", "analyticalDepth", "directness", "innovationAppetite"]
          },
          personaIdentity: { type: Type.STRING },
          decisionLogic: { type: Type.STRING }
        },
        required: ["role", "roleCitation", "priorities", "likelyObjections", "decisionStyle", "decisionStyleCitation", "riskTolerance", "riskToleranceCitation", "tone", "metrics", "personaIdentity", "decisionLogic"],
      },
      documentInsights: {
        type: Type.OBJECT,
        properties: {
          entities: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { name: { type: Type.STRING }, type: { type: Type.STRING }, context: { type: Type.STRING }, citation: citationSchema }, required: ["name", "type", "context", "citation"] } },
          structure: { type: Type.OBJECT, properties: { sections: { type: Type.ARRAY, items: { type: Type.STRING } }, keyHeadings: { type: Type.ARRAY, items: { type: Type.STRING } }, detectedTablesSummary: { type: Type.STRING } }, required: ["sections", "keyHeadings", "detectedTablesSummary"] },
          summaries: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { fileName: { type: Type.STRING }, summary: { type: Type.STRING }, strategicImpact: { type: Type.STRING }, criticalInsights: { type: Type.ARRAY, items: { type: Type.STRING } } }, required: ["fileName", "summary", "strategicImpact", "criticalInsights"] } },
          materialSynthesis: { type: Type.STRING }
        },
        required: ["entities", "structure", "summaries", "materialSynthesis"]
      },
      groundMatrix: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            observation: { type: Type.STRING },
            significance: { type: Type.STRING },
            evidence: citationSchema
          },
          required: ["category", "observation", "significance", "evidence"]
        }
      },
      competitiveHub: {
        type: Type.OBJECT,
        properties: {
          cognigy: competitorSchema,
          amelia: competitorSchema,
          others: { type: Type.ARRAY, items: competitorSchema }
        },
        required: ["cognigy", "amelia", "others"]
      },
      openingLines: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { text: { type: Type.STRING }, label: { type: Type.STRING }, citation: citationSchema }, required: ["text", "label", "citation"] } },
      predictedQuestions: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { customerAsks: { type: Type.STRING }, salespersonShouldRespond: { type: Type.STRING }, reasoning: { type: Type.STRING }, category: { type: Type.STRING }, citation: citationSchema }, required: ["customerAsks", "salespersonShouldRespond", "reasoning", "category", "citation"] } },
      strategicQuestionsToAsk: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { question: { type: Type.STRING }, whyItMatters: { type: Type.STRING }, citation: citationSchema }, required: ["question", "whyItMatters", "citation"] } },
      objectionHandling: { 
        type: Type.ARRAY, 
        items: { 
          type: Type.OBJECT, 
          properties: { 
            objection: { type: Type.STRING }, 
            realMeaning: { type: Type.STRING }, 
            strategy: { type: Type.STRING }, 
            exactWording: { type: Type.STRING }, 
            empathyTip: { type: Type.STRING },
            valueTip: { type: Type.STRING },
            citation: citationSchema 
          }, 
          required: ["objection", "realMeaning", "strategy", "exactWording", "empathyTip", "valueTip", "citation"] 
        } 
      },
      toneGuidance: { type: Type.OBJECT, properties: { wordsToUse: { type: Type.ARRAY, items: { type: Type.STRING } }, wordsToAvoid: { type: Type.ARRAY, items: { type: Type.STRING } }, sentenceLength: { type: Type.STRING }, technicalDepth: { type: Type.STRING } }, required: ["wordsToUse", "wordsToAvoid", "sentenceLength", "technicalDepth"] },
      finalCoaching: { type: Type.OBJECT, properties: { dos: { type: Type.ARRAY, items: { type: Type.STRING } }, donts: { type: Type.ARRAY, items: { type: Type.STRING } }, finalAdvice: { type: Type.STRING } }, required: ["dos", "donts", "finalAdvice"] },
      reportSections: {
        type: Type.OBJECT,
        properties: {
          introBackground: { type: Type.STRING },
          technicalDiscussion: { type: Type.STRING },
          productIntegration: { type: Type.STRING }
        },
        required: ["introBackground", "technicalDiscussion", "productIntegration"]
      }
    },
    required: ["snapshot", "documentInsights", "groundMatrix", "competitiveHub", "openingLines", "predictedQuestions", "strategicQuestionsToAsk", "objectionHandling", "toneGuidance", "finalCoaching", "reportSections"]
  };

  const prompt = `Synthesize high-fidelity cognitive sales intelligence based on the following documents:
  --- SOURCE --- 
  ${filesContent}`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: `You are a Cognitive Sales Strategist. Provide grounded intelligence in JSON.`,
        responseMimeType: "application/json",
        responseSchema,
        temperature: context.temperature,
        thinkingConfig: { thinkingBudget: THINKING_LEVEL_MAP[context.thinkingLevel] }
      },
    });
    return safeJsonParse(response.text || "{}") as AnalysisResult;
  } catch (error: any) { throw new Error(`Analysis Failed: ${error.message}`); }
}
