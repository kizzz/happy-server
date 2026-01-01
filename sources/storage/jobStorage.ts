import { Tx } from "@/storage/inTx";
import { Prisma } from "@prisma/client";

export interface CreateJobParams {
    accountId: string;
    sessionId?: string;
    type: 'claude' | 'codex';
    config: string; // Encrypted
    input: string; // Encrypted
    metadata?: Record<string, any>;
    priority?: number;
    machineId?: string;
    timeoutMs?: number; // Timeout in milliseconds
    maxRetries?: number; // Maximum number of retries
}

export interface UpdateJobStatusParams {
    status: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    output?: string; // Encrypted
    error?: string; // Encrypted
    startedAt?: Date;
    completedAt?: Date;
}

/**
 * Create a new job
 */
export async function createJob(tx: Tx, params: CreateJobParams): Promise<string> {
    const timeoutMs = params.timeoutMs || 30 * 60 * 1000; // Default 30 minutes
    const timeoutAt = new Date(Date.now() + timeoutMs);
    const maxRetries = params.maxRetries ?? 3; // Default 3 retries
    
    const job = await tx.job.create({
        data: {
            accountId: params.accountId,
            sessionId: params.sessionId,
            type: params.type,
            config: params.config,
            input: params.input,
            metadata: params.metadata || null,
            priority: params.priority || 0,
            machineId: params.machineId,
            timeoutMs,
            timeoutAt,
            maxRetries,
            status: 'pending'
        }
    });
    return job.id;
}

/**
 * Get job by ID
 */
export async function getJobById(tx: Tx, jobId: string, accountId?: string) {
    const where: Prisma.JobWhereInput = { id: jobId };
    if (accountId) {
        where.accountId = accountId;
    }
    
    return await tx.job.findFirst({ where });
}

/**
 * Update job status and related fields
 */
export async function updateJobStatus(
    tx: Tx,
    jobId: string,
    params: UpdateJobStatusParams
): Promise<void> {
    await tx.job.update({
        where: { id: jobId },
        data: {
            status: params.status,
            output: params.output,
            error: params.error,
            startedAt: params.startedAt,
            completedAt: params.completedAt
        }
    });
}

/**
 * Get pending jobs for a machine, ordered by priority (desc) then createdAt (asc)
 */
export async function getPendingJobsForMachine(tx: Tx, machineId: string, limit: number = 10) {
    return await tx.job.findMany({
        where: {
            machineId,
            status: 'pending'
        },
        orderBy: [
            { priority: 'desc' },
            { createdAt: 'asc' }
        ],
        take: limit
    });
}

/**
 * Get jobs for an account with optional filters
 */
export async function getJobsForAccount(
    tx: Tx,
    accountId: string,
    options?: {
        status?: 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
        limit?: number;
        cursor?: string;
    }
) {
    const where: Prisma.JobWhereInput = { accountId };
    
    if (options?.status) {
        where.status = options.status;
    }
    
    if (options?.cursor) {
        where.id = { lt: options.cursor };
    }
    
    return await tx.job.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50
    });
}

/**
 * Assign job to a machine (update machineId and status to queued)
 */
export async function assignJobToMachine(tx: Tx, jobId: string, machineId: string): Promise<void> {
    await tx.job.update({
        where: { id: jobId },
        data: {
            machineId,
            status: 'queued'
        }
    });
}

/**
 * Cancel a pending or queued job
 */
export async function cancelJob(tx: Tx, jobId: string, accountId: string): Promise<boolean> {
    const job = await tx.job.findFirst({
        where: {
            id: jobId,
            accountId,
            status: { in: ['pending', 'queued'] }
        }
    });
    
    if (!job) {
        return false;
    }
    
    await tx.job.update({
        where: { id: jobId },
        data: {
            status: 'cancelled',
            completedAt: new Date()
        }
    });
    
    return true;
}

/**
 * Get pending jobs without machineId, ordered by priority (desc) then createdAt (asc)
 */
export async function getPendingJobsWithoutMachine(tx: Tx, accountId: string, limit: number = 50) {
    return await tx.job.findMany({
        where: {
            accountId,
            status: 'pending',
            machineId: null
        },
        orderBy: [
            { priority: 'desc' },
            { createdAt: 'asc' }
        ],
        take: limit
    });
}

/**
 * Assign pending jobs to available machines
 * Returns the number of jobs assigned
 */
export async function assignPendingJobsToMachines(
    tx: Tx,
    accountId: string,
    limit: number = 50
): Promise<number> {
    // Get pending jobs without machineId
    const pendingJobs = await getPendingJobsWithoutMachine(tx, accountId, limit);
    
    if (pendingJobs.length === 0) {
        return 0;
    }
    
    // Get available machines
    const { getAvailableMachines } = await import('./machineStorage');
    const availableMachines = await getAvailableMachines(tx, accountId, 1);
    
    if (availableMachines.length === 0) {
        return 0; // No machines available
    }
    
    // Track load per machine
    const machineLoads = new Map<string, number>();
    
    // Count current running/queued jobs per machine
    for (const machine of availableMachines) {
        machineLoads.set(machine.machineId, machine.currentRunningJobs);
    }
    
    let assignedCount = 0;
    
    for (const job of pendingJobs) {
        // Find machine with most available slots
        const machine = availableMachines
            .map(m => ({
                ...m,
                currentLoad: machineLoads.get(m.machineId) || 0,
                effectiveSlots: m.availableSlots - (machineLoads.get(m.machineId) || 0)
            }))
            .filter(m => m.effectiveSlots > 0)
            .sort((a, b) => b.effectiveSlots - a.effectiveSlots)[0];
        
        if (!machine) {
            break; // No more machines with capacity
        }
        
        // Assign job to machine
        await assignJobToMachine(tx, job.id, machine.machineId);
        machineLoads.set(machine.machineId, (machineLoads.get(machine.machineId) || 0) + 1);
        assignedCount++;
    }
    
    return assignedCount;
}

/**
 * Retry a failed job by creating a new job with incremented retry count
 * Returns the new job ID, or null if max retries reached
 */
export async function retryFailedJob(
    tx: Tx,
    jobId: string,
    accountId: string
): Promise<string | null> {
    const job = await getJobById(tx, jobId, accountId);
    
    if (!job || job.status !== 'failed') {
        return null;
    }
    
    if (job.retryCount >= job.maxRetries) {
        return null; // Max retries reached
    }
    
    // Calculate backoff delay (exponential: 1min, 2min, 4min, ... max 1 hour)
    const backoffMs = Math.min(
        1000 * 60 * Math.pow(2, job.retryCount),
        1000 * 60 * 60 // Max 1 hour
    );
    const retryAfter = new Date(Date.now() + backoffMs);
    
    // Create new job with incremented retry count
    const newJob = await tx.job.create({
        data: {
            accountId: job.accountId,
            sessionId: job.sessionId,
            type: job.type,
            config: job.config, // Reuse encrypted config
            input: job.input, // Reuse encrypted input
            metadata: job.metadata,
            priority: job.priority,
            machineId: null, // Will be reassigned
            timeoutMs: job.timeoutMs,
            maxRetries: job.maxRetries,
            retryCount: job.retryCount + 1,
            retryAfter,
            status: 'pending'
        }
    });
    
    return newJob.id;
}

/**
 * Get failed jobs ready to retry (retryAfter is null or in the past)
 * Note: We fetch all failed jobs and filter in memory since Prisma doesn't support
 * comparing two fields directly in a where clause
 */
export async function getFailedJobsReadyToRetry(tx: Tx, limit: number = 100) {
    const now = new Date();
    
    const failedJobs = await tx.job.findMany({
        where: {
            status: 'failed',
            OR: [
                { retryAfter: null },
                { retryAfter: { lte: now } }
            ]
        },
        orderBy: [
            { createdAt: 'asc' }
        ],
        take: limit * 2 // Fetch more to account for filtering
    });
    
    // Filter in memory: retryCount < maxRetries
    return failedJobs.filter(job => {
        const maxRetries = job.maxRetries ?? 3;
        return job.retryCount < maxRetries;
    }).slice(0, limit);
}

/**
 * Get jobs that have timed out (timeoutAt is in the past and status is running/queued)
 */
export async function getTimedOutJobs(tx: Tx, limit: number = 100) {
    const now = new Date();
    
    return await tx.job.findMany({
        where: {
            status: { in: ['running', 'queued'] },
            timeoutAt: { lte: now }
        },
        take: limit
    });
}

