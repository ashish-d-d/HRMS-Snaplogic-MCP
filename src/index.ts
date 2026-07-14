import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";

/**
 * Environment bindings provided by Cloudflare.
 * Each operational pipeline has its own dedicated Triggered Task URL and secret token.
 */
type Env = {
  MCP_API_KEY: string;
  
  // 6 Isolated Pipeline's Triggered Task URLs 
  SL_URL_DIRECTORY: string;
  SL_URL_LEAVE: string;
  SL_URL_PAYROLL: string;
  SL_URL_ONBOARDING: string;
  SL_URL_APPLICANT: string;
  SL_URL_GENERAL: string;

  // 6 Each tasks Security Tokens
  SL_TOKEN_DIRECTORY: string;
  SL_TOKEN_LEAVE: string;
  SL_TOKEN_PAYROLL: string;
  SL_TOKEN_ONBOARDING: string;
  SL_TOKEN_APPLICANT: string;
  SL_TOKEN_GENERAL: string;
};

// Base schema properties shared across all tools
const baseInputSchema = {
  user_message: z.string().describe("The verbatim employee request or query in natural language."),
  target_employee_id: z.string().optional().describe("Unique employee ID if explicitly mentioned in the context."),
  conversation_history: z
    .array(z.object({ content: z.string(), sl_role: z.string() }))
    .optional()
    .describe("Maintains state context across multi-step workflows."),
};

export class MyMCP extends McpAgent<Env> {
  server = new McpServer({
    name: "snaplogic-hrms-agent",
    version: "1.0.0",
  });

  // Reusable internal pipeline router targeting a specific URL and dynamic Token binding
  private async forwardToIsolatedPipeline(
    targetUrl: string,
    targetToken: string,
    category: string,
    user_message: string,
    target_employee_id?: string,
    conversation_history?: Array<{ content: string; sl_role: string }>
  ) {
    const contents = Array.isArray(conversation_history) ? [...conversation_history] : [];
    contents.push({ content: user_message, sl_role: "USER" });

    const res = await fetch(targetUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${targetToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category,
        employeeId: target_employee_id || null,
        chat_context: contents,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { content: [{ type: "text" as const, text: `SnapLogic error ${res.status}: ${text}` }] };
    }

    const data = await res.json();
    const normalized = Array.isArray(data) && data.length === 1 ? data[0] : data;

    return { content: [{ type: "text" as const, text: JSON.stringify(normalized) }] };
  }

  async init() {
    // 1. DIRECTORY_LOOKUP -> SL_URL_DIRECTORY using SL_TOKEN_DIRECTORY
    this.server.registerTool(
      "lookup_employee_directory",
      {
        description: "Search employee records, look up team hierarchies, manager details, and locate contact information.",
        inputSchema: z.object(baseInputSchema),
      },
      async ({ user_message, target_employee_id, conversation_history }) => 
        this.forwardToIsolatedPipeline(
          this.env.SL_URL_DIRECTORY, 
          this.env.SL_TOKEN_DIRECTORY, 
          "DIRECTORY_LOOKUP", 
          user_message, 
          target_employee_id, 
          conversation_history
        )
    );

    // 2. LEAVE_MANAGEMENT -> SL_URL_LEAVE using SL_TOKEN_LEAVE
    this.server.registerTool(
      "manage_leaves_and_timeoff",
      {
        description: "Check leave balances, view time-off accruals, submit new leave requests, or cancel/supersede existing ones.",
        inputSchema: z.object(baseInputSchema),
      },
      async ({ user_message, target_employee_id, conversation_history }) => 
        this.forwardToIsolatedPipeline(
          this.env.SL_URL_LEAVE, 
          this.env.SL_TOKEN_LEAVE, 
          "LEAVE_MANAGEMENT", 
          user_message, 
          target_employee_id, 
          conversation_history
        )
    );

    // 3. PAYROLL_INFO -> SL_URL_PAYROLL using SL_TOKEN_PAYROLL
    this.server.registerTool(
      "query_payroll_details",
      {
        description: "Access compensation details, salary structures, tax declarations, bonus updates, and historical slips.",
        inputSchema: z.object(baseInputSchema),
      },
      async ({ user_message, target_employee_id, conversation_history }) => 
        this.forwardToIsolatedPipeline(
          this.env.SL_URL_PAYROLL, 
          this.env.SL_TOKEN_PAYROLL, 
          "PAYROLL_INFO", 
          user_message, 
          target_employee_id, 
          conversation_history
        )
    );

    // 4. ONBOARDING_OFFBOARDING -> SL_URL_ONBOARDING using SL_TOKEN_ONBOARDING
    this.server.registerTool(
      "manage_onboarding_offboarding",
      {
        description: "Process and trigger lifecycle state transitions for employee onboarding (new hires) or offboarding (terminations). " +
                     "IMPORTANT: This tool handles mutations and transactions only. It does NOT support looking up, searching for, or filtering " +
                     "already onboarded or offboarded employees—use the lookup_employee_directory tool for all history or record queries.",
        inputSchema: z.object(baseInputSchema),
      },
      async ({ user_message, target_employee_id, conversation_history }) => 
        this.forwardToIsolatedPipeline(
          this.env.SL_URL_ONBOARDING, 
          this.env.SL_TOKEN_ONBOARDING, 
          "ONBOARDING_OFFBOARDING", 
          user_message, 
          target_employee_id, 
          conversation_history
        )
    );

    // 5. APPLICANT_TRACKING -> SL_URL_APPLICANT using SL_TOKEN_APPLICANT
    this.server.registerTool(
      "query_applicant_tracking",
      {
        description: "Manage recruitment channels. Fetch, create, or update job openings, candidates profiles, and application status maps.",
        inputSchema: z.object(baseInputSchema),
      },
      async ({ user_message, target_employee_id, conversation_history }) => 
        this.forwardToIsolatedPipeline(
          this.env.SL_URL_APPLICANT, 
          this.env.SL_TOKEN_APPLICANT, 
          "APPLICANT_TRACKING", 
          user_message, 
          target_employee_id, 
          conversation_history
        )
    );

    // 6. COMBINED: POLICY & GENERAL INQUIRY -> SL_URL_GENERAL using SL_TOKEN_GENERAL
    this.server.registerTool(
      "query_policies_and_general_inquiries",
      {
        description: "Handles structural corporate policy questions (e.g., hybrid rules, holiday calendars, working hours) as well as general HR inquiries, support tickets, and workplace FAQs.",
        inputSchema: z.object(baseInputSchema),
      },
      async ({ user_message, target_employee_id, conversation_history }) => 
        this.forwardToIsolatedPipeline(
          this.env.SL_URL_GENERAL, 
          this.env.SL_TOKEN_GENERAL, 
          "GENERAL_INQUIRY", 
          user_message, 
          target_employee_id, 
          conversation_history
        )
    );
  }
}

// HTTP handler: /health (no auth), /mcp (MCP endpoint)
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/mcp") {
      const contentType = request.headers.get("content-type") || "";
      
      // If direct binary multipart bypass is executed, route via applicant pipeline token maps
      if (contentType.includes("multipart/form-data")) {
        try {
          const formData = await request.formData();
          const snapLogicForm = new FormData();

          for (const [key, value] of formData.entries()) {
            if (value instanceof File) {
              snapLogicForm.append(key, value, value.name);
            } else {
              snapLogicForm.append(key, value);
            }
          }

          const res = await fetch(env.SL_URL_APPLICANT, {
            method: "POST",
            headers: { Authorization: `Bearer ${env.SL_TOKEN_APPLICANT}` },
            body: snapLogicForm,
          });

          const responseData = await res.json();
          return new Response(JSON.stringify(responseData), {
            status: res.status,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: `Multipart form routing failed: ${err.message}` }), { status: 400 });
        }
      }

      return MyMCP.serve("/mcp").fetch(request, env, ctx);
    }

    return new Response("Not found", { status: 404 });
  },
};