import { UpdatePayload } from "@/app/events/eventRouter";
import { randomKeyNaked } from "@/utils/randomKeyNaked";

/**
 * Build a new job update payload
 */
export function buildNewJobUpdate(job: {
    id: string;
    accountId: string;
    type: 'claude' | 'codex';
    status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    priority: number;
    metadata: any;
    machineId: string | null;
    sessionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'new-job',
            jobId: job.id,
            accountId: job.accountId,
            jobType: job.type,
            status: job.status,
            priority: job.priority,
            metadata: job.metadata,
            machineId: job.machineId,
            sessionId: job.sessionId,
            createdAt: job.createdAt.getTime(),
            updatedAt: job.updatedAt.getTime(),
            startedAt: job.startedAt?.getTime(),
            completedAt: job.completedAt?.getTime()
        },
        createdAt: Date.now()
    };
}

/**
 * Build an update job payload
 */
export function buildUpdateJobUpdate(job: {
    id: string;
    type: 'claude' | 'codex';
    status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    priority: number;
    metadata: any;
    machineId: string | null;
    sessionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}, updateSeq: number, updateId: string): UpdatePayload {
    return {
        id: updateId,
        seq: updateSeq,
        body: {
            t: 'update-job',
            jobId: job.id,
            jobType: job.type,
            status: job.status,
            priority: job.priority,
            metadata: job.metadata,
            machineId: job.machineId,
            sessionId: job.sessionId,
            createdAt: job.createdAt.getTime(),
            updatedAt: job.updatedAt.getTime(),
            startedAt: job.startedAt?.getTime(),
            completedAt: job.completedAt?.getTime()
        },
        createdAt: Date.now()
    };
}

/**
 * Build a job update payload (alias for backward compatibility)
 */
export function buildJobUpdate(job: {
    id: string;
    type: 'claude' | 'codex';
    status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    priority: number;
    metadata: any;
    machineId: string | null;
    sessionId: string | null;
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
}, updateSeq: number, updateId: string): UpdatePayload {
    return buildUpdateJobUpdate(job, updateSeq, updateId);
}

export { eventRouter } from "@/app/events/eventRouter";

