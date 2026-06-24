import fs from 'fs';
import path from 'path';

const files = [
  './src/provisioners/aws/accountProvisioner.js',
  './src/provisioners/aws/identityProvisioner.js', 
  './src/provisioners/aws/permissionSetProvisioner.js',
  './src/provisioners/aws/accountAssignmentProvisioner.js',
  './src/provisioners/aws/scpProvisioner.js',
  './src/provisioners/aws/emailProvisioner.js',
  './src/services/provisionOrchestrator.js',
  './src/services/provisioningService.js',
  './src/config/aws.js',
];

for (const f of files) {
  if (fs.existsSync(f)) {
    console.log('\n========== ' + f + ' ==========');
    console.log(fs.readFileSync(f, 'utf8'));
  } else {
    console.log('\nMISSING: ' + f);
  }
}
