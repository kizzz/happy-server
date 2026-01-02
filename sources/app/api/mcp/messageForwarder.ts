import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log } from "@/utils/log";
import { eventRouter } from "@/app/events/eventRouter";
import { SessionContext } from "./sessionContext";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { allocateSessionSeq, allocateUserSeq } from "@/storage/seq";
import { db } from "@/storage/db";
import { buildNewMessageUpdate } from "@/app/events/eventRouter";

class MessageForwarder {
    private sessionHandlers = new Map<string, {
        mcp: McpServer;
        context: SessionContext;
        unsubscribe: () => void;
    }>();
    
    setupForwarding(sessionId: string, userId: string, context: SessionContext, mcp: McpServer): void {
        // Forward messages from MCP client to session
        // This would be done via MCP tool calls or custom methods
        // For now, we'll set up the infrastructure
        
        // Listen for session updates and forward to MCP clients
        const unsubscribe = this.setupSessionUpdateListener(sessionId, userId, mcp);
        
        this.sessionHandlers.set(sessionId, {
            mcp,
            context,
            unsubscribe
        });
        
        log({ module: 'mcp-forwarder', sessionId, userId }, `Message forwarding set up for session ${sessionId}`);
    }
    
    private setupSessionUpdateListener(sessionId: string, userId: string, mcp: McpServer): () => void {
        // This would listen to session WebSocket events and forward them to MCP
        // For now, this is a placeholder - actual implementation would need to:
        // 1. Subscribe to session update events
        // 2. Convert session messages to MCP notifications
        // 3. Send notifications to MCP client
        
        log({ module: 'mcp-forwarder', sessionId }, `Session update listener set up (placeholder)`);
        
        return () => {
            // Cleanup
        };
    }
    
    async forwardMcpMessageToSession(sessionId: string, userId: string, message: string): Promise<void> {
        // Forward a message from MCP client to the session
        // This creates a session message that will be processed by the agent
        
        const session = await db.session.findFirst({
            where: { id: sessionId, accountId: userId }
        });
        
        if (!session) {
            throw new Error('Session not found');
        }
        
        // Create encrypted message
        // Note: The message parameter is already a JSON string that needs to be encrypted
        // In a real implementation, we would encrypt using the session's dataEncryptionKey
        // For now, we store it as-is (the client should encrypt before sending)
        const msgContent: PrismaJson.SessionMessageContent = {
            t: 'encrypted',
            c: message // This should be base64-encoded encrypted content
        };
        
        const updSeq = await allocateUserSeq(userId);
        const msgSeq = await allocateSessionSeq(sessionId);
        
        const msg = await db.sessionMessage.create({
            data: {
                sessionId: sessionId,
                seq: msgSeq,
                content: msgContent as any,
                localId: null
            }
        });
        
        // Emit new message update
        const updatePayload = buildNewMessageUpdate(msg, sessionId, updSeq, randomKeyNaked(12));
        eventRouter.emitUpdate({
            userId,
            payload: updatePayload,
            recipientFilter: { type: 'all-interested-in-session', sessionId }
        });
        
        log({ module: 'mcp-forwarder', sessionId }, `Forwarded MCP message to session ${sessionId}`);
    }
    
    cleanup(sessionId: string): void {
        const handler = this.sessionHandlers.get(sessionId);
        if (handler) {
            handler.unsubscribe();
            this.sessionHandlers.delete(sessionId);
            log({ module: 'mcp-forwarder', sessionId }, `Cleaned up message forwarding for session ${sessionId}`);
        }
    }
}

export const messageForwarder = new MessageForwarder();

