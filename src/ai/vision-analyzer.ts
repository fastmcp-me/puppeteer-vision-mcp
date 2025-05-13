import { OpenAI } from 'openai';
import { apiConfig, config } from '../config.js';
import { AIAction } from '../types/index.js';

// Initialize the OpenAI client
const openai = new OpenAI(apiConfig);

/**
 * Analyzes a screenshot of a webpage using AI vision to determine if interactions are needed
 * @param base64Image Screenshot in base64 format
 * @returns A recommended action to take on the page
 */
export async function analyzePageWithAI(base64Image: string): Promise<AIAction> {
  const genericInteractionPrompt = `
You are an AI assistant helping to navigate a webpage. Analyze this screenshot and determine if there are any interactions needed to proceed with normal browsing.

Look for elements such as:
1. Cookie consent banners or popups (buttons like "Accept", "I agree", "Accept all", etc.)
2. CAPTCHA challenges
3. Login walls or paywalls
4. Newsletter or subscription prompts
5. Age verification prompts
6. Interstitial ads
7. "Continue reading" buttons
8. Any other interactive element blocking normal content viewing

If you identify any such element, respond with a JSON object specifying:
- "action": The action to take ("click", "type", "scroll", "wait", or "none")
- "targetText": The exact text of any button to click
- "targetSelector": (Optional) A CSS selector if the element has no visible text
- "inputText": Text to input if required
- "scrollAmount": Pixels to scroll if needed
- "waitTime": Time to wait in milliseconds if needed
- "reason": A brief explanation of what you identified and why this action is recommended

If no action is needed, respond with: {"action": "none", "reason": "No interaction needed"}

IMPORTANT: Your response must be valid JSON.
`;

  try {
    const response = await openai.chat.completions.create({
      model: config.visionModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: genericInteractionPrompt
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high"
              }
            }
          ]
        }
      ],
      response_format: { type: "json_object" },
      max_tokens: 500
    });

    const content = response.choices[0]?.message.content || '{"action": "none", "reason": "Failed to get response"}';
    console.log("AI analysis:", content);
    return JSON.parse(content) as AIAction;
  } catch (e) {
    console.error('Failed to parse AI response:', e);
    return { 
      action: 'none', 
      reason: 'Error parsing AI response' 
    };
  }
}