import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

async function run() {
  console.log("Connecting to Cloudflare Worker MCP Server...");
  
  // Create an explicit connection option mapping to prevent 400 Bad Request
  const transport = new SSEClientTransport(
    new URL("http://127.0.0.1:8787/mcp"),
    {
      eventSourceInitDict: {
        headers: {
          "Accept": "text/event-stream"
        }
      }
    }
  );
  
  const client = new Client({ name: "test-client", version: "1.0.0" }, {});
  
  await client.connect(transport);
  console.log("✅ Successfully connected!");

  // List available tools to verify the worker is exposing them
  const tools = await client.listTools();
  console.log("\n📦 Available Tools Found:", JSON.stringify(tools, null, 2));

  // Call your SnapLogic tool with a dummy prompt
  console.log("\n🚀 Sending test query to run_agent_tool...");
  const response = await client.callTool({
    name: "run_agent_tool",
    arguments: {
      user_message: "Hello! This is an automated network connection check."
    }
  });

  console.log("\n📥 SnapLogic Response Received:", JSON.stringify(response, null, 2));
}

run().catch(console.error);
