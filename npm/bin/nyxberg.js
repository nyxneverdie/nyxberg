#!/usr/bin/env node
const { spawnSync } = require('node:child_process');
const { packageName } = require('./platform');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const platform = `${process.platform}-${process.arch}`;
const packageId = packageName(process.platform, process.arch);
if (!packageId) { console.error(`NyxBerg does not support ${platform}.`); process.exit(1); }
let binary, checksumFile;
try { binary = require.resolve(`${packageId}/bin/${process.platform === 'win32' ? 'nyxberg.exe' : 'nyxberg'}`); checksumFile = require.resolve(`${packageId}/bin/sha256.txt`); }
catch { const local=path.join(__dirname,'native',`nyxberg-${platform}${process.platform === 'win32' ? '.exe' : ''}`); if(fs.existsSync(local)) { binary=local; checksumFile=local+'.sha256'; } else { console.error(`NyxBerg binary for ${platform} is missing. Reinstall with optional dependencies enabled, or build the CLI from source.`); process.exit(1); } }
try { const expected=fs.readFileSync(checksumFile,'utf8').trim(); const actual=crypto.createHash('sha256').update(fs.readFileSync(binary)).digest('hex'); if(!/^[a-f0-9]{64}$/.test(expected)||actual!==expected) throw new Error('checksum mismatch'); } catch { console.error('NyxBerg binary integrity verification failed. Reinstall the package.'); process.exit(1); }
const result = spawnSync(binary, process.argv.slice(2), { stdio: 'inherit' });
if (result.error) { console.error(`Could not start NyxBerg: ${result.error.message}`); process.exit(1); }
process.exit(result.status ?? 1);
