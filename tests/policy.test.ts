import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionsFor} from '../apps/web/lib/contribution-states';
import {safePath} from '../apps/web/lib/proposals';
test('code can be marked merged only by the verified merge operation',()=>{for(const state of ['OPEN','IN_REVIEW','CHANGES_REQUESTED','APPROVED'])assert.equal(transitionsFor('CODE',state).includes('MERGED'),false);assert.deepEqual(transitionsFor('BUG','OPEN'),['TRIAGED','CLOSED']);assert.equal(transitionsFor('SECURITY','IN_REVIEW').includes('APPROVED'),false)});
test('proposal paths cannot escape or address Git internals',()=>{for(const bad of ['../secret','/absolute','x/../y','.git/config','src/../../x','src\\secret','a//b','a/./b'])assert.equal(safePath(bad),false,bad);for(const good of ['src/main.go','README.md','dengan spasi/file.txt'])assert.equal(safePath(good),true,good)});
