# Pupeeter Vision MCP Server

This Model Context Protocol (MCP) server provides a tool for scraping webpages and converting them to markdown format using Puppeteer, Readability, and Turndown. It features AI-driven interaction capabilities (using vision) to handle cookies, captchas, and other interactive elements automatically.

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

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd web-scraper-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```
OPENAI_API_KEY=your_openai_api_key
PORT=3001 # Optional, defaults to 3001
```

The OpenAI API key is required for the AI-powered interaction capabilities.

## Usage

### Starting the Server

```bash
npm start
```

This will start the MCP server on port 3001 (or the port specified in your `.env` file).

### Using as a Tool with MCP-compatible LLMs

The server provides a `scrape-webpage` tool that can be used by any MCP-compatible LLM.

Tool parameters:
- `url` (string, required): The URL of the webpage to scrape
- `autoInteract` (boolean, optional, default: true): Whether to automatically handle interactive elements
- `maxInteractionAttempts` (number, optional, default: 3): Maximum number of interaction attempts
- `waitForNetworkIdle` (boolean, optional, default: true): Whether to wait for network to be idle before processing

### Response Format

The tool returns its result in a structured format:

- **content**: Contains only the raw markdown text of the scraped webpage without any additional messages
- **metadata**: Contains additional information about the scraping process:
  - `message`: Status message about the scraping operation
  - `success`: Boolean indicating whether the scraping was successful
  - `contentSize`: Size of the content in characters (when successful)

Example response:
```json
{
  "content": [
    {
      "type": "text",
      "text": "# Page Title\n\nThis is the content of the page...[markdown content continues]"
    }
  ],
  "metadata": {
    "message": "Scraping successful",
    "success": true,
    "contentSize": 8734
  }
}
```

In case of error:
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

The system uses GPT-4 Vision capabilities to analyze web pages and intelligently handle various interactive elements:

1. The scraper takes a screenshot of the page
2. The screenshot is sent to OpenAI's GPT-4 with instructions to identify interactive elements
3. The AI returns a structured response with the recommended action
4. The system executes the recommended action (click, type, scroll, wait)
5. This process repeats for a configurable number of attempts (default: 3)

The AI can detect and handle:
- Buttons to click (e.g., "Accept Cookies", "Continue Reading", "I Agree")
- Input fields that need text (e.g., email subscription forms)
- Areas that need scrolling
- Situations that require waiting

### Content Extraction

After handling interactive elements, the system:
1. Extracts the main content using Mozilla's Readability
2. Sanitizes the HTML to remove unwanted elements
3. Converts the clean HTML to well-formatted Markdown
4. Returns the Markdown content

## Development

```bash
# Run in development mode (build and start)
npm run dev
```

## Customization

You can modify the behavior of the scraper by editing the following parts of the code:

- `analyzePageWithAI` function: Customize the prompt for the AI
- `executeAction` function: Add new types of actions
- `visitWebPage` function: Change scraping behavior and options
- Turndown rules: Customize how different HTML elements are converted to Markdown

## Dependencies

- `@modelcontextprotocol/sdk`: MCP server implementation
- `puppeteer` & `puppeteer-extra`: For web scraping with stealth capabilities
- `@mozilla/readability` & `jsdom`: For extracting main content
- `turndown`: For converting HTML to Markdown
- `sanitize-html`: For cleaning HTML content
- `openai`: For AI-driven interactions with webpages
- `express`: For handling HTTP requests
- `zod`: For parameter validation

## License

ISC
`# Web Scraper MCP Server

This Model Context Protocol (MCP) server provides a tool for scraping webpages and converting them to markdown format using Puppeteer, Readability, and Turndown.

## Features

- Scrapes webpages using Puppeteer with stealth mode
- Extracts main content with Mozilla's Readability
- Converts HTML to well-formatted Markdown
- Special handling for code blocks, tables, and other structured content
- Automatic cookie consent handling with AI-driven interactions
- Accessible via the Model Context Protocol

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd web-scraper-mcp-server

# Install dependencies
npm install

# Build the project
npm run build
```

## Environment Setup

Create a `.env` file in the root directory with the following variables:

```
OPENAI_API_KEY=your_openai_api_key
PORT=3001 # Optional, defaults to 3001
```

## Usage

### Starting the Server

```bash
npm start
```

This will start the MCP server on port 3001 (or the port specified in your `.env` file).

### Using as a Tool with MCP-compatible LLMs

The server provides a `scrape-webpage` tool that can be used by any MCP-compatible LLM.

Tool parameters:
- `url` (string, required): The URL of the webpage to scrape
- `allowCookies` (boolean, optional, default: false): Whether to automatically accept cookies using AI-driven interactions

## Development

```bash
# Run in development mode (build and start)
npm run dev
```

## Customization

You can modify the behavior of the scraper by editing the following parts of the code:

- `visitWebPage` function: Handles the core scraping logic
- `handlePageInteraction` function: Manages automatic interactions with cookie consent banners
- Turndown rules: Customizes how different HTML elements are converted to Markdown

## Dependencies

- `@modelcontextprotocol/sdk`: MCP server implementation
- `puppeteer` & `puppeteer-extra`: For web scraping with stealth capabilities
- `@mozilla/readability` & `jsdom`: For extracting main content
- `turndown`: For converting HTML to Markdown
- `sanitize-html`: For cleaning HTML content
- `openai`: For AI-driven interactions with webpages
- `express`: For handling HTTP requests
- `zod`: For parameter validation