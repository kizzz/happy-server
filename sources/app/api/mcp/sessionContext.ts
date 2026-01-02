import { log } from "@/utils/log";

export interface SessionContext {
    sessionId: string;
    userId: string;
    mcpClients: Set<string>; // Track active MCP client IDs
    createdAt: number;
}

class SessionContextManager {
    private contexts = new Map<string, SessionContext>();
    
    getOrCreateContext(sessionId: string, userId: string): SessionContext {
        let context = this.contexts.get(sessionId);
        if (!context) {
            context = {
                sessionId,
                userId,
                mcpClients: new Set(),
                createdAt: Date.now()
            };
            this.contexts.set(sessionId, context);
            log({ module: 'mcp-context', sessionId, userId }, `Created session context for ${sessionId}`);
        }
        return context;
    }
    
    getContext(sessionId: string): SessionContext | undefined {
        return this.contexts.get(sessionId);
    }
    
    removeContext(sessionId: string): void {
        const context = this.contexts.get(sessionId);
        if (context) {
            this.contexts.delete(sessionId);
            log({ module: 'mcp-context', sessionId }, `Removed session context for ${sessionId}`);
        }
    }
    
    addMcpClient(sessionId: string, clientId: string): void {
        const context = this.contexts.get(sessionId);
        if (context) {
            context.mcpClients.add(clientId);
            log({ module: 'mcp-context', sessionId, clientId }, `Added MCP client ${clientId} to session ${sessionId}`);
        }
    }
    
    removeMcpClient(sessionId: string, clientId: string): void {
        const context = this.contexts.get(sessionId);
        if (context) {
            context.mcpClients.delete(clientId);
            log({ module: 'mcp-context', sessionId, clientId }, `Removed MCP client ${clientId} from session ${sessionId}`);
        }
    }
    
    getActiveMcpClients(sessionId: string): string[] {
        const context = this.contexts.get(sessionId);
        return context ? Array.from(context.mcpClients) : [];
    }
}

export const sessionContextManager = new SessionContextManager();

