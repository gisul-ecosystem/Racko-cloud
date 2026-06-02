import assert from 'node:assert/strict';
import {
  decodeAgentOutput,
  parseHyperVState,
  isProcessExited,
  HYPERV_STATE_SCRIPT,
} from './hypervGuestOutput';

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok — ${name}`);
  } catch (err) {
    console.error(`fail — ${name}`);
    throw err;
  }
}

test('decode plain Enabled without corrupting', () => {
  assert.equal(decodeAgentOutput('Enabled'), 'Enabled');
  assert.equal(parseHyperVState('Enabled'), 'Enabled');
});

test('parse HYPERV_STATE markers', () => {
  assert.equal(parseHyperVState('HYPERV_STATE=ON'), 'Enabled');
  assert.equal(parseHyperVState('hyperv_state=off'), 'Disabled');
});

test('isProcessExited accepts boolean and numeric exited', () => {
  assert.equal(isProcessExited({ exited: 1 }), true);
  assert.equal(isProcessExited({ exited: true }), true);
  assert.equal(isProcessExited({ exited: 0 }), false);
});

test('HYPERV_STATE_SCRIPT contains feature probe', () => {
  assert.match(HYPERV_STATE_SCRIPT, /Microsoft-Hyper-V/);
  assert.match(HYPERV_STATE_SCRIPT, /HYPERV_STATE/);
});

console.log('hypervGuestOutput: all tests passed');
