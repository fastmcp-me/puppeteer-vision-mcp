import fs from 'fs';
import { Page } from 'puppeteer';
import { AIAction } from '../types/index.js';
import { analyzePageWithAI } from './vision-analyzer.js';

/**
 * Executes an AI-recommended action on the page
 * @param page Puppeteer page instance
 * @param action The action to execute
 * @returns Whether the action was successfully executed
 */
export async function executeAction(page: Page, action: AIAction): Promise<boolean> {
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

/**
 * Clicks on elements that match the target text across all frames
 * @param page Puppeteer page instance
 * @param targetText The text to search for in clickable elements
 */
export async function clickElementsByText(page: Page, targetText: string): Promise<void> {
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

/**
 * Handles interactions with the page using AI vision analysis
 * @param page Puppeteer page instance
 * @param maxAttempts Maximum number of interaction attempts
 * @returns Whether any interactions were performed
 */
export async function handlePageInteractions(page: Page, maxAttempts: number = 3): Promise<boolean> {
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