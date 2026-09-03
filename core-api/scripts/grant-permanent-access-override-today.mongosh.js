/**
 * Grant permanent VM access override for end-users created on a given IST calendar day.
 * Matches VM Inventory "Permanent" override: accessOverride=true, accessOverrideUntil=null.
 *
 * Run on Mongo VM (preview first):
 *
 *   sudo docker cp grant-permanent-access-override-today.mongosh.js racko-onprem-mongo:/tmp/
 *   sudo docker exec -it racko-onprem-mongo mongosh --tls --tlsAllowInvalidCertificates \
 *     -u racko_app -p --authenticationDatabase iaas_platform iaas_platform \
 *     --file /tmp/grant-permanent-access-override-today.mongosh.js
 *
 * Set DRY_RUN = false in this file before applying.
 */

const DRY_RUN = true;

// IST calendar day (YYYY-MM-DD). Default: today in Asia/Kolkata.
const TARGET_DATE_IST = "2026-08-31";

// Optional: restrict to emails (lowercase). Example: ["user@example.com"]
const EMAIL_FILTER = [];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const dayStartUtc = new Date(`${TARGET_DATE_IST}T00:00:00.000Z`);
dayStartUtc.setTime(dayStartUtc.getTime() - IST_OFFSET_MS);
const dayEndUtc = new Date(dayStartUtc.getTime() + 24 * 60 * 60 * 1000);

const userQuery = {
  role: "user",
  createdAt: { $gte: dayStartUtc, $lt: dayEndUtc },
};
const tenantUserQuery = {
  role: "tenant_user",
  isConsoleOperator: { $ne: true },
  createdAt: { $gte: dayStartUtc, $lt: dayEndUtc },
};
if (EMAIL_FILTER.length) {
  userQuery.email = { $in: EMAIL_FILTER };
  tenantUserQuery.email = { $in: EMAIL_FILTER };
}

const platformUsers = db.users.find(userQuery, { email: 1, createdAt: 1 }).toArray();
const tenantUsers = db.tenantusers.find(tenantUserQuery, { email: 1, tenantId: 1, createdAt: 1 }).toArray();

const platformUserIds = platformUsers.map((u) => u._id);
const tenantUserIds = tenantUsers.map((u) => u._id);

print("=== Window (IST day -> UTC) ===");
printjson({ TARGET_DATE_IST, dayStartUtc, dayEndUtc, DRY_RUN });

print("\n=== Users created on target day ===");
print("Platform users:", platformUsers.length);
platformUsers.forEach((u) => print(`  ${u.email}  ${u.createdAt.toISOString()}`));
print("Tenant elastic users:", tenantUsers.length);
tenantUsers.forEach((u) => print(`  ${u.email}  tenant=${u.tenantId}  ${u.createdAt.toISOString()}`));

if (platformUserIds.length === 0 && tenantUserIds.length === 0) {
  print("\nNo matching users. Nothing to do.");
  quit(0);
}

const platformAssignFilter = { userId: { $in: platformUserIds }, status: "active" };
const tenantAssignFilter = { tenantUserId: { $in: tenantUserIds }, status: "active" };

const platformAssignments = db.externalvmuserassignments.find(platformAssignFilter).toArray();
const tenantAssignments = db.externalvmtenantassignments.find(tenantAssignFilter).toArray();

print("\n=== Active external VM assignments ===");
print("Platform assignments:", platformAssignments.length);
platformAssignments.forEach((a) =>
  print(`  assignment=${a._id} user=${a.userId} vm=${a.externalVmId} override=${a.accessOverride}`)
);
print("Tenant assignments:", tenantAssignments.length);
tenantAssignments.forEach((a) =>
  print(`  assignment=${a._id} tenantUser=${a.tenantUserId} vm=${a.externalVmId} override=${a.accessOverride}`)
);

const vmsFilter = {
  $or: [
    { assignedTo: { $in: platformUserIds } },
    { assignedTenantUserId: { $in: tenantUserIds } },
  ],
};
const vmsToUpdate = db.vms
  .find(vmsFilter, { name: 1, assignedTo: 1, assignedTenantUserId: 1, accessOverride: 1 })
  .toArray();

print("\n=== Platform VPS rows ===");
print("VPS docs:", vmsToUpdate.length);
vmsToUpdate.forEach((v) => print(`  vm=${v._id} name=${v.name} override=${v.accessOverride}`));

if (DRY_RUN) {
  print("\nDRY_RUN=true - no writes performed. Set DRY_RUN=false and re-run to apply.");
  quit(0);
}

const platformResult = db.externalvmuserassignments.updateMany(platformAssignFilter, {
  $set: { accessOverride: true, accessOverrideUntil: null },
});
const tenantResult = db.externalvmtenantassignments.updateMany(tenantAssignFilter, {
  $set: { accessOverride: true, accessOverrideUntil: null },
});
const vmsResult = db.vms.updateMany(vmsFilter, {
  $set: { accessOverride: true, accessOverrideUntil: null },
});

print("\n=== APPLIED ===");
printjson({
  platformAssignments: platformResult,
  tenantAssignments: tenantResult,
  vms: vmsResult,
});
