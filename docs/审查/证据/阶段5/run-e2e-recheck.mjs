import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {withBrowser} from '../阶段4/browser-fixture.mjs';
const dir=path.dirname(fileURLToPath(import.meta.url));
await withBrowser(async({origin})=>{const log=fs.openSync(path.join(dir,'e2e-recheck.log'),'w');try{const child=spawn(path.resolve('node_modules/.bin/playwright'),['test','--config',path.join(dir,'playwright-recheck.config.mts')],{cwd:dir,env:{...process.env,V4_BASE_URL:origin},stdio:['ignore',log,log]});const code=await new Promise(resolve=>child.on('exit',resolve));fs.writeFileSync(path.join(dir,'e2e-recheck-exit.json'),JSON.stringify({code,base:'isolated Vite + API',sourceTests:'unchanged existing e2e',cwd:'stage5 evidence to isolate screenshot outputs'})+'\n');console.log({code});}finally{fs.closeSync(log);}});
