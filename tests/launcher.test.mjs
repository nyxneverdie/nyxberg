import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { packageName } = createRequire(import.meta.url)('../npm/bin/platform.js');
test('launcher maps only supported platforms to platform packages', () => {
  assert.equal(packageName('linux','x64'),'@nyxberg/cli-linux-x64');
  assert.equal(packageName('darwin','arm64'),'@nyxberg/cli-darwin-arm64');
  assert.equal(packageName('win32','x64'),'@nyxberg/cli-win32-x64');
  assert.equal(packageName('win32','arm64'),null);
});
