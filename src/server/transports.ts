import express, { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from '../config.js';

/**
 * Sets up the appropriate transport for the MCP server
 * @param server The MCP server instance
 * @param serverName Server name for logging
 * @param serverVersion Server version for logging
 */
export function setupTransport(server: McpServer, serverName: string, serverVersion: string): void {
  if (config.useSSE) {
    setupSSETransport(server, serverName, serverVersion);
  } else {
    setupStdioTransport(server, serverName, serverVersion);
  }
}

/**
 * Sets up an SSE transport over HTTP
 * @param server The MCP server instance
 * @param serverName Server name for logging
 * @param serverVersion Server version for logging
 */
function setupSSETransport(server: McpServer, serverName: string, serverVersion: string): void {
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
  
  const webserver = app.listen(config.serverPort, () => {
    console.log(`${serverName} v${serverVersion} is running in SSE mode on port ${config.serverPort}`);
    if (config.apiBaseUrl) {
      console.log(`Using custom API endpoint: ${config.apiBaseUrl}`);
    }
  });
  
  webserver.keepAliveTimeout = 3000;
}

/**
 * Sets up a stdio transport for command-line usage
 * @param server The MCP server instance
 * @param serverName Server name for logging
 * @param serverVersion Server version for logging
 */
function setupStdioTransport(server: McpServer, serverName: string, serverVersion: string): void {
  // Use Stdio transport (default mode)
  const stdioTransport = new StdioServerTransport();
  
  console.log(`${serverName} v${serverVersion} starting in stdio mode`);
  if (config.apiBaseUrl) {
    console.log(`Using custom API endpoint: ${config.apiBaseUrl}`);
  }
  
  // Connect the transport to the server
  server.connect(stdioTransport).catch((error) => {
    console.error("Error connecting transport:", error);
    process.exit(1);
  });
}