/**
 * @fileOverview Provides a resilient AI-generated summary of visitor trends.
 * Updated to use current Gemini models with proper API key configuration.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const VisitRecordSchema = z.object({
  userId:       z.string().describe('The ID of the user who visited.'),
  timestamp:    z.string().describe('The timestamp of the visit.'),
  purpose:      z.string().describe('The purpose of the visit.'),
  collegeOffice: z.string().describe('The college or office.'),
});

const AIPoweredVisitSummaryInputSchema = z.object({
  startDate: z.string().describe('The start date.'),
  endDate:   z.string().describe('The end date.'),
  visitData: z.array(VisitRecordSchema).describe('An array of visit records.'),
});
export type AIPoweredVisitSummaryInput = z.infer<typeof AIPoweredVisitSummaryInputSchema>;

const AIPoweredVisitSummaryOutputSchema = z.object({
  summary: z.string().describe('A summary of visitor trends.'),
});
export type AIPoweredVisitSummaryOutput = z.infer<typeof AIPoweredVisitSummaryOutputSchema>;

export async function aiPoweredVisitSummary(input: AIPoweredVisitSummaryInput): Promise<AIPoweredVisitSummaryOutput> {
  return aiPoweredVisitSummaryFlow(input);
}

const aiPoweredVisitSummaryPrompt = ai.definePrompt({
  name: 'aiPoweredVisitSummaryPrompt',
  input:  { schema: AIPoweredVisitSummaryInputSchema },
  output: { schema: AIPoweredVisitSummaryOutputSchema },
  config: {
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
    ],
  },
  prompt: `You are a Data Analyst for the NEU Library.
Analyze these visitor logs from {{startDate}} to {{endDate}}.

Visitor Logs:
{{#each visitData}}
- {{timestamp}}: {{purpose}} ({{collegeOffice}})
{{/each}}

Write a concise scholarly report covering:
1. Peak usage periods based on timestamps.
2. Most common visit purposes/activities.
3. Most active colleges/departments.
4. Actionable insights for library management.

Keep the summary professional and under 200 words.`,
});

// Helper function to delay execution (for retry logic)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to get most frequent item in array
function getMostFrequent(arr: string[]): string {
  if (!arr || arr.length === 0) return 'Unknown';
  
  const counts: Record<string, number> = {};
  let maxCount = 0;
  let maxItem = arr[0];
  
  for (const item of arr) {
    counts[item] = (counts[item] || 0) + 1;
    if (counts[item] > maxCount) {
      maxCount = counts[item];
      maxItem = item;
    }
  }
  
  return maxItem;
}

// Helper function to get hour from timestamp
function getHourFromTimestamp(timestamp: string): number {
  try {
    return new Date(timestamp).getHours();
  } catch {
    return 12; // default to noon if parsing fails
  }
}

const aiPoweredVisitSummaryFlow = ai.defineFlow(
  {
    name: 'aiPoweredVisitSummaryFlow',
    inputSchema: AIPoweredVisitSummaryInputSchema,
    outputSchema: AIPoweredVisitSummaryOutputSchema,
  },
  async (input) => {
    // Limit to 50 records for performance
    const limitedData = {
      ...input,
      visitData: input.visitData.slice(0, 50),
    };

    // Model configurations with proper names and retry counts
    const models = [
      { 
        name: 'googleai/gemini-2.0-flash-exp', 
        retries: 2,
        delay: 1000,
        description: 'Latest flash model'
      },
      { 
        name: 'googleai/gemini-1.5-flash', 
        retries: 2,
        delay: 1000,
        description: 'Stable flash model'
      },
      { 
        name: 'googleai/gemini-1.5-pro', 
        retries: 1,
        delay: 2000,
        description: 'Pro model fallback'
      }
    ];

    let lastError: Error | null = null;

    // Try each model with retries
    for (const model of models) {
      for (let attempt = 0; attempt <= model.retries; attempt++) {
        try {
          console.log(`[AI Summary] Attempting ${model.description} (${model.name}) - attempt ${attempt + 1}/${model.retries + 1}`);
          
          const { output } = await aiPoweredVisitSummaryPrompt(limitedData, {
            model: model.name,
          });
          
          if (output?.summary) {
            console.log(`[AI Summary] Successfully generated summary with ${model.description}`);
            return output;
          }
        } catch (e: any) {
          lastError = e;
          const errorMessage = e.message || 'Unknown error';
          
          // Check if it's a quota error (429)
          if (errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
            console.warn(`[AI Summary] Quota exceeded for ${model.name}:`, errorMessage);
            
            // If we have more retries, wait and try again
            if (attempt < model.retries) {
              const waitTime = model.delay * Math.pow(2, attempt); // Exponential backoff
              console.log(`[AI Summary] Waiting ${waitTime}ms before retry...`);
              await delay(waitTime);
              continue;
            }
          } 
          // Check if it's a model not found error
          else if (errorMessage.includes('404') || errorMessage.includes('not found')) {
            console.warn(`[AI Summary] Model ${model.name} not available, skipping...`);
            break; // Skip to next model
          }
          else {
            console.warn(`[AI Summary] Error with ${model.name}:`, errorMessage);
            
            // If we have more retries, try again
            if (attempt < model.retries) {
              await delay(model.delay);
              continue;
            }
          }
        }
      }
    }

    // If all AI models fail, generate a statistical summary
    try {
      console.log('[AI Summary] All AI models failed, generating statistical fallback...');
      
      const data = limitedData.visitData;
      
      if (data.length === 0) {
        return {
          summary: 'No visit data available for the selected date range.',
        };
      }
      
      // Calculate statistics
      const purposes = data.map(d => d.purpose);
      const colleges = data.map(d => d.collegeOffice);
      const hours = data.map(d => getHourFromTimestamp(d.timestamp));
      
      const mostCommonPurpose = getMostFrequent(purposes);
      const mostActiveCollege = getMostFrequent(colleges);
      
      // Find peak hour
      const hourCounts: Record<number, number> = {};
      hours.forEach(hour => {
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      });
      
      let peakHour = 12;
      let maxVisits = 0;
      Object.entries(hourCounts).forEach(([hour, count]) => {
        if (count > maxVisits) {
          maxVisits = count;
          peakHour = parseInt(hour);
        }
      });
      
      // Format peak hour period
      const peakPeriod = peakHour < 12 ? 'morning' : peakHour < 17 ? 'afternoon' : 'evening';
      
      // Count unique purposes
      const uniquePurposes = new Set(purposes).size;
      
      return {
        summary: `📊 STATISTICAL SUMMARY (AI models unavailable)
        
Based on ${data.length} visits analyzed from ${input.startDate} to ${input.endDate}:

• Peak Activity: ${peakHour}:00 (${peakPeriod}) with ${maxVisits} visits
• Most Common Purpose: "${mostCommonPurpose}" (out of ${uniquePurposes} different purposes)
• Most Active Department: "${mostActiveCollege}"
• Total Departments Active: ${new Set(colleges).size}

⚠️ Note: This is a statistical summary because the AI service is currently unavailable due to quota limitations. To enable AI-powered insights:
1. Visit https://makersuite.google.com/app/apikey
2. Check your quota for API key: 
3. Consider enabling billing or requesting a quota increase`,
      };
    } catch (fallbackError) {
      console.error('[AI Summary] Even statistical fallback failed:', fallbackError);
    }

    // Ultimate fallback if everything fails
    return {
      summary: `Unable to generate AI summary at this time. The API quota has been exceeded for your Gemini API key.

To resolve this issue:
1. Go to https://makersuite.google.com/app/apikey
2. Check the quota for API key: 
3. Enable billing or request a quota increase
4. You can also try using the other API key: 

Please review the raw trends in the charts or export to PDF for manual analysis.`,
    };
  }
);