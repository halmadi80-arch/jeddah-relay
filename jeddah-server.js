/* JEDDAH DRIVE — multiplayer relay server.
   Tiny room-based WebSocket relay: no game logic runs here, clients simulate
   their own world (it's deterministic) and the server only relays player poses.
   Deploy on Render / Railway / Fly.io (any always-on Node host). NOT Vercel —
   serverless platforms can't hold persistent WebSocket connections.       */
const http=require('http');
const { WebSocketServer }=require('ws');

const PORT=process.env.PORT||8787;
const MAX_PER_ROOM=8;
const rooms=new Map();            // code -> {pass, players:Map<id,{ws,name}>}
let nextId=1;

const server=http.createServer((req,res)=>{ res.writeHead(200,{'content-type':'text/plain'}); res.end('jeddah-drive relay ok\n'); });
const wss=new WebSocketServer({server});

const send=(ws,o)=>{ try{ ws.send(JSON.stringify(o)); }catch(e){} };
const roomCast=(room,o,skipId)=>{ for(const [id,p] of room.players) if(id!==skipId) send(p.ws,o); };
const sanitize=(s,n)=>String(s||'').replace(/[^\w ؀-ۿ-]/g,'').slice(0,n);

wss.on('connection',ws=>{
  ws.id=nextId++; ws.room=null; ws.alive=true;
  ws.on('pong',()=>{ ws.alive=true; });
  ws.on('message',raw=>{
    let m; try{ m=JSON.parse(raw); }catch(e){ return; }
    if(m.t==='create'||m.t==='join'){
      const code=sanitize(m.room,12).toUpperCase(), pass=String(m.pass||'').slice(0,32), name=sanitize(m.name,12)||'PLAYER';
      if(!code) return send(ws,{t:'err',msg:'ROOM CODE REQUIRED'});
      let room=rooms.get(code);
      if(m.t==='create'){
        if(room) return send(ws,{t:'err',msg:'ROOM EXISTS — JOIN IT'});
        room={pass,players:new Map()}; rooms.set(code,room);
      } else {
        if(!room) return send(ws,{t:'err',msg:'ROOM NOT FOUND'});
        if(room.pass!==pass) return send(ws,{t:'err',msg:'WRONG PASSWORD'});
        if(room.players.size>=MAX_PER_ROOM) return send(ws,{t:'err',msg:'ROOM FULL'});
      }
      ws.room=code; ws.name=name;
      const peers=[...room.players].map(([id,p])=>({id,name:p.name}));
      room.players.set(ws.id,{ws,name});
      send(ws,{t:'ok',room:code,id:ws.id,peers});
      roomCast(room,{t:'add',id:ws.id,name},ws.id);
      return;
    }
    if(m.t==='s'&&ws.room){
      const room=rooms.get(ws.room); if(!room) return;
      roomCast(room,{t:'p',id:ws.id,d:m.d},ws.id);
    }
  });
  ws.on('close',()=>{
    if(!ws.room) return;
    const room=rooms.get(ws.room); if(!room) return;
    room.players.delete(ws.id);
    roomCast(room,{t:'del',id:ws.id});
    if(room.players.size===0) rooms.delete(ws.room);
  });
});

setInterval(()=>{ wss.clients.forEach(ws=>{ if(!ws.alive) return ws.terminate(); ws.alive=false; ws.ping(); }); },30000);
server.listen(PORT,()=>console.log('jeddah-drive relay listening on :'+PORT));
