import { eventRouter, buildJobUpdate, buildNewJobUpdate, buildUpdateJobUpdate } from "@/app/events/jobEventRouter";
import { type Fastify } from "../types";
import { db } from "@/storage/db";
import { z } from "zod";
import { log } from "@/utils/log";
import { inTx } from "@/storage/inTx";
import * as jobStorage from "@/storage/jobStorage";
import { allocateUserSeq } from "@/storage/seq";
import { randomKeyNaked } from "@/utils/randomKeyNaked";

export function jobRoutes(app: Fastify) {

    // Create job
    app.post('/v1/jobs', {
        schema: {
            body: z.object({
                type: z.enum(['claude', 'codex']),
                config: z.string(), // Encrypted
                input: z.string(), // Encrypted
                sessionId: z.string().optional(),
                metadata: z.record(z.any()).optional(),
                priority: z.number().int().optional(),
                machineId: z.string().optional(),
                timeoutMs: z.number().int().optional(),
                maxRetries: z.number().int().optional()
            })
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { type, config, input, sessionId, metadata, priority, machineId, timeoutMs, maxRetries } = request.body;

        // Verify session belongs to user if provided
        if (sessionId) {
            const session = await db.session.findFirst({
                where: {
                    id: sessionId,
                    accountId: userId
                }
            });
            if (!session) {
                return reply.code(404).send({ error: 'Session not found' });
            }
        }

        const jobId = await inTx(async (tx) => {
            return await jobStorage.createJob(tx, {
                accountId: userId,
                sessionId,
                type,
                config,
                input,
                metadata,
                priority,
                machineId,
                timeoutMs,
                maxRetries
            });
        });
        
        // If no machineId was provided, trigger assignment (async, don't wait)
        if (!machineId) {
            inTx(async (tx) => {
                await jobStorage.assignPendingJobsToMachines(tx, userId, 1);
            }).catch(err => {
                log({ module: 'job-create', level: 'error' }, `Failed to assign job: ${err}`);
            });
        }

        log({ module: 'job-create', jobId, userId, type }, `Job created: ${jobId}`);

        // Get created job for response
        const job = await inTx(async (tx) => {
            return await jobStorage.getJobById(tx, jobId);
        });

        if (!job) {
            return reply.code(500).send({ error: 'Failed to create job' });
        }

        // Emit job update
        const updSeq = await allocateUserSeq(userId);
        const updatePayload = buildNewJobUpdate(job, updSeq, randomKeyNaked(12));
        eventRouter.emitUpdate({
            userId,
            payload: updatePayload,
            recipientFilter: { type: 'user-scoped-only' }
        });

        return reply.send({
            job: {
                id: job.id,
                type: job.type,
                status: job.status,
                priority: job.priority,
                metadata: job.metadata,
                machineId: job.machineId,
                sessionId: job.sessionId,
                createdAt: job.createdAt.getTime(),
                updatedAt: job.updatedAt.getTime(),
                startedAt: job.startedAt?.getTime(),
                completedAt: job.completedAt?.getTime()
            }
        });
    });

    // Get jobs for account
    app.get('/v1/jobs', {
        schema: {
            querystring: z.object({
                status: z.enum(['pending', 'queued', 'running', 'completed', 'failed', 'cancelled']).optional(),
                limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
                cursor: z.string().optional()
            }).optional()
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { status, limit, cursor } = request.query || {};

        const jobs = await inTx(async (tx) => {
            return await jobStorage.getJobsForAccount(tx, userId, {
                status,
                limit,
                cursor
            });
        });

        return reply.send({
            jobs: jobs.map((job) => ({
                id: job.id,
                type: job.type,
                status: job.status,
                priority: job.priority,
                metadata: job.metadata,
                machineId: job.machineId,
                sessionId: job.sessionId,
                createdAt: job.createdAt.getTime(),
                updatedAt: job.updatedAt.getTime(),
                startedAt: job.startedAt?.getTime(),
                completedAt: job.completedAt?.getTime()
            }))
        });
    });

    // Get job by ID
    app.get('/v1/jobs/:jobId', {
        schema: {
            params: z.object({
                jobId: z.string()
            })
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { jobId } = request.params;

        const job = await inTx(async (tx) => {
            return await jobStorage.getJobById(tx, jobId, userId);
        });

        if (!job) {
            return reply.code(404).send({ error: 'Job not found' });
        }

        return reply.send({
            job: {
                id: job.id,
                type: job.type,
                status: job.status,
                priority: job.priority,
                metadata: job.metadata,
                machineId: job.machineId,
                sessionId: job.sessionId,
                config: job.config, // Encrypted
                input: job.input, // Encrypted
                output: job.output, // Encrypted
                error: job.error, // Encrypted
                createdAt: job.createdAt.getTime(),
                updatedAt: job.updatedAt.getTime(),
                startedAt: job.startedAt?.getTime(),
                completedAt: job.completedAt?.getTime()
            }
        });
    });

    // Cancel job
    app.delete('/v1/jobs/:jobId', {
        schema: {
            params: z.object({
                jobId: z.string()
            })
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { jobId } = request.params;

        const cancelled = await inTx(async (tx) => {
            return await jobStorage.cancelJob(tx, jobId, userId);
        });

        if (!cancelled) {
            return reply.code(404).send({ error: 'Job not found or cannot be cancelled' });
        }

        // Get updated job for event
        const job = await inTx(async (tx) => {
            return await jobStorage.getJobById(tx, jobId);
        });

        if (job) {
            const updSeq = await allocateUserSeq(userId);
            const updatePayload = buildUpdateJobUpdate(job, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });
        }

        return reply.send({ success: true });
    });

    // Update job status (for job executors)
    app.post('/v1/jobs/:jobId/status', {
        schema: {
            params: z.object({
                jobId: z.string()
            }),
            body: z.object({
                status: z.enum(['running', 'completed', 'failed']),
                output: z.string().optional(), // Encrypted
                error: z.string().optional() // Encrypted
            })
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { jobId } = request.params;
        const { status, output, error } = request.body;

        const job = await inTx(async (tx) => {
            return await jobStorage.getJobById(tx, jobId, userId);
        });

        if (!job) {
            return reply.code(404).send({ error: 'Job not found' });
        }

        // Update job status
        await inTx(async (tx) => {
            await jobStorage.updateJobStatus(tx, jobId, {
                status,
                output,
                error,
                startedAt: status === 'running' && !job.startedAt ? new Date() : job.startedAt || undefined,
                completedAt: (status === 'completed' || status === 'failed') ? new Date() : undefined
            });
        });

        // Get updated job for event
        const updatedJob = await inTx(async (tx) => {
            return await jobStorage.getJobById(tx, jobId);
        });

        if (updatedJob) {
            const updSeq = await allocateUserSeq(userId);
            const updatePayload = buildUpdateJobUpdate(updatedJob, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });
        }

        return reply.send({ success: true });
    });

    // Retry failed job
    app.post('/v1/jobs/:jobId/retry', {
        schema: {
            params: z.object({
                jobId: z.string()
            })
        },
        preHandler: app.authenticate
    }, async (request, reply) => {
        const userId = request.userId;
        const { jobId } = request.params;

        const job = await inTx(async (tx) => {
            return await jobStorage.getJobById(tx, jobId, userId);
        });

        if (!job) {
            return reply.code(404).send({ error: 'Job not found' });
        }

        if (job.status !== 'failed') {
            return reply.code(400).send({ error: 'Job must be in failed status to retry' });
        }

        // Create new job with same config
        const newJobId = await inTx(async (tx) => {
            return await jobStorage.createJob(tx, {
                accountId: userId,
                sessionId: job.sessionId || undefined,
                type: job.type,
                config: job.config,
                input: job.input,
                metadata: job.metadata as Record<string, any> | undefined,
                priority: job.priority,
                machineId: job.machineId || undefined
            });
        });

        log({ module: 'job-retry', originalJobId: jobId, newJobId, userId }, `Job retried: ${jobId} -> ${newJobId}`);

        const newJob = await inTx(async (tx) => {
            return await jobStorage.getJobById(tx, newJobId);
        });

        if (newJob) {
            const updSeq = await allocateUserSeq(userId);
            const updatePayload = buildNewJobUpdate(newJob, updSeq, randomKeyNaked(12));
            eventRouter.emitUpdate({
                userId,
                payload: updatePayload,
                recipientFilter: { type: 'user-scoped-only' }
            });
        }

        return reply.send({
            job: newJob ? {
                id: newJob.id,
                type: newJob.type,
                status: newJob.status,
                priority: newJob.priority,
                metadata: newJob.metadata,
                machineId: newJob.machineId,
                sessionId: newJob.sessionId,
                createdAt: newJob.createdAt.getTime(),
                updatedAt: newJob.updatedAt.getTime()
            } : null
        });
    });
}


