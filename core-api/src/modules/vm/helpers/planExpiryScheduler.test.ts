/**
 * Plan expiry scheduler verification (requires MongoDB).
 *
 * Run: npx ts-node --transpile-only src/modules/vm/helpers/planExpiryScheduler.test.ts
 *
 * Optional real Proxmox stop test (destructive — stops a real VM):
 *   PLAN_EXPIRY_INTEGRATION_VM_ID=<mongo-vm-_id> npx ts-node --transpile-only src/modules/vm/helpers/planExpiryScheduler.test.ts
 */
import 'dotenv/config';
import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from '../../../config';
import { VM } from '../vm.model';
import { User } from '../../../models/user.model';
import { runPlanExpiryCheck } from './planExpiryScheduler';

if (config.MONGODB_DNS_SERVERS?.length) {
  dns.setServers(config.MONGODB_DNS_SERVERS);
}

async function main(): Promise<void> {
  await mongoose.connect(config.MONGODB_URI, { dbName: config.MONGODB_DB_NAME });

  const admin = await User.findOne({ role: 'super_admin', isActive: true }).select('_id').lean();
  if (!admin) {
    throw new Error('No super_admin user found for test VM scaffolding.');
  }

  const untouched = await VM.create({
    vmid: 999999001,
    node: 'plan-expiry-test-node',
    adminId: admin._id,
    name: 'plan-expiry-null-plan-test',
    templateId: 100,
    templateName: 'test-template',
    cloneType: 'dynamic_storage',
    allocatedCpu: 1,
    allocatedMemoryGb: 1,
    allocatedDiskGb: 10,
    status: 'running',
    planStatus: null,
    planPeriodEnd: new Date(Date.now() - 60_000),
  });

  await runPlanExpiryCheck();

  const afterUntouched = await VM.findById(untouched._id);
  if (afterUntouched?.planStatus !== null) {
    throw new Error(`Expected planStatus null for non-tracked VM, got ${afterUntouched?.planStatus}`);
  }
  console.log('PASS: VM with planStatus null was not touched by plan expiry check');

  const integrationVmId = process.env['PLAN_EXPIRY_INTEGRATION_VM_ID'];
  if (integrationVmId) {
    const target = await VM.findById(integrationVmId);
    if (!target) {
      throw new Error(`PLAN_EXPIRY_INTEGRATION_VM_ID not found: ${integrationVmId}`);
    }

    target.planStatus = 'active';
    target.planPeriodEnd = new Date(Date.now() - 60_000);
    if (target.status === 'stopped') {
      target.status = 'running';
    }
    await target.save();

    await runPlanExpiryCheck();

    const after = await VM.findById(integrationVmId);
    if (after?.planStatus !== 'expired') {
      throw new Error(`Expected planStatus expired after integration run, got ${after?.planStatus}`);
    }
    if (after?.status !== 'stopped') {
      throw new Error(`Expected VM status stopped after integration run, got ${after?.status}`);
    }
    console.log('PASS: Integration VM stopped via Proxmox and planStatus set to expired');
  } else {
    console.log('SKIP: Set PLAN_EXPIRY_INTEGRATION_VM_ID to run live Proxmox stop integration');
  }

  await VM.deleteOne({ _id: untouched._id });
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
