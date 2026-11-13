#!/usr/bin/env node
/** Full local smoke/integration test. All services bind to 127.0.0.1 and all
 * test records live in a fresh temporary PostgreSQL cluster and fake S3. */
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {createServer as createNetServer} from 'node:net';
import {mkdtemp,mkdir,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {deflateSync,gunzipSync} from 'node:zlib';
import {SMTPServer} from 'smtp-server';
import {simpleParser} from 'mailparser';
import {unzipSync} from 'fflate';
import {startFakeS3} from '../tests/local/fake-s3.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const web=path.join(root,'apps','web');
const requireFromWeb=createRequire(path.join(web,'package.json'));
const {Pool}=requireFromWeb('pg');
const cliSource=path.join(root,'cli');
const args=process.argv.slice(2);
if(args.includes('--help')) { console.log('Usage: npm run test:local [-- --serve]\n\nRequires Linux/macOS, Node.js 20.9+, Git, Go 1.23+, and PostgreSQL server tools (initdb, postgres, pg_ctl).\nOptional environment: NYXBERG_TEST_PG_BIN, NYXBERG_TEST_PG_SHARE, NYXBERG_TEST_GO.\nUse --serve to keep the isolated test website running for manual testing.'); process.exit(0); }
if(args.some(a=>a!=='--serve')) { console.error('Usage: npm run test:local [-- --serve]'); process.exit(2); }
const serve=args.includes('--serve');
const state={temp:null,dist:null,postgres:null,app:null,s3:null,smtp:null};
let cleanupStarted=false;
let interactive=false;
const activeChildren=new Set();
const testPassword=`local-${randomBytes(12).toString('hex')}`;
const contributorPassword=`local-${randomBytes(12).toString('hex')}`;
const resetPassword=`local-${randomBytes(12).toString('hex')}`;
const secret=randomBytes(24).toString('hex');
const outputTail={app:'',postgres:''};
const shellEnv={...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_TERMINAL_PROMPT:'0'};
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
function capture(child,label){for(const stream of [child.stdout,child.stderr])stream?.on('data',chunk=>{outputTail[label]=(outputTail[label]+chunk.toString()).slice(-10000)});child.on('error',()=>{});}
function existsCommand(name){const result=spawnSync(name,['--version'],{stdio:'ignore'});return !result.error;}
function binary(dir,name){return dir?path.join(dir,name):name;}
async function postgresDirectory(){
  if(process.env.NYXBERG_TEST_PG_BIN)return process.env.NYXBERG_TEST_PG_BIN;
  const config=spawnSync('pg_config',['--bindir'],{encoding:'utf8'});
  if(config.status===0&&existsSync(path.join(config.stdout.trim(),'initdb')))return config.stdout.trim();
  if(existsCommand('initdb'))return '';
  for(const base of ['/usr/lib/postgresql','/opt/homebrew/opt','/usr/local/opt']) {
    try {const names=(await readdir(base)).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));for(const n of names){const dir=base.endsWith('postgresql')?path.join(base,n,'bin'):path.join(base,n,'bin');if((base.endsWith('postgresql')||n.startsWith('postgresql'))&&existsSync(path.join(dir,'initdb'))&&existsSync(path.join(dir,'postgres')))return dir;}}catch{}
  }
  throw new Error('PostgreSQL server tools not found. Install PostgreSQL, or set NYXBERG_TEST_PG_BIN to the directory containing initdb, postgres and pg_ctl.');
}
function run(command,argv,{cwd=root,env=process.env,input,timeout=120000,killAfter}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,argv,{cwd,env,stdio:['pipe','pipe','pipe']});activeChildren.add(child);let stdout='',stderr='',killedForTest=false,settled=false;
    const timer=setTimeout(()=>{child.kill('SIGKILL');if(!settled){settled=true;reject(new Error(`${command} timed out`));}},timeout);
    child.stdout.on('data',chunk=>{stdout+=chunk.toString();if(stdout.length>200000)stdout=stdout.slice(-200000);if(killAfter&&!killedForTest&&killAfter.test(stdout)){killedForTest=true;child.kill('SIGKILL')}});
    child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-30000)});
    child.on('error',error=>{activeChildren.delete(child);clearTimeout(timer);if(!settled){settled=true;reject(new Error(`Could not start ${command}: ${error.message}`))}});
    child.on('close',(code,signal)=>{activeChildren.delete(child);clearTimeout(timer);if(settled)return;settled=true;if(killedForTest){resolve({stdout,stderr,interrupted:true});return}if(code!==0){reject(new Error(`${command} exited ${code??signal}: ${(stderr||stdout).slice(-2000)}`));return}resolve({stdout,stderr,interrupted:false})});
    child.stdin.on('error',()=>{});child.stdin.end(input??'');
  });
}
async function availablePort(){const server=createNetServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve)});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function waitFor(label,fn,child,timeout=60000){const deadline=Date.now()+timeout;let last;while(Date.now()<deadline){if(child?.exitCode!==null||child?.signalCode)throw new Error(`${label} stopped unexpectedly`);try{if(await fn())return}catch(e){last=e}await sleep(250)}throw new Error(`${label} did not start${last?`: ${last.message}`:''}`)}
async function cleanup(){if(cleanupStarted)return;cleanupStarted=true;
  for(const child of activeChildren){try{child.kill('SIGTERM')}catch{}}
  if(state.app?.pid){try{process.kill(-state.app.pid,'SIGTERM')}catch{state.app.kill('SIGTERM')}await sleep(300);try{process.kill(-state.app.pid,'SIGKILL')}catch{}}
  if(state.postgres){try{await run(state.postgres.pgctl,['-D',state.postgres.data,'stop','-m','fast','-w'],{env:state.postgres.env,timeout:15000})}catch{try{state.postgres.child?.kill('SIGTERM')}catch{}}}
  try{if(state.smtp)await new Promise(resolve=>state.smtp.close(resolve))}catch{}try{await state.s3?.close()}catch{}
  if(state.dist)await rm(state.dist,{recursive:true,force:true});if(state.temp)await rm(state.temp,{recursive:true,force:true});
}
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{console.log('\nMenghentikan layanan uji...');cleanup().finally(()=>process.exit(signal==='SIGINT'?130:143))});
function message(text){console.log(`  ✓ ${text}`)}
function eq(actual,expected,what){assert.equal(actual,expected,what)}
function urlFor(base,pathName){return new URL(pathName,base).toString()}
async function request(base,pathName,{method='GET',body,cookie,token,expect=200}={}){
 const headers={origin:base};if(body!==undefined)headers['content-type']='application/json';if(cookie)headers.cookie=cookie;if(token)headers.authorization=`Bearer ${token}`;
 const response=await fetch(urlFor(base,pathName),{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(90000)});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=text};
 if(response.status!==expect)throw new Error(`${method} ${pathName}: expected ${expect}, got ${response.status}: ${typeof data==='string'?data.slice(0,300):JSON.stringify(data)}`);
 return {data,cookie:response.headers.get('set-cookie')?.split(';')[0],status:response.status};
}
async function git(cwd,...argv){return (await run('git',argv,{cwd,env:shellEnv})).stdout.trim()}
async function createCommit(repo,relative,content,messageText){await mkdir(path.dirname(path.join(repo,relative)),{recursive:true});await writeFile(path.join(repo,relative),content);await git(repo,'add','--',relative);await git(repo,'commit','-m',messageText);return git(repo,'rev-parse','HEAD')}
async function cli(executable,cwd,input,token,killAfter){return run(executable,[],{cwd,input,killAfter,env:{...shellEnv,...(token?{NYXBERG_TOKEN:token}:{NYXBERG_TOKEN:''})},timeout:120000})}
async function manifest(repo,head){const ids=(await git(repo,'rev-list','--objects','--no-object-names',head)).split('\n').filter(Boolean);const objects=[],data=new Map();for(const oid of ids){const type=await git(repo,'cat-file','-t',oid);const child=await new Promise((resolve,reject)=>{const p=spawn('git',['cat-file',type,oid],{cwd:repo,env:shellEnv});const chunks=[];p.stdout.on('data',c=>chunks.push(c));p.on('error',reject);p.on('close',code=>code===0?resolve(Buffer.concat(chunks)):reject(new Error('git cat-file failed')))});const raw=Buffer.concat([Buffer.from(`${type} ${child.length}\0`),child]);const compressed=deflateSync(raw);objects.push({oid,sha256:createHash('sha256').update(compressed).digest('hex'),size:compressed.length});data.set(oid,compressed)}return {objects,data}}
async function uploadTransfer(response,objects){for(const item of response.uploads){const result=await fetch(item.url,{method:'PUT',headers:{'x-amz-checksum-sha256':item.checksum},body:objects.get(item.oid),signal:AbortSignal.timeout(30000)});assert.equal(result.status,200,'fake S3 upload')}}

async function main(){
 if(process.platform==='win32')throw new Error('The local integration runner currently needs Linux or macOS (PostgreSQL process management). The application CLI can still be built for Windows.');
 if(process.getuid?.()===0)throw new Error('PostgreSQL initdb cannot run as root. Run this test as an ordinary user.');
 if(!existsCommand('git'))throw new Error('Git is required and must be available in PATH.');
 const go=process.env.NYXBERG_TEST_GO||'go';if(!existsCommand(go))throw new Error('Go 1.23+ is required. Install Go or set NYXBERG_TEST_GO to the Go executable.');
 const pgdir=await postgresDirectory();const initdb=binary(pgdir,'initdb'),postgres=binary(pgdir,'postgres'),pgctl=binary(pgdir,'pg_ctl');
 for(const cmd of [initdb,postgres,pgctl])if(!existsCommand(cmd))throw new Error(`PostgreSQL tool is unavailable: ${cmd}`);
 state.temp=await mkdtemp(path.join(tmpdir(),'nyxberg-local-test-'));
 const dataDir=path.join(state.temp,'postgres');const pgPort=await availablePort();const appPort=await availablePort();
 const distName=`.next-local-test-${randomBytes(6).toString('hex')}`;const distPath=path.join(web,distName);await mkdir(distPath);state.dist=distPath;
 const localBase=`http://127.0.0.1:${appPort}`;const dbUrl=`postgresql://nyxbergtest@127.0.0.1:${pgPort}/postgres`;
 const pgEnv={...process.env};const initArgs=['-D',dataDir,'--username=nyxbergtest','--auth=trust','--no-locale','--encoding=UTF8'];if(process.env.NYXBERG_TEST_PG_SHARE)initArgs.push('-L',process.env.NYXBERG_TEST_PG_SHARE);
 console.log('Menyiapkan layanan lokal sementara...');await run(initdb,initArgs,{cwd:state.temp,env:pgEnv});
 const pg=spawn(postgres,['-D',dataDir,'-p',String(pgPort),'-h','127.0.0.1','-k',state.temp],{cwd:state.temp,env:pgEnv,stdio:['ignore','pipe','pipe']});state.postgres={child:pg,data:dataDir,pgctl,env:pgEnv};capture(pg,'postgres');
 await waitFor('PostgreSQL',async()=>{const pool=new Pool({connectionString:dbUrl,connectionTimeoutMillis:500});try{await pool.query('SELECT 1');return true}finally{await pool.end()}},pg);
 state.s3=await startFakeS3({origin:localBase});const preflight=await fetch(`${state.s3.url}/${state.s3.bucket}/local-cors-test`,{method:'OPTIONS',headers:{origin:localBase,'access-control-request-method':'PUT','access-control-request-headers':'x-amz-checksum-sha256'}});eq(preflight.status,204,'S3 CORS preflight');eq(preflight.headers.get('access-control-allow-origin'),localBase,'S3 CORS origin');const emails=[];state.smtp=new SMTPServer({authOptional:true,closeTimeout:1000,disabledCommands:['STARTTLS'],onData(stream,_session,done){simpleParser(stream).then(mail=>{emails.push(mail.text||'');if(interactive){const link=(mail.text||'').match(/https?:\/\/[^\s]+/)?.[0];if(link)console.log(`\n  [SMTP uji] Tautan email lokal: ${link}`)}done()}).catch(done)}});
 await new Promise((resolve,reject)=>{state.smtp.once('error',reject);state.smtp.listen(0,'127.0.0.1',resolve)});const smtpPort=state.smtp.server.address().port;
 const env={...process.env,DATABASE_URL:dbUrl,APP_URL:localBase,S3_ENDPOINT:state.s3.url,S3_REGION:'us-east-1',S3_BUCKET:state.s3.bucket,S3_ACCESS_KEY_ID:'local-test-key',S3_SECRET_ACCESS_KEY:'local-test-secret',SMTP_URL:`smtp://127.0.0.1:${smtpPort}`,MAIL_FROM:'NyxBerg Test <no-reply@example.test>',RATE_LIMIT_SALT:secret,CRON_SECRET:secret,NYXBERG_TEST_DIST_DIR:distName,NEXT_TELEMETRY_DISABLED:'1',NODE_ENV:'development'};
 await run(process.execPath,['scripts/migrate.mjs'],{env});await run(process.execPath,['scripts/migrate.mjs'],{env});
 await run(process.execPath,['scripts/bootstrap-admin.mjs'],{env:{...env,NYXBERG_ADMIN_USERNAME:'localadmin',NYXBERG_ADMIN_EMAIL:'admin@example.test',NYXBERG_ADMIN_PASSWORD:testPassword}});
 message('Migrasi database dan bootstrap admin');
 const bin=path.join(state.temp,'nyxberg');await run(go,['test','./...'],{cwd:cliSource,env:{...shellEnv,GOCACHE:process.env.GOCACHE||path.join(state.temp,'go-cache')},timeout:240000});
 await run(go,['build','-buildvcs=false','-o',bin,'./cmd/nyxberg'],{cwd:cliSource,env:{...shellEnv,GOCACHE:process.env.GOCACHE||path.join(state.temp,'go-cache')},timeout:240000});
 await run(process.execPath,['scripts/copy-monaco.mjs'],{env});
 const nextCli=requireFromWeb.resolve('next/dist/bin/next');const app=spawn(process.execPath,[nextCli,'dev','--hostname','127.0.0.1','--port',String(appPort)],{cwd:web,env,detached:true,stdio:['ignore','pipe','pipe']});state.app=app;capture(app,'app');
 await waitFor('Website',async()=>{const res=await fetch(localBase,{signal:AbortSignal.timeout(2000)});return res.ok},app,90000);
 message('Website dan CLI berjalan dengan layanan loopback');
 const login=await request(localBase,'/api/v1/auth/login',{method:'POST',body:{identity:'localadmin',password:testPassword}});assert.ok(login.cookie,'admin session');const admin=login.cookie;
 const created=await request(localBase,'/api/v1/repos',{method:'POST',cookie:admin,body:{name:'Local integration',slug:'local-integration',visibility:'PUBLIC'},expect:201});const repo=created.data.id;
 const token=(await request(localBase,'/api/v1/tokens',{method:'POST',cookie:admin,body:{name:'local test',days:1},expect:201})).data.token;assert.ok(token);
 await request(localBase,'/api/v1/auth/register',{method:'POST',body:{username:'localcontributor',email:'contributor@example.test',password:contributorPassword},expect:201});
 const verificationLink=emails.at(-1)?.match(/https?:\/\/[^\s]+/)?.[0];assert.ok(verificationLink,'verification email');const verification=new URL(verificationLink).searchParams.get('token');
 await request(localBase,'/api/v1/auth/verify-email',{method:'POST',body:{token:verification}});const contributor=(await request(localBase,'/api/v1/auth/login',{method:'POST',body:{identity:'localcontributor',password:contributorPassword}})).cookie;assert.ok(contributor);
 message('Registrasi, verifikasi email, login dan token');
 const source=path.join(state.temp,'source');await mkdir(source);await git(source,'init','--object-format=sha1');await git(source,'config','user.name','Local Tester');await git(source,'config','user.email','local@example.test');await createCommit(source,'README.md','# Initial project\n','Initial commit');await createCommit(source,'src/main.txt','initial source\n','Add source');
 await git(source,'config','nyxberg.url',localBase);await git(source,'config','nyxberg.repo',repo);await git(source,'config','nyxberg.ref','mainyaww:3');const pushed=await cli(bin,source,'4\n2\nyes\n0\n',token);assert.match(pushed.stdout,/Push complete/);
 const cloned=await cli(bin,state.temp,`2\n${localBase}\n${repo}\n\nclone\nyes\n0\n`);assert.match(cloned.stdout,/Clone complete/);const clone=path.join(state.temp,'clone');eq(await git(source,'rev-parse','HEAD'),await git(clone,'rev-parse','HEAD'),'clone HEAD');await git(clone,'fsck','--full');
 await git(clone,'config','user.name','Local Tester');await git(clone,'config','user.email','local@example.test');await createCommit(clone,'src/main.txt','change from clone\n','Change from clone');assert.match((await cli(bin,clone,'4\n2\nyes\n0\n',token)).stdout,/Push complete/);assert.match((await cli(bin,source,'4\n3\n0\n')).stdout,/Fast-forward/);eq(await git(source,'rev-parse','HEAD'),await git(clone,'rev-parse','HEAD'),'pull HEAD');
 message('Git push → clone → push → pull dan git fsck');
 const privateRepo=(await request(localBase,'/api/v1/repos',{method:'POST',cookie:admin,body:{name:'Private test',slug:'private-test',visibility:'PRIVATE'},expect:201})).data.id;
 await request(localBase,`/api/v1/repos/${privateRepo}/refs`,{expect:404});await request(localBase,`/api/v1/repos/${privateRepo}/passport`,{expect:404});
 const security=(await request(localBase,`/api/v1/repos/${repo}/contributions`,{method:'POST',cookie:contributor,body:{type:'SECURITY',title:'Private local report',body:'A private security report for the local test.'},expect:201})).data.id;
 const publicItems=await request(localBase,`/api/v1/repos/${repo}/contributions`);assert.doesNotMatch(JSON.stringify(publicItems.data),/Private local report/);await request(localBase,`/api/v1/contributions/${security}`,{expect:404});await request(localBase,`/api/v1/contributions/${security}`,{cookie:admin});await request(localBase,`/api/v1/repos/${repo}/sync/negotiate`,{method:'POST',cookie:contributor,body:{},expect:403});
 message('Isolasi repository dan laporan keamanan privat');
 const getHead=async()=>{const refs=await request(localBase,`/api/v1/repos/${repo}/refs`);return refs.data.data.find(r=>r.kind==='BRANCH'&&r.displayName==='mainyaww:3')};
 let ref=await getHead();const proposal=(await request(localBase,`/api/v1/repos/${repo}/proposals`,{method:'POST',cookie:contributor,body:{title:'Improve documentation',body:'Change two text files for local integration coverage.',baseCommit:ref.headOid,ref:'mainyaww:3',changes:[{path:'README.md',content:'# Updated from proposal\n'},{path:'src/main.txt',content:'proposed source\n'}]},expect:201})).data.id;
 await request(localBase,`/api/v1/contributions/${proposal}`,{method:'PATCH',cookie:admin,body:{status:'IN_REVIEW'}});await request(localBase,`/api/v1/contributions/${proposal}`,{method:'PATCH',cookie:admin,body:{status:'APPROVED'}});
 const merge=await request(localBase,`/api/v1/contributions/${proposal}/merge`,{method:'POST',cookie:admin,body:{}});assert.equal(merge.data.status,'MERGED');await cli(bin,source,'4\n3\n0\n');eq(await git(source,'rev-parse','HEAD'),merge.data.headOid,'merged commit');eq(await readFile(path.join(source,'README.md'),'utf8'),'# Updated from proposal\n','merged content');await git(source,'fsck','--full');
 message('Proposal multi-file → review → commit merge → pull');
 ref=await getHead();const stale=(await request(localBase,`/api/v1/repos/${repo}/proposals`,{method:'POST',cookie:contributor,body:{title:'Stale proposal',body:'This tests stale proposal protection.',baseCommit:ref.headOid,ref:'mainyaww:3',changes:[{path:'README.md',content:'# Stale\n'}]},expect:201})).data.id;await request(localBase,`/api/v1/contributions/${stale}`,{method:'PATCH',cookie:admin,body:{status:'IN_REVIEW'}});await request(localBase,`/api/v1/contributions/${stale}`,{method:'PATCH',cookie:admin,body:{status:'APPROVED'}});
 const nextHead=await createCommit(source,'src/main.txt','new head for concurrency test\n','Concurrent push test');const all=await manifest(source,nextHead);const payload={gitRef:ref.gitRef,expectedHeadOid:ref.headOid,expectedGeneration:ref.generation,newHeadOid:nextHead,objects:all.objects};
 const first=(await request(localBase,`/api/v1/repos/${repo}/sync/negotiate`,{method:'POST',token,body:payload})).data;const second=(await request(localBase,`/api/v1/repos/${repo}/sync/negotiate`,{method:'POST',token,body:payload})).data;await Promise.all([uploadTransfer(first,all.data),uploadTransfer(second,all.data)]);
 const finalPath=`/api/v1/repos/${repo}/sync/complete`;const finish=async transferId=>{const res=await fetch(urlFor(localBase,finalPath),{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({transferId}),signal:AbortSignal.timeout(90000)});return res.status};const statuses=(await Promise.all([finish(first.transferId),finish(second.transferId)])).sort();assert.deepEqual(statuses,[200,409]);
 const staleMerge=await request(localBase,`/api/v1/contributions/${stale}/merge`,{method:'POST',cookie:admin,body:{},expect:409});eq(staleMerge.data.error.code,'STALE_BASE','stale merge');
 message('Dua push bersamaan dan penolakan merge dengan basis lama');
 await createCommit(source,'src/main.txt','resume after interruption\n','Interrupted transfer');const interrupted=await cli(bin,source,'4\n2\nyes\n0\n',token,/Uploading 1\//);assert.ok(interrupted.interrupted,'transfer interruption');assert.ok(existsSync(path.join(source,'.git','nyxberg-transfer.json')),'saved transfer state');const resumed=await cli(bin,source,'4\n2\nyes\n0\n',token);assert.match(resumed.stdout,/Resuming interrupted transfer/);assert.match(resumed.stdout,/Push complete/);assert.equal(existsSync(path.join(source,'.git','nyxberg-transfer.json')),false);
 message('Melanjutkan upload yang sengaja diputus');
 const release=(await request(localBase,`/api/v1/repos/${repo}/releases`,{method:'POST',cookie:admin,body:{tag:'v1-test',title:'Local release',changelog:'Local test asset',ref:'mainyaww:3'},expect:201})).data;const bytes=Buffer.from('local release asset\n');const sha=createHash('sha256').update(bytes).digest('hex');const releaseRoot=`/api/v1/repos/${repo}/releases/${release.id}/assets`;const asset=(await request(localBase,releaseRoot,{method:'POST',cookie:admin,body:{filename:'test.zip',size:bytes.length,sha256:sha},expect:201})).data;const uploaded=await fetch(asset.url,{method:'PUT',headers:{'x-amz-checksum-sha256':asset.checksum},body:bytes});eq(uploaded.status,200,'asset upload');await request(localBase,`${releaseRoot}/${asset.id}`,{method:'POST',cookie:admin,body:{}});const download=await fetch(urlFor(localBase,`${releaseRoot}/${asset.id}`));eq(download.status,200,'asset download');eq(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),sha,'asset checksum');
 const zipResponse=await fetch(urlFor(localBase,`/api/v1/repos/${repo}/archive?format=zip`));eq(zipResponse.status,200,'ZIP download');const unzipped=unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));assert.equal(Buffer.from(unzipped['README.md']).toString(),'# Updated from proposal\n');const tarResponse=await fetch(urlFor(localBase,`/api/v1/repos/${repo}/archive?format=tar.gz`));eq(tarResponse.status,200,'TAR.GZ download');assert.ok(gunzipSync(Buffer.from(await tarResponse.arrayBuffer())).includes(Buffer.from('README.md')));
 const passport=await fetch(urlFor(localBase,`/api/v1/repos/${repo}/passport`));assert.ok((await passport.text()).includes('REPO PASSPORT'));await request(localBase,'/api/cron/cleanup',{expect:401});await request(localBase,'/api/cron/cleanup',{token:secret});
 message('Rilis, checksum aset, ZIP/TAR.GZ dan RepoPassport');
 await request(localBase,'/api/v1/auth/forgot-password',{method:'POST',body:{email:'contributor@example.test'}});const resetLink=emails.at(-1)?.match(/https?:\/\/[^\s]+/)?.[0];assert.ok(resetLink,'password reset email');await request(localBase,'/api/v1/auth/reset-password',{method:'POST',body:{token:new URL(resetLink).searchParams.get('token'),password:resetPassword}});await request(localBase,'/api/v1/auth/login',{method:'POST',body:{identity:'localcontributor',password:contributorPassword},expect:401});await request(localBase,'/api/v1/auth/login',{method:'POST',body:{identity:'localcontributor',password:resetPassword}});const session=await request(localBase,'/api/v1/auth/me',{cookie:contributor});eq(session.data.user,null,'old session revoked');
 message('Reset password dan pencabutan sesi lama');
 console.log('\nSemua pengujian lokal lulus. Emulator S3 tidak memverifikasi signature AWS; provider Neon/S3 asli tetap perlu diuji.');
 if(serve){interactive=true;console.log(`\nServer uji: ${localBase}\nAdmin uji: localadmin\nPassword admin uji: ${testPassword}\nRepository ID: ${repo}\nCLI uji: ${bin}\n\nSMTP hanya mencetak tautan email uji di terminal. Semua data akan dihapus ketika proses dihentikan. Tekan Ctrl+C untuk berhenti.`);await new Promise(()=>{});}
}
try{await main()}catch(error){console.error(`\nPengujian gagal: ${error instanceof Error?error.message:String(error)}`);if(outputTail.app)console.error(`\nLog website (akhir):\n${outputTail.app.slice(-3500)}`);if(outputTail.postgres)console.error(`\nLog PostgreSQL (akhir):\n${outputTail.postgres.slice(-1200)}`);process.exitCode=1}finally{await cleanup()}
