# Puppeteer vision MCP Server

This Model Context Protocol (MCP) server provides a tool for scraping webpages and converting them to markdown format using Puppeteer, Readability, and Turndown. It features AI-driven interaction capabilities to handle cookies, captchas, and other interactive elements automatically.

**Now easily runnable via `npx`!**

## Features

- Scrapes webpages using Puppeteer with stealth mode
- Uses AI-powered interaction to automatically handle:
  - Cookie consent banners
  - CAPTCHAs
  - Newsletter or subscription prompts
  - Paywalls and login walls
  - Age verification prompts
  - Interstitial ads
  - Any other interactive elements blocking content
- Extracts main content with Mozilla's Readability
- Converts HTML to well-formatted Markdown
- Special handling for code blocks, tables, and other structured content
- Accessible via the Model Context Protocol
- Option to view browser interaction in real-time by disabling headless mode
- Easily consumable as an `npx` package.

## Quick Start with NPX

The recommended way to use this server is via `npx`, which ensures you're running the latest version without needing to clone or manually install.

1.  **Prerequisites:** Ensure you have Node.js and npm installed.
2.  **Environment Setup:**
    The server requires an `OPENAI_API_KEY`. You can provide this and other optional configurations in two ways:
    *   **`.env` file:** Create a `.env` file in the directory where you will run the `npx` command.
    *   **Shell Environment Variables:** Export the variables in your terminal session.

    **Example `.env` file or shell exports:**
    ```env
    # Required
    OPENAI_API_KEY=your_api_key_here

    # Optional (defaults shown)
    # VISION_MODEL=gpt-4.1
    # API_BASE_URL=https://api.openai.com/v1   # Uncomment to override
    # USE_SSE=true                             # Uncomment to use SSE mode instead of stdio
    # PORT=3001                                # Only used in SSE mode
    # DISABLE_HEADLESS=true                    # Uncomment to see the browser in action
    ```

3.  **Run the Server:**
    Open your terminal and run:
    ```bash
    npx -y puppeteer-vision-mcp-server
    ```
    *   The `-y` flag automatically confirms any prompts from `npx`.
    *   This command will download (if not already cached) and execute the server.
    *   By default, it starts in `stdio` mode. If `USE_SSE=true` is set in your environment, it will start an HTTP server for SSE communication.

## Using as an MCP Tool with NPX

This server is designed to be integrated as a tool within an MCP-compatible LLM orchestrator. Here's an example configuration snippet:

```json
{
  "mcpServers": {
    "web-scraper": {
      "command": "npx",
      "args": ["-y", "puppeteer-vision-mcp-server"],
      "env": {
        "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY_HERE",
        // Optional:
        // "VISION_MODEL": "gpt-4.1",
        // "API_BASE_URL": "https://api.example.com/v1",
        // "DISABLE_HEADLESS": "true" // To see the browser during operations
      }
    }
    // ... other MCP servers
  }
}
```
When configured this way, the MCP orchestrator will manage the lifecycle of the `puppeteer-vision-mcp-server` process.

## Environment Configuration Details

Regardless of how you run the server (NPX or local development), it uses the following environment variables:

- **`OPENAI_API_KEY`**: (Required) Your API key for accessing the vision model.
- **`VISION_MODEL`**: (Optional) The model to use for vision analysis.
  - Default: `gpt-4.1`
  - Can be any model with vision capabilities.
- **`API_BASE_URL`**: (Optional) Custom API endpoint URL.
  - Use this to connect to alternative OpenAI-compatible providers (e.g., Together.ai, Groq, Anthropic, local deployments).
- **`USE_SSE`**: (Optional) Set to `true` to enable SSE mode over HTTP.
  - Default: `false` (uses stdio mode).
- **`PORT`**: (Optional) The port for the HTTP server in SSE mode.
  - Default: `3001`.
- **`DISABLE_HEADLESS`**: (Optional) Set to `true` to run the browser in visible mode.
  - Default: `false` (browser runs in headless mode).

## Communication Modes

The server supports two communication modes:

1.  **stdio (Default)**: Communicates via standard input/output.
    -   Perfect for direct integration with LLM tools that manage processes.
    -   Ideal for command-line usage and scripting.
    -   No HTTP server is started. This is the default mode when running via `npx` unless `USE_SSE=true` is set.
2.  **SSE mode**: Communicates via Server-Sent Events over HTTP.
    -   Enable by setting `USE_SSE=true` in your environment.
    -   Starts an HTTP server on the specified `PORT` (default: 3001).
    -   Use when you need to connect to the tool over a network.

## Tool Usage (MCP Invocation)

The server provides a `scrape-webpage` tool.

**Tool Parameters:**

- `url` (string, required): The URL of the webpage to scrape.
- `autoInteract` (boolean, optional, default: true): Whether to automatically handle interactive elements.
- `maxInteractionAttempts` (number, optional, default: 3): Maximum number of AI interaction attempts.
- `waitForNetworkIdle` (boolean, optional, default: true): Whether to wait for network to be idle before processing.

**Response Format:**

The tool returns its result in a structured format:

- **`content`**: An array containing a single text object with the raw markdown of the scraped webpage.
- **`metadata`**: Contains additional information:
  - `message`: Status message.
  - `success`: Boolean indicating success.
  - `contentSize`: Size of the content in characters (on success).

*Example Success Response:*
```json
{
  "content": [
    {
      "type": "text",
      "text": "# Page Title\n\nThis is the content..."
    }
  ],
  "metadata": {
    "message": "Scraping successful",
    "success": true,
    "contentSize": 8734
  }
}
```

*Example Error Response:*
```json
{
  "content": [
    {
      "type": "text",
      "text": ""
    }
  ],
  "metadata": {
    "message": "Error scraping webpage: Failed to load the URL",
    "success": false
  }
}
```

## How It Works

### AI-Driven Interaction
The system uses vision-capable AI models (configurable via `VISION_MODEL` and `API_BASE_URL`) to analyze screenshots of web pages and decide on actions like clicking, typing, or scrolling to bypass overlays and consent forms. This process repeats up to `maxInteractionAttempts`.

### Content Extraction
After interactions, Mozilla's Readability extracts the main content, which is then sanitized and converted to Markdown using Turndown with custom rules for code blocks and tables.

## Installation & Development (for Modifying the Code)

If you wish to contribute, modify the server, or run a local development version:

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/djannot/puppeteer-vision-mcp.git
    cd puppeteer-vision-mcp
    ```
2.  **Install Dependencies:**
    ```bash
    npm install
    ```
3.  **Build the Project:**
    ```bash
    npm run build
    ```
4.  **Set Up Environment:**
    Create a `.env` file in the project's root directory with your `OPENAI_API_KEY` and any other desired configurations (see "Environment Configuration Details" above).

5.  **Run for Development:**
    ```bash
    npm start # Starts the server using the local build
    ```
    Or, for automatic rebuilding on changes:
    ```bash
    npm run dev
    ```

## Customization (for Developers)

You can modify the behavior of the scraper by editing:
- `src/ai/vision-analyzer.ts` (`analyzePageWithAI` function): Customize the AI prompt.
- `src/ai/page-interactions.ts` (`executeAction` function): Add new action types.
- `src/scrapers/webpage-scraper.ts` (`visitWebPage` function): Change Puppeteer options.
- `src/utils/markdown-formatters.ts`: Adjust Turndown rules for Markdown conversion.

## Dependencies
Key dependencies include:
- `@modelcontextprotocol/sdk`
- `puppeteer`, `puppeteer-extra`
- `@mozilla/readability`, `jsdom`
- `turndown`, `sanitize-html`
- `openai` (or compatible API for vision models)
- `express` (for SSE mode)
- `zod`
