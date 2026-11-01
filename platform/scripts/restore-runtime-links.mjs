import {readFileSync,existsSync,mkdirSync,symlinkSync,lstatSync,realpathSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from '../src/data.mjs';
export function restoreRuntime(root=path.join(ROOT,'runtime/dsh')){
 root=path.resolve(root);const links=JSON.parse(readFileSync(path.join(root,'runtime-links.json'),'utf8'));
 for(const [name,target] of Object.entries(links)){const from=path.resolve(root,name),to=path.resolve(root,target);if(!from.startsWith(root+path.sep)||!to.startsWith(root+path.sep))throw Error('Runtime link escapes locked root');mkdirSync(path.dirname(from),{recursive:true});if(existsSync(from)){if(realpathSync(from)!==realpathSync(to))throw Error('Existing runtime link conflicts: '+name);continue;}symlinkSync(to,from,process.platform==='win32'?'junction':'dir');}
 return {root,restored_links:Object.keys(links).length};
}
if(process.argv[1]?.endsWith('restore-runtime-links.mjs'))console.log(JSON.stringify(restoreRuntime()));

