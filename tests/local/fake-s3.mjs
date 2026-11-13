// Deliberately limited loopback-only S3 emulator for integration tests. It does
// not validate AWS signatures and must never be exposed as a real object store.
import http from 'node:http';
import {createHash} from 'node:crypto';

export async function startFakeS3({origin} = {}) {
  const objects = new Map();
  const bucket = 'nyxberg-test';
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (req.headers.origin && req.headers.origin === origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'content-type, x-amz-checksum-sha256');
        res.setHeader('Access-Control-Expose-Headers', 'etag');
      }
      if (req.method === 'OPTIONS') { res.writeHead(req.headers.origin === origin ? 204 : 403).end(); return; }
      const prefix = `/${bucket}/`;
      if (!url.pathname.startsWith(prefix)) { res.writeHead(404).end(); return; }
      const key = decodeURIComponent(url.pathname.slice(prefix.length));
      if (!key || key.length > 2048) { res.writeHead(400).end(); return; }
      if (req.method === 'PUT') {
        const source = req.headers['x-amz-copy-source'];
        if (source) {
          const decoded = decodeURIComponent(String(source)).replace(/^\//, '');
          const sourceKey = decoded.startsWith(`${bucket}/`) ? decoded.slice(bucket.length + 1) : '';
          const item = objects.get(sourceKey);
          if (!item) { res.writeHead(404, {'content-type':'application/xml'}).end('<Error><Code>NoSuchKey</Code></Error>'); return; }
          objects.set(key, Buffer.from(item));
          const etag = createHash('md5').update(item).digest('hex');
          res.writeHead(200, {'content-type':'application/xml'}).end(`<CopyObjectResult><ETag>"${etag}"</ETag><LastModified>2020-01-01T00:00:00.000Z</LastModified></CopyObjectResult>`);
          return;
        }
        const chunks = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > 33 * 1024 * 1024) { res.writeHead(413).end(); return; } chunks.push(chunk); }
        const body = Buffer.concat(chunks);
        const expected = req.headers['x-amz-checksum-sha256'];
        if (expected && expected !== createHash('sha256').update(body).digest('base64')) { res.writeHead(400).end(); return; }
        objects.set(key, body);
        res.writeHead(200, {etag:`"${createHash('md5').update(body).digest('hex')}"`}).end(); return;
      }
      if (req.method === 'GET') {
        const body = objects.get(key);
        if (!body) { res.writeHead(404, {'content-type':'application/xml'}).end('<Error><Code>NoSuchKey</Code></Error>'); return; }
        res.writeHead(200, {'content-type':'application/octet-stream','content-length':body.length,etag:`"${createHash('md5').update(body).digest('hex')}"`}).end(body); return;
      }
      res.writeHead(405).end();
    } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  const {port} = server.address();
  return {url:`http://127.0.0.1:${port}`,bucket,async close(){server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}};
}
