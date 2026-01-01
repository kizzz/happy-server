import { Tx } from "@/storage/inTx";
import { Prisma } from "@prisma/client";
import { db } from "./db";

export interface MachineAvailability {
    machineId: string;
    accountId: string;
    active: boolean;
    lastActiveAt: Date;
    maxConcurrentJobs: number; // From daemonState or default
    currentRunningJobs: number; // Count from Job table
    availableSlots: number;
}

/**
 * Get available machines for job assignment
 * Machines are considered available if:
 * 1. They are active (active = true)
 * 2. They were recently active (lastActiveAt within last 5 minutes)
 * 3. They have available slots (currentRunningJobs < maxConcurrentJobs)
 */
export async function getAvailableMachines(
    tx: Tx,
    accountId: string,
    minAvailableSlots: number = 1
): Promise<MachineAvailability[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    // Get all active machines for this account
    const machines = await tx.machine.findMany({
        where: {
            accountId,
            active: true,
            lastActiveAt: {
                gte: fiveMinutesAgo
            }
        }
    });
    
    if (machines.length === 0) {
        return [];
    }
    
    // Count running jobs per machine
    const machineIds = machines.map(m => m.id);
    const runningJobsCounts = await tx.job.groupBy({
        by: ['machineId'],
        where: {
            machineId: { in: machineIds },
            status: { in: ['running', 'queued'] }
        },
        _count: {
            id: true
        }
    });
    
    const runningJobsMap = new Map<string, number>();
    for (const count of runningJobsCounts) {
        if (count.machineId) {
            runningJobsMap.set(count.machineId, count._count.id);
        }
    }
    
    // Build availability list
    const availability: MachineAvailability[] = [];
    
    for (const machine of machines) {
        const currentRunningJobs = runningJobsMap.get(machine.id) || 0;
        
        // Default maxConcurrentJobs to 3 if daemonState is not available
        // In a real implementation, we'd decrypt daemonState, but for now we'll use a default
        // and count actual running jobs from the database
        const maxConcurrentJobs = 3; // Default, could be extracted from daemonState if needed
        const availableSlots = maxConcurrentJobs - currentRunningJobs;
        
        if (availableSlots >= minAvailableSlots) {
            availability.push({
                machineId: machine.id,
                accountId: machine.accountId,
                active: machine.active,
                lastActiveAt: machine.lastActiveAt,
                maxConcurrentJobs,
                currentRunningJobs,
                availableSlots
            });
        }
    }
    
    // Sort by available slots (descending) - machines with most capacity first
    return availability.sort((a, b) => b.availableSlots - a.availableSlots);
}

/**
 * Get machine by ID
 */
export async function getMachineById(tx: Tx, machineId: string, accountId: string) {
    return await tx.machine.findFirst({
        where: {
            id: machineId,
            accountId
        }
    });
}

/**
 * Count running jobs for a specific machine
 */
export async function countRunningJobsForMachine(tx: Tx, machineId: string): Promise<number> {
    const result = await tx.job.count({
        where: {
            machineId,
            status: { in: ['running', 'queued'] }
        }
    });
    return result;
}

