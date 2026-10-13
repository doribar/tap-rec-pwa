import {nextTapAction} from "./state-machine.mjs";
const $=id=>document.getElementById(id);
const ui={tap:$("tap"),mode:$("mode"),clock:$("clock"),status:$("status"),hint:$("hint"),fill:$("fill"),notice:$("notice"),symbol:$("symbol")};
const views={
 idle:["待機中","タップで録音開始","画面のどこをタップしてもOK","mic"],
 starting:["準備中","マイクに接続しています","初回はマイクを許可してください","mic"],
 recording:["録音中","録音しています","タップで録音終了","stop"],
 stopping:["保存中","録音を終了しています","録音を保存しています","stop"],
 ready:["録音完了","再生できます","タップで録音を再生","play"],
 playing:["再生中","再生しています","タップで一時停止","pause"],
 paused:["一時停止","再生を一時停止中","タップで続きから再生","play"],
 ended:["再生終了","再生が終わりました","タップで削除して新しく録音","repeat"]
};
const drawings={
 mic:'<rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8"/>',
 stop:'<rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" stroke="none"/>',
 play:'<path d="m7 4 13 8-13 8z" fill="currentColor" stroke="none"/>',
 pause:'<rect x="5" y="4" width="5" height="16" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4" width="5" height="16" rx="1" fill="currentColor" stroke="none"/>',
 repeat:'<path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 8v4l3 2"/>'
};
let state="starting",db=null,stream=null,recorder=null,chunks=[],clip=null,audio=null,url=null,wake=null,started=0,busy=false,lastTap=-1000;
function change(s){state=s;document.body.dataset.s=s;const [mode,status,hint,symbol]=views[s];ui.mode.textContent=mode;ui.status.textContent=status;ui.hint.textContent=hint;ui.symbol.innerHTML=drawings[symbol];ui.tap.disabled=!nextTapAction(s);ui.tap.setAttribute("aria-label",status+"。"+hint);clock()}
function notice(message=""){ui.notice.textContent=message}
function time(ms){const sec=Math.floor(Math.max(ms||0,0)/1000);const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?h+":"+String(m).padStart(2,"0")+":"+String(s).padStart(2,"0"):String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")}
function clock(){if(state==="recording"){ui.clock.textContent=time(performance.now()-started);ui.fill.style.width="0%";return}if(["idle","starting"].includes(state)){ui.clock.textContent="00:00";ui.fill.style.width="0%";return}const ms=(state==="playing"||state==="paused")&&audio?audio.currentTime*1000:clip?.durationMs||0;ui.clock.textContent=time(ms);ui.fill.style.width=clip?.durationMs?Math.min(100,ms/clip.durationMs*100)+"%":"0%"}
function database(){return new Promise((ok,no)=>{const r=indexedDB.open("tap-rec-audio-v1",1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("clips"))r.result.createObjectStore("clips")};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
function storage(method,entry){if(!db)return Promise.resolve(method==="get"?null:false);return new Promise((ok,no)=>{const t=db.transaction("clips",method==="get"?"readonly":"readwrite"),s=t.objectStore("clips");let result;const r=method==="get"?s.get("latest"):method==="put"?s.put(entry,"latest"):s.delete("latest");r.onsuccess=()=>{result=r.result};t.oncomplete=()=>ok(method==="get"?result:true);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error)})}
function closeStream(){if(stream){stream.getTracks().forEach(track=>track.stop());stream=null}}
function clearClip(){if(audio){audio.pause();audio.removeAttribute("src");audio.load();audio=null}if(url){URL.revokeObjectURL(url);url=null}clip=null}
function setClip(value){clearClip();clip=value;url=URL.createObjectURL(value.blob);audio=new Audio(url);audio.preload="auto";audio.addEventListener("ended",()=>{if(state==="playing")change("ended")});audio.addEventListener("error",()=>{if(state==="playing"||state==="paused"){change("ready");notice("音声を再生できませんでした")}})}
async function holdScreen(){if(!navigator.wakeLock||document.visibilityState!=="visible"||wake||state!=="recording")return;try{const w=await navigator.wakeLock.request("screen");if(state!=="recording"){await w.release();return}wake=w;w.addEventListener("release",()=>{if(wake===w)wake=null})}catch{notice("画面の消灯防止に失敗しました。端末の設定を確認してください")}}
function releaseScreen(){const w=wake;wake=null;if(w)w.release().catch(()=>{})}
function fail(e){closeStream();releaseScreen();recorder=null;chunks=[];change("idle");notice(e?.message||"録音に失敗しました")}
async function start(replace=false){
 change("starting");notice("");
 try{
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error("Android ChromeでHTTPS接続してください");
  // マイク取得はタップ処理から直ちに開始する
  const acquired=await navigator.mediaDevices.getUserMedia({audio:true});stream=acquired;
  const supported=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(t=>MediaRecorder.isTypeSupported(t));
  const current=new MediaRecorder(acquired,supported?{mimeType:supported}:undefined);
  chunks=[];recorder=current;
  current.addEventListener("dataavailable",e=>{if(e.data?.size)chunks.push(e.data)});
  current.addEventListener("stop",()=>{finish(current).catch(fail)},{once:true});
  current.addEventListener("error",()=>{if(current.state!=="inactive")current.stop()});
  current.start(500);started=performance.now();change("recording");void holdScreen();
  if(replace){ // 録音が正常に始まった後で古いデータを消す
   clearClip();
   try{await storage("delete")}catch{notice("古い録音の削除に失敗しました。サイトデータを確認してください")}
  }
 }catch(e){fail(e?.name==="NotAllowedError"?Error("マイクを許可してください。Chromeのサイト設定から変更できます"):e)}
}
function stop(){const r=recorder;if(!r||r.state==="inactive")return;change("stopping");try{r.stop()}catch(e){fail(e)}}
async function finish(current){
 const durationMs=performance.now()-started;closeStream();releaseScreen();if(recorder!==current)return;recorder=null;
 const blob=new Blob(chunks,{type:current.mimeType||chunks[0]?.type||"audio/webm"});chunks=[];
 if(!blob.size)throw Error("録音データが空でした");
 const value={blob,durationMs,mimeType:blob.type,savedAt:Date.now()};setClip(value);
 let saved=false;try{saved=await storage("put",value)}catch{}change("ready");if(!saved)notice("再生はできますが、保存できませんでした。アプリを閉じると失われます")}
async function play(resume=false){if(!audio)return;try{if(!resume)audio.currentTime=0;await audio.play();change(audio.ended?"ended":"playing")}catch{change(resume?"paused":"ready");notice("再生できませんでした。もう一度タップしてください")}}
async function tap(){const now=performance.now();if(busy||now-lastTap<300)return;const action=nextTapAction(state);if(!action)return;lastTap=now;busy=true;try{
 if(action==="start")await start();
 else if(action==="stop")stop();
 else if(action==="play")await play();
 else if(action==="pause"){audio?.pause();change("paused")}
 else if(action==="resume")await play(true);
 else if(action==="replace")await start(true);
}catch(e){notice(e?.message||"操作できませんでした")}finally{busy=false}}
ui.tap.addEventListener("click",()=>{void tap()});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&state==="recording")void holdScreen()});
setInterval(clock,150);
async function init(){
 try{db=await database();const saved=await storage("get");if(saved?.blob instanceof Blob&&saved.blob.size){setClip(saved);change("ready")}else change("idle")}
 catch{db=null;change("idle");notice("端末内の保存が使えません。アプリを閉じると録音は失われます")}
 if("serviceWorker" in navigator&&window.isSecureContext)navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
void init();
