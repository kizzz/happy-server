import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { log } from "@/utils/log";
import { z } from "zod";
import { messageForwarder } from "./messageForwarder";

class ToolExposer {
    registerSessionTools(mcp: McpServer, sessionId: string, userId: string): void {
        // Register change_title tool (same as local Happy server)
        mcp.registerTool('change_title', {
            description: 'Change the title of the current chat session',
            title: 'Change Chat Title',
            inputSchema: {
                title: z.string().describe('The new title for the chat session'),
            },
        }, async (args: { title: string }) => {
            log({ module: 'mcp-tools', sessionId, userId }, `change_title called with: ${args.title}`);
            
            // Forward to session via message (similar to local implementation)
            // In a real implementation, this would send a summary message to the session
            try {
                await messageForwarder.forwardMcpMessageToSession(
                    sessionId,
                    userId,
                    JSON.stringify({
                        type: 'summary',
                        summary: args.title,
                        leafUuid: `mcp-${Date.now()}`
                    })
                );
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Successfully changed chat title to: "${args.title}"`,
                        },
                    ],
                    isError: false,
                };
            } catch (error) {
                log({ module: 'mcp-tools', sessionId, userId, level: 'error' }, `Error in change_title: ${error}`);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to change chat title: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
        
        // Register send_message tool to allow MCP clients to send messages to session
        mcp.registerTool('send_message', {
            description: 'Send a message to the chat session',
            title: 'Send Message',
            inputSchema: {
                message: z.string().describe('The message content to send to the session'),
            },
        }, async (args: { message: string }) => {
            log({ module: 'mcp-tools', sessionId, userId }, `send_message called`);
            
            try {
                await messageForwarder.forwardMcpMessageToSession(
                    sessionId,
                    userId,
                    JSON.stringify({
                        role: 'user',
                        content: {
                            type: 'text',
                            text: args.message
                        }
                    })
                );
                
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Message sent to session`,
                        },
                    ],
                    isError: false,
                };
            } catch (error) {
                log({ module: 'mcp-tools', sessionId, userId, level: 'error' }, `Error in send_message: ${error}`);
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
        
        log({ module: 'mcp-tools', sessionId, userId }, `Registered session tools for ${sessionId}`);
    }
}

export const toolExposer = new ToolExposer();

