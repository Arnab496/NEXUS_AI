import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // If it's a 429 (Rate Limit), wait and retry if we have retries left
      const isRateLimit = 
        error?.status === 'RESOURCE_EXHAUSTED' || 
        error?.code === 429 || 
        (error?.message && (error.message.includes('429') || error.message.includes('RESOURCE_EXHAUSTED')));

      if (isRateLimit) {
        if (i < maxRetries - 1) {
          const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
      throw error;
    }
  }
  throw lastError;
}

export interface ChartConfig {
  id: string;
  type: 'bar' | 'line' | 'pie' | 'scatter' | 'area' | 'histogram' | 'heatmap' | 'venn' | 'distribution' | 'stats' | 'correlation' | 'network' | 'radar' | 'treemap' | 'funnel' | 'bubble';
  title: string;
  xAxis?: string;
  yAxis?: string;
  zAxis?: string; // For bubble charts
  dataKeys: string[];
  colors?: string[];
  insights: string[];
  description: string;
  statsData?: Record<string, any>; // For statistical summaries
}

export interface AssistantResponse {
  message: string;
  newChart?: ChartConfig;
  updatedChartId?: string;
  updatedConfig?: Partial<ChartConfig>;
  suggestedQueries: string[];
  dataSummary?: string;
  dashboardSummary?: string;
  newCalculatedField?: {
    name: string;
    formula: string;
    description: string;
  };
  dataHealth?: {
    missingValues: Record<string, number>;
    anomalies: string[];
    columnTypes: Record<string, string>;
  };
}

export async function processAssistantCommand(
  command: string, 
  data: any[], 
  currentCharts: ChartConfig[]
): Promise<AssistantResponse> {
  const dataSample = data.slice(0, 30);
  const schema = data.length > 0 && data[0] ? Object.keys(data[0]).map(key => ({
    name: key,
    type: typeof data[0][key],
    sampleValues: data.slice(0, 3).map(d => d[key])
  })) : [];

  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `
      You are the Nexus AI Autonomous Data Analytics Engine. Your goal is to help users explore their data through natural language.
      
      User Command: "${command}"
      
      Dataset Schema: ${JSON.stringify(schema)}
      Dataset Sample: ${JSON.stringify(dataSample)}
      Current Dashboard Charts: ${JSON.stringify(currentCharts)}
      
      Instructions:
      1. If the user wants to create a chart or analysis, generate a 'newChart' object.
      2. Supported types: bar, line, pie, scatter, area, histogram, heatmap, venn, distribution, stats, correlation, network, radar, treemap, funnel, bubble.
      3. For 'stats', calculate descriptive statistics (mean, median, mode, std dev, variance, min, max, sum) for relevant columns and put them in 'statsData'.
      4. For 'correlation', identify the correlation matrix for numeric columns.
      5. For 'bubble', use 'xAxis', 'yAxis', and 'zAxis' (for size).
      6. If the user wants to modify an existing chart, identify the 'updatedChartId' and provide 'updatedConfig'.
      7. If the user wants to create a "calculated field" (e.g., "Total = Price * Quantity"), provide 'newCalculatedField' with name and formula.
      8. Always provide a helpful 'message' explaining what you did.
      9. Automatically generate 3-5 'insights' for any new or updated chart. Focus on:
         - Trends (upward/downward movements)
         - Anomalies (outliers, unexpected spikes/dips)
         - Correlations (relationships between variables)
         - Key observations
      10. If the user asks for a "summary" or "overview" of the dashboard, provide a 'dashboardSummary' string.
      11. Suggest 3 follow-up queries.
      12. DO NOT include any forecasting or predictions. Focus on historical and current data analysis.
      
      Return the response in JSON format.
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          message: { type: Type.STRING },
          newChart: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              type: { type: Type.STRING, enum: ['bar', 'line', 'pie', 'scatter', 'area', 'histogram', 'heatmap', 'venn', 'distribution', 'stats', 'correlation', 'network', 'radar', 'treemap', 'funnel', 'bubble'] },
              title: { type: Type.STRING },
              xAxis: { type: Type.STRING },
              yAxis: { type: Type.STRING },
              zAxis: { type: Type.STRING },
              dataKeys: { type: Type.ARRAY, items: { type: Type.STRING } },
              colors: { type: Type.ARRAY, items: { type: Type.STRING } },
              insights: { type: Type.ARRAY, items: { type: Type.STRING } },
              description: { type: Type.STRING },
              statsData: { type: Type.OBJECT }
            },
            required: ["id", "type", "title", "dataKeys", "insights", "description"]
          },
          updatedChartId: { type: Type.STRING },
          updatedConfig: { type: Type.OBJECT },
          newCalculatedField: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              formula: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ["name", "formula", "description"]
          },
          suggestedQueries: { type: Type.ARRAY, items: { type: Type.STRING } },
          dataSummary: { type: Type.STRING },
          dashboardSummary: { type: Type.STRING }
        },
        required: ["message", "suggestedQueries"]
      }
    }
  }));

  return JSON.parse(response.text || "{}");
}

export async function getInitialSuggestions(data: any[]): Promise<{ suggestions: string[], health: AssistantResponse['dataHealth'] }> {
  const schema = data.length > 0 && data[0] ? Object.keys(data[0]) : [];
  const dataSample = data.slice(0, 20);
  
  const response = await withRetry(() => ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `
      Analyze this dataset schema and sample:
      Schema: ${schema.join(', ')}
      Sample: ${JSON.stringify(dataSample)}
      
      1. Suggest 5 interesting data visualization queries.
      2. Detect data health: missing values per column, any obvious anomalies, and confirm column types.
      
      Return as JSON.
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          health: {
            type: Type.OBJECT,
            properties: {
              missingValues: { type: Type.OBJECT },
              anomalies: { type: Type.ARRAY, items: { type: Type.STRING } },
              columnTypes: { type: Type.OBJECT }
            }
          }
        }
      }
    }
  }), 5);
  
  const result = JSON.parse(response.text || "{}");
  return {
    suggestions: result.suggestions || [],
    health: result.health
  };
}
