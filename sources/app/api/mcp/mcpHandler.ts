import { FastifyRequest, FastifyReply } from "fastify";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { log } from "@/utils/log";
import { eventRouter } from "@/app/events/eventRouter";
import { db } from "@/storage/db";
import { sessionContextManager } from "./sessionContext";
import { messageForwarder } from "./messageForwarder";
import { toolExposer } from "./toolExposer";

export interface McpHandler {
    handleRequest(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    cleanup(): void;
}

export function createMcpHandlerForSession(sessionId: string, userId: string): McpHandler {
    const mcp = new McpServer({
        name: "Happy Session MCP",
        version: "1.0.0",
    });

    // Get session context
    const context = sessionContextManager.getOrCreateContext(sessionId, userId);
    
    // Register session tools via toolExposer
    toolExposer.registerSessionTools(mcp, sessionId, userId);
    
    // Create transport
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined
    });
    
    let connected = false;
    
    const handler: McpHandler = {
        async handleRequest(request: FastifyRequest, reply: FastifyReply) {
            if (!connected) {
                await mcp.connect(transport);
                connected = true;
                
                // Register message forwarding
                messageForwarder.setupForwarding(sessionId, userId, context, mcp);
                
                log({ module: 'mcp', sessionId, userId }, `MCP handler connected for session ${sessionId}`);
            }
            
            // Handle the HTTP request
            await transport.handleRequest(request.raw, reply.raw);
        },
        
        cleanup() {
            if (connected) {
                messageForwarder.cleanup(sessionId);
                sessionContextManager.removeContext(sessionId);
                log({ module: 'mcp', sessionId, userId }, `MCP handler cleaned up for session ${sessionId}`);
            }
        }
    };
    
    return handler;
}

