import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port = process.env.SMOKE_PORT || '3107';
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import','tsx','backend/src/server.ts'], {env:{...process.env,NODE_ENV:'production',PORT:port},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',s=>logs+=s);server.stderr.on('data',s=>logs+=s);
try {
 let ready=false;
 for(let n=0;n<40;n++){
  if(server.exitCode!==null)throw Error(logs);
  try{const health=await fetch(url+'/health');if(health.ok){ready=true;break;}}catch{}
  await new Promise(r=>setTimeout(r,100));
 }
 assert.ok(ready,`Production server did not start: ${logs}`);
 const response=await fetch(url),html=await response.text();assert.equal(response.status,200);assert.match(html,/PETTY THEFT/);
 const asset=html.match(/src="([^\"]+\.js)"/)[1];const js=await fetch(url+asset);assert.equal(js.status,200);assert.ok((await js.text()).length>100000);
 const guide=await fetch(url+'/how-to-play.html');assert.equal(guide.status,200);assert.match(await guide.text(),/If you are a cop/);
 console.log('PASS guide, production HTML, bundled client, and health endpoint');
 const test=spawn(process.execPath,['--import','tsx','--test','tests/integration/multiplayer.test.ts'],{env:{...process.env,TEST_SERVER_URL:url},stdio:'inherit'});
 const exit=await new Promise(r=>test.on('exit',r));assert.equal(exit,0,'Production WebSocket checks failed');
} finally {server.kill('SIGTERM');}
