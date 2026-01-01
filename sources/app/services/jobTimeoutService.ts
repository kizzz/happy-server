import { log } from "@/utils/log";
import { inTx } from "@/storage/inTx";
import * as jobStorage from "@/storage/jobStorage";
import { db } from "@/storage/db";
import { allocateUserSeq } from "@/storage/seq";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { eventRouter, buildUpdateJobUpdate } from "@/app/events/jobEventRouter";
import { encryptString } from "@/modules/encrypt";

export class JobTimeoutService {
    private interval: NodeJS.Timeout | null = null;
    private isRunning = false;
    
    start(intervalMs: number = 60000) { // Check every minute
        if (this.isRunning) return;
        this.isRunning = true;
        
        this.interval = setInterval(async () => {
            await this.checkTimeouts();
        }, intervalMs);
        
        // Run immediately
        this.checkTimeouts();
        
        log({ module: 'job-timeout' }, `Job timeout service started (interval: ${intervalMs}ms)`);
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        log({ module: 'job-timeout' }, 'Job timeout service stopped');
    }
    
    private async checkTimeouts() {
        try {
            const timedOutJobs = await inTx(async (tx) => {
                return await jobStorage.getTimedOutJobs(tx, 100);
            });
            
            if (timedOutJobs.length === 0) {
                return;
            }
            
            log({ module: 'job-timeout' }, `Found ${timedOutJobs.length} timed out jobs`);
            
            for (const job of timedOutJobs) {
                await inTx(async (tx) => {
                    // Encrypt timeout error message
                    const errorMessage = 'Job execution timeout';
                    const encryptedErrorBytes = encryptString(['job', job.id, 'error'], errorMessage);
                    // Convert to base64 string for storage
                    const encryptedError = Buffer.from(encryptedErrorBytes).toString('base64');
                    
                    // Update job status to failed
                    await jobStorage.updateJobStatus(tx, job.id, {
                        status: 'failed',
                        error: encryptedError,
                        completedAt: new Date()
                    });
                    
                    // Emit timeout event
                    const updatedJob = await jobStorage.getJobById(tx, job.id);
                    if (updatedJob) {
                        const updSeq = await allocateUserSeq(job.accountId);
                        const updatePayload = buildUpdateJobUpdate(updatedJob, updSeq, randomKeyNaked(12));
                        eventRouter.emitUpdate({
                            userId: job.accountId,
                            payload: updatePayload,
                            recipientFilter: { type: 'user-scoped-only' }
                        });
                    }
                    
                    log({ module: 'job-timeout', jobId: job.id }, `Job timed out and marked as failed`);
                });
            }
        } catch (error) {
            log({ module: 'job-timeout', level: 'error' }, `Error checking timeouts: ${error}`);
        }
    }
}

