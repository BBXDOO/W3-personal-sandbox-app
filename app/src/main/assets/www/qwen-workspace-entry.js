/* W3 Qwen3 Workspace entry: additive UI only; never intercept Sandbox events. */
(()=>{'use strict';
const ENTRY_ID='w3-qwen-entry',OVERLAY_ID='w3-qwen-overlay';
let activeFrame=null;
window.w3QwenNativeResult=function(json){
 try{
  const data=JSON.parse(json);
  if(activeFrame&&activeFrame.isConnected&&data&&typeof data.id==='string')
   activeFrame.contentWindow.postMessage({w3qwen:true,kind:'response',...data},'*');
 }catch(_){}
};
window.addEventListener('message',event=>{
 if(!activeFrame||event.source!==activeFrame.contentWindow)return;
 const d=event.data;
 if(!d||d.w3qwen!==true||d.kind!=='request')return;
 if(!/^[A-Za-z0-9_-]{1,48}$/.test(d.id)||!['health','chat','token','clearToken'].includes(d.action)||typeof d.payload!=='string')return;
 if(typeof AndroidBridge==='undefined'||typeof AndroidBridge.qwenRequest!=='function'){
  activeFrame.contentWindow.postMessage({w3qwen:true,kind:'response',id:d.id,ok:false,message:'Android Bridge ยังไม่พร้อม — ต้องติดตั้ง APK รุ่นที่รองรับ'},'*');return;
 }
 AndroidBridge.qwenRequest(d.action,d.id,d.payload);
});

function openWorkspace(){
 if(document.getElementById(OVERLAY_ID))return;
 const backdrop=document.createElement('div');backdrop.id=OVERLAY_ID;backdrop.setAttribute('role','dialog');backdrop.setAttribute('aria-modal','true');backdrop.setAttribute('aria-label','Qwen3 Workspace');
 Object.assign(backdrop.style,{position:'fixed',inset:'0',zIndex:'2147483000',background:'rgba(0,0,0,.72)',display:'flex',flexDirection:'column',padding:'max(10px, env(safe-area-inset-top)) 8px max(10px, env(safe-area-inset-bottom))'});
 const bar=document.createElement('div');Object.assign(bar.style,{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',color:'#fff',background:'#17241b',borderRadius:'12px 12px 0 0'});
 const title=document.createElement('strong');title.textContent='💻 Qwen3 Workspace · ต้นแบบ';
 const close=document.createElement('button');close.type='button';close.textContent='✕ ปิด';close.setAttribute('aria-label','ปิด Qwen3 Workspace');Object.assign(close.style,{padding:'9px 12px',background:'#314c3a',color:'#fff',border:'0',borderRadius:'8px'});
 const frame=document.createElement('iframe');frame.title='พื้นที่ทำงาน Qwen3';frame.src='./ai-workspace-preview.html';frame.setAttribute('sandbox','allow-scripts allow-downloads');activeFrame=frame;Object.assign(frame.style,{border:'0',background:'#111714',width:'100%',flex:'1',minHeight:'0',borderRadius:'0 0 12px 12px'});
 const dismiss=()=>{activeFrame=null;backdrop.remove();document.removeEventListener('keydown',escapeHandler)};
 const escapeHandler=e=>{if(e.key==='Escape')dismiss()};
 close.addEventListener('click',dismiss);backdrop.addEventListener('click',e=>{if(e.target===backdrop)dismiss()});document.addEventListener('keydown',escapeHandler);
 bar.append(title,close);backdrop.append(bar,frame);document.body.appendChild(backdrop);close.focus();
}
function mount(){
 const nav=document.querySelector('nav.ps-nav');
 if(!nav||nav.querySelector('#'+ENTRY_ID))return;
 const button=document.createElement('button');button.id=ENTRY_ID;button.type='button';button.setAttribute('aria-label','เปิด Qwen3 Workspace');button.title='Qwen3 Workspace';
 button.className='w3-qwen-entry';button.innerHTML='<span aria-hidden="true" class="w3-qwen-icon">💻</span><span class="w3-qwen-label">Qwen3</span>';
 button.addEventListener('click',openWorkspace);
 // Append to the existing navigation, after the existing tools, without modifying their behavior.
 nav.appendChild(button);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
function init(){mount();const observer=new MutationObserver(()=>{if(!document.getElementById(ENTRY_ID))mount()});observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});}
})();
