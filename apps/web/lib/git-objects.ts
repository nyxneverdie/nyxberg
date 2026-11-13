import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
export type GitObject = { oid:string; type:'commit'|'tree'|'blob'|'tag'; content:Buffer };
const oidPattern=/^[a-f0-9]{40}$/;
export function decodeObject(oid:string, compressed:Buffer, expectedSha256:string):GitObject {
 if(!oidPattern.test(oid)||createHash('sha256').update(compressed).digest('hex')!==expectedSha256)throw new Error('Storage checksum mismatch');
 const raw=inflateSync(compressed,{maxOutputLength:4*1024*1024+100});
 if(createHash('sha1').update(raw).digest('hex')!==oid)throw new Error('Git object ID mismatch');
 const nul=raw.indexOf(0);if(nul<0||nul>80)throw new Error('Invalid Git object header');
 const match=/^(commit|tree|blob|tag) (0|[1-9][0-9]*)$/.exec(raw.subarray(0,nul).toString('ascii'));
 if(!match || Number(match[2])!==raw.length-nul-1)throw new Error('Invalid Git object size');
 return {oid,type:match[1] as GitObject['type'],content:raw.subarray(nul+1)};
}
type Edge={oid:string;type:GitObject['type']};
export function references(obj:GitObject):Edge[] {
 if(obj.type==='commit'){
  const text=obj.content.toString('utf8');const header=text.split('\n\n',1)[0];const trees=[...header.matchAll(/^tree ([a-f0-9]{40})$/gm)];const parents=[...header.matchAll(/^parent ([a-f0-9]{40})$/gm)];
  if(trees.length!==1 || /^tree |^parent /m.test(header.replace(/^tree [a-f0-9]{40}$/gm,'').replace(/^parent [a-f0-9]{40}$/gm,'')))throw new Error('Invalid commit');
  return [{oid:trees[0][1],type:'tree'},...parents.map(x=>({oid:x[1],type:'commit' as const}))];
 }
 if(obj.type==='tree'){
  const edges:Edge[]=[];let offset=0;const names=new Set<string>();
  while(offset<obj.content.length){const space=obj.content.indexOf(32,offset),end=obj.content.indexOf(0,space+1);if(space<0||end<0||end+21>obj.content.length)throw new Error('Invalid tree');const mode=obj.content.subarray(offset,space).toString('ascii');const name=obj.content.subarray(space+1,end);const nameKey=name.toString('hex');if(!name.length||name.includes(47)||name.equals(Buffer.from('.'))||name.equals(Buffer.from('..'))||names.has(nameKey))throw new Error('Invalid tree path');names.add(nameKey);const oid=obj.content.subarray(end+1,end+21).toString('hex');if(mode==='40000'||mode==='040000')edges.push({oid,type:'tree'});else if(['100644','100755','120000'].includes(mode))edges.push({oid,type:'blob'});else if(mode!=='160000')throw new Error('Invalid tree mode');offset=end+21;}
  return edges;
 }
 if(obj.type==='tag') {const head=obj.content.toString('utf8').split('\n\n',1)[0];const oid=/^object ([a-f0-9]{40})$/m.exec(head)?.[1],type=/^type (commit|tree|blob|tag)$/m.exec(head)?.[1] as GitObject['type']|undefined;if(!oid||!type)throw new Error('Invalid tag');return [{oid,type}];}
 return [];
}
export function validateGraph(objects:Map<string,GitObject>,head:string,oldHead:string|null):void {
 const seen=new Set<string>();const pending:Edge[]=[{oid:head,type:'commit'}];let oldFound=oldHead===null;
 while(pending.length){const edge=pending.pop()!;const obj=objects.get(edge.oid);if(!obj||obj.type!==edge.type)throw new Error('Missing or invalid reachable object');if(edge.type==='commit'&&edge.oid===oldHead)oldFound=true;if(seen.has(edge.oid))continue;seen.add(edge.oid);pending.push(...references(obj));}
 if(!oldFound)throw new Error('NON_FAST_FORWARD');
}
