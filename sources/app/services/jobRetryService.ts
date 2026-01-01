import { log } from "@/utils/log";
import { inTx } from "@/storage/inTx";
import * as jobStorage from "@/storage/jobStorage";
import { allocateUserSeq } from "@/storage/seq";
import { randomKeyNaked } from "@/utils/randomKeyNaked";
import { eventRouter, buildNewJobUpdate } from "@/app/events/jobEventRouter";

export class JobRetryService {
    private interval: NodeJS.Timeout | null = null;
    private isRunning = false;
    
    start(intervalMs: number = 60000) { // Check every minute
        if (this.isRunning) return;
        this.isRunning = true;
        
        this.interval = setInterval(async () => {
            await this.retryJobs();
        }, intervalMs);
        
        // Run immediately
        this.retryJobs();
        
        log({ module: 'job-retry' }, `Job retry service started (interval: ${intervalMs}ms)`);
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        log({ module: 'job-retry' }, 'Job retry service stopped');
    }
    
    private async retryJobs() {
        try {
            const jobsToRetry = await inTx(async (tx) => {
                return await jobStorage.getFailedJobsReadyToRetry(tx, 100);
            });
            
            if (jobsToRetry.length === 0) {
                return;
            }
            
            log({ module: 'job-retry' }, `Found ${jobsToRetry.length} jobs ready to retry`);
            
            for (const job of jobsToRetry) {
                await inTx(async (tx) => {
                    const newJobId = await jobStorage.retryFailedJob(tx, job.id, job.accountId);
                    if (newJobId) {
                        log({ module: 'job-retry', originalJobId: job.id, newJobId }, `Retrying job`);
                        
                        // Emit retry event
                        const newJob = await jobStorage.getJobById(tx, newJobId);
                        if (newJob) {
                            const updSeq = await allocateUserSeq(job.accountId);
                            const updatePayload = buildNewJobUpdate(newJob, updSeq, randomKeyNaked(12));
                            eventRouter.emitUpdate({
                                userId: job.accountId,
                                payload: updatePayload,
                                recipientFilter: { type: 'user-scoped-only' }
                            });
                        }
                    }
                });
            }
        } catch (error) {
            log({ module: 'job-retry', level: 'error' }, `Error retrying jobs: ${error}`);
        }
    }
}

