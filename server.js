
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 10000;

app.use(express.static("public"));
app.get("/health", (_, res) => res.json({ok:true, game:"harappa"}));

const rooms = new Map();
const COLORS = ["red","gold","jade","indigo"];
const EVENTS = [
  {title:"THE FLOOD", icon:"🌊", text:"Heavy rain swells the river.", apply:p=>{
    if(p.buildings.drainage) return "Your drainage system protects the city.";
    p.food=Math.max(0,p.food-1); p.prosperity=Math.max(0,p.prosperity-1);
    return "Without drainage, you lose 1 Food and 1 Prosperity.";
  }},
  {title:"GOOD HARVEST", icon:"🌾", text:"The fields produce an abundant harvest.", apply:p=>{p.food+=2;return "Gain 2 Food."}},
  {title:"MERCHANTS ARRIVE", icon:"🚢", text:"Merchants arrive at the river port.", apply:p=>{p.trade+=2;return "Gain 2 Trade Tokens."}},
  {title:"SKILLED CRAFTSMAN", icon:"🏺", text:"A master craftsman joins your settlement.", apply:p=>{p.beads+=1;p.prosperity+=1;return "Gain 1 Bead and 1 Prosperity."}},
  {title:"FERTILE SOIL", icon:"🌱", text:"New fertile ground is found near the river.", apply:p=>{p.food+=1;p.prosperity+=1;return "Gain 1 Food and 1 Prosperity."}},
  {title:"DISCOVERED SEAL", icon:"🔖", text:"A distinctive seal is discovered.", apply:p=>{p.prosperity+=2;return "Gain 2 Prosperity."}}
];
const BUILDINGS = {
  house:{name:"House", icon:"🏠", cost:{bricks:2,food:1}, points:2},
  drainage:{name:"Drainage", icon:"💧", cost:{bricks:2,metal:1}, points:3},
  bath:{name:"Great Bath", icon:"🛁", cost:{bricks:3,trade:1}, points:4, requires:"drainage"},
  workshop:{name:"Workshop", icon:"🏺", cost:{bricks:1,metal:1,beads:1}, points:3},
  tradecentre:{name:"Trade Centre", icon:"🚢", cost:{bricks:2,trade:2}, points:4}
};

function cleanName(n){
  return String(n||"Player").trim().replace(/[<>]/g,"").slice(0,18) || "Player";
}
function newPlayer(id,name,index){
  return {id,name:cleanName(name),color:COLORS[index],ready:false,pos:0,
    food:2,bricks:2,metal:1,beads:1,trade:1,prosperity:0,
    buildings:{house:0,drainage:0,bath:0,workshop:0,tradecentre:0}};
}
function publicRoom(room){
  return {code:room.code,host:room.host,started:room.started,round:room.round,
    current:room.current,turn:room.players[room.current]?.id||null,players:room.players.map(p=>({...p}))};
}
function emitRoom(room){io.to(room.code).emit("state",publicRoom(room));}
function log(room,msg){io.to(room.code).emit("log",msg);}
function enough(p,cost){return Object.entries(cost).every(([k,v])=>p[k]>=v);}
function pay(p,cost){Object.entries(cost).forEach(([k,v])=>p[k]-=v);}
function nextTurn(room){
  room.current++;
  if(room.current>=room.players.length){room.current=0;room.round++;}
  if(room.round>6){finish(room);return;}
  emitRoom(room);
}
function finish(room){
  room.started=false; room.finished=true;
  const max=Math.max(...room.players.map(p=>p.prosperity));
  const winners=room.players.filter(p=>p.prosperity===max).map(p=>p.name);
  room.winners=winners;
  io.to(room.code).emit("gameOver",{winners,score:max,players:room.players.map(p=>({...p}))});
  emitRoom(room);
}
function currentPlayer(room,socketId){return room.players[room.current]?.id===socketId ? room.players[room.current] : null;}

io.on("connection",socket=>{
  socket.on("createRoom",({name},cb)=>{
    let code;
    do {code=crypto.randomBytes(3).toString("hex").toUpperCase()} while(rooms.has(code));
    const room={code,host:socket.id,players:[newPlayer(socket.id,name,0)],started:false,finished:false,round:1,current:0};
    rooms.set(code,room); socket.join(code); cb({ok:true,code});
    emitRoom(room); log(room,`🏺 ${room.players[0].name} created the settlement.`);
  });

  socket.on("joinRoom",({code,name},cb)=>{
    const room=rooms.get(String(code||"").toUpperCase());
    if(!room) return cb({ok:false,error:"Room not found."});
    if(room.started) return cb({ok:false,error:"This game has already started."});
    if(room.players.length>=4) return cb({ok:false,error:"Room is full."});
    const p=newPlayer(socket.id,name,room.players.length); room.players.push(p);
    socket.join(room.code); cb({ok:true,code:room.code}); emitRoom(room);
    log(room,`🌿 ${p.name} joined the settlement.`);
  });

  socket.on("toggleReady",()=>{
    const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room||room.started)return;
    const p=room.players.find(p=>p.id===socket.id); p.ready=!p.ready; emitRoom(room);
  });

  socket.on("startGame",()=>{
    const room=[...rooms.values()].find(r=>r.host===socket.id); if(!room||room.started)return;
    if(room.players.length<2) return socket.emit("toast","At least 2 players are needed.");
    if(!room.players.every(p=>p.ready)) return socket.emit("toast","Everyone must be ready.");
    room.started=true; room.finished=false; room.round=1; room.current=0;
    room.players.forEach(p=>p.pos=0);
    log(room,"🏺 The gates open. Build, trade and grow!");
    emitRoom(room);
  });

  socket.on("roll",()=>{
    const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room||!room.started)return;
    const p=currentPlayer(room,socket.id); if(!p)return;
    if(p.rolled)return;
    const d=1+Math.floor(Math.random()*6); p.rolled=d;
    p.pos=(p.pos+d)%12;
    const icons=["food","metal",null,"beads","food","trade",null,"metal","food","beads",null,"food"];
    const res=icons[p.pos];
    if(res)p[res]++;
    log(room,`🎲 ${p.name} rolled ${d}${res?` and collected 1 ${res}`:""}.`);
    io.to(room.code).emit("dice",{player:p.id,value:d});
    emitRoom(room);
  });

  socket.on("build",({type})=>{
    const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room||!room.started)return;
    const p=currentPlayer(room,socket.id), b=BUILDINGS[type]; if(!p||p.acted||!p.rolled||!b)return;
    if(b.requires && !p.buildings[b.requires]) return socket.emit("toast","Build the Drainage System first.");
    if(!enough(p,b.cost)) return socket.emit("toast","Not enough resources.");
    pay(p,b.cost); p.buildings[type]++; p.prosperity+=b.points; p.acted=true;
    log(room,`${b.icon} ${p.name} built a ${b.name} (+${b.points} Prosperity).`);
    drawEvent(room,p); finishAction(room,p);
  });

  socket.on("explore",()=>{
    const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room||!room.started)return;
    const p=currentPlayer(room,socket.id); if(!p||p.acted||!p.rolled)return;
    const choices=[
      ["Fertile Land","Gain 2 Food.",()=>p.food+=2],
      ["Copper Source","Gain 1 Metal.",()=>p.metal++],
      ["Bead Discovery","Gain 2 Beads.",()=>p.beads+=2],
      ["Hidden Trade Route","Gain 2 Trade Tokens.",()=>p.trade+=2],
      ["Ancient Knowledge","Gain 2 Prosperity.",()=>p.prosperity+=2]
    ];
    const e=choices[Math.floor(Math.random()*choices.length)];e[2]();p.acted=true;
    log(room,`🗺️ ${p.name} explored: ${e[0]} — ${e[1]}`); drawEvent(room,p); finishAction(room,p);
  });

  socket.on("trade",({targetId,give,want})=>{
    const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room||!room.started)return;
    const p=currentPlayer(room,socket.id),t=room.players.find(x=>x.id===targetId);
    if(!p||p.acted||!p.rolled||!t||t.id===p.id)return;
    if(!["food","bricks","metal","beads","trade"].includes(give)||!["food","bricks","metal","beads","trade"].includes(want))return;
    if(p[give]<1||t[want]<1)return socket.emit("toast","That trade is not possible.");
    p[give]--;t[give]++;t[want]--;p[want]++;p.prosperity++;p.acted=true;
    log(room,`🤝 ${p.name} traded 1 ${give} for 1 ${want} with ${t.name}. (+1 Prosperity)`);
    drawEvent(room,p);finishAction(room,p);
  });

  socket.on("endTurn",()=>{
    const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id)); if(!room||!room.started)return;
    const p=currentPlayer(room,socket.id); if(!p||!p.rolled||!p.acted)return socket.emit("toast","Roll, then choose an action first.");
    p.rolled=0;p.acted=false;nextTurn(room);
  });

  socket.on("chat",msg=>{
    const room=[...rooms.values()].find(r=>r.players.some(p=>p.id===socket.id));if(!room)return;
    const p=room.players.find(p=>p.id===socket.id); const text=String(msg||"").trim().slice(0,120);if(!text)return;
    io.to(room.code).emit("chat",{name:p.name,color:p.color,text});
  });

  socket.on("restart",()=>{
    const room=[...rooms.values()].find(r=>r.host===socket.id);if(!room)return;
    room.started=false;room.finished=false;room.round=1;room.current=0;
    room.players.forEach((p,i)=>Object.assign(p,{ready:false,pos:0,food:2,bricks:2,metal:1,beads:1,trade:1,prosperity:0,buildings:{house:0,drainage:0,bath:0,workshop:0,tradecentre:0}}));
    emitRoom(room);log(room,"🔄 The settlement has been reset.");
  });

  socket.on("disconnect",()=>{
    for(const [code,room] of rooms){
      const i=room.players.findIndex(p=>p.id===socket.id);
      if(i<0)continue;
      const name=room.players[i].name; room.players.splice(i,1);
      if(room.players.length===0){rooms.delete(code);continue;}
      if(room.current>=room.players.length)room.current=0;
      if(room.host===socket.id)room.host=room.players[0].id;
      room.players.forEach((p,j)=>p.color=COLORS[j]);
      log(room,`👋 ${name} left the settlement.`);
      emitRoom(room);
    }
  });
});
function drawEvent(room,p){
  const e=EVENTS[Math.floor(Math.random()*EVENTS.length)];
  const result=e.apply(p);
  io.to(room.code).emit("eventCard",{title:e.title,icon:e.icon,text:e.text,result});
}
function finishAction(room,p){emitRoom(room);}
server.listen(PORT,"0.0.0.0",()=>console.log(`Harappa running on ${PORT}`));
