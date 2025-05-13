#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import express, { Request, Response } from "express";
import { z } from "zod";

// Import puppeteer with proper type handling
import puppeteer, { Page, ElementHandle } from 'puppeteer';
import puppeteerExtraImport from 'puppeteer-extra';
import StealthPluginImport from 'puppeteer-extra-plugin-stealth';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import sanitizeHtml from 'sanitize-html';
import { OpenAI } from 'openai';
import fs from 'fs';
import path from 'path';

// Work around TypeScript issues with puppeteer-extra
const puppeteerExtra = puppeteerExtraImport as any;
const StealthPlugin = StealthPluginImport as any;

// Apply stealth plugin
puppeteerExtra.use(StealthPlugin());

// --- Configuration & Environment Check ---
const apiKey = process.env.OPENAI_API_KEY;
const visionModel = process.env.VISION_MODEL || 'gpt-4.1';
const apiBaseUrl = process.env.API_BASE_URL;
const serverPort = process.env.PORT || 3001;

if (!apiKey) {
    console.error("Error: OPENAI_API_KEY environment variable is not set.");
    process.exit(1);
}

// Configure API client
const apiConfig: any = {
    apiKey: apiKey,
};

// Add custom base URL if provided
if (apiBaseUrl) {
    apiConfig.baseURL = apiBaseUrl;
    console.log(`Using custom API endpoint: ${apiBaseUrl}`);
}

console.log(`Using vision model: ${visionModel}`);

const openai = new OpenAI(apiConfig);

// --- Helper Functions ---
function markCodeParents(node: Element | null) {
  if (!node) return;

  // If the node contains a <pre> or <code>, mark it
  if (node.querySelector('pre, code')) {
    node.classList.add('article-content');
    node.setAttribute('data-readable-content-score', '100');
  }

  // Recursively mark parents
  markCodeParents(node.parentElement);
}

async function visitWebPage({
  url,
  autoInteract = true,
  maxInteractionAttempts = 3,
  waitForNetworkIdle = true,
}: {
  url: string;
  autoInteract?: boolean;
  maxInteractionAttempts?: number;
  waitForNetworkIdle?: boolean;
}): Promise<{ data?: string; error?: { message: string } }> {
  // Launch puppeteer with stealth plugin
  const browser = await puppeteerExtra.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  
  try {
    console.log(`Visiting webpage: ${url}`);
    const page = await browser.newPage();
    
    // Set viewport to a standard desktop size
    await page.setViewport({ width: 1280, height: 800 });
    
    // Navigate to the URL
    await page.goto(url, { 
      waitUntil: waitForNetworkIdle ? 'networkidle2' : 'domcontentloaded' 
    });
    
    // Allow initial page load to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Handle page interactions if enabled
    if (autoInteract) {
      console.log("Checking for interactive elements that need handling...");
      await handlePageInteractions(page, maxInteractionAttempts);
    }
    
    // Extract content after handling interactions
    const htmlContent: string = await page.evaluate(() => {
      // Try to select the main content area, fallback to the body if no specific selector
      const main = document.querySelector('main') || 
                  document.querySelector('article') || 
                  document.querySelector('.content') ||
                  document.querySelector('#content') ||
                  document.body;
      return main.innerHTML;
    });

    // Create DOM
    const dom = new JSDOM(htmlContent);
    const document = dom.window.document;

    // Mark code blocks to influence Readability scoring
    const preElements = document.querySelectorAll('pre');
    preElements.forEach(pre => {
      // Add classes that Readability considers as content
      pre.classList.add('article-content');
      // Set a very high readable score
      pre.setAttribute('data-readable-content-score', '100');
      // Make parent more likely to be kept
      if (pre.parentElement) {
        pre.parentElement.classList.add('article-content');
      }
    });

    document.querySelectorAll('pre, code').forEach(pre => {
      markCodeParents(pre.parentElement);
    });

    // Modify Readability options to be more lenient
    const readerOptions = {
      charThreshold: 20,
      classesToPreserve: ['article-content'],
    };

    // Now run Readability
    const reader = new Readability(document, readerOptions);
    const article = reader.parse();

    // Continue with sanitization and markdown conversion
    if (!article) {
      throw new Error('Failed to parse the article content.');
    }
    
    const cleanHtml = sanitizeHtml(article.content, {
      allowedTags: [
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'a', 'ul', 'ol',
        'li', 'b', 'i', 'strong', 'em', 'code', 'pre',
        'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td'
      ],
      allowedAttributes: {
        'a': ['href'],
        'pre': ['class', 'data-language'],
        'code': ['class', 'data-language'],
        'div': ['class'],
        'span': ['class']
      }
    });

    const turndownService = new TurndownService({
      codeBlockStyle: 'fenced',
      headingStyle: 'atx'
    });

    turndownService.addRule('codeBlocks', {
      filter: function (node) {
        return node.nodeName === 'PRE';
      },
      replacement: function (content, node) {
        // Cast node to HTMLElement to access getAttribute
        const htmlNode = node as HTMLElement;
        const code = htmlNode.querySelector('code');
        const language = code?.className?.match(/language-(\w+)/)?.[1] ||
                        htmlNode.getAttribute('data-language') ||
                        'yaml';

        const cleanContent = content
          .replace(/^\n+|\n+$/g, '')
          .replace(/\n\n+/g, '\n');

        return `\n\`\`\`${language}\n${cleanContent}\n\`\`\`\n`;
      }
    });

    turndownService.addRule('tableCell', {
      filter: ['th', 'td'],
      replacement: function (content, node) {
        const htmlNode = node as HTMLElement;

        // Extract text from nested paragraph if present
        let cellContent = '';
        if (htmlNode.querySelector('p')) {
          cellContent = Array.from(htmlNode.querySelectorAll('p'))
            .map(p => p.textContent || '')
            .join(' ')
            .trim();
        } else {
          cellContent = content.trim();
        }

        return ` ${cellContent.replace(/\|/g, '\\|')} |`;
      }
    });

    turndownService.addRule('tableRow', {
      filter: 'tr',
      replacement: function (content, node) {
        const htmlNode = node as HTMLTableRowElement;
        const cells = Array.from(htmlNode.cells);
        const isHeader = htmlNode.parentNode?.nodeName === 'THEAD';

        let output = '|' + content.trimEnd();

        // If this is a header row, add the separator row without extra newline
        if (isHeader) {
          const separator = cells.map(() => '---').join(' | ');
          output += '\n|' + separator + '|';
        }

        // Only add newline if not a header row or if there's no next row
        if (!isHeader || !htmlNode.nextElementSibling) {
          output += '\n';
        }

        return output;
      }
    });

    turndownService.addRule('table', {
      filter: 'table',
      replacement: function (content) {
        // Clean up any potential double newlines
        return '\n' + content.replace(/\n+/g, '\n').trim() + '\n';
      }
    });

    // Custom rule to preserve whitespace in table cells
    turndownService.addRule('preserveTableWhitespace', {
      filter: function (node) {
        return (
          (node.nodeName === 'TD' || node.nodeName === 'TH') &&
          node.textContent?.trim().length === 0
        );
      },
      replacement: function () {
        return ' |';
      }
    });

    const markdown = turndownService.turndown(cleanHtml);
    await browser.close();
    console.log(`Successfully scraped and converted to markdown: ${url}`);
    
    return { data: markdown };
  }
  catch(error) {
    await browser.close();
    if (error instanceof Error) {
      console.error(`Error scraping ${url}:`, error.message);
      return {
        error: {
          message: error.message,
        },
      };
    } else {
      console.error(`Unknown error scraping ${url}`);
      return {
        error: {
          message: "An unknown error occurred",
        },
      };
    }
  }
}

async function clickElementsByText(page: Page, targetText: string): Promise<void> {
  const frames = page.frames();
  const searchText = targetText.toLowerCase();

  // Process all frames in parallel using Promise.all
  const results = await Promise.all(
    frames.map(async (frame) => {
      try {
        // 1. Gather indexes of all matching elements
        const elementIndexes = await frame.$$eval(
          'a, button',
          (elements, t) => {
            const matches: number[] = [];
            elements.forEach((el, idx) => {
              if (el.textContent?.toLowerCase().includes(t)) {
                matches.push(idx);
              }
            });
            return matches;
          },
          searchText
        );

        if (elementIndexes.length === 0) {
          return {
            frame: frame.name() || frame.url(),
            found: false,
            count: 0
          };
        }

        // 2. Click all matching elements
        const allElements = await frame.$$('a, button');
        await Promise.all(
          elementIndexes.map(async (idx) => {
            try {
              if (allElements[idx]) {
                await allElements[idx].click();
              }
            } catch (clickError) {
              console.error(`Error clicking element at index ${idx}:`, clickError);
            }
          })
        );

        return {
          frame: frame.name() || frame.url(),
          found: true,
          count: elementIndexes.length
        };
      } catch (error) {
        console.error(`Error in frame "${frame.name() || frame.url()}"`, error);
        return {
          frame: frame.name() || frame.url(),
          found: false,
          count: 0,
          error
        };
      }
    })
  );

  // Aggregate and log results
  const successfulFrames = results.filter(r => r.found);
  const totalClicks = successfulFrames.reduce((sum, r) => sum + r.count, 0);

  if (successfulFrames.length > 0) {
    console.log(`Found and clicked ${totalClicks} element(s) with text "${targetText}" across ${successfulFrames.length} frame(s):`);
    successfulFrames.forEach(r => {
      console.log(`- Frame "${r.frame}": ${r.count} element(s)`);
    });
  } else {
    console.log(`No elements with text "${targetText}" were found in any frame.`);
  }
}

// Helper functions for AI-driven page interactions
interface AIAction {
  action: 'click' | 'scroll' | 'type' | 'wait' | 'none';
  targetText?: string;
  targetSelector?: string;
  inputText?: string;
  scrollAmount?: number;
  waitTime?: number;
  reason?: string;
}

async function analyzePageWithAI(base64Image: string): Promise<AIAction> {
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

  const response = await openai.chat.completions.create({
    model: visionModel,
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

  try {
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

async function executeAction(page: Page, action: AIAction): Promise<boolean> {
  console.log(`Executing action: ${action.action}`, action);
  
  switch (action.action) {
    case 'click':
      if (action.targetText) {
        // Try to click by text content
        await clickElementsByText(page, action.targetText);
        return true;
      } else if (action.targetSelector) {
        // Try to click by CSS selector
        try {
          await page.waitForSelector(action.targetSelector, { timeout: 5000 });
          await page.click(action.targetSelector);
          console.log(`Clicked element with selector: ${action.targetSelector}`);
          return true;
        } catch (error) {
          console.error(`Failed to click element with selector ${action.targetSelector}:`, error);
          return false;
        }
      }
      return false;

    case 'type':
      if (action.targetSelector && action.inputText) {
        try {
          await page.waitForSelector(action.targetSelector, { timeout: 5000 });
          await page.type(action.targetSelector, action.inputText);
          console.log(`Typed "${action.inputText}" into element with selector: ${action.targetSelector}`);
          return true;
        } catch (error) {
          console.error(`Failed to type into element with selector ${action.targetSelector}:`, error);
          return false;
        }
      }
      return false;

    case 'scroll':
      if (action.scrollAmount) {
        await page.evaluate((amount) => window.scrollBy(0, amount), action.scrollAmount);
        console.log(`Scrolled by ${action.scrollAmount} pixels`);
        return true;
      }
      return false;

    case 'wait':
      if (action.waitTime) {
        await new Promise(resolve => setTimeout(resolve, action.waitTime));
        console.log(`Waited for ${action.waitTime} milliseconds`);
        return true;
      }
      return false;

    default:
      console.log("No action taken");
      return false;
  }
}

async function handlePageInteractions(page: Page, maxAttempts: number = 3): Promise<boolean> {
  let interactionFound = false;
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    console.log(`Interaction attempt ${attempts + 1}/${maxAttempts}`);
    
    // Take screenshot of the current page state
    const screenshot = await page.screenshot({ encoding: 'base64' }) as string;
    
    // Save the screenshot for debugging (optional)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `screenshot-interaction-${timestamp}.png`;
    const buffer = Buffer.from(screenshot, 'base64');
    await fs.promises.writeFile(filename, buffer);
    console.log(`Saved screenshot to ${filename}`);
    
    // Analyze the page using AI
    const action = await analyzePageWithAI(screenshot);
    
    // If no interaction needed, we're done
    if (action.action === 'none') {
      console.log("No interactions needed:", action.reason);
      return interactionFound;
    }
    
    // Try to execute the recommended action
    const actionSuccess = await executeAction(page, action);
    
    if (actionSuccess) {
      interactionFound = true;
      console.log(`Successfully executed ${action.action} action: ${action.reason}`);
      
      // Wait for any page changes to settle
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log(`Failed to execute ${action.action} action`);
    }
    
    attempts += 1;
  }
  
  return interactionFound;
}

// --- MCP Server Setup ---
const serverName = "web-scraper-mcp-server";
const serverVersion = "1.0.0";

const server = new McpServer({
    name: serverName,
    version: serverVersion,
    capabilities: {},
});

// --- Define the MCP Tool ---
server.tool(
    "scrape-webpage",
    "Scrapes a webpage and converts it to markdown format",
    {
        url: z.string().url().describe("The URL of the webpage to scrape"),
        autoInteract: z.boolean().optional().default(true).describe("Whether to automatically handle interactive elements like cookies, captchas, etc."),
        maxInteractionAttempts: z.number().int().min(0).max(10).optional().default(3).describe("Maximum number of interaction attempts"),
        waitForNetworkIdle: z.boolean().optional().default(true).describe("Whether to wait for network to be idle before processing")
    },
    async ({ url, autoInteract, maxInteractionAttempts, waitForNetworkIdle }) => {
        console.log(`Received scrape request for URL: ${url}, autoInteract: ${autoInteract}, maxAttempts: ${maxInteractionAttempts}`);

        try {
            const result = await visitWebPage({ 
                url, 
                autoInteract, 
                maxInteractionAttempts,
                waitForNetworkIdle
            });

            if (result.error) {
                return {
                    content: [{ type: "text", text: "" }],
                    metadata: {
                        message: `Error scraping webpage: ${result.error.message}`,
                        success: false
                    }
                };
            }

            // Limit the size of returned content if too large
            const maxLength = 100000; // Set a reasonable limit
            let markdownContent = result.data || "";
            let message = "Scraping successful";
            
            if (markdownContent.length > maxLength) {
                markdownContent = markdownContent.substring(0, maxLength);
                message = `Content truncated due to size (total size: ${markdownContent.length} characters)`;
            }
            
            console.log(`Scraping successful. Payload size: ${markdownContent.length} chars.`);

            return {
                content: [{ type: "text", text: markdownContent }],
                metadata: {
                    message,
                    success: true,
                    contentSize: markdownContent.length
                }
            };
        } catch (error: any) {
            console.error("Error processing 'scrape-webpage' tool:", error);
            return {
                content: [{ type: "text", text: "" }],
                metadata: {
                    message: `Error scraping webpage: ${error.message}`,
                    success: false
                }
            };
        }
    }
);

// Determine transport type from environment variables
const useSSE = process.env.USE_SSE === 'true';

if (useSSE) {
    // Setup Express server for SSE mode
    const app = express();
    
    // to support multiple simultaneous connections we have a lookup object from
    // sessionId to transport
    const transports: {[sessionId: string]: SSEServerTransport} = {};
    
    app.get("/sse", async (_: Request, res: Response) => {
      const transport = new SSEServerTransport('/messages', res);
      transports[transport.sessionId] = transport;
      res.on("close", () => {
        delete transports[transport.sessionId];
      });
      await server.connect(transport);
    });
    
    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      const transport = transports[sessionId];
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(400).send('No transport found for sessionId');
      }
    });
    
    const webserver = app.listen(serverPort, () => {
        console.log(`${serverName} v${serverVersion} is running in SSE mode on port ${serverPort}`);
        if (apiBaseUrl) {
            console.log(`Using custom API endpoint: ${apiBaseUrl}`);
        }
    });
    
    webserver.keepAliveTimeout = 3000;
} else {
    // Use Stdio transport (default mode)
    const stdioTransport = new StdioServerTransport();
    
    console.log(`${serverName} v${serverVersion} starting in stdio mode`);
    if (apiBaseUrl) {
        console.log(`Using custom API endpoint: ${apiBaseUrl}`);
    }
    
    // Connect the transport to the server
    server.connect(stdioTransport).catch((error) => {
        console.error("Error connecting transport:", error);
        process.exit(1);
    });
}