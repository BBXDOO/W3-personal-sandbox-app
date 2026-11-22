/* W3 Qwen3 Workspace entry: additive UI only; never intercept Sandbox events. */
(()=>{'use strict';
const ENTRY_ID='w3-qwen-entry',OVERLAY_ID='w3-qwen-overlay';
let activeFrame=null,storyTarget=null,storySelection=null;
document.addEventListener('focusin',e=>{
 const t=e.target;
 if(t&&t.tagName==='TEXTAREA'&&document.getElementById('root')?.contains(t)){
  storyTarget=t;storySelection={start:t.selectionStart,end:t.selectionEnd};
 }
},true);
document.addEventListener('selectionchange',()=>{
 if(storyTarget?.tagName==='TEXTAREA'&&document.activeElement===storyTarget)
  storySelection={start:storyTarget.selectionStart,end:storyTarget.selectionEnd};
});
function insertStoryMarkdown(markdown){
 const t=storyTarget;
 if(!t||!t.isConnected||!document.getElementById('root')?.contains(t)||t.tagName!=='TEXTAREA')throw Error('เปิดโหมดเขียนเนื้อเรื่อง แล้วแตะตำแหน่งเคอร์เซอร์ก่อน');
 const v=t.value,at=storySelection||{start:t.selectionStart,end:t.selectionEnd};
 if(!Number.isInteger(at.start)||!Number.isInteger(at.end)||at.start<0||at.end>v.length)throw Error('ไม่พบตำแหน่งเคอร์เซอร์ที่ถูกต้อง');
 const next=v.slice(0,at.start)+markdown+v.slice(at.end);
 if(next.length>2000000)throw Error('เนื้อเรื่องมีขนาดใหญ่เกินไป');
 Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,next);
 t.dispatchEvent(new Event('input',{bubbles:true}));
 storySelection={start:at.start+markdown.length,end:at.start+markdown.length};
}
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
 if(d&&d.w3icon===true&&d.kind==='insert-story'){
  let ok=false,message='';
  try{
   if(typeof d.markdown!=='string'||d.markdown.length>250000||!/^!\\[[^\\]]{0,70}\\]\\(data:image\\/png;base64,[A-Za-z0-9+/=]+\\)$/.test(d.markdown))throw Error('ข้อมูลภาพไม่ถูกต้อง');
   insertStoryMarkdown(d.markdown);ok=true;
  }catch(err){message=err.message}
  activeFrame.contentWindow.postMessage({w3icon:true,kind:'insert-result',id:d.id,ok,message},'*');
  return;
 }
 if(!d||d.w3qwen!==true||d.kind!=='request')return;
 if(!/^[A-Za-z0-9_-]{1,48}$/.test(d.id)||!['health','chat','token','clearToken','export','checkUpdate'].includes(d.action)||typeof d.payload!=='string')return;
 if(d.action==='checkUpdate'){
  try{
   if(typeof AndroidBridge==='undefined'||typeof AndroidBridge.checkUpdate!=='function')throw Error('Android Bridge ไม่พร้อม');
   AndroidBridge.checkUpdate();
   activeFrame.contentWindow.postMessage({w3qwen:true,kind:'response',id:d.id,ok:true,message:'กำลังตรวจอัปเดต'},'*');
  }catch(err){activeFrame.contentWindow.postMessage({w3qwen:true,kind:'response',id:d.id,ok:false,message:err.message},'*')}
  return;
 }
 if(d.action==='export'){
  try{
   const file=JSON.parse(d.payload);
   if(typeof file.name!=='string'||typeof file.content!=='string'||file.name.length>100||file.content.length>1048576)throw Error('ขนาดไฟล์ไม่ถูกต้อง');
   if(!/^[^\\/:*?"<>|]+$/.test(file.name))throw Error('ชื่อไฟล์ไม่ถูกต้อง');
   if(typeof AndroidBridge==='undefined')throw Error('Android Bridge ไม่พร้อม');
   if(file.mime==='application/json')AndroidBridge.saveJson(file.name,file.content);
   else AndroidBridge.saveText(file.name,file.content,'text/plain');
   activeFrame.contentWindow.postMessage({w3qwen:true,kind:'response',id:d.id,ok:true,message:'เปิดหน้าบันทึกไฟล์แล้ว'},'*');
  }catch(err){activeFrame.contentWindow.postMessage({w3qwen:true,kind:'response',id:d.id,ok:false,message:err.message},'*')}
  return;
 }
 if(typeof AndroidBridge==='undefined'||typeof AndroidBridge.qwenRequest!=='function'){
  activeFrame.contentWindow.postMessage({w3qwen:true,kind:'response',id:d.id,ok:false,message:'Android Bridge ยังไม่พร้อม — ต้องติดตั้ง APK รุ่นที่รองรับ'},'*');return;
 }
 AndroidBridge.qwenRequest(d.action,d.id,d.payload);
});

function openWorkspace(){
 if(document.getElementById(OVERLAY_ID))return;
 const backdrop=document.createElement('div');backdrop.id=OVERLAY_ID;backdrop.setAttribute('role','dialog');backdrop.setAttribute('aria-modal','true');backdrop.setAttribute('aria-label','Icon Library');
 Object.assign(backdrop.style,{position:'fixed',inset:'0',zIndex:'2147483000',background:'rgba(0,0,0,.72)',display:'flex',flexDirection:'column',padding:'max(10px, env(safe-area-inset-top)) 8px max(10px, env(safe-area-inset-bottom))'});
 const bar=document.createElement('div');Object.assign(bar.style,{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',color:'#fff',background:'#17241b',borderRadius:'12px 12px 0 0'});
 const title=document.createElement('strong');title.textContent='🧩 Icon Library · IL1';
 const close=document.createElement('button');close.type='button';close.textContent='✕ ปิด';close.setAttribute('aria-label','ปิด Qwen3 Workspace');Object.assign(close.style,{padding:'9px 12px',background:'#314c3a',color:'#fff',border:'0',borderRadius:'8px'});
 const frame=document.createElement('iframe');frame.title='คลังไอคอน';frame.src='./icon-library.html';frame.setAttribute('sandbox','allow-scripts allow-forms allow-downloads allow-same-origin');activeFrame=frame;Object.assign(frame.style,{border:'0',background:'#111714',width:'100%',flex:'1',minHeight:'0',borderRadius:'0 0 12px 12px'});
 const dismiss=()=>{activeFrame=null;backdrop.remove();document.removeEventListener('keydown',escapeHandler)};
 const escapeHandler=e=>{if(e.key==='Escape')dismiss()};
 close.addEventListener('click',dismiss);backdrop.addEventListener('click',e=>{if(e.target===backdrop)dismiss()});document.addEventListener('keydown',escapeHandler);
 bar.append(title,close);backdrop.append(bar,frame);document.body.appendChild(backdrop);close.focus();
}
function mount(){
 const nav=document.querySelector('nav.ps-nav');
 if(!nav||nav.querySelector('#'+ENTRY_ID))return;
 const button=document.createElement('button');button.id=ENTRY_ID;button.type='button';button.setAttribute('aria-label','เปิด Icon Library');button.title='Icon Library';
 button.className='w3-qwen-entry';button.innerHTML='<span aria-hidden="true" class="w3-qwen-icon">🧩</span><span class="w3-qwen-label">Icons</span>';
 button.addEventListener('click',openWorkspace);
 // Append to the existing navigation, after the existing tools, without modifying their behavior.
 const formatButton=nav.querySelector('button[aria-label="จัดรูปแบบเนื้อหา"]');
 const formatGroup=formatButton&&formatButton.parentElement;
 const scrollColumn=formatGroup&&formatGroup.parentElement;
 if(formatGroup&&scrollColumn)scrollColumn.insertBefore(button,formatGroup);
 else nav.appendChild(button);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
function init(){mount();const observer=new MutationObserver(()=>{if(!document.getElementById(ENTRY_ID))mount()});observer.observe(document.getElementById('root')||document.body,{childList:true,subtree:true});}
})();
