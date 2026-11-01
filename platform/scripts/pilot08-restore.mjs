import {DatabaseSync,backup} from 'node:sqlite';
import path from 'node:path';
import {existsSync,copyFileSync,mkdirSync} from 'node:fs';
import {ROOT} from '../src/data.mjs';
const args=process.argv.slice(2),id=args[args.indexOf('--backup')+1],dir=path.resolve(process.env.TUTOR_V08_VAR||path.join(ROOT,'var/pilot-v0.8'));
if(!args.includes('--stopped')||!/^[-a-z0-9]{8,100}$/.test(id))throw Error('先停止v0.8服务，再指定 --backup <id> --stopped。');
const file=path.resolve(dir,'backups',id+'.sqlite');if(!file.startsWith(path.join(dir,'backups')+path.sep)||!existsSync(file))throw Error('备份不存在');
try{await fetch('http://127.0.0.1:'+(process.env.PORT||3811)+'/api/auth/status',{signal:AbortSignal.timeout(2000)});throw Error('检测到试点服务仍运行，拒绝覆盖数据库。');}catch(e){if(e.cause?.code!=='ECONNREFUSED')throw e;}
const db=new DatabaseSync(file,{readOnly:true});if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('备份损坏');db.close();
const target=path.join(dir,'platform.sqlite');if(existsSync(target)){const current=new DatabaseSync(target);current.exec('PRAGMA wal_checkpoint(TRUNCATE)');await backup(current,path.join(dir,'backups/pre-restore-'+Date.now()+'.sqlite'));current.close();}
copyFileSync(file,target);const restored=new DatabaseSync(target);restored.prepare('DELETE FROM sessions').run();restored.close();console.log('已恢复试点数据库并清除登录会话；模型消耗账本未回退。');

