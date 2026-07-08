import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

/**
 * Environment bindings provided by Cloudflare.
 * You will set these in wrangler later:
 *  - SL_PIPELINE_URL: SnapLogic Triggered Task URL
 *  - SL_PIPELINE_TOKEN: SnapLogic Bearer token
 *  - MCP_API_KEY: API key clients must send to call /mcp
 */
type Env = {
  SL_PIPELINE_URL: string;
  SL_PIPELINE_TOKEN: string;
  MCP_API_KEY: string;
};

// Our MCP agent: one tool that forwards to SnapLogic
export class MyMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "snaplogic-hrms-agent",
    version: "1.0.0",
  });

  async init() {
    this.server.registerTool(
      "execute_hrms_action",
      {
        description:
          "The primary gateway to the Enterprise HRMS (Human Resource Management System). " +
          "Use this tool to read, look up, modify, or terminate employee records, pull company holiday calendars, " +
          "query corporate leave/working hour policies, manage employee time-off request lifecycles (apply, update status), " +
          "and search or filter job applicant tracking pipelines. " +
          "The tool routes your request to specialized downstream internal modules (e.g., Payroll, LeaveTracker, EmployeeDirectory, ApplicantTracking, Onboarding). " +
          "IMPORTANT: For compound or relative queries (e.g., 'Compare Sarah's remaining leave balance with the team average'), " +
          "execute these sequentially. First, pull Sarah's records, then pull the team directory data, and compute the final output manually.",
        inputSchema: {
          action_category: z
            .enum([
              "DIRECTORY_LOOKUP",
              "LEAVE_MANAGEMENT",
              "PAYROLL_INFO",
              "ONBOARDING_OFFBOARDING",
              "POLICY_AND_CALENDAR",
              "APPLICANT_TRACKING",
              "GENERAL_INQUIRY"
            ])
            .describe("Categorize the core operational bucket of the HR request to optimize internal routing speed."),
          user_message: z
            .string()
            .describe("The verbatim employee request or query in natural language. Examples: 'Find job applications for job 1052', 'Change my leave request R123 to next week', 'Offboard employee E009', 'What is our hybrid work policy?'"),
          target_employee_id: z
            .string()
            .optional()
            .describe("The unique employee identification string if explicitly mentioned in the context, otherwise leave blank."),
          conversation_history: z
            .array(
              z.object({
                content: z.string(),
                sl_role: z.string(),
              })
            )
            .optional()
            .describe("Maintains state context across multi-step HR requests or approval workflows."),
        },
      },
      // Tool implementation: call SnapLogic pipeline
      async ({ action_category, user_message, target_employee_id, conversation_history }) => {
        const contents = Array.isArray(conversation_history) ? [...conversation_history] : [];
        contents.push({ content: user_message, sl_role: "USER" });

        // Build a structured package optimized for HR systems
        const payload = {
          category: action_category,
          employeeId: target_employee_id || null,
          chat_context: contents
        };

        const res = await fetch(this.env.SL_PIPELINE_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.env.SL_PIPELINE_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ contents }),
        });

        if (!res.ok) {
          const text = await res.text();
          return {
            content: [
              {
                type: "text",
                text: `SnapLogic error ${res.status}: ${text}`,
              },
            ],
          };
        }

        const data = await res.json();
        const normalized =
          Array.isArray(data) && data.length === 1 ? data[0] : data;

        // Return the full SnapLogic response as JSON string
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(normalized),
            },
          ],
        };
      }
    );
  }
}

// HTTP handler: /health (no auth), /mcp (MCP with API-key auth)
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check, no auth
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // MCP endpoint – NO AUTH
    if (url.pathname === "/mcp") {
      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};