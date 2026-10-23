(function(){
  "use strict";
  const STORE_KEY="aft-tasks-v1", UI_KEY="aft-ui", BACKUP_KEY="aft-last-export";
  const STATUSES=[{id:"new",label:"New"},{id:"ongoing",label:"Ongoing"},{id:"done",label:"Done"},{id:"cancelled",label:"Cancelled"}];
  const CLOSED=["done","cancelled"], isClosed=t=>CLOSED.includes(t.status);
  const CYCLE=["new","ongoing","done"];
  const PRIOS={high:0,medium:1,low:2};
  const CATEGORIES=["Legal & compliance","Finance & banking","Brand & marketing","Operations & IT","Odoo partnership","Sales & clients","Product","Personal & skills"];
  const state={tasks:[],view:"list",status:"all",cat:"all",q:"",sort:"deadline",openId:null,confirmDel:false,canSave:true,importing:null};

  const $=s=>document.querySelector(s);
  const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  // ---------- storage (this browser only) ----------
  function readJSON(key,fallback){try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback}catch(e){return fallback}}
  function writeJSON(key,val){try{localStorage.setItem(key,JSON.stringify(val));return true}catch(e){return false}}
  function load(){
    try{localStorage.setItem("aft-probe","1");localStorage.removeItem("aft-probe")}catch(e){state.canSave=false}
    const saved=readJSON(STORE_KEY,null);
    state.tasks=Array.isArray(saved)?saved.filter(validTask):[];
    const ui=readJSON(UI_KEY,{});if(ui.view)state.view=ui.view;if(ui.sort)state.sort=ui.sort;
  }
  function persist(){
    if(!state.canSave)return;
    if(!writeJSON(STORE_KEY,state.tasks)){state.canSave=false;toast("Couldn't save. This browser's storage is full or blocked.");renderNote()}
  }
  function saveUi(){writeJSON(UI_KEY,{view:state.view,sort:state.sort})}
  // keep several open tabs in step
  window.addEventListener("storage",e=>{if(e.key===STORE_KEY){const v=readJSON(STORE_KEY,[]);state.tasks=Array.isArray(v)?v.filter(validTask):[];if(state.openId&&!byId(state.openId))state.openId=null;render()}});

  function validTask(t){return t&&typeof t==="object"&&typeof t.id==="string"&&typeof t.title==="string"}
  function normalise(t){
    return {id:String(t.id),seq:Number(t.seq)||0,title:String(t.title||""),notes:String(t.notes||""),
      category:CATEGORIES.includes(t.category)?t.category:CATEGORIES[0],
      status:STATUSES.some(s=>s.id===t.status)?t.status:"new",
      priority:["high","medium","low"].includes(t.priority)?t.priority:"medium",
      deadline:/^\d{4}-\d{2}-\d{2}$/.test(t.deadline||"")?t.deadline:"",
      comments:Array.isArray(t.comments)?t.comments.filter(c=>c&&typeof c.text==="string").map(c=>({text:c.text,at:String(c.at||new Date().toISOString())})):[],
      createdAt:t.createdAt||new Date().toISOString(),doneAt:t.doneAt||null,cancelledAt:t.cancelledAt||null};
  }

  // ---------- dates ----------
  function todayStr(){const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
  function dayDiff(a,b){return Math.round((Date.parse(a+"T00:00:00Z")-Date.parse(b+"T00:00:00Z"))/864e5)}
  function fmtDate(s){if(!s)return"";const d=new Date(s+"T00:00:00");return d.toLocaleDateString(undefined,{day:"numeric",month:"short"})}
  function dueInfo(t){
    if(!t.deadline)return{cls:"none",txt:"No deadline",late:false};
    if(isClosed(t))return{cls:"none",txt:fmtDate(t.deadline),late:false};
    const n=dayDiff(t.deadline,todayStr());
    if(n<0)return{cls:"late",txt:fmtDate(t.deadline)+" · "+(-n)+"d late",late:true};
    if(n===0)return{cls:"soon",txt:"Today",late:false};
    if(n===1)return{cls:"soon",txt:"Tomorrow",late:false};
    if(n<=7)return{cls:"soon",txt:fmtDate(t.deadline)+" · "+n+"d",late:false};
    return{cls:"",txt:fmtDate(t.deadline)+" · "+n+"d",late:false};
  }
  function stamp(iso){const d=new Date(iso);return d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})+" "+d.toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}
  const refOf=t=>"AF-"+String(t.seq||0).padStart(3,"0");
  const byId=id=>state.tasks.find(t=>t.id===id);

  $("#today").innerHTML="Today <b>"+new Date().toLocaleDateString(undefined,{weekday:"short",day:"numeric",month:"long",year:"numeric"})+"</b>";

  // ---------- toolbar ----------
  $("#catFilter").innerHTML='<option value="all">All categories</option>'+CATEGORIES.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join("");
  function renderChips(){
    const opts=[{id:"all",label:"All"},{id:"open",label:"Not done"},...STATUSES,{id:"late",label:"Overdue"}];
    $("#statusChips").innerHTML=opts.map(o=>`<button type="button" class="chip" data-st="${o.id}" aria-pressed="${state.status===o.id}">${o.label}</button>`).join("");
  }
  $("#statusChips").addEventListener("click",e=>{const b=e.target.closest("[data-st]");if(!b)return;state.status=b.dataset.st;render()});
  $("#catFilter").addEventListener("change",e=>{state.cat=e.target.value;render()});
  $("#sortBy").addEventListener("change",e=>{state.sort=e.target.value;saveUi();render()});
  $("#q").addEventListener("input",e=>{state.q=e.target.value.trim().toLowerCase();render()});
  document.querySelectorAll("[data-view]").forEach(b=>b.addEventListener("click",()=>{state.view=b.dataset.view;saveUi();render()}));
  $("#addBtn").addEventListener("click",createTask);
  $("#exportBtn").addEventListener("click",exportTasks);
  $("#importBtn").addEventListener("click",()=>$("#importFile").click());
  $("#importFile").addEventListener("change",onImportFile);

  function filtered(){
    let ts=state.tasks.slice();
    if(state.cat!=="all")ts=ts.filter(t=>t.category===state.cat);
    if(state.status==="open")ts=ts.filter(t=>!isClosed(t));
    else if(state.status==="late")ts=ts.filter(t=>dueInfo(t).late);
    else if(state.status!=="all")ts=ts.filter(t=>t.status===state.status);
    if(state.q)ts=ts.filter(t=>[t.title,t.notes,t.category,refOf(t),...(t.comments||[]).map(c=>c.text)].join(" ").toLowerCase().includes(state.q));
    const byDeadline=(a,b)=>(a.deadline||"9999")<(b.deadline||"9999")?-1:(a.deadline||"9999")>(b.deadline||"9999")?1:0;
    if(state.sort==="deadline")ts.sort((a,b)=>byDeadline(a,b)||(PRIOS[a.priority]-PRIOS[b.priority]));
    if(state.sort==="priority")ts.sort((a,b)=>(PRIOS[a.priority]-PRIOS[b.priority])||byDeadline(a,b));
    if(state.sort==="recent")ts.sort((a,b)=>(b.seq||0)-(a.seq||0));
    return ts;
  }

  function renderSummary(){
    const all=state.tasks, n=s=>all.filter(t=>t.status===s).length;
    const late=all.filter(t=>dueInfo(t).late).length;
    const week=all.filter(t=>!isClosed(t)&&t.deadline&&dayDiff(t.deadline,todayStr())>=0&&dayDiff(t.deadline,todayStr())<=7).length;
    const c=n("cancelled"), active=all.length-c, total=active||1, d=n("done"), o=n("ongoing"), w=n("new");
    $("#summary").innerHTML=`
      <div class="stat"><span class="k"><span class="dot" style="color:var(--new)"></span>New</span><span class="v">${w}</span></div>
      <div class="stat"><span class="k"><span class="dot" style="color:var(--ongoing)"></span>Ongoing</span><span class="v">${o}</span></div>
      <div class="stat"><span class="k"><span class="dot" style="color:var(--done)"></span>Done</span><span class="v">${d}</span></div>
      <div class="stat"><span class="k"><span class="dot" style="color:var(--cancelled)"></span>Cancelled</span><span class="v">${c}</span></div>
      <div class="stat late"><span class="k">Overdue</span><span class="v">${late}</span></div>
      <div class="stat"><span class="k">Due in 7 days</span><span class="v">${week}</span></div>
      <div class="progress"><div class="bar" role="img" aria-label="${d} of ${active} active tasks done"><i style="width:${d/total*100}%;background:var(--done)"></i><i style="width:${o/total*100}%;background:var(--ongoing)"></i></div><span>${Math.round(d/total*100)}% done · ${d}/${active}${c?" · "+c+" cancelled not counted":""}</span></div>`;
  }

  const ccIcon='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z"/></svg>';
  const statusLabel=s=>STATUSES.find(x=>x.id===s)?.label||"New";
  const pill=t=>`<button type="button" class="pill ${t.status}" data-cycle="${t.id}" title="${t.status==="cancelled"?"Click to reopen":"Click to change status"}"><span class="dot"></span>${statusLabel(t.status)}</button>`;

  function rowHtml(t){
    const d=dueInfo(t), cc=(t.comments||[]).length;
    return `<div class="row ${isClosed(t)?"isdone":""} ${t.status==="cancelled"?"iscancelled":""} ${d.late?"late":""}" data-open="${t.id}" tabindex="0">
      <div class="c-status">${pill(t)}</div>
      <div class="tcell"><span class="title">${esc(t.title||"Untitled task")}</span><span class="ref">${refOf(t)}</span>
        <span class="mobile-meta"><span class="due ${d.cls}">${d.txt}</span><span class="prio ${t.priority}">${t.priority}</span><span class="cat">${esc(t.category||"")}</span>${cc?`<span class="cc">${ccIcon}${cc}</span>`:""}</span></div>
      <div class="c-cat cat">${esc(t.category||"—")}</div>
      <div class="c-prio prio ${t.priority}">${t.priority}</div>
      <div class="c-due due ${d.cls}">${d.txt}</div>
      <div class="c-cc cc">${cc?ccIcon+cc:""}</div>
    </div>`;
  }
  function cardHtml(t){
    const d=dueInfo(t), cc=(t.comments||[]).length;
    return `<div class="card ${d.late?"late":""} ${t.status==="cancelled"?"iscancelled":""}" data-open="${t.id}" draggable="true" tabindex="0">
      <span class="ref">${refOf(t)} · ${esc(t.category||"")}</span>
      <span class="title">${esc(t.title||"Untitled task")}</span>
      <span class="meta"><span class="due ${d.cls}">${d.txt}</span><span class="prio ${t.priority}">${t.priority}</span>${cc?`<span class="cc">${ccIcon}${cc}</span>`:""}</span>
    </div>`;
  }

  function renderNote(){
    const last=readJSON(BACKUP_KEY,null);
    $("#storeNote").textContent=state.canSave
      ?"Tasks are saved in this browser only. Use Export to keep a backup or move them to another device."+(last?" Last export: "+stamp(last)+".":" No export yet.")
      :"This browser is blocking storage, so changes last only until you close the page. Use Export before you leave.";
  }

  function renderBanner(){
    const b=$("#banner");
    if(!state.importing){b.hidden=true;b.innerHTML="";return}
    const n=state.importing.length;
    b.hidden=false;
    b.innerHTML=`<span>Replace your ${state.tasks.length} task${state.tasks.length===1?"":"s"} with the ${n} in this file?</span><span class="confirm"><button class="btn primary" type="button" id="impYes">Replace</button><button class="btn" type="button" id="impNo">Cancel</button></span>`;
    $("#impYes").onclick=()=>applyImport(state.importing);
    $("#impNo").onclick=()=>{state.importing=null;renderBanner()};
  }

  function render(){
    renderChips(); renderSummary(); renderNote(); renderBanner();
    $("#sortBy").value=state.sort;
    document.querySelectorAll("[data-view]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.view===state.view)));
    const main=$("#main");
    if(!state.tasks.length){
      main.innerHTML=`<div class="empty"><strong>No tasks yet</strong><span>Add your first launch task, or import a backup file you exported earlier.</span><span class="confirm"><button class="btn primary" type="button" id="emptyAdd">+ New task</button><button class="btn" type="button" id="emptyImport">Import backup</button></span></div>`;
      $("#emptyAdd").onclick=createTask;$("#emptyImport").onclick=()=>$("#importFile").click();
      return renderDrawer();
    }
    const ts=filtered();
    if(state.view==="list"){
      if(!ts.length){main.innerHTML=`<div class="empty"><strong>Nothing matches these filters</strong><span>Try "All" or clear the search.</span></div>`;}
      else{
        let body="";
        if(state.sort==="deadline"&&!CLOSED.includes(state.status)){
          const open=ts.filter(t=>!isClosed(t)), done=ts.filter(t=>t.status==="done"), cancelled=ts.filter(t=>t.status==="cancelled");
          const g=[["Overdue",open.filter(t=>dueInfo(t).late)],["This week",open.filter(t=>!dueInfo(t).late&&t.deadline&&dayDiff(t.deadline,todayStr())<=7)],["Later",open.filter(t=>t.deadline&&dayDiff(t.deadline,todayStr())>7)],["No deadline",open.filter(t=>!t.deadline)],["Done",done],["Cancelled",cancelled]];
          g.forEach(([name,items])=>{if(items.length)body+=`<div class="group">${name}<span class="ref">${items.length}</span></div>`+items.map(rowHtml).join("")});
        } else body=ts.map(rowHtml).join("");
        main.innerHTML=`<div class="list"><div class="lhead"><span>Status</span><span>Task</span><span>Category</span><span>Priority</span><span>Deadline</span><span></span></div>${body}</div>`;
      }
    } else {
      main.innerHTML=`<div class="board">${STATUSES.map(s=>{const items=ts.filter(t=>t.status===s.id);return `<div class="col" data-col="${s.id}"><div class="colhead"><span class="pill ${s.id}"><span class="dot"></span>${s.label}</span><span class="n">${items.length}</span></div>${items.map(cardHtml).join("")||'<div class="colempty">Drop a task here</div>'}</div>`}).join("")}</div>`;
      bindBoard();
    }
    renderDrawer();
  }

  // ---------- list / board interactions ----------
  $("#main").addEventListener("click",e=>{
    const c=e.target.closest("[data-cycle]");
    if(c){e.stopPropagation();const t=byId(c.dataset.cycle);const i=CYCLE.indexOf(t.status);setStatus(t,i<0?"new":CYCLE[(i+1)%CYCLE.length]);return;}
    const o=e.target.closest("[data-open]");if(o)openTask(o.dataset.open);
  });
  $("#main").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.matches("[data-open]"))openTask(e.target.dataset.open)});
  function bindBoard(){
    document.querySelectorAll(".card").forEach(c=>c.addEventListener("dragstart",e=>{e.dataTransfer.setData("text/plain",c.dataset.open)}));
    document.querySelectorAll(".col").forEach(col=>{
      col.addEventListener("dragover",e=>{e.preventDefault();col.classList.add("over")});
      col.addEventListener("dragleave",()=>col.classList.remove("over"));
      col.addEventListener("drop",e=>{e.preventDefault();col.classList.remove("over");const t=byId(e.dataTransfer.getData("text/plain"));if(t&&t.status!==col.dataset.col)setStatus(t,col.dataset.col)});
    });
  }

  // ---------- task changes ----------
  function update(id,data,quiet){const t=byId(id);if(!t)return;Object.assign(t,data);persist();if(!quiet)render()}
  function setStatus(t,s){const now=new Date().toISOString();update(t.id,{status:s,doneAt:s==="done"?now:null,cancelledAt:s==="cancelled"?now:null});toast(refOf(t)+" moved to "+statusLabel(s))}
  function createTask(){
    const id="t"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
    const seq=Math.max(0,...state.tasks.map(t=>t.seq||0))+1;
    state.tasks.push({id,seq,title:"",notes:"",category:state.cat!=="all"?state.cat:CATEGORIES[0],status:"new",priority:"medium",deadline:"",comments:[],createdAt:new Date().toISOString(),doneAt:null,cancelledAt:null});
    persist();
    state.openId=id;state.confirmDel=false;render();
    setTimeout(()=>{const el=$("#f-title");if(el)el.focus()},30);
  }
  function openTask(id){state.openId=id;state.confirmDel=false;renderDrawer()}
  function closeDrawer(){state.openId=null;render()}

  // ---------- drawer ----------
  function renderDrawer(){
    const root=$("#drawerRoot"), t=state.openId&&byId(state.openId);
    if(!t){root.innerHTML="";delete root.dataset.id;return;}
    if(root.querySelector(".drawer")&&root.dataset.id===t.id){refreshComments(t);refreshStatus(t);refreshFoot(t);return;}
    root.dataset.id=t.id;
    root.innerHTML=`<div class="scrim" id="scrim"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="Task ${refOf(t)}">
      <div class="dhead"><span class="ref">${refOf(t)} · created ${t.createdAt?new Date(t.createdAt).toLocaleDateString(undefined,{day:"numeric",month:"short"}):""}</span>
        <button class="iconbtn" id="closeD" type="button" aria-label="Close"><svg width="18" height="18" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.6" fill="none"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9"/></svg></button></div>
      <div class="dbody">
        <div class="field"><label for="f-title">Task</label><input id="f-title" class="inp ttl" value="${esc(t.title)}" placeholder="What needs to happen?"></div>
        <div class="field"><span class="lbl">Status</span><div class="statusset" id="statusSet"></div></div>
        <div class="grid2">
          <div class="field"><label for="f-deadline">Deadline</label><input id="f-deadline" type="date" class="inp" value="${esc(t.deadline)}"></div>
          <div class="field"><label for="f-prio">Priority</label><select id="f-prio" class="inp">${["high","medium","low"].map(p=>`<option value="${p}" ${t.priority===p?"selected":""}>${p[0].toUpperCase()+p.slice(1)}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label for="f-cat">Category</label><select id="f-cat" class="inp">${CATEGORIES.map(c=>`<option ${t.category===c?"selected":""}>${esc(c)}</option>`).join("")}</select></div>
        <div class="field"><label for="f-notes">Details</label><textarea id="f-notes" class="inp" placeholder="Links, requirements, who to contact…">${esc(t.notes)}</textarea></div>
        <div class="field"><span class="lbl">Comments</span>
          <div class="comments" id="cmts"></div>
          <div class="addc"><textarea id="f-cmt" class="inp" placeholder="Add an update or note"></textarea><button class="btn" id="addCmt" type="button">Post</button></div>
        </div>
      </div>
      <div class="dfoot" id="dfoot"></div>
    </aside>`;
    refreshStatus(t);refreshComments(t);refreshFoot(t);
    $("#scrim").onclick=closeDrawer;$("#closeD").onclick=closeDrawer;
    $("#f-title").oninput=e=>update(t.id,{title:e.target.value},true);
    $("#f-notes").oninput=e=>update(t.id,{notes:e.target.value},true);
    $("#f-deadline").onchange=e=>update(t.id,{deadline:e.target.value});
    $("#f-prio").onchange=e=>update(t.id,{priority:e.target.value});
    $("#f-cat").onchange=e=>update(t.id,{category:e.target.value});
    $("#addCmt").onclick=addComment;
    $("#f-cmt").onkeydown=e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))addComment()};
  }
  function refreshStatus(t){
    const el=$("#statusSet");if(!el)return;
    el.innerHTML=STATUSES.map(s=>`<button type="button" class="pill ${s.id}" data-set="${s.id}" aria-pressed="${t.status===s.id}"><span class="dot"></span>${s.label}</button>`).join("");
    el.querySelectorAll("[data-set]").forEach(b=>b.onclick=()=>{if(t.status!==b.dataset.set)setStatus(t,b.dataset.set)});
  }
  function refreshComments(t){
    const el=$("#cmts");if(!el)return;
    const cs=(t.comments||[]).slice().sort((a,b)=>a.at<b.at?1:-1);
    el.innerHTML=cs.length?cs.map(c=>`<div class="cmt"><span class="when">${stamp(c.at)}<button type="button" data-delc="${esc(c.at)}">Remove</button></span><p>${esc(c.text)}</p></div>`).join(""):'<span class="note">No comments yet. Log progress, blockers and decisions here.</span>';
    el.querySelectorAll("[data-delc]").forEach(b=>b.onclick=()=>update(t.id,{comments:(t.comments||[]).filter(c=>c.at!==b.dataset.delc)}));
  }
  function refreshFoot(t){
    const f=$("#dfoot");if(!f)return;
    f.innerHTML=state.confirmDel
      ?`<div class="confirm">Delete ${refOf(t)} and its comments?<button class="btn danger" id="yesDel" type="button">Delete</button><button class="btn" id="noDel" type="button">Keep</button></div>`
      :`<button class="btn danger" id="del" type="button">Delete task</button><span class="note">${t.status==="done"&&t.doneAt?"Completed "+new Date(t.doneAt).toLocaleDateString(undefined,{day:"numeric",month:"short"}):t.status==="cancelled"&&t.cancelledAt?"Cancelled "+new Date(t.cancelledAt).toLocaleDateString(undefined,{day:"numeric",month:"short"}):"Changes save automatically"}</span>`;
    if(state.confirmDel){$("#yesDel").onclick=deleteTask;$("#noDel").onclick=()=>{state.confirmDel=false;refreshFoot(t)}}
    else $("#del").onclick=()=>{state.confirmDel=true;refreshFoot(t)};
  }
  function addComment(){
    const t=byId(state.openId),el=$("#f-cmt"),text=el.value.trim();if(!t||!text)return;
    el.value="";
    update(t.id,{comments:[...(t.comments||[]),{text,at:new Date().toISOString()}]});
  }
  function deleteTask(){
    const t=byId(state.openId);if(!t)return;
    state.tasks=state.tasks.filter(x=>x.id!==t.id);persist();
    state.openId=null;toast(refOf(t)+" deleted");render();
  }
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&state.openId)closeDrawer()});

  // ---------- backup ----------
  function exportTasks(){
    const now=new Date();
    const payload={app:"antifragile-launch-tracker",format:1,exportedAt:now.toISOString(),tasks:state.tasks};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob);
    a.download="antifragile-tasks-"+todayStr()+".json";
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    writeJSON(BACKUP_KEY,now.toISOString());renderNote();
    toast("Exported "+state.tasks.length+" tasks");
  }
  function onImportFile(e){
    const file=e.target.files&&e.target.files[0];e.target.value="";
    if(!file)return;
    const reader=new FileReader();
    reader.onload=()=>{
      let data;
      try{data=JSON.parse(reader.result)}catch(err){toast("That file isn't a tracker backup. Choose the .json file you exported.");return}
      const list=Array.isArray(data)?data:data&&Array.isArray(data.tasks)?data.tasks:null;
      if(!list){toast("That file has no tasks in it. Choose the .json file you exported.");return}
      const tasks=list.filter(validTask).map(normalise);
      if(!state.tasks.length)applyImport(tasks);
      else{state.importing=tasks;renderBanner();}
    };
    reader.onerror=()=>toast("Couldn't read that file. Try again.");
    reader.readAsText(file);
  }
  function applyImport(tasks){
    state.tasks=tasks;state.importing=null;state.openId=null;persist();render();
    toast("Imported "+tasks.length+" tasks");
  }

  let tt;function toast(msg){$("#toastRoot").innerHTML=`<div class="toast" role="status">${esc(msg)}</div>`;clearTimeout(tt);tt=setTimeout(()=>$("#toastRoot").innerHTML="",2400)}

  load();
  render();
})();
