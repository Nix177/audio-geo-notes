document.addEventListener("DOMContentLoaded",()=>{
const API=window.VOCAL_WALLS_API_BASE||"http://localhost:4000";
const POLL_MS=8000,HB_MS=6000;
let mode="archive",notes=[],current=null,apiOnline=false,offlineToast=false,onlineToast=false,liveTimer=null;
let marks=[];
const votes={},reports=new Set();
const pos={lat:48.8566,lng:2.3522},composerPos={lat:48.8566,lng:2.3522};
const clip={mic:null,rec:null,chunks:[],blob:null,mime:"",on:false};
const live={id:null,mic:null,rec:null,hb:null,q:Promise.resolve()};

const $=(id)=>document.getElementById(id);
const toast=(m,t="info")=>{const c=$("toast-container");if(!c)return;const e=document.createElement("div");e.className=`toast ${t}`;e.innerHTML=`<span>${t==="success"?"OK":t==="live"?"LIVE":"INFO"}</span> ${m}`;c.appendChild(e);setTimeout(()=>{e.style.opacity="0";setTimeout(()=>e.remove(),250);},3000);};
const setApi=(ok,silent=false)=>{apiOnline=ok;if(ok){offlineToast=false;if(!onlineToast&&!silent){toast("Backend connecte","success");onlineToast=true;}}else{onlineToast=false;if(!offlineToast&&!silent){toast("Backend indisponible","info");offlineToast=true;}}};
async function req(path,opt={}){const o={method:opt.method||"GET",headers:{...(opt.headers||{})}};if(opt.body!==undefined){if(opt.body instanceof FormData)o.body=opt.body;else{o.headers["content-type"]="application/json";o.body=JSON.stringify(opt.body);}}const r=await fetch(`${API}${path}`,o);const p=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(p.error||`HTTP ${r.status}`);e.status=r.status;throw e;}return p.data;}
const nrm=(n)=>({id:n.id||`local_${Date.now()}`,title:n.title||"Note",description:n.description||"",category:n.category||"Communaute",icon:n.icon||"A",type:n.type||"story",author:n.author||"Anonyme",duration:Number.isFinite(+n.duration)?Math.max(5,+n.duration):120,isLive:!!n.isLive,isStream:!!n.isStream,streamActive:!!n.streamActive,lat:Number.isFinite(+n.lat)?+n.lat:null,lng:Number.isFinite(+n.lng)?+n.lng:null,likes:Number.isFinite(+n.likes)?+n.likes:0,downvotes:Number.isFinite(+n.downvotes)?+n.downvotes:0,reports:Number.isFinite(+n.reports)?+n.reports:0,plays:Number.isFinite(+n.plays)?+n.plays:0,listeners:Number.isFinite(+n.listeners)?+n.listeners:0,audioUrl:typeof n.audioUrl==="string"?n.audioUrl:null});
const upsert=(u)=>{const m=nrm(u);notes=[m,...notes.filter(x=>x.id!==m.id)];return m;};
const score=(n)=>n.likes-n.downvotes-n.reports*2;
const status=(n)=>n.reports>=4||score(n)<=-10?{t:"Contenu sous revue",c:"critical"}:n.reports>=2||score(n)<20?{t:"Visibilite reduite",c:"warning"}:{t:"Contenu normal",c:"ok"};
const ftime=(s)=>{const v=Math.max(0,Math.round(+s||0));return`${Math.floor(v/60)}:${String(v%60).padStart(2,"0")}`;};

const map=L.map("map",{zoomControl:false,attributionControl:false}).setView([pos.lat,pos.lng],16);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{maxZoom:20}).addTo(map);
const layer=L.layerGroup().addTo(map);
const userIcon=L.divIcon({className:"user-marker",html:'<div style="width:14px;height:14px;background:#3742fa;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px #3742fa"></div>',iconSize:[14,14]});
const zone=(a,b)=>{const e=$("h3-cell");if(e)e.textContent=`Zone: ${a.toFixed(3)}, ${b.toFixed(3)}`;};
const compPos=()=>{const e=$("composer-location-text");if(e)e.textContent=`Position: ${composerPos.lat.toFixed(5)}, ${composerPos.lng.toFixed(5)}`;};
map.locate({setView:true,maxZoom:16});
map.on("locationfound",(ev)=>{pos.lat=ev.latlng.lat;pos.lng=ev.latlng.lng;composerPos.lat=ev.latlng.lat;composerPos.lng=ev.latlng.lng;L.marker(ev.latlng,{icon:userIcon}).addTo(map);$("location-name").textContent="Votre position";zone(ev.latlng.lat,ev.latlng.lng);compPos();});
map.on("locationerror",()=>{const c=map.getCenter();$("location-name").textContent="Paris centre";zone(c.lat,c.lng);compPos();});
map.on("moveend",()=>{const c=map.getCenter();zone(c.lat,c.lng);refresh();});

const modeLabel=$("mode-label"),modeBtn=$("mode-toggle");
const modeUI=(fb=false)=>{if(mode==="live"){modeLabel.textContent="LIVE";modeLabel.classList.add("live");if(fb)toast("Mode live","live");}else{modeLabel.textContent="Archive";modeLabel.classList.remove("live");if(fb)toast("Mode archive","info");}};
if(modeBtn)modeBtn.addEventListener("click",()=>{mode=mode==="archive"?"live":"archive";modeUI(true);refresh();void load(false);});

const modal=$("audio-modal"),mClose=$("modal-close"),mTitle=$("modal-title"),mAuthor=$("modal-author"),mCat=$("modal-category"),mIcon=$("modal-icon"),mLive=$("modal-live"),mDesc=$("modal-description"),mAudio=$("modal-audio"),mNoAudio=$("modal-audio-empty"),mLikes=$("modal-likes"),mPlays=$("modal-plays"),mTime=$("modal-time"),mScore=$("modal-score"),mDown=$("modal-downvotes"),mRep=$("modal-reports"),mStatus=$("modal-status");
const bLike=$("btn-like"),bDis=$("btn-dislike"),bShare=$("btn-share"),bRep=$("btn-report");
function wave(l){const cv=$("waveform");if(!cv)return;const x=cv.getContext("2d");x.clearRect(0,0,cv.width,cv.height);const c=l?"#ff4757":"#ff6b81";for(let i=0;i<34;i++){const h=Math.random()*35+8,y=(cv.height-h)/2,b=cv.width/34;x.fillStyle=i<12?c:`${c}55`;x.fillRect(i*b+1,y,b-2,h);}}
function voteUI(){if(!current)return;const v=votes[current.id],r=reports.has(current.id);bLike.textContent=v==="like"?"Like OK":"Like";bDis.textContent=v==="dislike"?"Downvote OK":"Downvote";bLike.classList.toggle("active",v==="like");bDis.classList.toggle("active",v==="dislike");bLike.disabled=!!v;bDis.disabled=!!v;bRep.disabled=r;bRep.textContent=r?"Signale":"Reporter ce contenu";}
function drawModal(n){mTitle.textContent=n.title;mAuthor.textContent=`Par ${n.author}`;mCat.textContent=n.category;mIcon.textContent=n.icon;mDesc.textContent=n.description||"Aucune description.";mLikes.textContent=String(n.likes);mPlays.textContent=String(n.plays);mTime.textContent=`0:00 / ${ftime(n.duration)}`;mScore.textContent=String(score(n));mDown.textContent=String(n.downvotes);mRep.textContent=String(n.reports);const s=status(n);mStatus.textContent=s.t;mStatus.classList.remove("ok","warning","critical");mStatus.classList.add(s.c);if(n.isLive){mLive.classList.remove("hidden");mLive.textContent=`${n.isStream&&n.streamActive?"LIVE STREAM":"LIVE"} - ${n.listeners} auditeurs`;}else mLive.classList.add("hidden");if(n.audioUrl){if((mAudio.getAttribute("src")||"")!==n.audioUrl){mAudio.setAttribute("src",n.audioUrl);mAudio.load();}mAudio.classList.remove("hidden");mNoAudio.classList.add("hidden");}else{mAudio.pause();mAudio.removeAttribute("src");mAudio.load();mAudio.classList.add("hidden");mNoAudio.classList.remove("hidden");}wave(n.isLive);voteUI();}
function stopLiveRefresh(){if(liveTimer){clearInterval(liveTimer);liveTimer=null;}}
function startLiveRefresh(id){stopLiveRefresh();liveTimer=setInterval(async()=>{if(!current||current.id!==id)return;try{const u=upsert(await req(`/api/notes/${id}`));if(current&&current.id===u.id){current=u;drawModal(u);}refresh();}catch(_e){}},5000);}
async function openModal(n){current=n;drawModal(n);modal.classList.remove("hidden");try{const p=upsert(await req(`/api/notes/${n.id}/play`,{method:"POST"}));current=p;drawModal(p);refresh();}catch(_e){}if(n.isLive&&n.streamActive)startLiveRefresh(n.id);}
function closeModal(){stopLiveRefresh();modal.classList.add("hidden");mAudio.pause();current=null;}
if(mClose)mClose.addEventListener("click",closeModal);
if(modal)modal.addEventListener("click",(e)=>{if(e.target===modal)closeModal();});
async function doVote(type){if(!current)return;if(votes[current.id]){toast("Vote deja enregistre","info");return;}votes[current.id]=type;if(type==="like")current.likes+=1;else current.downvotes+=1;drawModal(current);refresh();try{current=upsert(await req(`/api/notes/${current.id}/votes`,{method:"POST",body:{type}}));drawModal(current);refresh();}catch(_e){toast("Vote local conserve","info");}}
async function doReport(){if(!current)return;if(reports.has(current.id)){toast("Signalement deja envoye","info");return;}reports.add(current.id);current.reports+=1;drawModal(current);refresh();try{current=upsert(await req(`/api/notes/${current.id}/report`,{method:"POST"}));drawModal(current);refresh();}catch(_e){toast("Signalement local conserve","info");}}
if(bLike)bLike.addEventListener("click",()=>void doVote("like"));
if(bDis)bDis.addEventListener("click",()=>void doVote("dislike"));
if(bRep)bRep.addEventListener("click",()=>void doReport());
if(bShare)bShare.addEventListener("click",async()=>{const t=current?`${window.location.href}#note=${encodeURIComponent(current.id)}`:window.location.href;try{if(!navigator.clipboard?.writeText)throw new Error("clip");await navigator.clipboard.writeText(t);toast("Lien copie","success");}catch(_e){toast("Copie impossible","info");}});

const cModal=$("composer-modal"),cClose=$("composer-close"),cTitle=$("composer-title"),cDesc=$("composer-description"),cAuthor=$("composer-author"),cUse=$("composer-use-map"),cRec=$("composer-record-toggle"),cRecStatus=$("composer-record-status"),cPub=$("composer-publish"),cStart=$("composer-start-live"),cStop=$("composer-stop-live"),launcher=$("record-btn");
const cOpen=()=>{cModal.classList.remove("hidden");compPos();};
const cHide=()=>{cModal.classList.add("hidden");};
if(launcher)launcher.addEventListener("click",cOpen);
if(cClose)cClose.addEventListener("click",cHide);
if(cModal)cModal.addEventListener("click",(e)=>{if(e.target===cModal)cHide();});

function pickMime(){const a=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/ogg","audio/mp4"];for(const m of a){if(typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported(m))return m;}return"";}
function recUI(){if(cRec.disabled)return;if(clip.on){cRec.textContent="Arreter enregistrement";cRecStatus.textContent="Enregistrement en cours...";return;}cRec.textContent="Demarrer enregistrement";if(clip.blob){cRecStatus.textContent=`Son pret (${Math.max(1,Math.round(clip.blob.size/1024))} KB)`;}else cRecStatus.textContent="Aucun son enregistre";}
function freeClip(){if(clip.rec&&clip.rec.state!=="inactive")clip.rec.stop();if(clip.mic)clip.mic.getTracks().forEach((t)=>t.stop());clip.rec=null;clip.mic=null;clip.on=false;}
async function startRec(){if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){toast("Micro non supporte","info");return;}if(clip.on)return;try{clip.chunks=[];clip.blob=null;clip.mime=pickMime();clip.mic=await navigator.mediaDevices.getUserMedia({audio:true});clip.rec=clip.mime?new MediaRecorder(clip.mic,{mimeType:clip.mime}):new MediaRecorder(clip.mic);clip.rec.ondataavailable=(e)=>{if(e.data&&e.data.size>0)clip.chunks.push(e.data);};clip.rec.onstop=()=>{if(clip.chunks.length>0){const t=clip.mime||clip.chunks[0].type||"audio/webm";clip.blob=new Blob(clip.chunks,{type:t});}clip.chunks=[];if(clip.mic)clip.mic.getTracks().forEach((t)=>t.stop());clip.rec=null;clip.mic=null;clip.on=false;recUI();};clip.rec.start();clip.on=true;recUI();}catch(_e){freeClip();toast("Acces micro refuse","info");}}
async function stopRec(){if(!clip.on||!clip.rec)return;clip.rec.stop();}
function clearClip(){clip.blob=null;clip.mime="";recUI();}
if(cRec)cRec.addEventListener("click",()=>{if(clip.on)void stopRec();else void startRec();});
if(cUse)cUse.addEventListener("click",()=>{const c=map.getCenter();composerPos.lat=c.lat;composerPos.lng=c.lng;compPos();toast("Position prise depuis la carte","info");});

function buildPayload(liveMode){const t=cTitle.value.trim(),d=cDesc.value.trim(),a=cAuthor.value.trim()||"Web User";if(!t)return{error:"Titre obligatoire"};return{value:{title:t,description:d,author:a,category:liveMode?"Live":"Communaute",icon:liveMode?"LIVE":"AUDIO",type:liveMode?"live":"story",duration:liveMode?180:120,isLive:liveMode,lat:composerPos.lat,lng:composerPos.lng,listeners:liveMode?1:0}};}
function ext(m){if(!m)return"webm";if(m.includes("ogg"))return"ogg";if(m.includes("mp4")||m.includes("m4a"))return"m4a";if(m.includes("mpeg"))return"mp3";return"webm";}
function form(payload,blob=null,name="clip"){const f=new FormData();Object.entries(payload).forEach(([k,v])=>f.append(k,String(v)));if(blob)f.append("audio",blob,`${name}-${Date.now()}.${ext(blob.type||clip.mime)}`);return f;}
async function publish(){const p=buildPayload(false);if(p.error){toast(p.error,"info");return;}if(!clip.blob){toast("Enregistrez un son avant publication","info");return;}try{const u=upsert(await req("/api/notes",{method:"POST",body:form(p.value,clip.blob,"note")}));refresh();clearClip();cTitle.value="";cDesc.value="";cHide();toast("Capsule publiee","success");await openModal(u);setApi(true,true);}catch(e){if(e&&typeof e.status==="number"){toast(e.message||"Publication impossible","info");setApi(true,true);}else setApi(false,false);}}
if(cPub)cPub.addEventListener("click",()=>void publish());
async function sendChunk(id,blob){if(!blob||blob.size===0)return;const f=new FormData();f.append("audio",blob,`stream-${Date.now()}.${ext(blob.type)}`);const u=upsert(await req(`/api/streams/${id}/audio`,{method:"POST",body:f}));refresh();if(current&&current.id===u.id){current=u;drawModal(u);}}
async function beginCapture(id){if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){toast("Stream non supporte","info");return;}live.mic=await navigator.mediaDevices.getUserMedia({audio:true});const m=pickMime();live.rec=m?new MediaRecorder(live.mic,{mimeType:m}):new MediaRecorder(live.mic);live.rec.ondataavailable=(e)=>{if(!e.data||e.data.size===0)return;live.q=live.q.then(()=>sendChunk(id,e.data)).catch(()=>toast("Chunk live non envoye","info"));};live.rec.start(5000);live.hb=setInterval(()=>{const lis=Math.max(1,Math.round(Math.random()*20));void req(`/api/streams/${id}/heartbeat`,{method:"POST",body:{listeners:lis}}).then((u)=>{upsert(u);refresh();}).catch(()=>{});},HB_MS);}
function liveUI(){const on=!!live.id;cStart.disabled=on;cStop.disabled=!on;cPub.disabled=on;cRec.disabled=on;cUse.disabled=on;if(on)cRecStatus.textContent=`Live actif (${live.id.slice(0,12)})`;else if(!clip.on)recUI();}
async function startLive(){const p=buildPayload(true);if(p.error){toast(p.error,"info");return;}if(live.id){toast("Un live est deja actif","info");return;}try{const s=upsert(await req("/api/streams/start",{method:"POST",body:form(p.value,clip.blob,"stream-start")}));live.id=s.id;live.q=Promise.resolve();liveUI();refresh();clearClip();toast("Stream demarre","live");await beginCapture(s.id);}catch(e){if(e&&typeof e.status==="number"){toast(e.message||"Demarrage live impossible","info");setApi(true,true);}else setApi(false,false);await stopLive(true);}}
async function stopLive(silent=false){const id=live.id;if(!id)return;if(live.hb){clearInterval(live.hb);live.hb=null;}if(live.rec&&live.rec.state!=="inactive")live.rec.stop();if(live.mic)live.mic.getTracks().forEach((t)=>t.stop());live.rec=null;live.mic=null;try{await live.q.catch(()=>{});const s=upsert(await req(`/api/streams/${id}/stop`,{method:"POST"}));refresh();if(current&&current.id===s.id){current=s;drawModal(s);}if(!silent)toast("Stream termine","info");setApi(true,true);}catch(_e){if(!silent)toast("Arret stream incomplet","info");}finally{live.id=null;liveUI();void load(true);}}
if(cStart)cStart.addEventListener("click",()=>void startLive());
if(cStop)cStop.addEventListener("click",()=>void stopLive(false));

function icon(n){const l=n.isLive,size=l?50:45,b=l?"#ff4757":"#2ed573",bg=l?"rgba(255,71,87,.22)":"rgba(46,213,115,.16)",p=l?"pulse-live":"pulse",dot=n.isStream&&n.streamActive?"<span class=\"live-dot\"></span>":"";return L.divIcon({className:"custom-bubble-mini",html:`<div class=\"bubble-mini ${p}\" style=\"width:${size}px;height:${size}px;border-color:${b};background:${bg};\"><span class=\"bubble-icon\">${n.icon||"A"}</span>${dot}</div>`,iconSize:[size,size],iconAnchor:[size/2,size/2]});}
const clear=()=>{layer.clearLayers();marks=[];};
const close=(c)=>marks.some((m)=>Math.hypot(m.coords[0]-c[0],m.coords[1]-c[1])<0.00028);
function add(n){const b=map.getBounds(),ok=Number.isFinite(n.lat)&&Number.isFinite(n.lng),lat=ok?n.lat:b.getSouth()+Math.random()*(b.getNorth()-b.getSouth()),lng=ok?n.lng:b.getWest()+Math.random()*(b.getEast()-b.getWest());if(close([lat,lng])&&marks.length>4)return;const mk=L.marker([lat,lng],{icon:icon(n)});mk.on("click",()=>void openModal(n));mk.addTo(layer);marks.push({coords:[lat,lng],marker:mk});}
function refresh(){clear();const f=notes.filter((n)=>mode==="live"?n.isLive:!n.isLive),max=mode==="live"?8:12;f.slice(0,max).forEach(add);}

const fallback=[nrm({id:"fallback_archive_1",title:"Capsule locale demo",description:"Backend offline.",category:"Communaute",icon:"AUDIO",type:"story",author:"Demo",duration:120,isLive:false,isStream:false,streamActive:false,lat:48.857,lng:2.353,likes:10,downvotes:1,reports:0,plays:32,listeners:0,audioUrl:null})];
async function load(silent=false){try{const data=await req(`/api/notes?mode=${mode==="live"?"live":"archive"}`);notes=data.map(nrm);refresh();setApi(true,silent);}catch(_e){if(notes.length===0){notes=fallback.slice();refresh();}setApi(false,silent);}}

function anim(el,s,e,d){const r=e-s,t=performance.now();function u(now){const p=Math.min((now-t)/d,1),q=1-Math.pow(1-p,3),v=Math.floor(s+r*q);el.textContent=`${v.toLocaleString()}${el.dataset.target==="85"?"%":"+"}`;if(p<1)requestAnimationFrame(u);}requestAnimationFrame(u);}
function stats(){const els=document.querySelectorAll(".stat-number");const ob=new IntersectionObserver((en)=>{en.forEach((e)=>{if(!e.isIntersecting)return;anim(e.target,0,parseInt(e.target.dataset.target,10),2000);ob.unobserve(e.target);});},{threshold:.4});els.forEach((x)=>ob.observe(x));}
document.querySelectorAll("a[href^='#']").forEach((a)=>a.addEventListener("click",function(ev){ev.preventDefault();const t=document.querySelector(this.getAttribute("href"));if(t)t.scrollIntoView({behavior:"smooth",block:"start"});}));

modeUI(false);recUI();liveUI();compPos();zone(pos.lat,pos.lng);stats();void load(false);setInterval(()=>void load(true),POLL_MS);setTimeout(()=>toast("Cliquez sur une bulle pour ecouter","info"),700);
window.addEventListener("beforeunload",()=>{stopLiveRefresh();if(live.id)void stopLive(true);freeClip();});
});
