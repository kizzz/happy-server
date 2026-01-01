import { log } from "@/utils/log";
import { inTx } from "@/storage/inTx";
import * as jobStorage from "@/storage/jobStorage";

export class JobAssignmentService {
    private interval: NodeJS.Timeout | null = null;
    private isRunning = false;
    
    start(intervalMs: number = 10000) {
        if (this.isRunning) return;
        this.isRunning = true;
        
        this.interval = setInterval(async () => {
            await this.assignJobs();
        }, intervalMs);
        
        // Run immediately
        this.assignJobs();
        
        log({ module: 'job-assignment' }, `Job assignment service started (interval: ${intervalMs}ms)`);
    }
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.isRunning = false;
        log({ module: 'job-assignment' }, 'Job assignment service stopped');
    }
    
    private async assignJobs() {
        try {
            // Get all users with pending jobs
            const usersWithPendingJobs = await inTx(async (tx) => {
                const jobs = await tx.job.findMany({
                    where: {
                        status: 'pending',
                        machineId: null
                    },
                    select: {
                        accountId: true
                    },
                    distinct: ['accountId']
                });
                
                return jobs.map(j => j.accountId);
            });
            
            for (const accountId of usersWithPendingJobs) {
                await inTx(async (tx) => {
                    const assigned = await jobStorage.assignPendingJobsToMachines(tx, accountId, 50);
                    if (assigned > 0) {
                        log({ module: 'job-assignment', accountId }, `Assigned ${assigned} jobs to machines`);
                    }
                });
            }
        } catch (error) {
            log({ module: 'job-assignment', level: 'error' }, `Error assigning jobs: ${error}`);
        }
    }
}

