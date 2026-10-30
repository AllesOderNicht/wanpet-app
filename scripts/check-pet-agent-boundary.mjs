// Inspect the real CLI request against a local fake provider. No credentials or player data.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {CodexPetAgent} from '../apps/server/dist/pet-agent.js';
import {PET_TOOL_NAMES} from '../apps/server/dist/pet-model-proxy.js';
let names;
const server=createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;
 const request=JSON.parse(raw);names=request.tools.flatMap(tool=>tool.type==='namespace'?tool.tools.map(n=>tool.name+'__'+n.name):[tool.name??tool.type]);
 res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:{message:'Synthetic boundary check complete',type:'invalid_request_error'}}));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try{
 const agent=new CodexPetAgent({apiKey:'synthetic',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'claude-haiku-5.5'});
 await assert.rejects(agent.run({prompt:'Synthetic capability inventory',signal:AbortSignal.timeout(30000),text:async()=>{},tool:async()=>{throw Error('No tools should execute');}}));
 console.log(JSON.stringify({advertisedTools:names}));
 assert.deepEqual([...names].sort(),PET_TOOL_NAMES.map(name=>'mcp__pet__'+name).sort(),'Only application pet tools may be advertised');
 console.log('PASS isolated Codex capability boundary');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
