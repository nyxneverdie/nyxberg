import { mkdir, writeFile, copyFile, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const version='1.0.0-beta.1';
const targets=[['linux','amd64','linux','x64'],['linux','arm64','linux','arm64'],['darwin','amd64','darwin','x64'],['darwin','arm64','darwin','arm64'],['windows','amd64','win32','x64']];
const checks=[];
for(const [goos,goarch,os,cpu] of targets){const name=`nyxberg-${os}-${cpu}`;const dir=path.join(root,'npm','platforms',name);const binary=os==='win32'?'nyxberg.exe':'nyxberg';await mkdir(path.join(dir,'bin'),{recursive:true});const output=path.join(dir,'bin',binary);const build=spawnSync('go',['build','-buildvcs=false','-trimpath','-ldflags=-s -w','-o',output,'./cmd/nyxberg'],{cwd:path.join(root,'cli'),stdio:'inherit',env:{...process.env,CGO_ENABLED:'0',GOOS:goos,GOARCH:goarch}});if(build.error||build.status!==0)throw build.error||new Error(`build failed for ${name}`);await chmod(output,0o755);await writeFile(path.join(dir,'package.json'),JSON.stringify({name:`@nyxberg/cli-${os}-${cpu}`,version,os:[os],cpu:[cpu],files:['bin']},null,2)+'\n');const sha=createHash('sha256').update(await readFile(output)).digest('hex');await writeFile(path.join(dir,'bin','sha256.txt'),sha+'\n');checks.push(`${sha}  ${name}/${binary}`);if(os===process.platform&&cpu===process.arch){const local=path.join(root,'npm','bin','native');await mkdir(local,{recursive:true});const native=`nyxberg-${os}-${cpu}${os==='win32'?'.exe':''}`;await copyFile(output,path.join(local,native));await writeFile(path.join(local,native+'.sha256'),sha+'\n');await chmod(path.join(local,native),0o755)}}
await writeFile(path.join(root,'npm','platforms','SHA256SUMS'),checks.join('\n')+'\n');console.log('Built platform packages and SHA256SUMS.');
