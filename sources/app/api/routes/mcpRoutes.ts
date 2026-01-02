import { type Fastify } from "../types";
import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { createMcpHandlerForSession } from "../mcp/mcpHandler";

export function mcpRoutes(app: Fastify) {
    // HTTP MCP endpoint for session access
    // POST /v1/mcp/:sessionId
    // Handles StreamableHTTP MCP protocol
    app.post('/v1/mcp/:sessionId', {
        schema: {
            params: {
                type: 'object',
                properties: {
                    sessionId: { type: 'string' }
                },
                required: ['sessionId']
            }
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { sessionId } = request.params as { sessionId: string };
        
        log({ module: 'mcp', sessionId, userId }, `MCP connection request for session ${sessionId}`);
        
        // Validate session ownership
        const session = await db.session.findFirst({
            where: {
                id: sessionId,
                accountId: userId
            }
        });
        
        if (!session) {
            log({ module: 'mcp', sessionId, userId }, `Session not found or access denied`);
            return reply.code(404).send({ error: 'Session not found' });
        }
        
        // Create MCP handler for this session
        const mcpHandler = createMcpHandlerForSession(sessionId, userId);
        
        // Handle the MCP request
        try {
            await mcpHandler.handleRequest(request, reply);
        } catch (error) {
            log({ module: 'mcp', sessionId, userId, level: 'error' }, `Error handling MCP request: ${error}`);
            if (!reply.sent) {
                return reply.code(500).send({ error: 'Internal server error' });
            }
        }
    });
}

