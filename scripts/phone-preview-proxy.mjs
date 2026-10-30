// Development-only LAN bridge. Keep the application server on loopback.
import http from 'node:http';
import {isIP} from 'node:net';
const host=process.argv[2];
const [a,b]=(host??'').split('.').map(Number);
if(isIP(host??'')!==4||!(a===10||(a===172&&b>=16&&b<=31)||(a===192&&b===168)))throw new Error('Pass a private IPv4 address for this Mac');
const server=http.createServer((req,res)=>{
 if(!req.url?.startsWith('/v1/')){res.writeHead(404).end();return;}
 const upstream=http.request({hostname:'127.0.0.1',port:3100,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:3100'}},reply=>{res.writeHead(reply.statusCode??502,reply.headers);reply.pipe(res);});
 upstream.setTimeout(15000,()=>upstream.destroy());
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
 req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
});
server.requestTimeout=20000;
server.listen(3101,host,()=>console.log(`Phone preview bridge listening on ${host}:3101`));
