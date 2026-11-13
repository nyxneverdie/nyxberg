import {cp,mkdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');const require=createRequire(join(root,'apps/web/package.json'));const source=join(dirname(require.resolve('monaco-editor/package.json')),'min/vs');const target=join(root,'apps/web/public/monaco/vs');await rm(target,{recursive:true,force:true});await mkdir(target,{recursive:true});await cp(source,target,{recursive:true});
