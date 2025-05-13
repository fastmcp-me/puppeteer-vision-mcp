import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration & Environment Check
export const config = {
  apiKey: process.env.OPENAI_API_KEY,
  visionModel: process.env.VISION_MODEL || 'gpt-4.1',
  apiBaseUrl: process.env.API_BASE_URL,
  serverPort: parseInt(process.env.PORT || '3001', 10),
  useSSE: process.env.USE_SSE === 'true',
  headless: process.env.DISABLE_HEADLESS !== 'true', // Default to headless mode unless explicitly disabled
};

// Validate essential configuration
if (!config.apiKey) {
  console.error("Error: OPENAI_API_KEY environment variable is not set.");
  process.exit(1);
}

// Configure API client settings
export const apiConfig: any = {
  apiKey: config.apiKey,
};

// Add custom base URL if provided
if (config.apiBaseUrl) {
  apiConfig.baseURL = config.apiBaseUrl;
  console.log(`Using custom API endpoint: ${config.apiBaseUrl}`);
}

console.log(`Using vision model: ${config.visionModel}`);
console.log(`Browser mode: ${config.headless ? 'headless' : 'visible'}`);