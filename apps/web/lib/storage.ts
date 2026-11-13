import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
let client: S3Client | undefined;
function config() {
 const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION } = process.env;
 if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error('S3 storage is not configured');
 if (!client) client = new S3Client({ endpoint:S3_ENDPOINT, region:S3_REGION || 'auto', forcePathStyle:true, credentials:{accessKeyId:S3_ACCESS_KEY_ID,secretAccessKey:S3_SECRET_ACCESS_KEY} });
 return { client, bucket:S3_BUCKET };
}
export async function signPut(key:string, checksum:string) { const {client,bucket}=config(); return getSignedUrl(client,new PutObjectCommand({Bucket:bucket,Key:key,ChecksumSHA256:Buffer.from(checksum,'hex').toString('base64')}),{expiresIn:300,unhoistableHeaders:new Set(['x-amz-checksum-sha256'])}); }
export async function signGet(key:string) { const {client,bucket}=config(); return getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key}),{expiresIn:60}); }
export async function getBytes(key:string, max:number):Promise<Buffer> { const {client,bucket}=config(); const object=await client.send(new GetObjectCommand({Bucket:bucket,Key:key})); if (!object.Body || (object.ContentLength??0)>max) throw new Error('Object exceeds limit'); const chunks:Uint8Array[]=[]; let size=0; for await (const chunk of object.Body as AsyncIterable<Uint8Array>) { size+=chunk.byteLength; if(size>max) throw new Error('Object exceeds limit');chunks.push(chunk); } return Buffer.concat(chunks); }

export async function copyVerified(source:string,destination:string) { const {client,bucket}=config(); await client.send(new CopyObjectCommand({Bucket:bucket,Key:destination,CopySource:`${encodeURIComponent(bucket)}/${source.split('/').map(encodeURIComponent).join('/')}`})); }

export async function putPrivate(key:string,data:Buffer,contentType="application/octet-stream") { const {client,bucket}=config(); await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:data,ContentType:contentType})); }

export async function signDownload(key:string,filename:string) { const {client,bucket}=config(); const safe=filename.replace(/[^A-Za-z0-9._-]/g,"_"); return getSignedUrl(client,new GetObjectCommand({Bucket:bucket,Key:key,ResponseContentDisposition:`attachment; filename="${safe}"`,ResponseContentType:"application/octet-stream"}),{expiresIn:60}); }

export async function deleteKeys(keys:string[]) { if(!keys.length)return;const {client,bucket}=config();for(let i=0;i<keys.length;i+=1000){const result=await client.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{Objects:keys.slice(i,i+1000).map(Key=>({Key})),Quiet:true}}));if(result.Errors?.length)throw new Error("Object cleanup failed")} }
