document.addEventListener("DOMContentLoaded",()=>{
const hostName=window.location.hostname||"localhost";
const rawApiBase=window.VOCAL_WALLS_API_BASE||"http://localhost:4000";
const resolvedApiBase=(rawApiBase.includes("localhost")&&hostName!=="localhost"&&hostName!=="127.0.0.1")?rawApiBase.replace("localhost",hostName):rawApiBase;
const apiCandidates=Array.from(new Set([resolvedApiBase,`http://${hostName}:4000`]));
let apiBase=apiCandidates[0];
const POLL_MS=8000,HB_MS=6000,CLIENT_ID_KEY="vocal-walls-client-id";
let notes=[],current=null,apiOnline=false,offlineToast=false,onlineToast=false,liveTimer=null;
let marks=[];
const votes={},reports=new Set();
const pos={lat:48.8566,lng:2.3522},composerPos={lat:48.8566,lng:2.3522};
const geo={capturedAt:null,accuracy:null};
let geoMode="gps",userMarker=null,pinMarker=null,pinChosen=false;
const clip={mic:null,rec:null,chunks:[],blob:null,mime:"",on:false};
const live={id:null,mic:null,rec:null,hb:null,q:Promise.resolve()};
let creationMode="audio";

const $=(id)=>document.getElementById(id);
const mockup=document.querySelector(".mockup");
const menuBtn=$("app-menu"),menuPanel=$("app-menu-panel");
const quickExplore=document.createElement("div");quickExplore.className="quick-explore";quickExplore.innerHTML="<button id=\"quick-nearby\" type=\"button\">Centrer</button><button id=\"quick-live\" type=\"button\">Live</button>";if(mockup&&!mockup.querySelector(".quick-explore"))mockup.appendChild(quickExplore);
const toast=(m,t="info")=>{const c=$("toast-container");if(!c)return;const e=document.createElement("div");e.className=`toast ${t}`;e.innerHTML=`<span>${t==="success"?"OK":t==="live"?"LIVE":"INFO"}</span> ${m}`;c.appendChild(e);setTimeout(()=>{e.style.opacity="0";setTimeout(()=>e.remove(),250);},3000);};
const setApi=(ok,silent=false)=>{apiOnline=ok;if(ok){offlineToast=false;if(!onlineToast&&!silent){toast("Backend connecte","success");onlineToast=true;}}else{onlineToast=false;if(!offlineToast&&!silent){toast("Backend indisponible","info");offlineToast=true;}}};
function ensureClientId(){try{const existing=localStorage.getItem(CLIENT_ID_KEY);if(existing)return existing;const created=`web-${Math.random().toString(36).slice(2,10)}-${Date.now().toString(36)}`;localStorage.setItem(CLIENT_ID_KEY,created);return created;}catch(_e){return null;}}
async function req(path,opt={}){const clientId=ensureClientId();const o={method:opt.method||"GET",headers:{...(opt.headers||{})}};if(clientId)o.headers["x-client-id"]=clientId;if(opt.body!==undefined){if(opt.body instanceof FormData)o.body=opt.body;else{o.headers["content-type"]="application/json";o.body=JSON.stringify(opt.body);}}let lastErr=null;for(const base of apiCandidates){try{const r=await fetch(`${base}${path}`,o);apiBase=base;const p=await r.json().catch(()=>({}));if(!r.ok){const e=new Error(p.error||`HTTP ${r.status}`);e.status=r.status;throw e;}return p.data;}catch(err){lastErr=err;if(err&&typeof err.status==="number"&&err.status>0)throw err;}}const e=new Error(`Backend indisponible (${apiBase}). Ouvrez ${`http://${hostName}:4000/api/health`}`);e.status=0;e.network=true;e.cause=lastErr;throw e;}
const nrm=(n)=>({id:n.id||`local_${Date.now()}`,title:n.title||"Note",description:n.description||"",category:n.category||"Communaute",icon:n.icon||"A",type:n.type||"story",author:n.author||"Anonyme",duration:Number.isFinite(+n.duration)?Math.max(5,+n.duration):120,isLive:!!n.isLive,isStream:!!n.isStream,streamActive:!!n.streamActive,lat:Number.isFinite(+n.lat)?+n.lat:null,lng:Number.isFinite(+n.lng)?+n.lng:null,likes:Number.isFinite(+n.likes)?+n.likes:0,downvotes:Number.isFinite(+n.downvotes)?+n.downvotes:0,reports:Number.isFinite(+n.reports)?+n.reports:0,plays:Number.isFinite(+n.plays)?+n.plays:0,listeners:Number.isFinite(+n.listeners)?+n.listeners:0,audioUrl:typeof n.audioUrl==="string"?n.audioUrl:null,clientVote:n.clientVote==="like"||n.clientVote==="dislike"?n.clientVote:null,clientReported:!!n.clientReported,canDelete:!!n.canDelete});
const upsert=(u)=>{const m=nrm(u);if(m.clientVote)votes[m.id]=m.clientVote;else delete votes[m.id];if(m.clientReported)reports.add(m.id);else reports.delete(m.id);notes=[m,...notes.filter(x=>x.id!==m.id)];return m;};
const score=(n)=>n.likes-n.downvotes-n.reports*2;
const status=(n)=>n.reports>=4||score(n)<=-10?{t:"Contenu sous revue",c:"critical"}:n.reports>=2||score(n)<20?{t:"Visibilite reduite",c:"warning"}:{t:"Contenu normal",c:"ok"};
const ftime=(s)=>{const v=Math.max(0,Math.round(+s||0));return`${Math.floor(v/60)}:${String(v%60).padStart(2,"0")}`;};
const pickLiveNote=()=>notes.filter((n)=>n.isLive&&Number.isFinite(n.lat)&&Number.isFinite(n.lng)).sort((a,b)=>(b.listeners||0)-(a.listeners||0)||(b.plays||0)-(a.plays||0)||score(b)-score(a))[0]||null;

const map=L.map("map",{zoomControl:false,attributionControl:false}).setView([pos.lat,pos.lng],16);
L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",{maxZoom:20}).addTo(map);
const layer=L.layerGroup().addTo(map);
const userIcon=L.divIcon({className:"user-marker",html:'<div style="width:14px;height:14px;background:#2ed573;border:2px solid #fff;border-radius:50%;box-shadow:0 0 10px #2ed573"></div>',iconSize:[14,14]});
const pinIcon=L.divIcon({className:"user-marker",html:'<div style="width:16px;height:16px;background:#ff4757;border:2px solid #fff;border-radius:50%;box-shadow:0 0 14px #ff4757"></div>',iconSize:[16,16]});
const zone=(a,b)=>{const e=$("h3-cell");if(e)e.textContent=`Zone: ${a.toFixed(3)}, ${b.toFixed(3)}`;};
const compPos=()=>{const e=$("composer-location-text");if(e)e.textContent=`Position: ${composerPos.lat.toFixed(5)}, ${composerPos.lng.toFixed(5)}`;};
const setGeo=(lat,lng,accuracy=null,capturedAt=Date.now())=>{pos.lat=lat;pos.lng=lng;if(geoMode==="gps"){composerPos.lat=lat;composerPos.lng=lng;}geo.accuracy=Number.isFinite(+accuracy)?+accuracy:null;geo.capturedAt=Number.isFinite(+capturedAt)?+capturedAt:Date.now();compPos();zone(lat,lng);};
const renderUser=()=>{if(userMarker)userMarker.remove();userMarker=L.marker([pos.lat,pos.lng],{icon:userIcon}).addTo(map);};
const setPin=(lat,lng,centerMap=false)=>{composerPos.lat=lat;composerPos.lng=lng;pinChosen=true;compPos();if(centerMap)map.setView([lat,lng],16);if(pinMarker)pinMarker.remove();pinMarker=L.marker([lat,lng],{icon:pinIcon,draggable:false}).addTo(map);};
const clearPin=()=>{if(pinMarker){pinMarker.remove();pinMarker=null;}pinChosen=false;};
const geoMsg=(err)=>{if(!err)return"Position GPS indisponible";if(err.code===1)return"Autorisez la geolocalisation pour publier.";if(err.code===2)return"Position GPS indisponible (signal).";if(err.code===3)return"Position GPS timeout.";return"Position GPS indisponible";};
async function captureGps({setView=false}={}){if(!navigator.geolocation){throw new Error("Geolocalisation non supportee");}const p=await new Promise((resolve,reject)=>{navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:0});});const lat=p.coords.latitude,lng=p.coords.longitude,acc=p.coords.accuracy,ts=p.timestamp||Date.now();setGeo(lat,lng,acc,ts);if(setView)map.setView([lat,lng],16);return{lat,lng,acc,ts};}
map.locate({setView:true,maxZoom:16});
map.on("locationfound",(ev)=>{setGeo(ev.latlng.lat,ev.latlng.lng,ev.accuracy,Date.now());renderUser();$("location-name").textContent="Votre position";});
map.on("locationerror",()=>{const c=map.getCenter();$("location-name").textContent="Paris centre";zone(c.lat,c.lng);compPos();});
map.on("click",()=>{if(menuOpen){menuOpen=false;menuUI();}if(creationMenu&&!creationMenu.classList.contains("hidden"))creationMenu.classList.add("hidden");});
map.on("moveend",()=>{const c=map.getCenter();zone(c.lat,c.lng);refresh();});

const modeLabel=$("mode-label"),modeBtn=$("mode-toggle");
const modeUI=()=>{if(modeBtn?.closest(".mode-control"))modeBtn.closest(".mode-control").style.display="none";if(modeLabel){modeLabel.textContent="Carte mixte";modeLabel.classList.remove("live");}};
let menuOpen=false;
function menuUI(){if(menuPanel)menuPanel.classList.toggle("hidden",!menuOpen);if(menuBtn)menuBtn.setAttribute("aria-expanded",menuOpen?"true":"false");}
if(menuPanel)menuPanel.innerHTML="<strong>Menu</strong><span>Centrer vous replace sur votre position.</span><span>Live ouvre le direct le plus pertinent visible.</span><span>Esc ferme la fiche ou le panneau actif.</span>";
if(menuBtn)menuBtn.addEventListener("click",(ev)=>{ev.stopPropagation();menuOpen=!menuOpen;menuUI();});
document.addEventListener("click",(ev)=>{if(!menuOpen)return;if(menuPanel?.contains(ev.target)||menuBtn?.contains(ev.target))return;menuOpen=false;menuUI();});

const modal=$("audio-modal"),mClose=$("modal-close"),mTitle=$("modal-title"),mAuthor=$("modal-author"),mCat=$("modal-category"),mIcon=$("modal-icon"),mLive=$("modal-live"),mDesc=$("modal-description"),mAudio=$("modal-audio"),mNoAudio=$("modal-audio-empty"),mLikes=$("modal-likes"),mPlays=$("modal-plays"),mTime=$("modal-time"),mStatus=$("modal-status");
const bLike=$("btn-like"),bDis=$("btn-dislike"),bShare=$("btn-share"),bRep=$("btn-report"),bDelete=$("btn-delete"),quickNearby=$("quick-nearby"),quickLive=$("quick-live");
const modalModeration=document.querySelector("#audio-modal .modal-moderation");
const modalHeaderMain=mTitle?.parentElement||null;
const modalMetaRow=mAuthor?.parentElement||null;
const modalHeaderWrap=modalHeaderMain?.parentElement||null;
const modalControlsWrap=document.querySelector("#audio-modal .modal-controls");
const modalActionsWrap=document.querySelector("#audio-modal .modal-actions");
if(modalHeaderMain)modalHeaderMain.classList.add("modal-header-main");
if(modalMetaRow)modalMetaRow.classList.add("modal-meta-row");
if(modalHeaderWrap&&!modalHeaderWrap.querySelector(".modal-shortcuts")){
  const hint=document.createElement("div");
  hint.className="modal-shortcuts";
  hint.textContent="Esc pour fermer";
  modalHeaderWrap.appendChild(hint);
}
if(modalModeration)modalModeration.style.display="none";
if(bLike)bLike.textContent="Like";
if(bDis)bDis.textContent="Dislike";
if(bRep)bRep.textContent="Signaler";
function ensureModalLabel(target,text){
  if(!target)return;
  target.classList.add("modal-block");
  const prev=target.previousElementSibling;
  if(prev&&prev.classList.contains("modal-block-label"))return;
  const label=document.createElement("div");
  label.className="modal-block-label";
  label.textContent=text;
  target.parentNode?.insertBefore(label,target);
}
if(mDesc)ensureModalLabel(mDesc,"Description");
if(mAudio)ensureModalLabel(mAudio,"Lecture");
if(modalControlsWrap){
  ensureModalLabel(modalControlsWrap,"Infos");
  const timeNode=mTime?.parentElement===modalControlsWrap?mTime:null;
  const statsNode=document.querySelector("#audio-modal .modal-stats");
  if(timeNode&&statsNode&&!modalControlsWrap.querySelector(".modal-control-row")){
    const row=document.createElement("div");
    row.className="modal-control-row";
    modalControlsWrap.insertBefore(row,timeNode);
    row.appendChild(timeNode);
    row.appendChild(statsNode);
  }
}
if(modalActionsWrap)ensureModalLabel(modalActionsWrap,"Actions");
function wave(l){const cv=$("waveform");if(!cv)return;const x=cv.getContext("2d");x.clearRect(0,0,cv.width,cv.height);const c=l?"#ff4757":"#ff6b81";for(let i=0;i<34;i++){const h=Math.random()*35+8,y=(cv.height-h)/2,b=cv.width/34;x.fillStyle=i<12?c:`${c}55`;x.fillRect(i*b+1,y,b-2,h);}}
function voteUI(){if(!current)return;const v=votes[current.id],r=reports.has(current.id);bLike.classList.toggle("active",v==="like");bDis.classList.toggle("active",v==="dislike");bLike.setAttribute("aria-pressed",v==="like"?"true":"false");bDis.setAttribute("aria-pressed",v==="dislike"?"true":"false");bLike.title=v==="like"?"Retirer le like":"Ajouter un like";bDis.title=v==="dislike"?"Retirer le dislike":"Ajouter un dislike";bRep.disabled=r;bRep.textContent=r?"Signale":"Signaler";if(bDelete)bDelete.classList.toggle("hidden",!(current.canDelete&&!current.isLive));}
function drawModal(n){mTitle.textContent=n.title;mAuthor.textContent=`Par ${n.author}`;mCat.textContent=n.category;mIcon.innerHTML='<span class="speaker-shell"><span class="speaker-box"></span><span class="speaker-cone"></span><span class="speaker-wave-one"></span><span class="speaker-wave-two"></span></span>';mDesc.textContent=n.description||"Aucune description.";mLikes.textContent=String(n.likes);mPlays.textContent=String(n.plays);mTime.textContent=`0:00 / ${ftime(n.duration)}`;const s=status(n);mStatus.textContent=s.t;mStatus.classList.remove("ok","warning","critical");mStatus.classList.add(s.c);if(n.isLive){mLive.classList.remove("hidden");mLive.textContent=`${n.isStream&&n.streamActive?"LIVE STREAM":"LIVE"} - ${n.listeners} auditeurs`;}else mLive.classList.add("hidden");if(n.audioUrl){if((mAudio.getAttribute("src")||"")!==n.audioUrl){mAudio.setAttribute("src",n.audioUrl);mAudio.load();}mAudio.classList.remove("hidden");mNoAudio.classList.add("hidden");}else{mAudio.pause();mAudio.removeAttribute("src");mAudio.load();mAudio.classList.add("hidden");mNoAudio.classList.remove("hidden");}wave(n.isLive);voteUI();}
function stopLiveRefresh(){if(liveTimer){clearInterval(liveTimer);liveTimer=null;}}
function startLiveRefresh(id){stopLiveRefresh();liveTimer=setInterval(async()=>{if(!current||current.id!==id)return;try{const u=upsert(await req(`/api/notes/${id}`));if(current&&current.id===u.id){current=u;drawModal(u);}refresh();}catch(_e){}},5000);}
async function openModal(n){current=n;drawModal(n);modal.classList.remove("hidden");try{const p=upsert(await req(`/api/notes/${n.id}/play`,{method:"POST"}));current=p;drawModal(p);refresh();}catch(_e){}if(n.isLive&&n.streamActive)startLiveRefresh(n.id);}
function closeModal(){stopLiveRefresh();modal.classList.add("hidden");mAudio.pause();current=null;}
if(mClose)mClose.addEventListener("click",closeModal);
if(modal)modal.addEventListener("click",(e)=>{if(e.target===modal)closeModal();});
document.addEventListener("keydown",(e)=>{if(e.key!=="Escape")return;if(modal&&!modal.classList.contains("hidden")){closeModal();return;}if(cModal&&!cModal.classList.contains("hidden")){cHide();}});
async function doVote(type){if(!current)return;const prev=votes[current.id]||null;const next=prev===type?null:type;if(prev==="like")current.likes=Math.max(0,(current.likes||0)-1);if(prev==="dislike")current.downvotes=Math.max(0,(current.downvotes||0)-1);if(next==="like")current.likes=(current.likes||0)+1;if(next==="dislike")current.downvotes=(current.downvotes||0)+1;if(next)votes[current.id]=next;else delete votes[current.id];drawModal(current);refresh();try{current=upsert(await req(`/api/notes/${current.id}/votes`,{method:"POST",body:{type}}));drawModal(current);refresh();}catch(_e){toast("Vote local conserve","info");}}
async function doReport(){if(!current)return;if(reports.has(current.id)){toast("Signalement deja envoye","info");return;}reports.add(current.id);current.reports+=1;drawModal(current);refresh();try{current=upsert(await req(`/api/notes/${current.id}/report`,{method:"POST"}));drawModal(current);refresh();}catch(_e){toast("Signalement local conserve","info");}}
async function doDelete(){if(!current||!current.canDelete||current.isLive)return;if(!window.confirm("Supprimer ce son ?"))return;const id=current.id;try{await req(`/api/notes/${id}`,{method:"DELETE"});notes=notes.filter((n)=>n.id!==id);delete votes[id];reports.delete(id);closeModal();refresh();toast("Son supprime","success");setApi(true,true);}catch(e){toast(e.message||"Suppression impossible","info");if(e&&e.network)setApi(false,false);}}
if(bLike)bLike.addEventListener("click",()=>void doVote("like"));
if(bDis)bDis.addEventListener("click",()=>void doVote("dislike"));
if(bRep)bRep.addEventListener("click",()=>void doReport());
if(bDelete)bDelete.addEventListener("click",()=>void doDelete());
if(bShare)bShare.addEventListener("click",async()=>{const t=current?`${window.location.href}#note=${encodeURIComponent(current.id)}`:window.location.href;try{if(!navigator.clipboard?.writeText)throw new Error("clip");await navigator.clipboard.writeText(t);toast("Lien copie","success");}catch(_e){toast("Copie impossible","info");}});
if(quickNearby)quickNearby.addEventListener("click",()=>{menuOpen=false;menuUI();map.flyTo([pos.lat,pos.lng],Math.max(map.getZoom(),16));});
if(quickLive)quickLive.addEventListener("click",()=>{menuOpen=false;menuUI();const liveNote=pickLiveNote();if(!liveNote){toast("Aucun live pour le moment","info");return;}map.flyTo([liveNote.lat,liveNote.lng],Math.max(map.getZoom(),16));void openModal(liveNote);});

const cModal=$("composer-modal"),cClose=$("composer-close"),cTitle=$("composer-title"),cDesc=$("composer-description"),cAuthor=$("composer-author"),cUse=$("composer-use-map"),cGeoGps=$("composer-geo-gps"),cGeoPin=$("composer-geo-pin"),cHint=$("composer-location-hint"),cRec=$("composer-record-toggle"),cRecStatus=$("composer-record-status"),cPub=$("composer-publish"),cStart=$("composer-start-live"),cStop=$("composer-stop-live"),launcher=$("record-btn"),creationMenu=$("creation-menu"),createAudio=$("create-audio"),createLive=$("create-live"),composerHeading=$("composer-heading"),composerSubtitle=$("composer-subtitle");
function geoModeUI(){if(cGeoGps)cGeoGps.style.display="none";if(cGeoPin)cGeoPin.style.display="none";if(cUse)cUse.textContent="Mettre a jour GPS";if(cHint)cHint.textContent="Votre publication prendra votre position GPS actuelle. Restez fair-play !";}
function syncComposerMode(){if(composerHeading)composerHeading.textContent=creationMode==="live"?"Demarrer un live local":"Publier un son geolocalise";if(composerSubtitle)composerSubtitle.textContent=creationMode==="live"?"Le live utilise votre position GPS actuelle.":"Creez une capsule audio locale sans surcharger la carte.";if(cPub)cPub.classList.toggle("hidden",creationMode!=="audio");if(cStart)cStart.classList.toggle("hidden",creationMode!=="live");if(cStop)cStop.classList.toggle("hidden",creationMode!=="live");}
const cOpen=(nextMode="audio")=>{creationMode=nextMode;if(creationMenu)creationMenu.classList.add("hidden");cModal.classList.remove("hidden");geoModeUI();syncComposerMode();compPos();setPin(composerPos.lat,composerPos.lng,false);};
const cHide=()=>{cModal.classList.add("hidden");if(!pinChosen)clearPin();};
if(launcher)launcher.addEventListener("click",(ev)=>{ev.stopPropagation();if(creationMenu)creationMenu.classList.toggle("hidden");});
if(createAudio)createAudio.addEventListener("click",(ev)=>{ev.stopPropagation();cOpen("audio");});
if(createLive)createLive.addEventListener("click",(ev)=>{ev.stopPropagation();cOpen("live");});
if(cClose)cClose.addEventListener("click",cHide);
if(cModal)cModal.addEventListener("click",(e)=>{if(e.target===cModal)cHide();});
document.addEventListener("click",(ev)=>{if(!creationMenu||creationMenu.classList.contains("hidden"))return;if(creationMenu.contains(ev.target)||launcher?.contains(ev.target))return;creationMenu.classList.add("hidden");});

function pickMime(){const a=["audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus","audio/ogg","audio/mp4"];for(const m of a){if(typeof MediaRecorder!=="undefined"&&MediaRecorder.isTypeSupported(m))return m;}return"";}
function recUI(){if(cRec.disabled)return;if(clip.on){cRec.textContent="Arreter enregistrement";cRecStatus.textContent="Enregistrement en cours...";return;}cRec.textContent="Demarrer enregistrement";if(clip.blob){cRecStatus.textContent=`Son pret (${Math.max(1,Math.round(clip.blob.size/1024))} KB)`;}else cRecStatus.textContent="Aucun son enregistre";}
function freeClip(){if(clip.rec&&clip.rec.state!=="inactive")clip.rec.stop();if(clip.mic)clip.mic.getTracks().forEach((t)=>t.stop());clip.rec=null;clip.mic=null;clip.on=false;}
async function startRec(){if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){toast("Micro non supporte","info");return;}if(clip.on)return;try{clip.chunks=[];clip.blob=null;clip.mime=pickMime();clip.mic=await navigator.mediaDevices.getUserMedia({audio:true});clip.rec=clip.mime?new MediaRecorder(clip.mic,{mimeType:clip.mime}):new MediaRecorder(clip.mic);clip.rec.ondataavailable=(e)=>{if(e.data&&e.data.size>0)clip.chunks.push(e.data);};clip.rec.onstop=()=>{if(clip.chunks.length>0){const t=clip.mime||clip.chunks[0].type||"audio/webm";clip.blob=new Blob(clip.chunks,{type:t});}clip.chunks=[];if(clip.mic)clip.mic.getTracks().forEach((t)=>t.stop());clip.rec=null;clip.mic=null;clip.on=false;recUI();};clip.rec.start();clip.on=true;recUI();}catch(_e){freeClip();toast("Acces micro refuse","info");}}
async function stopRec(){if(!clip.on||!clip.rec)return;clip.rec.stop();}
function clearClip(){clip.blob=null;clip.mime="";recUI();}
if(cRec)cRec.addEventListener("click",()=>{if(clip.on)void stopRec();else void startRec();});
if(cGeoGps)cGeoGps.addEventListener("click",()=>{});
if(cGeoPin)cGeoPin.addEventListener("click",()=>{});
if(cUse)cUse.addEventListener("click",()=>{void captureGps({setView:true}).then(()=>{toast("Position GPS mise a jour","success");}).catch((err)=>{toast(geoMsg(err),"info");});});

async function prepareComposerPosition(){try{await captureGps({setView:false});return true;}catch(err){toast(geoMsg(err),"info");return false;}}
function buildPayload(liveMode){const t=cTitle.value.trim(),d=cDesc.value.trim(),a=cAuthor.value.trim()||"Web User";if(!t)return{error:"Titre obligatoire"};if(!Number.isFinite(+composerPos.lat)||!Number.isFinite(+composerPos.lng))return{error:"Position invalide"};const payload={title:t,description:d,author:a,category:liveMode?"Live":"Communaute",icon:liveMode?"LIVE":"AUDIO",type:liveMode?"live":"story",duration:liveMode?180:120,isLive:liveMode,lat:composerPos.lat,lng:composerPos.lng,listeners:liveMode?1:0,geoSource:geoMode};if(geoMode==="gps"){if(!geo.capturedAt)return{error:"Position GPS requise"};payload.geoAccuracy=geo.accuracy??-1;payload.geoCapturedAt=new Date(geo.capturedAt).toISOString();}return{value:payload};}
function ext(m){if(!m)return"webm";if(m.includes("ogg"))return"ogg";if(m.includes("mp4")||m.includes("m4a"))return"m4a";if(m.includes("mpeg"))return"mp3";return"webm";}
function form(payload,blob=null,name="clip"){const f=new FormData();Object.entries(payload).forEach(([k,v])=>f.append(k,String(v)));if(blob)f.append("audio",blob,`${name}-${Date.now()}.${ext(blob.type||clip.mime)}`);return f;}
async function publish(){if(!(await prepareComposerPosition()))return;const p=buildPayload(false);if(p.error){toast(p.error,"info");return;}if(!clip.blob){toast("Enregistrez un son avant publication","info");return;}try{const u=upsert(await req("/api/notes",{method:"POST",body:form(p.value,clip.blob,"note")}));refresh();clearClip();cTitle.value="";cDesc.value="";cHide();toast("Capsule publiee","success");await openModal(u);setApi(true,true);}catch(e){toast(e.message||"Publication impossible","info");if(e&&e.network)setApi(false,false);else setApi(true,true);}}
if(cPub)cPub.addEventListener("click",()=>void publish());
async function sendChunk(id,blob){if(!blob||blob.size===0)return;const f=new FormData();f.append("audio",blob,`stream-${Date.now()}.${ext(blob.type)}`);const u=upsert(await req(`/api/streams/${id}/audio`,{method:"POST",body:f}));refresh();if(current&&current.id===u.id){current=u;drawModal(u);}}
async function beginCapture(id){if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){toast("Stream non supporte","info");return;}live.mic=await navigator.mediaDevices.getUserMedia({audio:true});const m=pickMime();live.rec=m?new MediaRecorder(live.mic,{mimeType:m}):new MediaRecorder(live.mic);live.rec.ondataavailable=(e)=>{if(!e.data||e.data.size===0)return;live.q=live.q.then(()=>sendChunk(id,e.data)).catch(()=>toast("Chunk live non envoye","info"));};live.rec.start(5000);live.hb=setInterval(()=>{const lis=Math.max(1,Math.round(Math.random()*20));void req(`/api/streams/${id}/heartbeat`,{method:"POST",body:{listeners:lis}}).then((u)=>{upsert(u);refresh();}).catch(()=>{});},HB_MS);}
function liveUI(){const on=!!live.id;cStart.disabled=on;cStop.disabled=!on;cPub.disabled=on;cRec.disabled=on;cUse.disabled=on;if(cGeoGps)cGeoGps.disabled=on;if(cGeoPin)cGeoPin.disabled=on;if(on)cRecStatus.textContent=`Live actif (${live.id.slice(0,12)})`;else if(!clip.on)recUI();}
async function startLive(){if(!(await prepareComposerPosition()))return;const p=buildPayload(true);if(p.error){toast(p.error,"info");return;}if(live.id){toast("Un live est deja actif","info");return;}try{const s=upsert(await req("/api/streams/start",{method:"POST",body:form(p.value,clip.blob,"stream-start")}));live.id=s.id;live.q=Promise.resolve();liveUI();refresh();clearClip();toast("Stream demarre","live");await beginCapture(s.id);}catch(e){toast(e.message||"Demarrage live impossible","info");if(e&&e.network)setApi(false,false);else setApi(true,true);await stopLive(true);}}
async function stopLive(silent=false){const id=live.id;if(!id)return;if(live.hb){clearInterval(live.hb);live.hb=null;}if(live.rec&&live.rec.state!=="inactive")live.rec.stop();if(live.mic)live.mic.getTracks().forEach((t)=>t.stop());live.rec=null;live.mic=null;try{await live.q.catch(()=>{});const s=upsert(await req(`/api/streams/${id}/stop`,{method:"POST"}));refresh();if(current&&current.id===s.id){current=s;drawModal(s);}if(!silent)toast("Stream termine","info");setApi(true,true);}catch(_e){if(!silent)toast("Arret stream incomplet","info");}finally{live.id=null;liveUI();void load(true);}}
if(cStart)cStart.addEventListener("click",()=>void startLive());
if(cStop)cStop.addEventListener("click",()=>void stopLive(false));

function icon(n){
  const l=n.isLive;
  const negativeWeight=(n.downvotes||0)+(n.reports||0)*2;
  const positiveWeight=n.likes||0;
  const totalWeight=positiveWeight+negativeWeight;
  let scale=1,opacity=1,glow="";
  if(totalWeight>=3){
    const ratio=(positiveWeight-negativeWeight)/totalWeight;
    if(ratio>0){
      scale=1+Math.min(ratio*0.5,0.5);
      if(ratio>=0.55&&!l)glow="bubble-mini-highlight";
    }else opacity=Math.max(0.14,1+ratio*10);
  }
  const baseSize=l?50:45;
  const size=baseSize*scale;
  const border=l?"#ff4757":"#4f7cff";
  const bg=l?"rgba(255,71,87,.22)":"rgba(79,124,255,.16)";
  const pulse=l?"pulse-live":"";
  const dot=n.isStream&&n.streamActive?'<span class="live-dot"></span>':"";
  return L.divIcon({
    className:"custom-bubble-mini",
    html:`<div class="bubble-shell" style="transform: scale(${scale}); opacity: ${opacity};">
      <div class="bubble-mini ${pulse} ${glow}" style="width:${baseSize}px;height:${baseSize}px;border-color:${border};background:${bg};">
        <span class="speaker-shell speaker-shell-pin">
          <span class="speaker-box"></span>
          <span class="speaker-cone"></span>
          <span class="speaker-wave-one"></span>
          <span class="speaker-wave-two"></span>
        </span>
        ${dot}
      </div>
      <div class="bubble-pointer" style="border-top-color:${border};"></div>
    </div>`,
    iconSize:[size,size+12],
    iconAnchor:[size/2,size+12]
  });
}
const clear=()=>{layer.clearLayers();marks=[];};
function clusterIcon(cluster){return L.divIcon({className:"custom-bubble-mini",html:`<div class="cluster-pin"><div class="cluster-half archive"><strong>${cluster.archiveCount}</strong><span>sons</span></div><div class="cluster-half live"><strong>${cluster.liveCount}</strong><span>live</span></div></div><div class="cluster-pointer"></div>`,iconSize:[78,54],iconAnchor:[39,54]});}
function clusterEntries(items){
  const b=map.getBounds(),zoom=map.getZoom(),divisor=zoom<13?4.5:zoom<15?6.2:8,latStep=Math.max((b.getNorth()-b.getSouth())/divisor,0.0011),lngStep=Math.max((b.getEast()-b.getWest())/divisor,0.0011),buckets=new Map();
  items.filter((n)=>Number.isFinite(n.lat)&&Number.isFinite(n.lng)).forEach((n)=>{const key=`${Math.round(n.lat/latStep)}:${Math.round(n.lng/lngStep)}`;const bucket=buckets.get(key)||[];bucket.push(n);buckets.set(key,bucket);});
  return Array.from(buckets.values()).flatMap((group,index)=>{
    if(group.length===1)return[{type:"note",note:group[0]}];
    const lat=group.reduce((sum,n)=>sum+n.lat,0)/group.length;
    const lng=group.reduce((sum,n)=>sum+n.lng,0)/group.length;
    if(zoom>=17){
      const latSpread=Math.max(...group.map((n)=>n.lat))-Math.min(...group.map((n)=>n.lat));
      const lngSpread=Math.max(...group.map((n)=>n.lng))-Math.min(...group.map((n)=>n.lng));
      if(latSpread<0.00018&&lngSpread<0.00018){
        const radius=0.00016;
        return group.map((note,itemIndex)=>{
          const angle=(Math.PI*2*itemIndex)/group.length;
          return{type:"note",note:{...note,renderLat:note.lat+Math.sin(angle)*radius,renderLng:note.lng+Math.cos(angle)*radius}};
        });
      }
    }
    const liveCount=group.filter((n)=>n.isLive).length;
    return[{type:"cluster",id:`cluster-${index}-${group[0].id}`,lat,lng,archiveCount:group.length-liveCount,liveCount}];
  });
}
function addEntry(entry){
  if(entry.type==="cluster"){
    const mk=L.marker([entry.lat,entry.lng],{icon:clusterIcon(entry)});
    mk.on("click",()=>map.flyTo([entry.lat,entry.lng],Math.min(map.getZoom()+2,19)));
    mk.addTo(layer);
    marks.push(mk);
    return;
  }
  const n=entry.note;
  const markerLat=Number.isFinite(n.renderLat)?n.renderLat:n.lat;
  const markerLng=Number.isFinite(n.renderLng)?n.renderLng:n.lng;
  const mk=L.marker([markerLat,markerLng],{icon:icon(n)});
  mk.on("click",()=>void openModal(n));
  mk.addTo(layer);
  marks.push(mk);
}
function refresh(){clear();const center=map.getCenter();const max=map.getZoom()<14?18:28;const prioritized=notes.filter((n)=>Number.isFinite(n.lat)&&Number.isFinite(n.lng)).slice().sort((a,b)=>Number(b.isLive)-Number(a.isLive)||score(b)-score(a)||(b.plays||0)-(a.plays||0)||((Math.abs(a.lat-center.lat)+Math.abs(a.lng-center.lng))-(Math.abs(b.lat-center.lat)+Math.abs(b.lng-center.lng)))).slice(0,max);clusterEntries(prioritized).forEach(addEntry);}

const fallback=[nrm({id:"fallback_archive_1",title:"Capsule locale demo",description:"Backend offline.",category:"Communaute",icon:"AUDIO",type:"story",author:"Demo",duration:120,isLive:false,isStream:false,streamActive:false,lat:48.857,lng:2.353,likes:10,downvotes:1,reports:0,plays:32,listeners:0,audioUrl:null})];
async function load(silent=false){try{const [archiveData,liveData]=await Promise.all([req("/api/notes?mode=archive"),req("/api/streams?active=true")]);const merged=[...liveData,...archiveData].map(nrm);Object.keys(votes).forEach((key)=>delete votes[key]);reports.clear();merged.forEach((n)=>{if(n.clientVote)votes[n.id]=n.clientVote;if(n.clientReported)reports.add(n.id);});notes=Array.from(new Map(merged.map((n)=>[n.id,n])).values());refresh();setApi(true,silent);}catch(_e){if(notes.length===0){notes=fallback.slice();refresh();}setApi(false,silent);}}

function anim(el,s,e,d){const r=e-s,t=performance.now();function u(now){const p=Math.min((now-t)/d,1),q=1-Math.pow(1-p,3),v=Math.floor(s+r*q);el.textContent=`${v.toLocaleString()}${el.dataset.target==="85"?"%":"+"}`;if(p<1)requestAnimationFrame(u);}requestAnimationFrame(u);}
function stats(){const els=document.querySelectorAll(".stat-number");const ob=new IntersectionObserver((en)=>{en.forEach((e)=>{if(!e.isIntersecting)return;anim(e.target,0,parseInt(e.target.dataset.target,10),2000);ob.unobserve(e.target);});},{threshold:.4});els.forEach((x)=>ob.observe(x));}
document.querySelectorAll("a[href^='#']").forEach((a)=>a.addEventListener("click",function(ev){ev.preventDefault();const t=document.querySelector(this.getAttribute("href"));if(t)t.scrollIntoView({behavior:"smooth",block:"start"});}));

modeUI(false);geoModeUI();recUI();liveUI();compPos();zone(pos.lat,pos.lng);stats();void load(false);setInterval(()=>void load(true),POLL_MS);setTimeout(()=>toast("Carte mixte active. Zoomez puis touchez un son.","info"),700);
window.addEventListener("beforeunload",()=>{stopLiveRefresh();if(live.id)void stopLive(true);freeClip();});
});





