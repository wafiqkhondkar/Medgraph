/* ==================== WHITEBOARD ====================
   Smart Ink whiteboard: pointer events capture Pencil/stylus/mouse/touch locally.
   Geometry handles enclosures and arrow structure; handwriting is recognized by
   the browser's on-device Handwriting Recognition API when available, or by an
   optional quantized TrOCR model that downloads once and then runs in-browser.
   Arrow recognition is orientation-independent and adapts to accepted/rejected
   suggestions by keeping small feature examples in the MedGraph export. */
const WBW=1600,WBH=1000;
function wbData(){
  G.whiteboard=G.whiteboard||{strokes:[],nodes:[],arrows:[]};
  const W=G.whiteboard;W.strokes=W.strokes||[];W.nodes=W.nodes||[];W.arrows=W.arrows||[];
  W.training=W.training||{arrowPos:[],arrowNeg:[],nodePos:[],nodeNeg:[]};
  ['arrowPos','arrowNeg','nodePos','nodeNeg'].forEach(k=>W.training[k]=W.training[k]||[]);
  return W;
}
function openWhiteboard(){try{mgHwrSyncIntoWhiteboard(true)}catch(e){};view={mode:'whiteboard'};render()}
function wbSaveSoon(){clearTimeout(WB.saveTimer);WB.saveTimer=setTimeout(()=>{save();stats()},450)}
function wbSetTool(t){WB.tool=t;WB.active=null;WB.lasso=null;WB.pan=null;render()}
function wbNode(id){return wbData().nodes.find(n=>n.id===id)}
function wbStroke(id){return wbData().strokes.find(n=>n.id===id)}
function wbRelValue(){const e=document.getElementById('wb-rel');return e?e.value:(WB.rel||'causes')}
function wbRelOptions(cur){cur=cur||WB.rel||'causes';return [...new Set(ALL_RELS)].map(r=>`<option value="${esc(r)}" ${r===cur?'selected':''}>${esc(phrase(r))}</option>`).join('')}
function wbHwrStatus(){
  if(WB.aiLoading)return {cls:'busy',txt:`loading local AI${WB.aiProgress?` ${Math.round(WB.aiProgress)}%`:''}`};
  if(WB.hwrPipe)return {cls:'on',txt:'local handwriting AI ready'};
  if('createHandwritingRecognizer' in navigator)return {cls:'on',txt:'browser handwriting available'};
  if(WB.aiError)return {cls:'',txt:'AI load failed'};
  return {cls:'',txt:'handwriting AI not loaded'};
}
function whiteboardHTML(){
  const W=wbData(),sel=WB.selection,pn=WB.pendingNode,pa=WB.pendingArrow,sn=WB.selectedNode&&wbNode(WB.selectedNode),gh=WB.ghostText,hs=wbHwrStatus();
  const nodeGuess=pn?(pn.name||''):'';
  const selGuess=sel?(sel.guess||''):'';
  return `<div class="panel" style="padding:14px 16px">
    <div class="panel-h"><span style="width:10px;height:10px;border-radius:50%;background:#0F766E"></span><h2>Whiteboard</h2>
      <span class="hint" style="margin:0 0 0 auto">Apple Pencil · Surface/stylus · touch · mouse</span></div>
    <div class="wbtools">
      <span class="seg">${[['pen','Pen'],['lasso','Lasso'],['arrow','Arrow'],['eraser','Eraser'],['pan','Pan']].map(([k,l])=>`<button class="${WB.tool===k?'on':''}" onclick="wbSetTool('${k}')">${l}</button>`).join('')}</span>
      <label class="eyebrow" style="margin-left:3px">Default arrow</label><select id="wb-rel" onchange="WB.rel=this.value;if(WB.pendingArrow)WB.pendingArrow.rel=this.value">${wbRelOptions(pa&&pa.rel)}</select>
      <button class="mini" onclick="wbUndoInk()">Undo ink</button><button class="mini" onclick="wbSaveSequence()">Save chain as sequence</button><button class="mini x" onclick="wbClearBoard()">Clear board</button>
    </div>
    <div class="wbsmart">
      <label><input type="checkbox" ${WB.smart?'checked':''} onchange="WB.smart=this.checked"> smart arrows</label>
      <label><input type="checkbox" ${WB.autoShapes?'checked':''} onchange="WB.autoShapes=this.checked"> circles → node guesses</label>
      <label><input type="checkbox" ${WB.autoText?'checked':''} onchange="WB.autoText=this.checked"> auto word guesses</label>
      <label title="Off = a finger pans while Pen is selected; Pencil/stylus still writes"><input type="checkbox" ${WB.fingerInk?'checked':''} onchange="WB.fingerInk=this.checked"> finger draws</label>
      <span class="wbai ${hs.cls}" id="wb-ai-status">${esc(hs.txt)}</span>
      ${!WB.hwrPipe?`<button class="mini" id="wb-load-ai" onclick="wbLoadHandwritingAI()" ${WB.aiLoading?'disabled':''}>Load local handwriting AI (~65 MB)</button>`:''}
      <button class="mini" onclick="wbSmartScan()">Smart scan board</button>
    </div>
    ${pn?`<div class="wbedit">
      <div><b>Node shape detected.</b> ${pn.engine?`<span class="hint">read by ${esc(pn.engine)}</span>`:''}</div>
      <div class="grid3" style="margin-top:8px">
        <div class="fld"><label class="eyebrow">Guessed text</label><input id="wb-pnode-name" value="${esc(nodeGuess)}" placeholder="${pn?.recognizing?'recognizing…':'type or correct ANY word/phrase'}"></div>
        <div class="fld"><label class="eyebrow">Class</label><select id="wb-pnode-cls"><option value="">none</option>${CLASSES.map(c=>`<option value="${c.key}" ${pn.cls===c.key?'selected':''}>${esc(c.label)}</option>`).join('')}</select></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" onclick="wbAcceptPendingNode()">Create / link node</button><button class="mini x" onclick="wbRejectPendingNode()">Not a node</button></div>
      </div>
      ${pn.alts&&pn.alts.length?`<div class="wbalt">${pn.alts.slice(0,5).map((x,i)=>`<button onclick="wbUsePendingNodeAlt(${i})">${esc(x)}</button>`).join('')}</div>`:''}
    </div>`:''}
    ${pa?`<div class="wbedit">
      <div><b>Arrow detected:</b> <span class="mono">${pa.from?esc(termOf((wbNode(pa.from)||{}).graphId)):'?'}</span> → <span class="mono">${pa.to?esc(termOf((wbNode(pa.to)||{}).graphId)):'?'}</span>
        <span class="wbconf">shape ${Math.round((pa.score||0)*100)}%</span></div>
      ${pa.labelText?`<div style="margin-top:5px">label guess: <span class="wbguess">${esc(pa.labelText)}</span> → <b>${esc(phrase(pa.rel||'causes'))}</b></div>`:''}
      <div class="actions" style="margin-top:8px;padding-top:8px"><select id="wb-pending-rel" style="width:auto" onchange="WB.pendingArrow.rel=this.value">${wbRelOptions(pa.rel)}</select>
        <button class="btn" onclick="wbAcceptDetectedArrow()" ${(!pa.from||!pa.to)?'disabled':''}>Add relationship</button><button class="mini" onclick="wbFlipDetectedArrow()">Flip direction</button><button class="mini" onclick="wbReadArrowLabel()">Re-read label</button><button class="mini x" onclick="wbRejectDetectedArrow()">Not an arrow</button></div>
      ${(!pa.from||!pa.to)?`<div class="hint">The arrow shape is recognized, but its tail/head are not close enough to two linked nodes yet.</div>`:''}
    </div>`:''}
    ${sel?`<div class="wbedit"><div class="eyebrow">Selected handwriting</div><div class="grid3" style="margin-top:8px">
      <div class="fld"><label class="eyebrow">Node name</label><input id="wb-name" value="${esc(selGuess)}" placeholder="auto guess — or type ANY new word/phrase" autocomplete="off"></div>
      <div class="fld"><label class="eyebrow">Class</label><select id="wb-cls"><option value="">none</option>${CLASSES.map(c=>`<option value="${c.key}" ${sel.cls===c.key?'selected':''}>${esc(c.label)}</option>`).join('')}</select></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" onclick="wbConvertSelection()">Create / link node</button><button class="mini" onclick="wbRecognizeSelection()">Recognize again</button></div>
      </div>${sel.alts&&sel.alts.length?`<div class="wbalt">${sel.alts.slice(0,5).map((x,i)=>`<button onclick="wbUseSelectionAlt(${i})">${esc(x)}</button>`).join('')}</div>`:''}</div>`:''}
    ${gh?`<div class="wbedit"><b>Recent handwriting guess:</b> <span class="wbguess">${esc(gh.text||'')}</span>${gh.engine?` <span class="hint">(${esc(gh.engine)})</span>`:''}
      <button class="mini" style="margin-left:8px" onclick="wbMakeGhostNode()">Make node</button><button class="mini x" onclick="WB.ghostText=null;render()">Dismiss</button></div>`:''}
    ${sn?`<div class="wbedit"><span class="wbdot"></span><b class="mono">${esc(termOf(sn.graphId))}</b> is linked to this handwriting.<button class="mini x" style="margin-left:10px" onclick="wbUnlinkNode('${sn.id}')">Remove board link</button></div>`:''}
    <div class="wbscroll" id="wb-scroll"><canvas id="wb-canvas" width="1600" height="1000"></canvas></div>
    <div class="wbstatus"><span><b id="wb-stat-strokes">${W.strokes.length}</b> ink strokes</span><span><b id="wb-stat-nodes">${W.nodes.length}</b> linked nodes</span><span><b id="wb-stat-arrows">${W.arrows.length}</b> structured arrows</span>
      <span>Circle handwriting to propose a node. Draw a shaft + arrowhead in any direction; text near the middle is treated as a possible relationship label.</span></div>
  </div>`;
}
function wbCanvas(){return document.getElementById('wb-canvas')}
function wbUpdateStatus(){const W=wbData(),a=document.getElementById('wb-stat-strokes'),b=document.getElementById('wb-stat-nodes'),c=document.getElementById('wb-stat-arrows');if(a)a.textContent=W.strokes.length;if(b)b.textContent=W.nodes.length;if(c)c.textContent=W.arrows.length}
function wbSetAIStatus(txt,cls){const e=document.getElementById('wb-ai-status');if(e){e.textContent=txt;e.className='wbai '+(cls||'')}}
function wbPoint(e,c){const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*(WBW/r.width),y:(e.clientY-r.top)*(WBH/r.height),p:e.pressure&&e.pressure>0?e.pressure:.5,t:performance.now()}}
function wbBounds(pts){if(!pts||!pts.length)return{x:0,y:0,w:0,h:0};let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;pts.forEach(p=>{x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y)});return{x:x0,y:y0,w:x1-x0,h:y1-y0}}
function wbUnionBounds(bs){if(!bs.length)return{x:0,y:0,w:0,h:0};return wbBounds(bs.flatMap(b=>[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y+b.h}]))}
function wbStrokeBounds(st){return st.b||wbBounds(st.pts||[])}
function wbCenter(b){return{x:b.x+b.w/2,y:b.y+b.h/2}}
function wbInPoly(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/((b.y-a.y)||1e-9)+a.x);if(hit)inside=!inside}return inside}
function wbNodeDist(n,p){const dx=Math.max(n.x-p.x,0,p.x-(n.x+n.w)),dy=Math.max(n.y-p.y,0,p.y-(n.y+n.h));return Math.hypot(dx,dy)}
function wbNearestNode(p,max=76){let best=null,bd=max;wbData().nodes.forEach(n=>{const d=wbNodeDist(n,p);if(d<bd){best=n;bd=d}});return best}
function wbStrokeLen(st){let n=0,p=st.pts||[];for(let i=1;i<p.length;i++)n+=Math.hypot(p[i].x-p[i-1].x,p[i].y-p[i-1].y);return n}
function wbLineInfo(st){const p=st.pts||[];if(p.length<2)return null;const len=wbStrokeLen(st),a=p[0],b=p[p.length-1],direct=Math.hypot(b.x-a.x,b.y-a.y);if(!len||!direct)return null;return{st,a,b,len,direct,ratio:direct/len,ux:(b.x-a.x)/direct,uy:(b.y-a.y)/direct}}
function wbPointSegDist(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy||1,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/L2)),q={x:a.x+t*dx,y:a.y+t*dy};return{d:Math.hypot(p.x-q.x,p.y-q.y),t,q}}
function wbStrokeLinked(id){return wbData().nodes.some(n=>(n.strokeIds||[]).includes(id))}
function wbTraining(){return wbData().training}
function wbVecDist(a,b){let n=0;for(let i=0;i<Math.min(a.length,b.length);i++){const d=a[i]-b[i];n+=d*d}return Math.sqrt(n)}
function wbLearnBias(kind,feat){const T=wbTraining(),P=T[kind+'Pos']||[],N=T[kind+'Neg']||[];if(!P.length&&!N.length)return 0;const dp=P.length?Math.min(...P.map(x=>wbVecDist(x,feat))):Infinity,dn=N.length?Math.min(...N.map(x=>wbVecDist(x,feat))):Infinity;if(!isFinite(dp))return-.45;if(!isFinite(dn))return .45;return Math.max(-1,Math.min(1,(dn-dp)/((dn+dp)||1e-6)))}
function wbTrain(kind,feat,pos){if(!feat)return;const T=wbTraining(),k=kind+(pos?'Pos':'Neg');T[k].push(feat);T[k]=T[k].slice(-50);wbSaveSoon()}

/* ---------- handwriting recognition ---------- */
async function wbLoadHandwritingAI(){
  WB.aiLoading=false;WB.aiError='Portable build: no remote model download';WB.hwrPipe=null;WB.hwrMod=null;
  wbSetAIStatus('portable mode · personal trainer + native handwriting/Scribble','on');
  toast('Portable mode uses your adaptive trainer plus native handwriting/Scribble when available.');
  render();
}
async function wbNativeRecognize(strokes){
  if(!('createHandwritingRecognizer' in navigator)||typeof window.HandwritingStroke==='undefined')return [];
  try{
    if(!WB.nativeRec)WB.nativeRec=await navigator.createHandwritingRecognizer({languages:['en']});
    const d=WB.nativeRec.startDrawing({recognitionType:'text',alternatives:3,inputType:'stylus'});
    const b=wbUnionBounds(strokes.map(wbStrokeBounds));
    strokes.forEach(st=>{const hs=new HandwritingStroke(),p=st.pts||[],t0=p.length?(p[0].t||0):0;p.forEach((q,i)=>hs.addPoint({x:q.x-b.x,y:q.y-b.y,t:Math.max(0,(q.t||i*8)-t0)}));d.addStroke(hs)});
    const pr=await d.getPrediction();try{d.clear()}catch(_){};return (pr||[]).map(x=>String(x.text||'').trim()).filter(Boolean);
  }catch(e){return []}
}
function wbInkCrop(strokes){
  const b=wbUnionBounds(strokes.map(wbStrokeBounds)),pad=18,max=420,scale=Math.min(3,Math.max(1,max/Math.max(80,b.w+pad*2,b.h+pad*2))),c=document.createElement('canvas');
  c.width=Math.max(96,Math.ceil((b.w+pad*2)*scale));c.height=Math.max(64,Math.ceil((b.h+pad*2)*scale));const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.strokeStyle='#000';x.lineCap='round';x.lineJoin='round';
  strokes.forEach(st=>{const p=st.pts||[];if(p.length<2)return;x.lineWidth=Math.max(2,3.1*scale);x.beginPath();p.forEach((q,i)=>{const xx=(q.x-b.x+pad)*scale,yy=(q.y-b.y+pad)*scale;i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke()});return c;
}
async function wbAIRecognize(strokes){if(!WB.hwrPipe||!WB.hwrMod)return[];try{const c=wbInkCrop(strokes),img=WB.hwrMod.RawImage.fromCanvas(c),o=await WB.hwrPipe(img,{max_new_tokens:48});return (o||[]).map(x=>String(x.generated_text||'').trim()).filter(Boolean)}catch(e){console.warn('TrOCR',e);return[]}}
function wbLev(a,b){a=canon(a);b=canon(b);const m=a.length,n=b.length,dp=Array(n+1).fill(0).map((_,i)=>i);for(let i=1;i<=m;i++){let prev=dp[0];dp[0]=i;for(let j=1;j<=n;j++){const old=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=old}}return dp[n]}
function wbNodeMatches(text){const t=String(text||'').trim();if(!t)return[];const vals=[];G.defs.forEach(d=>allForms(d).forEach(f=>{const den=Math.max(3,canon(t).length,canon(f).length),z=wbLev(t,f)/den;if(z<=.46)vals.push({term:d.term,z,cls:d.cls||''})}));vals.sort((a,b)=>a.z-b.z||a.term.length-b.term.length);const seen=new Set();return vals.filter(x=>{const k=canon(x.term);if(seen.has(k))return false;seen.add(k);return true}).slice(0,5)}
function wbRelationFromText(text){const raw=String(text||'').trim();if(!raw)return null;const f=findVerb(`A ${raw} B`);if(f)return{rel:f.rel,text:raw,score:1};const cand=[];ALL_RELS.forEach(r=>{[r,phrase(r),r.replace(/_/g,' ')].forEach(v=>{const den=Math.max(3,canon(raw).length,canon(v).length),z=wbLev(raw,v)/den;if(z<.48)cand.push({rel:r,text:raw,score:1-z})})});cand.sort((a,b)=>b.score-a.score);return cand[0]||null}
async function wbRecognizeStrokes(strokes,mode='node'){
  if(!strokes||!strokes.length)return{guesses:[],engine:''};WB.recognizing=true;
  let guesses=await wbNativeRecognize(strokes),engine=guesses.length?'browser on-device':'';
  if(!guesses.length&&WB.hwrPipe){guesses=await wbAIRecognize(strokes);engine=guesses.length?'local TrOCR':''}
  guesses=guesses.map(x=>x.replace(/^\s+|\s+$/g,'')).filter(Boolean);
  if(mode==='node'&&guesses.length){const M=wbNodeMatches(guesses[0]);M.forEach(m=>{if(!guesses.some(g=>canon(g)===canon(m.term)))guesses.push(m.term)})}
  if(mode==='relation'&&guesses.length){const r=wbRelationFromText(guesses[0]);if(r&&!guesses.some(g=>canon(g)===canon(phrase(r.rel))))guesses.push(phrase(r.rel))}
  WB.recognizing=false;return{guesses:[...new Set(guesses)].slice(0,6),engine};
}
function wbGuessClass(name){const ex=resolve(name);if(ex){const d=byId(ex.id);return d&&d.cls||''}const M=wbNodeMatches(name);return M[0]&&M[0].z<.22?M[0].cls:''}

/* ---------- enclosure / node recognition ---------- */
function wbEnclosureInfo(st){const p=st.pts||[],b=wbStrokeBounds(st),diag=Math.hypot(b.w,b.h),len=wbStrokeLen(st);if(p.length<8||diag<28||len<70)return null;const close=Math.hypot(p[0].x-p[p.length-1].x,p[0].y-p[p.length-1].y),closure=1-Math.min(1,close/Math.max(12,diag*.35)),aspect=Math.min(b.w,b.h)/Math.max(1,Math.max(b.w,b.h)),loop=Math.min(1,len/Math.max(1,Math.PI*diag));const feat=[closure,aspect,Math.min(1,loop),Math.min(1,diag/260)];let score=.46*closure+.24*aspect+.18*Math.min(1,loop)+.12*Math.min(1,diag/150)+.14*wbLearnBias('node',feat);return{score,feat,b,p}}
function wbInsideEnclosure(info,boundaryId){const W=wbData();return W.strokes.filter(st=>st.id!==boundaryId&&!st.role&&wbInPoly(wbCenter(wbStrokeBounds(st)),info.p)&&wbStrokeBounds(st).w<info.b.w*.96&&wbStrokeBounds(st).h<info.b.h*.96)}
async function wbMaybeEnclosure(st){if(!WB.smart||!WB.autoShapes)return false;const info=wbEnclosureInfo(st);if(!info||info.score<.68)return false;const inside=wbInsideEnclosure(info,st.id);if(!inside.length)return false;st.role='node-boundary-candidate';const token=uid('pn');WB.pendingNode={token,boundaryId:st.id,strokeIds:inside.map(x=>x.id),bounds:wbUnionBounds(inside.map(wbStrokeBounds)),name:'',alts:[],cls:'',engine:'',feat:info.feat,score:info.score};render();const rr=await wbRecognizeStrokes(inside,'node');if(!WB.pendingNode||WB.pendingNode.token!==token)return true;WB.pendingNode.alts=rr.guesses;WB.pendingNode.openAlts=rr.openGuesses||rr.guesses;WB.pendingNode.knownAlts=rr.knownGuesses||[];WB.pendingNode.name=rr.guesses[0]||'';WB.pendingNode.cls=wbGuessClass(WB.pendingNode.name);WB.pendingNode.engine=rr.engine;render();return true}
function wbUsePendingNodeAlt(i){if(!WB.pendingNode)return;const x=WB.pendingNode.alts&&WB.pendingNode.alts[i];if(!x)return;WB.pendingNode.name=x;WB.pendingNode.cls=wbGuessClass(x);render()}
async function wbAcceptPendingNode(){const p=WB.pendingNode;if(!p)return;const inp=document.getElementById('wb-pnode-name'),sel=document.getElementById('wb-pnode-cls'),name=(inp&&inp.value||p.name||'').trim();if(!name)return toast('Need a node name');const gid=ensure(name,{}),d=byId(gid),cls=sel&&sel.value;if(cls&&d&&!d.cls)d.cls=cls;const b=p.bounds,pad=8,ids=[...p.strokeIds,p.boundaryId];wbData().nodes.push({id:uid('wbn'),graphId:gid,x:Math.max(0,b.x-pad),y:Math.max(26,b.y-pad),w:Math.max(54,b.w+pad*2),h:Math.max(28,b.h+pad*2),strokeIds:ids,created:Date.now(),auto:true});const bs=wbStroke(p.boundaryId);if(bs)bs.role='node-boundary';wbTrain('node',p.feat,true);WB.pendingNode=null;WB.ghostText=null;if(WB.pendingArrow){WB.pendingArrow.from=(wbNearestNode(WB.pendingArrow.tail,92)||{}).id||WB.pendingArrow.from;WB.pendingArrow.to=(wbNearestNode(WB.pendingArrow.tip,92)||{}).id||WB.pendingArrow.to}bump();await save();refresh();render();toast(`Linked ${termOf(gid)}`)}
function wbRejectPendingNode(){const p=WB.pendingNode;if(!p)return;const st=wbStroke(p.boundaryId);if(st)st.role='';wbTrain('node',p.feat,false);WB.pendingNode=null;render()}

/* ---------- arrow recognition ---------- */
function wbHeadEvidence(shaft,others,tipEnd){const q=wbLineInfo(shaft);if(!q)return{score:0,used:[]};const tip=tipEnd?q.b:q.a,back=tipEnd?{x:-q.ux,y:-q.uy}:{x:q.ux,y:q.uy},rad=Math.max(15,Math.min(34,q.len*.18)),legs=[],used=new Set();others.forEach(st=>{if(st.id===shaft.id||st.role)return;const L=wbStrokeLen(st);if(L<5||L>q.len*.62)return;const p=st.pts||[];let mi=0,md=Infinity;p.forEach((x,i)=>{const d=Math.hypot(x.x-tip.x,x.y-tip.y);if(d<md){md=d;mi=i}});if(md>rad)return;const piv=p[mi];[p[0],p[p.length-1]].forEach(ep=>{const vx=ep.x-tip.x,vy=ep.y-tip.y,l=Math.hypot(vx,vy);if(l<5||l>q.len*.62)return;const co=(vx*back.x+vy*back.y)/l,cr=(back.x*vy-back.y*vx)/l;if(co>.18&&Math.abs(cr)>.10){legs.push({sign:Math.sign(cr),co,cr});used.add(st.id)}})});const signs=new Set(legs.map(x=>x.sign));let score=0;if(signs.size>=2)score=.98;else if(legs.length>=2)score=.74;else if(legs.length===1)score=.48;score=Math.min(1,score+Math.min(.12,legs.length*.03));return{score,used:[...used]}}
function wbSingleArrow(st){const p=st.pts||[];if(p.length<12)return null;const test=(tailAtStart)=>{const tail=tailAtStart?p[0]:p[p.length-1],seq=tailAtStart?p:[...p].reverse();let idx=0,far=0;seq.forEach((q,i)=>{const d=Math.hypot(q.x-tail.x,q.y-tail.y);if(d>far){far=d;idx=i}});if(far<55||idx<seq.length*.48||idx>seq.length*.94)return null;const tip=seq[idx],end=seq[seq.length-1],back={x:(tail.x-tip.x)/far,y:(tail.y-tip.y)/far},vx=end.x-tip.x,vy=end.y-tip.y,l=Math.hypot(vx,vy);if(l<7||l>far*.6)return null;const co=(vx*back.x+vy*back.y)/l,cr=Math.abs(back.x*vy-back.y*vx)/l;if(co<.18||cr<.1)return null;return{tail,tip,score:Math.min(.82,.48+.25*co+.22*cr)}};return test(true)||test(false)}
function wbArrowCandidate(){const W=wbData(),now=Date.now(),recent=W.strokes.filter(st=>!st.role&&now-(st.created||0)<2800).slice(-8);let best=null;recent.forEach(shaft=>{const q=wbLineInfo(shaft);if(!q||q.len<45||q.ratio<.72)return;[false,true].forEach(tipEnd=>{const h=wbHeadEvidence(shaft,recent,tipEnd),feat=[q.ratio,h.score,Math.min(1,h.used.length/2),Math.min(1,q.len/300),0],base=.48*q.ratio+.44*h.score+.08*Math.min(1,q.len/180),score=base+.17*wbLearnBias('arrow',feat);if(h.score>=.45&&(!best||score>best.score)){const tail=tipEnd?q.a:q.b,tip=tipEnd?q.b:q.a;best={shaftId:shaft.id,headIds:h.used,ids:[shaft.id,...h.used],tail,tip,score:Math.max(0,Math.min(1,score)),feat}}})});if(!best){for(const st of recent.slice().reverse()){const x=wbSingleArrow(st);if(x){const q=wbLineInfo(st),feat=[q?q.ratio:.5,x.score,0,Math.min(1,(q&&q.len||80)/300),1],score=x.score+.15*wbLearnBias('arrow',feat);best={shaftId:st.id,headIds:[],ids:[st.id],tail:x.tail,tip:x.tip,score:Math.min(1,score),feat};break}}}return best}
function wbArrowLabelStrokes(c){if(!c)return[];const W=wbData(),a=c.tail,b=c.tip,L=Math.hypot(b.x-a.x,b.y-a.y)||1,ux=(b.x-a.x)/L,uy=(b.y-a.y)/L;const linked=new Set(W.nodes.flatMap(n=>n.strokeIds||[])),ids=new Set(c.ids||[]);return W.strokes.filter(st=>{if(ids.has(st.id)||linked.has(st.id)||st.role)return false;const p=wbCenter(wbStrokeBounds(st)),vx=p.x-a.x,vy=p.y-a.y,t=(vx*ux+vy*uy)/L,perp=Math.abs(vx*uy-vy*ux);return t>.20&&t<.80&&perp>4&&perp<Math.min(75,Math.max(38,L*.30))&&wbStrokeBounds(st).w<L*.75&&wbStrokeBounds(st).h<90})}
async function wbMaybeArrowGroup(){if(!WB.smart)return false;const c=wbArrowCandidate();if(!c||c.score<.60)return false;c.from=(wbNearestNode(c.tail,92)||{}).id||null;c.to=(wbNearestNode(c.tip,92)||{}).id||null;if(c.from&&c.to&&c.from===c.to)return false;c.rel=WB.rel||'causes';c.labelText='';c.labelIds=[];(c.ids||[]).forEach(id=>{const st=wbStroke(id);if(st)st.role='arrow-candidate'});WB.pendingArrow=c;render();await wbReadArrowLabel();return true}
async function wbReadArrowLabel(){const c=WB.pendingArrow;if(!c)return;const ls=wbArrowLabelStrokes(c);c.labelIds=ls.map(x=>x.id);if(ls.length){const rr=await wbRecognizeStrokes(ls,'relation');if(!WB.pendingArrow)return;if(rr.guesses.length){c.labelText=rr.guesses[0];const r=wbRelationFromText(c.labelText);if(r)c.rel=r.rel}}render()}
function wbFlipDetectedArrow(){const c=WB.pendingArrow;if(!c)return;[c.from,c.to]=[c.to,c.from];[c.tail,c.tip]=[c.tip,c.tail];render()}
async function wbAcceptDetectedArrow(){const c=WB.pendingArrow;if(!c)return;const e=document.getElementById('wb-pending-rel');if(e)c.rel=e.value;wbTrain('arrow',c.feat,true);(c.ids||[]).forEach(id=>{const st=wbStroke(id);if(st)st.role='arrow-ink'});WB.pendingArrow=null;if(c.from&&c.to)await wbCreateArrow(c.from,c.to,c.rel||'causes');else{await save();render()}}
function wbRejectDetectedArrow(){const c=WB.pendingArrow;if(!c)return;(c.ids||[]).forEach(id=>{const st=wbStroke(id);if(st&&st.role==='arrow-candidate')st.role=''});wbTrain('arrow',c.feat,false);WB.pendingArrow=null;render()}

/* ---------- live word guessing ---------- */
function wbClusterRecent(latest){
  const W=wbData(),latestTime=latest.created||Date.now();
  /* Spatial continuity is the primary criterion. The old 2.6-second cutoff
     discarded the beginning of longer words, which is why 8–15 letter writing
     routinely became 2–3 letter guesses. */
  const pool=W.strokes.filter(st=>
    !st.role&&!wbStrokeLinked(st.id) &&
    (latestTime-(st.created||latestTime))>=-500 &&
    (latestTime-(st.created||latestTime))<60000
  );
  const cluster=[latest],seen=new Set([latest.id]);let changed=true;
  while(changed){
    changed=false;
    const B=wbUnionBounds(cluster.map(wbStrokeBounds));
    const baseH=Math.max(12,B.h);
    pool.forEach(st=>{
      if(seen.has(st.id))return;
      const b=wbStrokeBounds(st);
      const ygap=Math.max(0,b.y-(B.y+B.h),B.y-(b.y+b.h));
      const xgap=Math.max(0,b.x-(B.x+B.w),B.x-(b.x+b.w));
      const vCenter=Math.abs((b.y+b.h/2)-(B.y+B.h/2));
      const charGap=Math.max(30,Math.min(58,baseH*.48));
      if(ygap<Math.max(22,baseH*.32)&&vCenter<Math.max(55,baseH*.72)&&xgap<charGap){
        seen.add(st.id);cluster.push(st);changed=true;
      }
    });
  }
  const B=wbUnionBounds(cluster.map(wbStrokeBounds));
  return B.w<1400&&B.h<190?cluster:[];
}
function wbScheduleWordGuess(st){clearTimeout(WB.wordTimer);if(!WB.autoText)return;WB.wordTimer=setTimeout(async()=>{if(WB.pendingNode||WB.pendingArrow||!wbStroke(st.id)||st.role)return;const cl=wbClusterRecent(st);if(!cl.length)return;const rr=await wbRecognizeStrokes(cl,'node');if(rr.guesses.length){WB.ghostText={strokeIds:cl.map(x=>x.id),bounds:wbUnionBounds(cl.map(wbStrokeBounds)),text:rr.guesses[0],alts:rr.guesses,openAlts:rr.openGuesses||rr.guesses,knownAlts:rr.knownGuesses||[],engine:rr.engine,cls:wbGuessClass(rr.guesses[0])};render()}},780)}
async function wbMakeGhostNode(){const g=WB.ghostText;if(!g||!g.text)return;const gid=ensure(g.text,{}),d=byId(gid);if(g.cls&&d&&!d.cls)d.cls=g.cls;const b=g.bounds,pad=8;wbData().nodes.push({id:uid('wbn'),graphId:gid,x:Math.max(0,b.x-pad),y:Math.max(26,b.y-pad),w:Math.max(54,b.w+pad*2),h:Math.max(28,b.h+pad*2),strokeIds:[...g.strokeIds],created:Date.now(),auto:true});WB.ghostText=null;await save();refresh();render();toast(`Linked ${termOf(gid)}`)}
async function wbSmartAfterStroke(st){if(!WB.smart)return;if(await wbMaybeEnclosure(st))return;if(await wbMaybeArrowGroup())return;wbScheduleWordGuess(st)}
async function wbSmartScan(){if(WB.recognizing)return toast('Recognition already running');const W=wbData();for(const st of W.strokes.slice().reverse()){if(st.role)continue;if(await wbMaybeEnclosure(st))return;if(await wbMaybeArrowGroup())return}const last=[...W.strokes].reverse().find(st=>!st.role&&!wbStrokeLinked(st.id));if(last){const cl=wbClusterRecent(last),rr=await wbRecognizeStrokes(cl,'node');if(rr.guesses.length){WB.ghostText={strokeIds:cl.map(x=>x.id),bounds:wbUnionBounds(cl.map(wbStrokeBounds)),text:rr.guesses[0],alts:rr.guesses,openAlts:rr.openGuesses||rr.guesses,knownAlts:rr.knownGuesses||[],engine:rr.engine,cls:wbGuessClass(rr.guesses[0])};render();return}}toast(WB.hwrPipe||('createHandwritingRecognizer'in navigator)?'No new smart shape found':'Load handwriting AI to guess words; shape detection already works')}

/* ---------- drawing ---------- */
function wbDrawArrow(ctx,a,b,label,ghost){const ca={x:a.x+a.w/2,y:a.y+a.h/2},cb={x:b.x+b.w/2,y:b.y+b.h/2},dx=cb.x-ca.x,dy=cb.y-ca.y,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,sx=ca.x+ux*Math.min(a.w,a.h)*.45,sy=ca.y+uy*Math.min(a.w,a.h)*.45,ex=cb.x-ux*Math.min(b.w,b.h)*.45,ey=cb.y-uy*Math.min(b.w,b.h)*.45;ctx.save();ctx.globalAlpha=ghost?.5:1;ctx.strokeStyle='#334155';ctx.fillStyle='#334155';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(ex,ey);ctx.stroke();const ah=10;ctx.beginPath();ctx.moveTo(ex,ey);ctx.lineTo(ex-ux*ah-uy*5,ey-uy*ah+ux*5);ctx.lineTo(ex-ux*ah+uy*5,ey-uy*ah-ux*5);ctx.closePath();ctx.fill();if(label){ctx.font='11px IBM Plex Mono, monospace';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle='#475569';ctx.fillText(label,(sx+ex)/2,(sy+ey)/2-4)}ctx.restore()}
function wbPaint(){const c=wbCanvas();if(!c)return;const ctx=c.getContext('2d'),W=wbData();ctx.clearRect(0,0,WBW,WBH);ctx.fillStyle='#fff';ctx.fillRect(0,0,WBW,WBH);ctx.fillStyle='#E8EDF2';for(let x=20;x<WBW;x+=20)for(let y=20;y<WBH;y+=20)ctx.fillRect(x,y,1,1);
  W.strokes.forEach(st=>{const p=st.pts||[];if(p.length<2)return;ctx.strokeStyle=st.color||'#12171C';ctx.lineCap='round';ctx.lineJoin='round';for(let i=1;i<p.length;i++){ctx.lineWidth=(st.width||2.1)*(.65+.35*((p[i-1].p||.5)+(p[i].p||.5)));ctx.beginPath();ctx.moveTo(p[i-1].x,p[i-1].y);ctx.lineTo(p[i].x,p[i].y);ctx.stroke()}});
  W.arrows.forEach(a=>{const A=wbNode(a.from),B=wbNode(a.to);if(A&&B)wbDrawArrow(ctx,A,B,phrase(a.relation||'causes'),false)});
  W.nodes.forEach(n=>{const d=byId(n.graphId);ctx.save();ctx.strokeStyle=WB.selectedNode===n.id?'#0F766E':'#94A3B8';ctx.setLineDash([5,4]);ctx.lineWidth=WB.selectedNode===n.id?2:1;ctx.strokeRect(n.x-5,n.y-5,n.w+10,n.h+10);ctx.setLineDash([]);const txt=d?d.term:'linked node';ctx.font='11px IBM Plex Mono, monospace';const tw=ctx.measureText(txt).width+12;ctx.fillStyle='rgba(255,255,255,.92)';ctx.fillRect(n.x-5,n.y-24,tw,18);ctx.fillStyle='#0F766E';ctx.fillText(txt,n.x+1,n.y-11);ctx.restore()});
  if(WB.ghostText&&WB.ghostText.text){const b=WB.ghostText.bounds;ctx.save();ctx.font='11px IBM Plex Mono, monospace';ctx.fillStyle='rgba(15,118,110,.78)';ctx.fillText('≈ '+WB.ghostText.text,b.x,b.y+b.h+16);ctx.restore()}
  if(WB.pendingArrow){ctx.save();ctx.strokeStyle='#B45309';ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(WB.pendingArrow.tail.x,WB.pendingArrow.tail.y);ctx.lineTo(WB.pendingArrow.tip.x,WB.pendingArrow.tip.y);ctx.stroke();ctx.setLineDash([]);ctx.restore()}
  if(WB.active&&WB.active.kind==='stroke'){const st=WB.active,p=st.pts||[];ctx.strokeStyle='#12171C';ctx.lineWidth=2;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();p.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke()}
  if(WB.active&&WB.active.kind==='arrow'){const A=wbNearestNode(WB.active.start,9999),B=wbNearestNode(WB.active.end,9999);if(A&&B&&A.id!==B.id)wbDrawArrow(ctx,A,B,phrase(wbRelValue()),true);else{ctx.strokeStyle='#64748B';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(WB.active.start.x,WB.active.start.y);ctx.lineTo(WB.active.end.x,WB.active.end.y);ctx.stroke()}}
  if(WB.lasso&&WB.lasso.length>1){ctx.strokeStyle='#0F766E';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();WB.lasso.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();ctx.setLineDash([])}if(WB.selection){const b=WB.selection.bounds;ctx.strokeStyle='#0F766E';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.strokeRect(b.x-5,b.y-5,b.w+10,b.h+10);ctx.setLineDash([])}}
function wbEraseAt(p){const W=wbData();let best=-1,bd=14;W.strokes.forEach((st,i)=>{const b=wbStrokeBounds(st),d=Math.hypot(Math.max(b.x-p.x,0,p.x-(b.x+b.w)),Math.max(b.y-p.y,0,p.y-(b.y+b.h)));if(d<bd){best=i;bd=d}});if(best>=0){const id=W.strokes[best].id;W.strokes.splice(best,1);W.nodes.forEach(n=>n.strokeIds=(n.strokeIds||[]).filter(x=>x!==id));WB.pendingNode=null;WB.pendingArrow=null;WB.ghostText=null;wbSaveSoon();wbPaint();wbUpdateStatus()}}
function wbAddPointerPoints(st,e,c){const es=e.getCoalescedEvents?e.getCoalescedEvents():[e];es.forEach(z=>{const p=wbPoint(z,c),a=st.pts[st.pts.length-1];if(!a||Math.hypot(p.x-a.x,p.y-a.y)>1.1)st.pts.push(p)})}
function initWhiteboard(){const c=wbCanvas(),sc=document.getElementById('wb-scroll');if(!c||c._wbInit)return;c._wbInit=true;wbPaint();wbUpdateStatus();
  c.addEventListener('pointerdown',e=>{if(e.cancelable)e.preventDefault();const p=wbPoint(e,c);try{c.setPointerCapture(e.pointerId)}catch(_){};const touch=e.pointerType==='touch';if(WB.tool==='pan'||(touch&&WB.tool==='pen'&&!WB.fingerInk)){WB.pan={id:e.pointerId,x:e.clientX,y:e.clientY,l:sc.scrollLeft,t:sc.scrollTop};return}if(WB.tool==='pen'){WB.active={kind:'stroke',pointerId:e.pointerId,id:uid('wbs'),pts:[p],color:'#12171C',width:e.pointerType==='pen'?2.1:2.3,created:Date.now(),pointerType:e.pointerType||'mouse'}}else if(WB.tool==='lasso'){WB.lasso=[p];WB.selection=null;WB.selectedNode=null}else if(WB.tool==='arrow')WB.active={kind:'arrow',pointerId:e.pointerId,start:p,end:p};else if(WB.tool==='eraser')wbEraseAt(p);wbPaint()});
  c.addEventListener('pointermove',e=>{if(e.cancelable)e.preventDefault();if(WB.pan&&WB.pan.id===e.pointerId){sc.scrollLeft=WB.pan.l-(e.clientX-WB.pan.x);sc.scrollTop=WB.pan.t-(e.clientY-WB.pan.y);return}const p=wbPoint(e,c);if(WB.active&&WB.active.kind==='stroke'&&WB.active.pointerId===e.pointerId)wbAddPointerPoints(WB.active,e,c);else if(WB.lasso){const a=WB.lasso[WB.lasso.length-1];if(Math.hypot(p.x-a.x,p.y-a.y)>2)WB.lasso.push(p)}else if(WB.active&&WB.active.kind==='arrow'&&WB.active.pointerId===e.pointerId)WB.active.end=p;else if(WB.tool==='eraser'&&e.buttons)wbEraseAt(p);wbPaint()});
  c.addEventListener('pointerup',async e=>{if(e.cancelable)e.preventDefault();try{if(c.hasPointerCapture&&c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId)}catch(_){};if(WB.pan&&WB.pan.id===e.pointerId){WB.pan=null;return}if(WB.active&&WB.active.kind==='stroke'&&WB.active.pointerId===e.pointerId){wbAddPointerPoints(WB.active,e,c);const st=WB.active;WB.active=null;if(st.pts.length>1){st.b=wbBounds(st.pts);wbData().strokes.push(st);wbSaveSoon();wbPaint();wbUpdateStatus();setTimeout(()=>wbSmartAfterStroke(st),10)}else wbPaint();return}if(WB.lasso){const poly=WB.lasso;WB.lasso=null,ids=wbData().strokes.filter(st=>wbInPoly(wbCenter(wbStrokeBounds(st)),poly)).map(st=>st.id),node=wbData().nodes.find(n=>wbInPoly({x:n.x+n.w/2,y:n.y+n.h/2},poly));if(node&&!ids.length){WB.selectedNode=node.id;WB.selection=null;render();return}if(ids.length){const pts=ids.flatMap(id=>(wbStroke(id)||{}).pts||[]);WB.selection={strokeIds:ids,bounds:wbBounds(pts),guess:'',alts:[],cls:''};render();wbRecognizeSelection()}else{WB.selection=null;WB.selectedNode=null;wbPaint()}return}if(WB.active&&WB.active.kind==='arrow'&&WB.active.pointerId===e.pointerId){const ar=WB.active;WB.active=null,A=wbNearestNode(ar.start,70),B=wbNearestNode(ar.end,70);if(A&&B&&A.id!==B.id)await wbCreateArrow(A.id,B.id,wbRelValue());else{toast('Start and finish near two linked nodes');wbPaint()}return}});
  c.addEventListener('pointercancel',()=>{WB.active=null;WB.lasso=null;WB.pan=null;wbPaint()});c.addEventListener('lostpointercapture',e=>{if(WB.pan&&WB.pan.id===e.pointerId)WB.pan=null});
}
async function wbRecognizeSelection(){if(!WB.selection)return;const ids=[...WB.selection.strokeIds],st=ids.map(wbStroke).filter(Boolean),token=uid('sel');WB.selection.token=token;const rr=await wbRecognizeStrokes(st,'node');if(!WB.selection||WB.selection.token!==token)return;WB.selection.alts=rr.guesses;WB.selection.guess=rr.guesses[0]||WB.selection.guess||'';WB.selection.cls=wbGuessClass(WB.selection.guess);render()}
function wbUseSelectionAlt(i){if(!WB.selection)return;const x=WB.selection.alts&&WB.selection.alts[i];if(!x)return;WB.selection.guess=x;WB.selection.cls=wbGuessClass(x);render()}
async function wbConvertSelection(){if(!WB.selection)return;const inp=document.getElementById('wb-name'),sel=document.getElementById('wb-cls'),name=(inp&&inp.value||WB.selection.guess||'').trim();if(!name)return toast('Name the node first');const gid=ensure(name,{}),d=byId(gid),cls=sel&&sel.value;if(cls&&d&&!d.cls)d.cls=cls;const b=WB.selection.bounds,pad=8;wbData().nodes.push({id:uid('wbn'),graphId:gid,x:Math.max(0,b.x-pad),y:Math.max(26,b.y-pad),w:Math.max(54,b.w+pad*2),h:Math.max(28,b.h+pad*2),strokeIds:[...WB.selection.strokeIds],created:Date.now()});WB.selection=null;WB.selectedNode=null;WB.ghostText=null;bump();await save();refresh();render();toast(`Linked handwriting to ${termOf(gid)}`)}
async function wbCreateArrow(from,to,rel){const A=wbNode(from),B=wbNode(to);if(!A||!B)return;const aId=A.graphId,bId=B.graphId;if(!byId(aId)||!byId(bId))return;let r=G.rels.find(x=>x.aId===aId&&x.bId===bId&&x.relation===rel&&!x.neg);if(!r){const da=byId(aId)||{};r={id:uid('rel'),created:Date.now(),aId,relation:rel,bId,neg:false,effect:null,conditions:[],context:'',system:da.system||'',topic:da.topic||'',tags:['from-whiteboard']};G.rels.push(r)}if(!wbData().arrows.some(x=>x.from===from&&x.to===to&&x.relation===rel))wbData().arrows.push({id:uid('wba'),from,to,relation:rel,relId:r.id,created:Date.now()});bump();await save();refresh();render();toast(`${termOf(aId)} ${phrase(rel)} ${termOf(bId)}`)}
async function wbUnlinkNode(id){const W=wbData();W.nodes=W.nodes.filter(n=>n.id!==id);W.arrows=W.arrows.filter(a=>a.from!==id&&a.to!==id);WB.selectedNode=null;await save();render();toast('Removed board link; graph facts were kept')}
function wbUndoInk(){const W=wbData();if(!W.strokes.length)return toast('No ink to undo');const st=W.strokes.pop();W.nodes.forEach(n=>n.strokeIds=(n.strokeIds||[]).filter(x=>x!==st.id));WB.selection=null;WB.pendingNode=null;WB.pendingArrow=null;WB.ghostText=null;wbSaveSoon();wbPaint();wbUpdateStatus()}
async function wbClearBoard(){if(!confirm('Clear all whiteboard ink, board nodes, and board arrows?\n\nUnderlying MedGraph nodes and relationships stay in the graph. Learned shape examples are kept.'))return;const tr=wbTraining();G.whiteboard={strokes:[],nodes:[],arrows:[],training:tr};WB.selection=null;WB.selectedNode=null;WB.pendingNode=null;WB.pendingArrow=null;WB.ghostText=null;await save();render()}
async function wbSaveSequence(){const W=wbData();if(W.nodes.length<2||W.arrows.length<1)return toast('Build a connected arrow chain first');const out={},ind={};W.nodes.forEach(n=>{out[n.id]=[];ind[n.id]=0});W.arrows.forEach(a=>{if(out[a.from]&&ind[a.to]!==undefined){out[a.from].push(a.to);ind[a.to]++}});if(Object.values(out).some(a=>a.length>1)||Object.values(ind).some(n=>n>1))return toast('This board branches; MedGraph sequences are linear. Keep it as a whiteboard graph.');const starts=W.nodes.filter(n=>ind[n.id]===0&&out[n.id].length);if(starts.length!==1)return toast('Need one connected linear chain');const chain=[],seen=new Set();let n=starts[0];while(n&&!seen.has(n.id)){chain.push(n);seen.add(n.id);n=wbNode((out[n.id]||[])[0])}if(chain.length<2||seen.size!==W.nodes.filter(n=>ind[n.id]||out[n.id].length).length)return toast('Need one connected linear chain');const name=prompt('Sequence name:','Whiteboard sequence');if(!name||!name.trim())return;const steps=chain.map((x,i)=>({order:i+1,event:`[[${termOf(x.graphId)}]]`,links:[x.graphId],noLink:[]})),ex=G.seqs.find(s=>canon(s.name)===canon(name));if(ex)ex.steps=steps;else G.seqs.push({id:uid('seq'),created:Date.now(),name:name.trim(),steps,system:'',topic:'',tags:['from-whiteboard']});await save();refresh();toast(`Saved ${chain.length}-step sequence`)}


/* ==================== WHITEBOARD V4 OVERRIDES ====================
   Semantic lasso + true sequence connectors + cached ink rendering.
   The lasso can explicitly turn any selected ink into a node, definition,
   relationship, class assignment, sequence step, or numbered procedure. */
function wbV4Data(){
  const W=wbData();W.annotations=W.annotations||[];
  if(WB.edgeKind==null)WB.edgeKind='auto';if(WB.inkDirty==null)WB.inkDirty=true;
  return W;
}
function toggleSidebar(force){
  SIDEBAR_OPEN=typeof force==='boolean'?force:!SIDEBAR_OPEN;
  const sh=document.getElementById('app-shell'),b=document.getElementById('side-open-btn');
  if(sh)sh.classList.toggle('sideclosed',!SIDEBAR_OPEN);
  if(b)b.textContent=SIDEBAR_OPEN?'Hide terms':'Show terms';
  try{localStorage.setItem('medgraph_sidebar_open',SIDEBAR_OPEN?'1':'0')}catch(e){}
}
function applySidebar(){try{const v=localStorage.getItem('medgraph_sidebar_open');if(v!==null)SIDEBAR_OPEN=v!=='0'}catch(e){};toggleSidebar(SIDEBAR_OPEN)}
function wbItemText(n){if(!n)return'?';return n.graphId?termOf(n.graphId):(n.text||'sequence step')}
function wbEdgeKindValue(){const e=document.getElementById('wb-edge-kind');return e?e.value:(WB.edgeKind||'auto')}
function wbInferEdgeKind(from,to,asked){
  if(asked&&asked!=='auto')return asked;
  const A=wbNode(from),B=wbNode(to);
  if((A&&A.kind==='step')||(B&&B.kind==='step')||(A&&A.stepOrder)||(B&&B.stepOrder))return 'sequence';
  return 'relationship';
}
function wbClassFromText(text){const t=canon(String(text||'').replace(/[\[\]]/g,' '));if(!t)return'';for(const c of CLASSES){if(t===canon(c.key)||t===canon(c.label)||t===canon(c.label.replace(/s$/,'')))return c.key}return''}
function wbParseStepText(text){const raw=String(text||'').trim(),m=raw.match(/^\s*(\d+)\s*[\.)\-:]\s*(.+)$/s);return m?{order:+m[1],text:m[2].trim()}:{order:null,text:raw}}
function wbSplitNumberedSteps(text){
  const raw=String(text||'').trim();if(!raw)return[];
  let parts=raw.split(/\n+/).map(x=>x.trim()).filter(Boolean),out=[];
  for(const line of parts){const m=line.match(/^\s*(\d+)\s*[\.)\-:]\s*(.+)$/s);if(m)out.push({order:+m[1],text:m[2].trim()})}
  if(out.length>=2)return out.sort((a,b)=>a.order-b.order);
  out=[];const rxn=/(?:^|\s)(\d+)\s*[\.)]\s*/g,ms=[...raw.matchAll(rxn)];
  if(ms.length>=2){for(let i=0;i<ms.length;i++){const st=ms[i].index+ms[i][0].length,en=i+1<ms.length?ms[i+1].index:raw.length,txt=raw.slice(st,en).trim();if(txt)out.push({order:+ms[i][1],text:txt})}}
  return out.sort((a,b)=>a.order-b.order)
}
function wbGuessSelectionKind(text){
  const t=String(text||'').trim();if(!t)return'node';
  if(wbSplitNumberedSteps(t).length>=2)return'sequence_block';
  if(/^\s*\d+\s*[\.)\-:]\s*/.test(t))return'sequence_step';
  if(t.includes('::'))return'definition';
  if(wbClassFromText(t))return'class';
  const r=wbRelationFromText(t);if(r&&r.score>.9&&t.split(/\s+/).length<=4)return'relationship';
  return'node'
}
function wbSelectionKindOptions(cur){const xs=[['node','Node'],['definition','Definition (::)'],['relationship','Relationship'],['class','Class assignment'],['sequence_step','Sequence step / procedure'],['sequence_connector','Sequence connector (→)'],['sequence_block','Numbered sequence block']];return xs.map(([k,l])=>`<option value="${k}" ${k===cur?'selected':''}>${l}</option>`).join('')}
function wbNearestBoardItems(bounds,n=2){const p=wbCenter(bounds);return wbV4Data().nodes.map(x=>({x,d:wbNodeDist(x,p)})).sort((a,b)=>a.d-b.d).slice(0,n).map(z=>z.x)}
function wbSelectedArrowHint(sel){
  const strokes=(sel.strokeIds||[]).map(wbStroke).filter(Boolean);let best=null;
  for(const shaft of strokes){const q=wbLineInfo(shaft);if(!q||q.len<30||q.ratio<.58)continue;for(const tipEnd of [false,true]){const h=wbHeadEvidence(shaft,strokes,tipEnd),score=.55*q.ratio+.45*h.score;if(h.score>.35&&(!best||score>best.score)){best={tail:tipEnd?q.a:q.b,tip:tipEnd?q.b:q.a,score}}}}
  if(!best)return null;const A=wbNearestNode(best.tail,130),B=wbNearestNode(best.tip,130);return{from:A&&A.id,to:B&&B.id,score:best.score}
}
function wbSelectionPanel(sel){
  const kind=sel.kind||'node',guess=sel.guess||'',near=wbNearestBoardItems(sel.bounds,2),hint=wbSelectedArrowHint(sel);
  if(!sel._defaults){sel._defaults=true;sel.from=sel.from||(hint&&hint.from)||(near[0]&&near[0].id)||'';sel.to=sel.to||(hint&&hint.to)||(near[1]&&near[1].id)||'';sel.target=sel.target||(near[0]&&wbItemText(near[0]))||'';const ps=wbParseStepText(guess);sel.order=sel.order||ps.order||1;sel.seqName=sel.seqName||WB.lastSeqName||'Whiteboard procedure'}
  const nodeName=sel.nodeName||guess,defText=sel.defText!==undefined?sel.defText:guess,step=wbParseStepText(sel.stepText||guess),relGuess=wbRelationFromText(guess),clsGuess=wbClassFromText(guess)||sel.cls||'';
  const itemOpts=(cur)=>wbV4Data().nodes.filter(n=>n.graphId||n.kind==='step').map(n=>`<option value="${n.id}" ${n.id===cur?'selected':''}>${esc(wbItemText(n))}</option>`).join('');
  let inner='';
  if(kind==='node') inner=`<div class="grid3"><div class="fld"><label class="eyebrow">Node name</label><input id="wb-sel-node" value="${esc(nodeName)}" placeholder="existing OR brand-new term"></div><div class="fld"><label class="eyebrow">Class (optional)</label><select id="wb-sel-cls"><option value="">none</option>${CLASSES.map(c=>`<option value="${c.key}" ${(sel.cls||clsGuess)===c.key?'selected':''}>${esc(c.label)}</option>`).join('')}</select></div><div class="actions" style="border:0;margin:0;padding:18px 0 0"><button class="btn" onclick="wbCommitLassoNode()">Create / link node</button></div></div>`;
  if(kind==='definition'){
    let target=sel.target||'' , body=defText;if(body.includes('::')){const a=body.split('::');if(!target)target=a.shift().trim();body=a.join('::').trim()}
    inner=`<div class="grid2"><div class="fld"><label class="eyebrow">Term being defined</label><input id="wb-def-target" value="${esc(target)}" placeholder="e.g. Vancomycin"></div><div class="fld"><label class="eyebrow">Definition / feature</label><textarea id="wb-def-text">${esc(body)}</textarea></div></div><div class="wbsyntax">${esc(target||'term')} :: ${esc(body||'definition')}</div><div class="actions"><button class="btn" onclick="wbCommitLassoDefinition()">Add :: definition</button></div>`;
  }
  if(kind==='relationship'){
    inner=`<div class="grid3"><div class="fld"><label class="eyebrow">From</label><select id="wb-rel-from"><option value="">choose…</option>${itemOpts(sel.from)}</select></div><div class="fld"><label class="eyebrow">Relationship</label><select id="wb-sel-rel">${wbRelOptions((sel.rel)||(relGuess&&relGuess.rel)||WB.rel)}</select></div><div class="fld"><label class="eyebrow">To</label><select id="wb-rel-to"><option value="">choose…</option>${itemOpts(sel.to)}</select></div></div><div class="wbsyntax">A -relationship→ B</div><div class="actions"><button class="btn" onclick="wbCommitLassoRelationship()">Create relationship</button></div>`;
  }
  if(kind==='class'){
    inner=`<div class="grid2"><div class="fld"><label class="eyebrow">Target term</label><input id="wb-class-target" value="${esc(sel.target||'')}" placeholder="nearest node or type a term"></div><div class="fld"><label class="eyebrow">Class</label><select id="wb-class-value">${CLASSES.map(c=>`<option value="${c.key}" ${(sel.classValue||clsGuess)===c.key?'selected':''}>${esc(c.label)}</option>`).join('')}</select></div></div><div class="wbsyntax">${esc(sel.target||'term')} [${esc(sel.classValue||clsGuess||'class')}]</div><div class="actions"><button class="btn" onclick="wbCommitLassoClass()">Assign class</button></div>`;
  }
  if(kind==='sequence_step'){
    inner=`<div class="grid3"><div class="fld"><label class="eyebrow">Sequence / procedure name</label><input id="wb-step-seq" value="${esc(sel.seqName||'Whiteboard procedure')}"></div><div class="fld"><label class="eyebrow">Step #</label><input id="wb-step-order" type="number" min="1" value="${esc(sel.order||step.order||1)}"></div><div class="fld"><label class="eyebrow">Step text</label><input id="wb-step-text" value="${esc(step.text||guess)}"></div></div><div class="wbsyntax">${esc(sel.seqName||'procedure')} := ${esc(sel.order||step.order||1)}. ${esc(step.text||'step')}</div><div class="actions"><button class="btn" onclick="wbCommitLassoSequenceStep()">Add sequence step</button></div>`;
  }
  if(kind==='sequence_connector'){
    inner=`<div class="grid2"><div class="fld"><label class="eyebrow">Previous step</label><select id="wb-seq-from"><option value="">choose…</option>${itemOpts(sel.from)}</select></div><div class="fld"><label class="eyebrow">Next step</label><select id="wb-seq-to"><option value="">choose…</option>${itemOpts(sel.to)}</select></div></div><div class="wbsyntax">previous step → next step &nbsp; (ordering only; no G.rels edge)</div><div class="actions"><button class="btn" onclick="wbCommitLassoSequenceConnector()">Create sequence connector</button></div>`;
  }
  if(kind==='sequence_block'){
    const steps=wbSplitNumberedSteps(guess),preview=steps.length?steps.map(x=>`${x.order}. ${x.text}`).join('  →  '):guess;
    inner=`<div class="grid2"><div class="fld"><label class="eyebrow">Sequence / procedure name</label><input id="wb-block-seq" value="${esc(sel.seqName||'Whiteboard procedure')}"></div><div class="fld"><label class="eyebrow">Numbered steps</label><textarea id="wb-block-text">${esc(guess)}</textarea></div></div><div class="wbsyntax">${esc(preview||'1. step → 2. step → 3. step')}</div><div class="actions"><button class="btn" onclick="wbCommitLassoSequenceBlock()">Save procedure / sequence</button></div>`;
  }
  return `<div class="wbedit"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="eyebrow">Lassoed ink</span><select class="wbkind" id="wb-sel-kind" onchange="wbSetSelectionKind(this.value)">${wbSelectionKindOptions(kind)}</select><button class="mini" onclick="wbRecognizeSelection()">Recognize again</button><button class="mini x" onclick="WB.selection=null;render()">Dismiss</button></div><div class="hint" style="margin-top:5px">Anything inside the lasso can be assigned a MedGraph meaning. Recognition is only a guess; this label wins.</div>${sel.engine?`<div class="hint">read by ${esc(sel.engine)}</div>`:''}<div class="wbsemantic">${inner}</div>${sel.alts&&sel.alts.length?`<div class="wbalt">${sel.alts.slice(0,5).map((x,i)=>`<button onclick="wbUseSelectionAlt(${i})">${esc(x)}</button>`).join('')}</div>`:''}</div>`
}
function wbSetSelectionKind(k){if(!WB.selection)return;WB.selection.kind=k;WB.selection._defaults=false;render()}
function wbUseSelectionAlt(i){if(!WB.selection)return;const x=WB.selection.alts&&WB.selection.alts[i];if(!x)return;WB.selection.guess=x;WB.selection.kind=wbGuessSelectionKind(x);WB.selection._defaults=false;render()}
async function wbRecognizeSelection(){
  if(!WB.selection)return;const ids=[...WB.selection.strokeIds],st=ids.map(wbStroke).filter(Boolean),token=uid('sel');WB.selection.token=token;
  const rr=await wbRecognizeStrokes(st,'raw');if(!WB.selection||WB.selection.token!==token)return;
  let guesses=[...rr.guesses];if(guesses.length){const M=wbNodeMatches(guesses[0]);M.forEach(m=>{if(!guesses.some(g=>canon(g)===canon(m.term)))guesses.push(m.term)})}
  WB.selection.alts=guesses;WB.selection.openAlts=rr.openGuesses||guesses;WB.selection.knownAlts=rr.knownGuesses||[];WB.selection.guess=guesses[0]||WB.selection.guess||'';WB.selection.cls=wbGuessClass(WB.selection.guess);WB.selection.engine=rr.engine;WB.selection.kind=wbGuessSelectionKind(WB.selection.guess);WB.selection._defaults=false;render()
}
function wbAddAnnotation(kind,bounds,text,strokeIds,extra){const W=wbV4Data();W.annotations.push({id:uid('wban'),kind,x:bounds.x,y:bounds.y,w:bounds.w,h:bounds.h,text:String(text||''),strokeIds:[...(strokeIds||[])],created:Date.now(),...(extra||{})})}
function wbLinkBoardNode(gid,b,strokeIds,extra){const pad=8,n={id:uid('wbn'),graphId:gid||null,x:Math.max(0,b.x-pad),y:Math.max(26,b.y-pad),w:Math.max(54,b.w+pad*2),h:Math.max(28,b.h+pad*2),strokeIds:[...(strokeIds||[])],created:Date.now(),...(extra||{})};wbV4Data().nodes.push(n);return n}
async function wbCommitLassoNode(){if(!WB.selection)return;const name=(document.getElementById('wb-sel-node')?.value||WB.selection.guess||'').trim();if(!name)return toast('Name the node first');const gid=ensure(name,{}),d=byId(gid),cls=document.getElementById('wb-sel-cls')?.value||'';if(cls&&d)d.cls=cls;wbLinkBoardNode(gid,WB.selection.bounds,WB.selection.strokeIds,{kind:'node'});WB.selection=null;WB.ghostText=null;bump();await save();refresh();render();toast(`Linked ${termOf(gid)}`)}
async function wbCommitLassoDefinition(){if(!WB.selection)return;let target=(document.getElementById('wb-def-target')?.value||'').trim(),text=(document.getElementById('wb-def-text')?.value||'').trim();if(text.includes('::')){const a=text.split('::');if(!target)target=a.shift().trim();text=a.join('::').trim()}if(!target||!text)return toast('Need both the term and its definition');const gid=ensure(target,{}),d=byId(gid);d.features=d.features||[];if(!d.features.some(f=>canon(f.text)===canon(text)))d.features.push({text,links:resolveBrackets(text,{})});d.stub=!d.features.length;wbAddAnnotation('definition',WB.selection.bounds,`:: ${text}`,WB.selection.strokeIds,{targetGraphId:gid});WB.selection=null;bump();await save();refresh();render();toast(`${termOf(gid)} :: definition added`)}
async function wbCommitLassoClass(){if(!WB.selection)return;const target=(document.getElementById('wb-class-target')?.value||'').trim(),cls=document.getElementById('wb-class-value')?.value||'';if(!target||!cls)return toast('Need a target term and class');const gid=ensure(target,{}),d=byId(gid);d.cls=cls;wbAddAnnotation('class',WB.selection.bounds,`[${cls}]`,WB.selection.strokeIds,{targetGraphId:gid});WB.selection=null;bump();await save();refresh();render();toast(`${termOf(gid)} [${cls}]`)}
function wbGraphRelation(aId,bId,rel){let r=G.rels.find(x=>x.aId===aId&&x.bId===bId&&x.relation===rel&&!x.neg);if(!r){const da=byId(aId)||{};r={id:uid('rel'),created:Date.now(),aId,relation:rel,bId,neg:false,effect:null,conditions:[],context:'',system:da.system||'',topic:da.topic||'',tags:['from-whiteboard']};G.rels.push(r)}return r}
async function wbCommitLassoRelationship(){if(!WB.selection)return;const from=document.getElementById('wb-rel-from')?.value||'',to=document.getElementById('wb-rel-to')?.value||'',rel=document.getElementById('wb-sel-rel')?.value||WB.rel;if(!from||!to||from===to)return toast('Choose two different endpoints');const A=wbNode(from),B=wbNode(to);if(!A?.graphId||!B?.graphId)return toast('Relationships need two MedGraph nodes; sequence steps use sequence arrows');const r=wbGraphRelation(A.graphId,B.graphId,rel);const W=wbV4Data();if(!W.arrows.some(x=>x.from===from&&x.to===to&&x.kind!=='sequence'&&x.relation===rel))W.arrows.push({id:uid('wba'),from,to,kind:'relationship',relation:rel,relId:r.id,strokeIds:[...WB.selection.strokeIds],created:Date.now()});wbAddAnnotation('relationship',WB.selection.bounds,phrase(rel),WB.selection.strokeIds,{relId:r.id});WB.selection=null;bump();await save();refresh();WB.inkDirty=true;render();toast(`${wbItemText(A)} ${phrase(rel)} ${wbItemText(B)}`)}
function wbSequenceRecord(name){let s=G.seqs.find(x=>canon(x.name)===canon(name));if(!s){s={id:uid('seq'),created:Date.now(),name:name.trim(),steps:[],system:'',topic:'',tags:['from-whiteboard']};G.seqs.push(s)}return s}
function wbStepLinks(text){const r=resolve(text);return r&&r.id?[r.id]:resolveBrackets(text,{})}
async function wbCommitLassoSequenceStep(){if(!WB.selection)return;const name=(document.getElementById('wb-step-seq')?.value||'Whiteboard procedure').trim(),order=Math.max(1,+document.getElementById('wb-step-order')?.value||1),text=(document.getElementById('wb-step-text')?.value||'').trim();if(!name||!text)return toast('Need a sequence name and step text');WB.lastSeqName=name;const s=wbSequenceRecord(name),rec={order,event:text,links:wbStepLinks(text),noLink:[]},i=s.steps.findIndex(x=>x.order===order);if(i>=0)s.steps[i]=rec;else s.steps.push(rec);s.steps.sort((a,b)=>a.order-b.order);wbLinkBoardNode(null,WB.selection.bounds,WB.selection.strokeIds,{kind:'step',text,stepOrder:order,seqName:name});wbAddAnnotation('sequence_step',WB.selection.bounds,`${order}.`,WB.selection.strokeIds,{seqName:name,order});WB.selection=null;bump();await save();refresh();render();toast(`Saved step ${order} in ${name}`)}
async function wbCommitLassoSequenceConnector(){if(!WB.selection)return;const from=document.getElementById('wb-seq-from')?.value||'',to=document.getElementById('wb-seq-to')?.value||'';if(!from||!to||from===to)return toast('Choose a previous and next step');const W=wbV4Data();if(!W.arrows.some(x=>x.from===from&&x.to===to&&x.kind==='sequence'))W.arrows.push({id:uid('wba'),from,to,kind:'sequence',relation:'precedes',relId:null,strokeIds:[...WB.selection.strokeIds],created:Date.now()});wbAddAnnotation('sequence_connector',WB.selection.bounds,'→ next',WB.selection.strokeIds,{from,to});WB.selection=null;bump();await save();render();toast(`${wbItemText(wbNode(from))} → ${wbItemText(wbNode(to))} (sequence order)`)}
async function wbCommitLassoSequenceBlock(){if(!WB.selection)return;const name=(document.getElementById('wb-block-seq')?.value||'Whiteboard procedure').trim(),raw=(document.getElementById('wb-block-text')?.value||'').trim(),steps=wbSplitNumberedSteps(raw);if(steps.length<2)return toast('I need at least two numbered steps (1., 2., 3., …)');WB.lastSeqName=name;const s=wbSequenceRecord(name);s.steps=steps.map(x=>({order:x.order,event:x.text,links:wbStepLinks(x.text),noLink:[]}));wbAddAnnotation('sequence_block',WB.selection.bounds,`:= ${steps.length} steps`,WB.selection.strokeIds,{seqName:name});WB.selection=null;bump();await save();refresh();render();toast(`Saved ${steps.length}-step procedure: ${name}`)}
function wbCaptureSelection(poly){const W=wbV4Data(),ids=W.strokes.filter(st=>wbInPoly(wbCenter(wbStrokeBounds(st)),poly)).map(st=>st.id);if(!ids.length)return null;const pts=ids.flatMap(id=>(wbStroke(id)||{}).pts||[]);return{strokeIds:ids,bounds:wbBounds(pts),guess:'',alts:[],cls:'',kind:'node',engine:'',_defaults:false}}

function whiteboardHTML(){
  wbV4Data();const W=wbV4Data(),sel=WB.selection,pn=WB.pendingNode,pa=WB.pendingArrow,sn=WB.selectedNode&&wbNode(WB.selectedNode),gh=WB.ghostText,hs=wbHwrStatus();
  const nodeGuess=pn?(pn.name||''):'';
  return `<div class="panel" style="padding:14px 16px">
    <div class="panel-h"><span style="width:10px;height:10px;border-radius:50%;background:#0F766E"></span><h2>Whiteboard</h2><span class="hint" style="margin:0 0 0 auto">Apple Pencil · Surface/stylus · touch · mouse</span></div>
    <div class="wbtools"><span class="seg">${[['pen','Pen'],['lasso','Lasso'],['arrow','Arrow'],['eraser','Eraser'],['pan','Pan']].map(([k,l])=>`<button class="${WB.tool===k?'on':''}" onclick="wbSetTool('${k}')">${l}</button>`).join('')}</span>
      <label class="eyebrow">Arrow makes</label><select id="wb-edge-kind" onchange="WB.edgeKind=this.value"><option value="auto" ${WB.edgeKind==='auto'?'selected':''}>Auto — numbered steps = sequence</option><option value="relationship" ${WB.edgeKind==='relationship'?'selected':''}>Relationship</option><option value="sequence" ${WB.edgeKind==='sequence'?'selected':''}>Sequence / procedure order</option></select>
      <label class="eyebrow">Default relation</label><select id="wb-rel" onchange="WB.rel=this.value;if(WB.pendingArrow)WB.pendingArrow.rel=this.value">${wbRelOptions(pa&&pa.rel)}</select>
      <button class="mini" onclick="wbUndoInk()">Undo ink</button><button class="mini" onclick="wbSaveSequence()">Save sequence connectors</button><button class="mini x" onclick="wbClearBoard()">Clear board</button>
    </div>
    <div class="wbsmart"><label><input type="checkbox" ${WB.smart?'checked':''} onchange="WB.smart=this.checked"> smart arrows</label><label><input type="checkbox" ${WB.autoShapes?'checked':''} onchange="WB.autoShapes=this.checked"> circles → node guesses</label><label><input type="checkbox" ${WB.autoText?'checked':''} onchange="WB.autoText=this.checked"> idle word guesses</label><label title="Off = finger pans while Pen is selected"><input type="checkbox" ${WB.fingerInk?'checked':''} onchange="WB.fingerInk=this.checked"> finger draws</label><span class="wbai ${hs.cls}" id="wb-ai-status">${esc(hs.txt)}</span>${!WB.hwrPipe?`<button class="mini" id="wb-load-ai" onclick="wbLoadHandwritingAI()" ${WB.aiLoading?'disabled':''}>Load local handwriting AI (~65 MB)</button>`:''}<button class="mini" onclick="wbSmartScan()">Smart scan</button><button class="mini" onclick="mgHwrManualSync()">Sync handwriting</button><span class="wbperf" id="wb-hwr-shared-count">${typeof mgHwrCountV6==='function'?mgHwrCountV6():((wbData().training.samples||[]).length)} personal ink samples loaded</span><span class="wbperf">cached ink rendering · lasso labels override guesses</span></div>
    ${pn?`<div class="wbedit"><div><b>Node shape detected.</b> ${pn.engine?`<span class="hint">read by ${esc(pn.engine)}</span>`:''}</div><div class="grid3" style="margin-top:8px"><div class="fld"><label class="eyebrow">Guessed text</label><input id="wb-pnode-name" value="${esc(nodeGuess)}" placeholder="${pn?.recognizing?'recognizing…':'type or correct ANY word/phrase'}"></div><div class="fld"><label class="eyebrow">Class</label><select id="wb-pnode-cls"><option value="">none</option>${CLASSES.map(c=>`<option value="${c.key}" ${pn.cls===c.key?'selected':''}>${esc(c.label)}</option>`).join('')}</select></div><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" onclick="wbAcceptPendingNode()">Create / link node</button><button class="mini x" onclick="wbRejectPendingNode()">Not a node</button></div></div>${pn.alts&&pn.alts.length?`<div class="wbalt">${pn.alts.slice(0,5).map((x,i)=>`<button onclick="wbUsePendingNodeAlt(${i})">${esc(x)}</button>`).join('')}</div>`:''}</div>`:''}
    ${pa?`<div class="wbedit"><div><b>Arrow detected:</b> <span class="mono">${pa.from?esc(wbItemText(wbNode(pa.from))):'?'}</span> → <span class="mono">${pa.to?esc(wbItemText(wbNode(pa.to))):'?'}</span> <span class="wbconf">shape ${Math.round((pa.score||0)*100)}%</span></div><div class="grid3" style="margin-top:8px"><div class="fld"><label class="eyebrow">Interpret arrow as</label><select id="wb-pending-kind" onchange="WB.pendingArrow.kind=this.value;render()"><option value="relationship" ${pa.kind!=='sequence'?'selected':''}>Relationship</option><option value="sequence" ${pa.kind==='sequence'?'selected':''}>Sequence / next step</option></select></div>${pa.kind==='sequence'?`<div class="fld"><label class="eyebrow">Meaning</label><div class="wbsyntax">previous step → next step</div></div>`:`<div class="fld"><label class="eyebrow">Relationship</label><select id="wb-pending-rel" onchange="WB.pendingArrow.rel=this.value">${wbRelOptions(pa.rel)}</select></div><div class="fld"><label class="eyebrow">Label guess</label><div class="wbsyntax">${esc(pa.labelText||'none')}</div></div>`}</div><div class="actions"><button class="btn" onclick="wbAcceptDetectedArrow()" ${(!pa.from||!pa.to)?'disabled':''}>${pa.kind==='sequence'?'Add sequence connector':'Add relationship'}</button><button class="mini" onclick="wbFlipDetectedArrow()">Flip direction</button>${pa.kind!=='sequence'?`<button class="mini" onclick="wbReadArrowLabel()">Re-read label</button>`:''}<button class="mini x" onclick="wbRejectDetectedArrow()">Not an arrow</button></div>${(!pa.from||!pa.to)?`<div class="hint">Link/lasso the endpoint items first, or use the Arrow tool after labeling them.</div>`:''}</div>`:''}
    ${sel?wbSelectionPanel(sel):''}
    ${gh?`<div class="wbedit"><div><b>Recent handwriting:</b>${gh.engine?` <span class="hint">(${esc(gh.engine)})</span>`:''}</div><div class="grid3" style="margin-top:7px"><div class="fld"><label class="eyebrow">Word / phrase</label><input id="wb-ghost-name" value="${esc(gh.text||'')}" placeholder="type ANY new word or phrase"></div><div class="fld"><label class="eyebrow">Open spelling alternatives</label><div class="wbalt">${(gh.openAlts||gh.alts||[]).slice(0,4).map((x,i)=>`<button onclick="wbUseGhostAlt(${i})">${esc(x)}</button>`).join('')}</div></div><div class="actions" style="border:0;margin:0;padding-top:18px"><button class="btn" onclick="wbMakeGhostNode()">Create node</button><button class="mini x" onclick="WB.ghostText=null;render()">Dismiss</button></div></div></div>`:''}
    ${sn?`<div class="wbedit"><span class="wbdot"></span><b class="mono">${esc(wbItemText(sn))}</b> is linked to this ink.<button class="mini x" style="margin-left:10px" onclick="wbUnlinkNode('${sn.id}')">Remove board link</button></div>`:''}
    <div class="wbscroll" id="wb-scroll"><canvas id="wb-canvas" width="1600" height="1000"></canvas></div>
    <div class="wbstatus"><span><b id="wb-stat-strokes">${W.strokes.length}</b> ink strokes</span><span><b id="wb-stat-nodes">${W.nodes.length}</b> semantic items</span><span><b id="wb-stat-arrows">${W.arrows.length}</b> structured arrows</span><span>Lasso anything → explicitly label it. Numbered steps + sequence arrows are stored in <b>G.seqs</b>, not as biological relationships.</span></div>
  </div>`
}

/* performance: committed ink is rasterized once; pointer moves only redraw overlays */
function wbMarkInkDirty(){WB.inkDirty=true}
function wbRequestPaint(){if(WB.paintRAF)return;WB.paintRAF=requestAnimationFrame(()=>{WB.paintRAF=0;wbPaint()})}
function wbDrawStrokeTo(ctx,st){const p=st.pts||[];if(p.length<2)return;ctx.strokeStyle=st.color||'#12171C';ctx.lineCap='round';ctx.lineJoin='round';for(let i=1;i<p.length;i++){ctx.lineWidth=(st.width||2.1)*(.65+.35*((p[i-1].p||.5)+(p[i].p||.5)));ctx.beginPath();ctx.moveTo(p[i-1].x,p[i-1].y);ctx.lineTo(p[i].x,p[i].y);ctx.stroke()}}
function wbInkLayer(){if(!WB.inkLayer){const c=document.createElement('canvas');c.width=WBW;c.height=WBH;WB.inkLayer=c;WB.inkDirty=true}if(WB.inkDirty){const c=WB.inkLayer,ctx=c.getContext('2d'),W=wbV4Data();ctx.clearRect(0,0,WBW,WBH);ctx.fillStyle='#fff';ctx.fillRect(0,0,WBW,WBH);ctx.fillStyle='#E8EDF2';for(let x=20;x<WBW;x+=20)for(let y=20;y<WBH;y+=20)ctx.fillRect(x,y,1,1);W.strokes.forEach(st=>wbDrawStrokeTo(ctx,st));WB.inkDirty=false}return WB.inkLayer}
function wbPaint(){const c=wbCanvas();if(!c)return;const ctx=c.getContext('2d'),W=wbV4Data();ctx.clearRect(0,0,WBW,WBH);ctx.drawImage(wbInkLayer(),0,0);
  W.arrows.forEach(a=>{const A=wbNode(a.from),B=wbNode(a.to);if(A&&B)wbDrawArrow(ctx,A,B,a.kind==='sequence'?'next':phrase(a.relation||'causes'),false)});
  W.nodes.forEach(n=>{ctx.save();ctx.strokeStyle=WB.selectedNode===n.id?'#0F766E':(n.kind==='step'?'#6B46C1':'#94A3B8');ctx.setLineDash(n.kind==='step'?[3,3]:[5,4]);ctx.lineWidth=WB.selectedNode===n.id?2:1;ctx.strokeRect(n.x-5,n.y-5,n.w+10,n.h+10);ctx.setLineDash([]);const txt=n.kind==='step'?`${n.stepOrder||'?'} · ${wbItemText(n)}`:wbItemText(n);ctx.font='11px IBM Plex Mono, monospace';const tw=Math.min(360,ctx.measureText(txt).width+12);ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(n.x-5,n.y-24,tw,18);ctx.fillStyle=n.kind==='step'?'#6B46C1':'#0F766E';ctx.fillText(txt,n.x+1,n.y-11);ctx.restore()});
  W.annotations.forEach(a=>{ctx.save();ctx.font='10.5px IBM Plex Mono, monospace';ctx.fillStyle='rgba(255,255,255,.94)';const tag=a.kind==='definition'?'::':a.kind==='class'?a.text:a.kind==='relationship'?`rel: ${a.text}`:a.kind==='sequence_block'?a.text:a.kind==='sequence_step'?a.text:a.kind==='sequence_connector'?a.text:'';if(tag){const tw=Math.min(320,ctx.measureText(tag).width+10),y=Math.max(12,a.y+a.h+7);ctx.fillRect(a.x,y,tw,16);ctx.fillStyle=a.kind.startsWith('sequence')?'#6B46C1':'#475569';ctx.fillText(tag,a.x+4,y+12)}ctx.restore()});
  if(WB.ghostText&&WB.ghostText.text){const b=WB.ghostText.bounds;ctx.save();ctx.font='11px IBM Plex Mono, monospace';ctx.fillStyle='rgba(15,118,110,.78)';ctx.fillText('≈ '+WB.ghostText.text,b.x,b.y+b.h+16);ctx.restore()}
  if(WB.pendingArrow){ctx.save();ctx.strokeStyle=WB.pendingArrow.kind==='sequence'?'#6B46C1':'#B45309';ctx.setLineDash([6,4]);ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(WB.pendingArrow.tail.x,WB.pendingArrow.tail.y);ctx.lineTo(WB.pendingArrow.tip.x,WB.pendingArrow.tip.y);ctx.stroke();ctx.restore()}
  if(WB.active&&WB.active.kind==='stroke')wbDrawStrokeTo(ctx,WB.active);
  if(WB.active&&WB.active.kind==='arrow'){const A=wbNearestNode(WB.active.start,9999),B=wbNearestNode(WB.active.end,9999);if(A&&B&&A.id!==B.id){const k=wbInferEdgeKind(A.id,B.id,wbEdgeKindValue());wbDrawArrow(ctx,A,B,k==='sequence'?'next':phrase(wbRelValue()),true)}else{ctx.strokeStyle='#64748B';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(WB.active.start.x,WB.active.start.y);ctx.lineTo(WB.active.end.x,WB.active.end.y);ctx.stroke()}}
  if(WB.lasso&&WB.lasso.length>1){ctx.strokeStyle='#0F766E';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.beginPath();WB.lasso.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();ctx.setLineDash([])}if(WB.selection){const b=WB.selection.bounds;ctx.strokeStyle='#0F766E';ctx.lineWidth=1.5;ctx.setLineDash([6,4]);ctx.strokeRect(b.x-5,b.y-5,b.w+10,b.h+10);ctx.setLineDash([])}
}
function wbEraseAt(p){const W=wbV4Data();let best=-1,bd=14;W.strokes.forEach((st,i)=>{const b=wbStrokeBounds(st),d=Math.hypot(Math.max(b.x-p.x,0,p.x-(b.x+b.w)),Math.max(b.y-p.y,0,p.y-(b.y+b.h)));if(d<bd){best=i;bd=d}});if(best>=0){const id=W.strokes[best].id;W.strokes.splice(best,1);W.nodes.forEach(n=>n.strokeIds=(n.strokeIds||[]).filter(x=>x!==id));W.annotations.forEach(a=>a.strokeIds=(a.strokeIds||[]).filter(x=>x!==id));WB.pendingNode=null;WB.pendingArrow=null;WB.ghostText=null;wbMarkInkDirty();wbSaveSoon();wbRequestPaint();wbUpdateStatus()}}
function wbUndoInk(){const W=wbV4Data();if(!W.strokes.length)return toast('No ink to undo');const st=W.strokes.pop();W.nodes.forEach(n=>n.strokeIds=(n.strokeIds||[]).filter(x=>x!==st.id));W.annotations.forEach(a=>a.strokeIds=(a.strokeIds||[]).filter(x=>x!==st.id));WB.selection=null;WB.pendingNode=null;WB.pendingArrow=null;WB.ghostText=null;wbMarkInkDirty();wbSaveSoon();wbRequestPaint();wbUpdateStatus()}
async function wbClearBoard(){if(!confirm('Clear all whiteboard ink and whiteboard semantic overlays?\n\nUnderlying MedGraph nodes, definitions, classes, relationships, and sequences stay in the graph. Learned shape examples are kept.'))return;const tr=wbTraining();G.whiteboard={strokes:[],nodes:[],arrows:[],annotations:[],training:tr};WB.selection=null;WB.selectedNode=null;WB.pendingNode=null;WB.pendingArrow=null;WB.ghostText=null;WB.inkLayer=null;WB.inkDirty=true;await save();render()}

async function wbCreateArrow(from,to,rel,askedKind){const A=wbNode(from),B=wbNode(to);if(!A||!B)return;const kind=wbInferEdgeKind(from,to,askedKind||wbEdgeKindValue()),W=wbV4Data();if(kind==='sequence'){if(!W.arrows.some(x=>x.from===from&&x.to===to&&x.kind==='sequence'))W.arrows.push({id:uid('wba'),from,to,kind:'sequence',relation:'precedes',relId:null,created:Date.now()});bump();await save();render();toast(`${wbItemText(A)} → ${wbItemText(B)} (sequence order)`);return}if(!A.graphId||!B.graphId)return toast('A relationship needs two MedGraph nodes. Label these as nodes, or use sequence-step labels.');const r=wbGraphRelation(A.graphId,B.graphId,rel||WB.rel||'causes');if(!W.arrows.some(x=>x.from===from&&x.to===to&&x.kind!=='sequence'&&x.relation===(rel||WB.rel)))W.arrows.push({id:uid('wba'),from,to,kind:'relationship',relation:rel||WB.rel,relId:r.id,created:Date.now()});bump();await save();refresh();render();toast(`${wbItemText(A)} ${phrase(rel||WB.rel)} ${wbItemText(B)}`)}
async function wbMaybeArrowGroup(){if(!WB.smart)return false;const c=wbArrowCandidate();if(!c||c.score<.60)return false;c.from=(wbNearestNode(c.tail,92)||{}).id||null;c.to=(wbNearestNode(c.tip,92)||{}).id||null;if(c.from&&c.to&&c.from===c.to)return false;c.kind=wbInferEdgeKind(c.from,c.to,WB.edgeKind||'auto');c.rel=WB.rel||'causes';c.labelText='';c.labelIds=[];(c.ids||[]).forEach(id=>{const st=wbStroke(id);if(st)st.role='arrow-candidate'});WB.pendingArrow=c;render();if(c.kind!=='sequence')await wbReadArrowLabel();return true}
async function wbReadArrowLabel(){const c=WB.pendingArrow;if(!c||c.kind==='sequence')return;const ls=wbArrowLabelStrokes(c);c.labelIds=ls.map(x=>x.id);if(ls.length){const rr=await wbRecognizeStrokes(ls,'relation');if(!WB.pendingArrow)return;if(rr.guesses.length){c.labelText=rr.guesses[0];const r=wbRelationFromText(c.labelText);if(r)c.rel=r.rel}}render()}
async function wbAcceptDetectedArrow(){const c=WB.pendingArrow;if(!c)return;const ke=document.getElementById('wb-pending-kind');if(ke)c.kind=ke.value;const re=document.getElementById('wb-pending-rel');if(re)c.rel=re.value;wbTrain('arrow',c.feat,true);(c.ids||[]).forEach(id=>{const st=wbStroke(id);if(st)st.role='arrow-ink'});WB.pendingArrow=null;if(c.from&&c.to)await wbCreateArrow(c.from,c.to,c.rel||'causes',c.kind);else{await save();render()}}

function initWhiteboard(){const c=wbCanvas(),sc=document.getElementById('wb-scroll');if(!c||c._wbInit)return;c._wbInit=true;wbV4Data();wbMarkInkDirty();wbRequestPaint();wbUpdateStatus();
  c.addEventListener('pointerdown',e=>{if(e.cancelable)e.preventDefault();const p=wbPoint(e,c);try{c.setPointerCapture(e.pointerId)}catch(_){};const touch=e.pointerType==='touch';if(WB.tool==='pan'||(touch&&WB.tool==='pen'&&!WB.fingerInk)){WB.pan={id:e.pointerId,x:e.clientX,y:e.clientY,l:sc.scrollLeft,t:sc.scrollTop};return}if(WB.tool==='pen'){WB.active={kind:'stroke',pointerId:e.pointerId,id:uid('wbs'),pts:[p],color:'#12171C',width:e.pointerType==='pen'?2.1:2.3,created:Date.now(),pointerType:e.pointerType||'mouse'}}else if(WB.tool==='lasso'){WB.lasso=[p];WB.selection=null;WB.selectedNode=null}else if(WB.tool==='arrow')WB.active={kind:'arrow',pointerId:e.pointerId,start:p,end:p};else if(WB.tool==='eraser')wbEraseAt(p);wbRequestPaint()});
  c.addEventListener('pointermove',e=>{if(e.cancelable)e.preventDefault();if(WB.pan&&WB.pan.id===e.pointerId){sc.scrollLeft=WB.pan.l-(e.clientX-WB.pan.x);sc.scrollTop=WB.pan.t-(e.clientY-WB.pan.y);return}const p=wbPoint(e,c);if(WB.active&&WB.active.kind==='stroke'&&WB.active.pointerId===e.pointerId)wbAddPointerPoints(WB.active,e,c);else if(WB.lasso){const a=WB.lasso[WB.lasso.length-1];if(Math.hypot(p.x-a.x,p.y-a.y)>2.5)WB.lasso.push(p)}else if(WB.active&&WB.active.kind==='arrow'&&WB.active.pointerId===e.pointerId)WB.active.end=p;else if(WB.tool==='eraser'&&e.buttons)wbEraseAt(p);wbRequestPaint()});
  c.addEventListener('pointerup',async e=>{if(e.cancelable)e.preventDefault();try{if(c.hasPointerCapture&&c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId)}catch(_){};if(WB.pan&&WB.pan.id===e.pointerId){WB.pan=null;return}if(WB.active&&WB.active.kind==='stroke'&&WB.active.pointerId===e.pointerId){wbAddPointerPoints(WB.active,e,c);const st=WB.active;WB.active=null;if(st.pts.length>1){st.b=wbBounds(st.pts);wbV4Data().strokes.push(st);wbMarkInkDirty();wbSaveSoon();wbRequestPaint();wbUpdateStatus();setTimeout(()=>wbSmartAfterStroke(st),40)}return}if(WB.lasso){const poly=WB.lasso;WB.lasso=null;const captured=wbCaptureSelection(poly),node=wbV4Data().nodes.find(n=>wbInPoly({x:n.x+n.w/2,y:n.y+n.h/2},poly));if(captured){WB.selection=captured;WB.selectedNode=null;render();setTimeout(()=>wbRecognizeSelection(),20)}else if(node){WB.selectedNode=node.id;WB.selection=null;render()}else{WB.selection=null;WB.selectedNode=null;wbRequestPaint()}return}if(WB.active&&WB.active.kind==='arrow'&&WB.active.pointerId===e.pointerId){const ar=WB.active;WB.active=null,A=wbNearestNode(ar.start,80),B=wbNearestNode(ar.end,80);if(A&&B&&A.id!==B.id)await wbCreateArrow(A.id,B.id,wbRelValue(),wbEdgeKindValue());else{toast('Start and finish near two labeled whiteboard items');wbRequestPaint()}return}});
  c.addEventListener('pointercancel',()=>{WB.active=null;WB.lasso=null;WB.pan=null;wbRequestPaint()});c.addEventListener('lostpointercapture',e=>{if(WB.pan&&WB.pan.id===e.pointerId)WB.pan=null})
}
/* expensive free-word OCR waits until the pen is truly idle; geometry still scans immediately */
function wbScheduleWordGuess(st){clearTimeout(WB.wordTimer);if(!WB.autoText)return;WB.wordTimer=setTimeout(async()=>{if(WB.pendingNode||WB.pendingArrow||!wbStroke(st.id)||st.role)return;const cl=wbClusterRecent(st);if(!cl.length||cl.length>90)return;const run=()=>wbRecognizeStrokes(cl,'node').then(rr=>{if(rr.guesses.length){WB.ghostText={strokeIds:cl.map(x=>x.id),bounds:wbUnionBounds(cl.map(wbStrokeBounds)),text:rr.guesses[0],alts:rr.guesses,openAlts:rr.openGuesses||rr.guesses,knownAlts:rr.knownGuesses||[],engine:rr.engine,cls:wbGuessClass(rr.guesses[0])};render()}});if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1800});else setTimeout(run,40)},1350)}
async function wbSaveSequence(){const W=wbV4Data(),seqAr=W.arrows.filter(a=>a.kind==='sequence');let chain=[];
  if(seqAr.length){const out={},ind={};W.nodes.forEach(n=>{out[n.id]=[];ind[n.id]=0});seqAr.forEach(a=>{if(out[a.from]&&ind[a.to]!==undefined){out[a.from].push(a.to);ind[a.to]++}});if(Object.values(out).some(a=>a.length>1)||Object.values(ind).some(n=>n>1))return toast('Sequence connectors branch. A MedGraph sequence needs one linear order.');const starts=W.nodes.filter(n=>ind[n.id]===0&&out[n.id].length);if(starts.length!==1)return toast('Need one connected sequence chain');const seen=new Set();let n=starts[0];while(n&&!seen.has(n.id)){chain.push(n);seen.add(n.id);n=wbNode((out[n.id]||[])[0])}}
  else chain=W.nodes.filter(n=>n.kind==='step'&&n.stepOrder).sort((a,b)=>a.stepOrder-b.stepOrder);
  if(chain.length<2)return toast('Label at least two items as Sequence steps, or connect them with sequence arrows.');const suggested=chain.find(n=>n.seqName)?.seqName||WB.lastSeqName||'Whiteboard procedure',name=prompt('Sequence name:',suggested);if(!name||!name.trim())return;WB.lastSeqName=name.trim();const steps=chain.map((x,i)=>({order:i+1,event:wbItemText(x),links:x.graphId?[x.graphId]:wbStepLinks(wbItemText(x)),noLink:[]})),s=wbSequenceRecord(name.trim());s.steps=steps;await save();refresh();toast(`Saved ${steps.length}-step sequence`)}



function wbUseGhostAlt(i){if(!WB.ghostText)return;const a=WB.ghostText.openAlts||WB.ghostText.alts||[],x=a[i];const el=document.getElementById('wb-ghost-name');if(x&&el)el.value=x}
wbMakeGhostNode=async function(){
  const g=WB.ghostText;if(!g)return;const el=document.getElementById('wb-ghost-name');const name=String(el?.value||g.text||'').trim();if(!name)return toast('Type or choose a word first');
  const gid=ensure(name,{}),d=byId(gid);if(g.cls&&d&&!d.cls)d.cls=g.cls;wbLinkBoardNode(gid,g.bounds,g.strokeIds,{kind:'node',auto:true});WB.ghostText=null;await save();refresh();render();toast(`Created / linked ${termOf(gid)}`)
};

/* ==================== INK TRAINER ====================
   Personal examples are stored in G.whiteboard.training.samples. They are used
   as lightweight local prototypes before slower handwriting OCR. Whiteboard
   lasso confirmations also feed this set automatically. */
let WT={strokes:[],active:null,tool:'pen',raf:0,lastResult:''};
const WT_CATS=[
  ['letter','Letter / symbol'],['letter_pair','Letter pair'],['letter_trio','Letter trio'],['word','Word / medical term'],['node','Node handwriting'],
  ['node_enclosure','Node circle / box'],['relationship_arrow','Relationship arrow'],
  ['sequence_arrow','Sequence / process arrow'],['relationship_label','Relationship label'],
  ['definition','Definition / ::'],['class','Class / [drug]'],
  ['sequence_step','Numbered sequence step'],['sequence_block','Whole numbered process']
];
function openTrainer(){view={mode:'trainer'};render()}
function wtTraining(){const W=wbV4Data();W.training=W.training||{};W.training.arrowPos=W.training.arrowPos||[];W.training.arrowNeg=W.training.arrowNeg||[];W.training.nodePos=W.training.nodePos||[];W.training.nodeNeg=W.training.nodeNeg||[];W.training.samples=W.training.samples||[];return W.training}
function wtSamples(){return wtTraining().samples}
function wtCatLabel(k){return (WT_CATS.find(x=>x[0]===k)||[k,k])[1]}
function wtIsTextCat(k){return !['node_enclosure','relationship_arrow','sequence_arrow'].includes(k)}
function wtCounts(){const a=wtSamples();return{all:a.length,text:a.filter(x=>wtIsTextCat(x.category)).length,shape:a.filter(x=>!wtIsTextCat(x.category)).length}}
function trainerHTML(){const T=wtSamples(),C=wtCounts(),recent=T.slice(-60).reverse();return `<div class="panel">
  <div class="panel-h"><span style="width:10px;height:10px;border-radius:50%;background:#6B46C1"></span><h2>Whiteboard Ink Trainer</h2><span class="hint" style="margin-left:auto">Apple Pencil · Surface Pen · touch · mouse</span></div>
  <div class="trainergrid"><div>
    <div class="trainerbar">
      <div class="fld"><label class="eyebrow">Train as</label><select id="wt-cat" onchange="wtCategoryChanged()">${WT_CATS.map(([k,l])=>`<option value="${k}">${esc(l)}</option>`).join('')}</select></div>
      <div class="fld" id="wt-label-wrap"><label class="eyebrow">What you wrote</label><input id="wt-label" placeholder="A, vancomycin, inhibits, 1. wash hands…"></div>
      <button class="btn" onclick="wtSaveExample()">Save example</button>
      <button class="mini" onclick="wtUndo()">Undo stroke</button><button class="mini x" onclick="wtClear()">Clear pad</button>
    </div>
    <div class="trainercanvaswrap"><canvas id="trainer-canvas" width="1100" height="430"></canvas></div>
    <div class="notice" style="margin-bottom:8px"><b>Open vocabulary:</b> handwriting can resolve to a word that has never appeared in MedGraph. Existing terms only help rerank close guesses. Any node-name field also accepts a completely new typed word or phrase.</div><div class="trainerhint"><b>How it learns:</b> draw one example, label it, save it. Confirming/lassoing ink on the real Whiteboard also adds training examples automatically. Text examples are matched locally before OCR; node circles and arrows also feed the geometric classifiers. Relationship arrows and sequence arrows are stored separately.</div>
    <div class="wbedit" id="wt-test" style="display:${WT.lastResult?'block':'none'}">${WT.lastResult?esc(WT.lastResult):''}</div>
  </div><div>
    <div class="trainerstats"><div class="trainerstat"><b>${C.all}</b><span>examples</span></div><div class="trainerstat"><b>${C.text}</b><span>text</span></div><div class="trainerstat"><b>${C.shape}</b><span>shapes</span></div></div>
    <div class="gutter"><span class="eyebrow">Recent training</span>${T.length?`<button class="mini x" onclick="wtResetTraining()">Reset trainer</button>`:''}</div>
    <div class="trainerlist">${recent.length?recent.map(x=>`<div class="trainerrow"><div class="txt"><b>${esc(x.label||wtCatLabel(x.category))}</b><span>${esc(wtCatLabel(x.category))}${x.source==='whiteboard'?' · learned from whiteboard':''}</span></div><button class="mini x" onclick="wtDelete('${x.id}')">×</button></div>`).join(''):'<div class="empty" style="padding:20px 0">No examples yet.</div>'}</div>
  </div></div></div>`}
function wtCategoryChanged(){const k=document.getElementById('wt-cat')?.value||'letter',w=document.getElementById('wt-label-wrap');if(w)w.style.display=wtIsTextCat(k)?'':'none'}
function wtCanvas(){return document.getElementById('trainer-canvas')}
function wtPoint(e,c){const r=c.getBoundingClientRect();return{x:(e.clientX-r.left)*(c.width/r.width),y:(e.clientY-r.top)*(c.height/r.height),p:e.pressure&&e.pressure>0?e.pressure:.5,t:performance.now()}}
function wtPaint(){const c=wtCanvas();if(!c)return;const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#E8EDF2';for(let xx=20;xx<c.width;xx+=20)for(let yy=20;yy<c.height;yy+=20)x.fillRect(xx,yy,1,1);const all=WT.active?[...WT.strokes,WT.active]:WT.strokes;all.forEach(st=>wbDrawStrokeTo(x,st));WT.raf=0}
function wtReq(){if(!WT.raf)WT.raf=requestAnimationFrame(wtPaint)}
function initTrainer(){wtCategoryChanged();const c=wtCanvas();if(!c||c._trainerInit)return;c._trainerInit=true;wtPaint();
  c.addEventListener('pointerdown',e=>{if(e.cancelable)e.preventDefault();try{c.setPointerCapture(e.pointerId)}catch(_){};WT.active={id:uid('wtt'),pointerId:e.pointerId,pts:[wtPoint(e,c)],color:'#12171C',width:e.pointerType==='pen'?2.2:2.5,created:Date.now()};wtReq()});
  c.addEventListener('pointermove',e=>{if(e.cancelable)e.preventDefault();if(!WT.active||WT.active.pointerId!==e.pointerId)return;const evs=e.getCoalescedEvents?e.getCoalescedEvents():[e];for(const q of evs){const p=wtPoint(q,c),a=WT.active.pts[WT.active.pts.length-1];if(!a||Math.hypot(p.x-a.x,p.y-a.y)>.7)WT.active.pts.push(p)}wtReq()});
  const up=e=>{if(!WT.active||WT.active.pointerId!==e.pointerId)return;if(e.cancelable)e.preventDefault();const st=WT.active;WT.active=null;if(st.pts.length>1){st.b=wbBounds(st.pts);WT.strokes.push(st)}wtReq()};c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up)
}
function wtUndo(){WT.strokes.pop();wtReq()}
function wtClear(){WT.strokes=[];WT.active=null;WT.lastResult='';wtReq();const e=document.getElementById('wt-test');if(e)e.style.display='none'}
function wtSparseSignature(strokes){if(!strokes||!strokes.length)return[];const b=wbUnionBounds(strokes.map(wbStrokeBounds));if(!b.w&&!b.h)return[];const N=24,c=document.createElement('canvas');c.width=N;c.height=N;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,N,N);x.strokeStyle='#000';x.lineCap='round';x.lineJoin='round';x.lineWidth=1.7;const sc=Math.min((N-4)/Math.max(1,b.w),(N-4)/Math.max(1,b.h)),ox=(N-b.w*sc)/2,oy=(N-b.h*sc)/2;strokes.forEach(st=>{const p=st.pts||[];if(p.length<2)return;x.beginPath();p.forEach((q,i)=>{const xx=ox+(q.x-b.x)*sc,yy=oy+(q.y-b.y)*sc;i?x.lineTo(xx,yy):x.moveTo(xx,yy)});x.stroke()});const d=x.getImageData(0,0,N,N).data,out=[];for(let i=0;i<N*N;i++)if(d[i*4]<210)out.push(i);return out}
function wtSigSim(a,b){if(!a?.length||!b?.length)return 0;const A=new Set(a),B=new Set(b);let inter=0;A.forEach(v=>{if(B.has(v))inter++});return inter/Math.max(1,A.size+B.size-inter)}
function wtCompactStrokes(strokes){if(!strokes?.length)return[];const b=wbUnionBounds(strokes.map(wbStrokeBounds));const den=Math.max(1,b.w,b.h);return strokes.map(st=>({pts:(st.pts||[]).filter((_,i)=>i%Math.max(1,Math.floor((st.pts||[]).length/80))===0).slice(0,90).map(p=>[+( (p.x-b.x)/den).toFixed(3),+( (p.y-b.y)/den).toFixed(3)])}))}
function wtStoreExample(category,label,strokes,meta={},source='trainer'){if(!strokes?.length)return null;const sample={id:uid('wtex'),category,label:String(label||'').trim(),sig:wtSparseSignature(strokes),strokes:wtCompactStrokes(strokes),meta,source,created:Date.now()};const T=wtSamples();T.push(sample);if(T.length>1200)T.splice(0,T.length-1200);return sample}
function wtArrowFeatureFromStrokes(strokes){if(!strokes?.length)return null;let shaft=null,qbest=null;strokes.forEach(st=>{const q=wbLineInfo(st);if(q&&q.len>35&&(!qbest||q.len*q.ratio>qbest.len*qbest.ratio)){shaft=st;qbest=q}});if(!shaft||!qbest)return null;const others=strokes.filter(x=>x!==shaft);let head=0;for(const st of others){const p=st.pts||[];if(p.length<2)continue;for(const end of [qbest.a,qbest.b]){const d=Math.min(Math.hypot(p[0].x-end.x,p[0].y-end.y),Math.hypot(p[p.length-1].x-end.x,p[p.length-1].y-end.y));if(d<35)head=Math.max(head,1-Math.min(1,d/35))}}return[qbest.ratio,head,Math.min(1,others.length/2),Math.min(1,qbest.len/300),strokes.length===1?1:0]}
async function wtSaveExample(){if(!WT.strokes.length)return toast('Draw an example first');const cat=document.getElementById('wt-cat')?.value||'letter',label=(document.getElementById('wt-label')?.value||'').trim();if(wtIsTextCat(cat)&&!label)return toast('Label what you wrote first');wtStoreExample(cat,label||wtCatLabel(cat),WT.strokes,{},'trainer');if(cat==='node_enclosure'){const st=[...WT.strokes].sort((a,b)=>wbStrokeLen(b)-wbStrokeLen(a))[0],info=st&&wbEnclosureInfo(st);if(info)wbTrain('node',info.feat,true)}if(cat==='relationship_arrow'||cat==='sequence_arrow'){const f=wtArrowFeatureFromStrokes(WT.strokes);if(f)wbTrain('arrow',f,true)}await save();WT.lastResult=`Saved ${wtCatLabel(cat)}${label?`: ${label}`:''}. This example is now available to Whiteboard recognition.`;WT.strokes=[];render()}
function wtDelete(id){const T=wtSamples(),i=T.findIndex(x=>x.id===id);if(i>=0)T.splice(i,1);save();render()}
async function wtResetTraining(){if(!confirm('Delete all personal Ink Trainer examples?\n\nThis does not delete your MedGraph or whiteboard notes.'))return;const T=wtTraining();T.samples=[];T.arrowPos=[];T.arrowNeg=[];T.nodePos=[];T.nodeNeg=[];await save();render()}
function wtAllowedCats(mode){if(mode==='relation')return new Set(['relationship_label','relationship_arrow']);if(mode==='node')return new Set(['letter','word','node','class','definition','sequence_step','sequence_block']);return new Set(['letter','word','node','relationship_label','definition','class','sequence_step','sequence_block'])}
function wtPrototypeMatches(strokes,mode){const sig=wtSparseSignature(strokes),allow=wtAllowedCats(mode),arr=[];for(const x of wtSamples()){if(!allow.has(x.category)||!x.label||!x.sig?.length)continue;const score=wtSigSim(sig,x.sig);if(score>=.28)arr.push({label:x.label,score,category:x.category})}arr.sort((a,b)=>b.score-a.score);const seen=new Set();return arr.filter(x=>{const k=canon(x.label);if(seen.has(k))return false;seen.add(k);return true}).slice(0,4)}

/* Put personal prototypes in front of browser/TrOCR guesses. A very close match
   avoids the expensive model entirely, which also helps the laggy-board case. */
const _wbRecognizeStrokesTrainerBase=wbRecognizeStrokes;
wbRecognizeStrokes=async function(strokes,mode='node'){
  const P=wtPrototypeMatches(strokes,mode);if(P[0]?.score>=.72)return{guesses:P.map(x=>x.label),engine:'your Ink Trainer'};
  const base=await _wbRecognizeStrokesTrainerBase(strokes,mode),g=P.filter(x=>x.score>=.38).map(x=>x.label);for(const x of (base.guesses||[]))if(!g.some(y=>canon(y)===canon(x)))g.push(x);return{guesses:g.slice(0,6),engine:P[0]?.score>=.38?(base.engine?`Ink Trainer + ${base.engine}`:'your Ink Trainer'):base.engine}
};
function wtAutoFromWhiteboard(category,label,ids,meta={}){const st=(ids||[]).map(wbStroke).filter(Boolean);if(!st.length)return;wtStoreExample(category,label,st,meta,'whiteboard');wbSaveSoon()}

/* Confirmed Whiteboard semantics automatically become personal training data. */
const _wtNode=wbCommitLassoNode;wbCommitLassoNode=async function(){const s=WB.selection&&{ids:[...WB.selection.strokeIds],label:(document.getElementById('wb-sel-node')?.value||WB.selection.guess||'').trim()};await _wtNode();if(s?.label)wtAutoFromWhiteboard('node',s.label,s.ids)};
const _wtDef=wbCommitLassoDefinition;wbCommitLassoDefinition=async function(){const s=WB.selection&&{ids:[...WB.selection.strokeIds],label:(document.getElementById('wb-def-text')?.value||'').trim()};await _wtDef();if(s?.label)wtAutoFromWhiteboard('definition',s.label,s.ids)};
const _wtClass=wbCommitLassoClass;wbCommitLassoClass=async function(){const s=WB.selection&&{ids:[...WB.selection.strokeIds],label:'['+(document.getElementById('wb-class-value')?.value||'class')+']'};await _wtClass();if(s)wtAutoFromWhiteboard('class',s.label,s.ids)};
const _wtRel=wbCommitLassoRelationship;wbCommitLassoRelationship=async function(){const s=WB.selection&&{ids:[...WB.selection.strokeIds],label:phrase(document.getElementById('wb-sel-rel')?.value||WB.rel)};await _wtRel();if(s)wtAutoFromWhiteboard('relationship_label',s.label,s.ids)};
const _wtStep=wbCommitLassoSequenceStep;wbCommitLassoSequenceStep=async function(){const s=WB.selection&&{ids:[...WB.selection.strokeIds],label:(document.getElementById('wb-step-text')?.value||'').trim()};await _wtStep();if(s?.label)wtAutoFromWhiteboard('sequence_step',s.label,s.ids)};
const _wtSeqArrow=wbCommitLassoSequenceConnector;wbCommitLassoSequenceConnector=async function(){const s=WB.selection&&{ids:[...WB.selection.strokeIds]};await _wtSeqArrow();if(s)wtAutoFromWhiteboard('sequence_arrow','sequence arrow',s.ids)};
const _wtBlock=wbCommitLassoSequenceBlock;wbCommitLassoSequenceBlock=async function(){const s=WB.selection&&{ids:[...WB.selection.strokeIds],label:(document.getElementById('wb-block-text')?.value||'').trim()};await _wtBlock();if(s?.label)wtAutoFromWhiteboard('sequence_block',s.label,s.ids)};
const _wtPendingNode=wbAcceptPendingNode;wbAcceptPendingNode=async function(){const p=WB.pendingNode&&{ids:[...WB.pendingNode.strokeIds,WB.pendingNode.boundaryId],label:(document.getElementById('wb-pnode-name')?.value||WB.pendingNode.name||'').trim()};await _wtPendingNode();if(p?.label)wtAutoFromWhiteboard('node',p.label,p.ids)};
const _wtDetectedArrow=wbAcceptDetectedArrow;wbAcceptDetectedArrow=async function(){const c=WB.pendingArrow&&{ids:[...(WB.pendingArrow.ids||[])],kind:(document.getElementById('wb-pending-kind')?.value||WB.pendingArrow.kind||'relationship'),rel:(document.getElementById('wb-pending-rel')?.value||WB.pendingArrow.rel||'causes')};await _wtDetectedArrow();if(c)wtAutoFromWhiteboard(c.kind==='sequence'?'sequence_arrow':'relationship_arrow',c.kind==='sequence'?'sequence arrow':phrase(c.rel),c.ids,{edgeKind:c.kind})};



/* ==================== V7 ADAPTIVE INK + INFINITE CANVAS ====================
   - Infinite canvas is virtual: ink lives in unbounded world coordinates while
     the visible canvas is only the viewport, so notes can extend in any direction.
   - Personal training uses a small online k-NN stroke classifier over normalized
     geometry features. It learns circle/box, relationship-arrow, sequence-arrow,
     ::, class, etc. from trainer samples and Whiteboard corrections.
   - Text still uses browser/TrOCR recognition, but corrections build a personal
     lexicon/confusion memory. Word labels also create low-weight per-letter
     prototypes, so writing words contributes to letter learning over time. */

function wbCamera(){const W=wbV4Data();W.view=W.view||{x:0,y:0,zoom:1};if(!Number.isFinite(W.view.x))W.view.x=0;if(!Number.isFinite(W.view.y))W.view.y=0;if(!Number.isFinite(W.view.zoom))W.view.zoom=1;W.view.zoom=Math.max(.25,Math.min(4,W.view.zoom));return W.view}
function wbZoomBy(f,cx,cy){const c=wbCanvas();if(!c)return;const V=wbCamera(),r=c.getBoundingClientRect(),sx=cx==null?r.width/2:cx-r.left,sy=cy==null?r.height/2:cy-r.top,wx=V.x+sx/V.zoom,wy=V.y+sy/V.zoom;V.zoom=Math.max(.25,Math.min(4,V.zoom*f));V.x=wx-sx/V.zoom;V.y=wy-sy/V.zoom;wbRequestPaint();wbSaveSoon();wbUpdateZoomLabel()}
function wbResetView(){const V=wbCamera();V.x=0;V.y=0;V.zoom=1;wbRequestPaint();wbSaveSoon();wbUpdateZoomLabel()}
function wbUpdateZoomLabel(){const e=document.getElementById('wb-zoom-val');if(e)e.textContent=Math.round(wbCamera().zoom*100)+'%'}
function wbPoint(e,c){const r=c.getBoundingClientRect(),V=wbCamera();return{x:V.x+(e.clientX-r.left)/V.zoom,y:V.y+(e.clientY-r.top)/V.zoom,p:e.pressure&&e.pressure>0?e.pressure:.5,t:performance.now()}}
function wbResizeViewport(){const c=wbCanvas();if(!c)return;const r=c.getBoundingClientRect(),d=Math.max(1,Math.min(2,window.devicePixelRatio||1)),w=Math.max(1,Math.round(r.width*d)),h=Math.max(1,Math.round(r.height*d));if(c.width!==w||c.height!==h){c.width=w;c.height=h;c._dpr=d}wbRequestPaint()}
function wbVisibleBounds(){const c=wbCanvas(),V=wbCamera();if(!c)return{x:-1e9,y:-1e9,w:2e9,h:2e9};const r=c.getBoundingClientRect(),pad=100/V.zoom;return{x:V.x-pad,y:V.y-pad,w:r.width/V.zoom+2*pad,h:r.height/V.zoom+2*pad}}
function wbBoxHit(a,b){return a.x<=b.x+b.w&&a.x+a.w>=b.x&&a.y<=b.y+b.h&&a.y+a.h>=b.y}
function wbWorldTransform(ctx){const c=wbCanvas(),V=wbCamera(),d=c?c._dpr||Math.max(1,Math.min(2,window.devicePixelRatio||1)):1;ctx.setTransform(d*V.zoom,0,0,d*V.zoom,-V.x*d*V.zoom,-V.y*d*V.zoom)}
function wbPaintGrid(ctx){const c=wbCanvas(),V=wbCamera(),d=c._dpr||1,r=c.getBoundingClientRect(),z=V.zoom;ctx.setTransform(d,0,0,d,0,0);ctx.fillStyle='#fff';ctx.fillRect(0,0,r.width,r.height);const step=z<.45?100:z<.8?40:20,px=step*z;ctx.fillStyle='#E8EDF2';let x0=(((-V.x)%step)+step)%step*z,y0=(((-V.y)%step)+step)%step*z;for(let x=x0;x<r.width;x+=px)for(let y=y0;y<r.height;y+=px)ctx.fillRect(Math.round(x),Math.round(y),z>1.7?1.5:1,z>1.7?1.5:1)}

/* final whiteboard renderer: viewport-only + spatial culling. */
wbPaint=function(){const c=wbCanvas();if(!c)return;const ctx=c.getContext('2d'),W=wbV4Data(),vis=wbVisibleBounds();wbPaintGrid(ctx);wbWorldTransform(ctx);
  for(const st of W.strokes){if(wbBoxHit(wbStrokeBounds(st),vis))wbDrawStrokeTo(ctx,st)}
  for(const a of W.arrows){const A=wbNode(a.from),B=wbNode(a.to);if(A&&B&&(wbBoxHit(A,vis)||wbBoxHit(B,vis)))wbDrawArrow(ctx,A,B,a.kind==='sequence'?'next':phrase(a.relation||'causes'),false)}
  for(const n of W.nodes){if(!wbBoxHit(n,vis))continue;ctx.save();ctx.strokeStyle=WB.selectedNode===n.id?'#0F766E':(n.kind==='step'?'#6B46C1':'#94A3B8');ctx.setLineDash(n.kind==='step'?[3,3]:[5,4]);ctx.lineWidth=(WB.selectedNode===n.id?2:1)/wbCamera().zoom;ctx.strokeRect(n.x-5,n.y-5,n.w+10,n.h+10);ctx.setLineDash([]);const txt=n.kind==='step'?`${n.stepOrder||'?'} · ${wbItemText(n)}`:wbItemText(n);ctx.font=`${11/wbCamera().zoom}px IBM Plex Mono, monospace`;const tw=Math.min(360/wbCamera().zoom,ctx.measureText(txt).width+12/wbCamera().zoom);ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(n.x-5,n.y-24/wbCamera().zoom,tw,18/wbCamera().zoom);ctx.fillStyle=n.kind==='step'?'#6B46C1':'#0F766E';ctx.fillText(txt,n.x+1,n.y-11/wbCamera().zoom);ctx.restore()}
  for(const a of (W.annotations||[])){const b={x:a.x,y:a.y,w:a.w||1,h:a.h||1};if(!wbBoxHit(b,vis))continue;ctx.save();ctx.font=`${10.5/wbCamera().zoom}px IBM Plex Mono, monospace`;const tag=a.kind==='definition'?'::':a.kind==='class'?a.text:a.kind==='relationship'?`rel: ${a.text}`:a.kind==='sequence_block'?a.text:a.kind==='sequence_step'?a.text:a.kind==='sequence_connector'?a.text:'';if(tag){const tw=Math.min(320/wbCamera().zoom,ctx.measureText(tag).width+10/wbCamera().zoom),y=a.y+a.h+7/wbCamera().zoom;ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(a.x,y,tw,16/wbCamera().zoom);ctx.fillStyle=a.kind.startsWith('sequence')?'#6B46C1':'#475569';ctx.fillText(tag,a.x+4/wbCamera().zoom,y+12/wbCamera().zoom)}ctx.restore()}
  if(WB.ghostText&&WB.ghostText.text){const b=WB.ghostText.bounds;if(wbBoxHit(b,vis)){ctx.save();ctx.font=`${11/wbCamera().zoom}px IBM Plex Mono, monospace`;ctx.fillStyle='rgba(15,118,110,.78)';ctx.fillText('≈ '+WB.ghostText.text,b.x,b.y+b.h+16/wbCamera().zoom);ctx.restore()}}
  if(WB.pendingArrow){ctx.save();ctx.strokeStyle=WB.pendingArrow.kind==='sequence'?'#6B46C1':'#B45309';ctx.setLineDash([6/wbCamera().zoom,4/wbCamera().zoom]);ctx.lineWidth=2/wbCamera().zoom;ctx.beginPath();ctx.moveTo(WB.pendingArrow.tail.x,WB.pendingArrow.tail.y);ctx.lineTo(WB.pendingArrow.tip.x,WB.pendingArrow.tip.y);ctx.stroke();ctx.restore()}
  if(WB.active&&WB.active.kind==='stroke')wbDrawStrokeTo(ctx,WB.active);
  if(WB.active&&WB.active.kind==='arrow'){const A=wbNearestNode(WB.active.start,9999),B=wbNearestNode(WB.active.end,9999);if(A&&B&&A.id!==B.id){const k=wbInferEdgeKind(A.id,B.id,wbEdgeKindValue());wbDrawArrow(ctx,A,B,k==='sequence'?'next':phrase(wbRelValue()),true)}else{ctx.strokeStyle='#64748B';ctx.lineWidth=2/wbCamera().zoom;ctx.beginPath();ctx.moveTo(WB.active.start.x,WB.active.start.y);ctx.lineTo(WB.active.end.x,WB.active.end.y);ctx.stroke()}}
  if(WB.lasso&&WB.lasso.length>1){ctx.strokeStyle='#0F766E';ctx.lineWidth=1.5/wbCamera().zoom;ctx.setLineDash([6/wbCamera().zoom,4/wbCamera().zoom]);ctx.beginPath();WB.lasso.forEach((q,i)=>i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y));ctx.stroke();ctx.setLineDash([])}
  if(WB.selection){const b=WB.selection.bounds;ctx.strokeStyle='#0F766E';ctx.lineWidth=1.5/wbCamera().zoom;ctx.setLineDash([6/wbCamera().zoom,4/wbCamera().zoom]);ctx.strokeRect(b.x-5,b.y-5,b.w+10,b.h+10);ctx.setLineDash([])}
  ctx.setTransform(1,0,0,1,0,0)
};

const _wbHTMLv6=whiteboardHTML;
whiteboardHTML=function(){let h=_wbHTMLv6();h=h.replace('<div class="wbscroll" id="wb-scroll"><canvas id="wb-canvas" width="1600" height="1000"></canvas></div>',`<div class="wbscroll" id="wb-scroll"><canvas id="wb-canvas"></canvas><div class="wbcorner">infinite canvas · pan anywhere</div></div>`);h=h.replace('<button class="mini" onclick="wbSmartScan()">Smart scan</button>',`<button class="mini" onclick="wbSmartScan()">Smart scan</button><span class="wbzoom"><button onclick="wbZoomBy(.8)">−</button><span class="zval" id="wb-zoom-val">${Math.round(wbCamera().zoom*100)}%</span><button onclick="wbZoomBy(1.25)">+</button><button onclick="wbResetView()">⌂</button></span>`);return h};

/* allow semantic items anywhere in world coordinates, including negative x/y. */
wbLinkBoardNode=function(gid,b,strokeIds,extra){const pad=8,n={id:uid('wbn'),graphId:gid||null,x:b.x-pad,y:b.y-pad,w:Math.max(54,b.w+pad*2),h:Math.max(28,b.h+pad*2),strokeIds:[...(strokeIds||[])],created:Date.now(),...(extra||{})};wbV4Data().nodes.push(n);return n};

/* override the two auto-link paths that previously clamped nodes to the old fixed canvas. */
wbAcceptPendingNode=async function(){const p=WB.pendingNode;if(!p)return;const inp=document.getElementById('wb-pnode-name'),sel=document.getElementById('wb-pnode-cls'),name=(inp&&inp.value||p.name||'').trim();if(!name)return toast('Need a node name');const gid=ensure(name,{}),d=byId(gid),cls=sel&&sel.value;if(cls&&d&&!d.cls)d.cls=cls;const b=p.bounds,ids=[...p.strokeIds,p.boundaryId];wbLinkBoardNode(gid,b,ids,{kind:'node',auto:true});const bs=wbStroke(p.boundaryId);if(bs)bs.role='node-boundary';wbTrain('node',p.feat,true);WB.pendingNode=null;WB.ghostText=null;bump();await save();refresh();render();toast(`Linked ${termOf(gid)}`)};
wbMakeGhostNode=async function(){const g=WB.ghostText;if(!g||!g.text)return;const gid=ensure(g.text,{}),d=byId(gid);if(g.cls&&d&&!d.cls)d.cls=g.cls;wbLinkBoardNode(gid,g.bounds,g.strokeIds,{kind:'node',auto:true});WB.ghostText=null;await save();refresh();render();toast(`Linked ${termOf(gid)}`)};

/* virtual panning: no scroll extents, so there is no edge to hit. */
initWhiteboard=function(){const c=wbCanvas();if(!c||c._wbInit)return;c._wbInit=true;wbV4Data();wbResizeViewport();wbUpdateStatus();wbUpdateZoomLabel();
  const ro=('ResizeObserver'in window)?new ResizeObserver(()=>wbResizeViewport()):null;if(ro)ro.observe(c.parentElement);else window.addEventListener('resize',wbResizeViewport,{passive:true});
  c.addEventListener('contextmenu',e=>e.preventDefault());
  c.addEventListener('wheel',e=>{if(e.cancelable)e.preventDefault();const V=wbCamera();if(e.ctrlKey||e.metaKey){wbZoomBy(Math.exp(-e.deltaY*.0015),e.clientX,e.clientY)}else{V.x+=e.deltaX/V.zoom;V.y+=e.deltaY/V.zoom;wbRequestPaint();clearTimeout(WB._viewSave);WB._viewSave=setTimeout(wbSaveSoon,400)}},{passive:false});
  c.addEventListener('pointerdown',e=>{if(e.cancelable)e.preventDefault();const p=wbPoint(e,c);try{c.setPointerCapture(e.pointerId)}catch(_){};const touch=e.pointerType==='touch';if(WB.tool==='pan'||e.button===1||(touch&&WB.tool==='pen'&&!WB.fingerInk)){const V=wbCamera();WB.pan={id:e.pointerId,x:e.clientX,y:e.clientY,cx:V.x,cy:V.y};return}if(WB.tool==='pen'){clearTimeout(WB.wordTimer);WB.ghostText=null;MG_V8_RECOG_SERIAL++;WB.active={kind:'stroke',pointerId:e.pointerId,id:uid('wbs'),pts:[p],color:'#12171C',width:e.pointerType==='pen'?2.1:2.3,created:Date.now(),pointerType:e.pointerType||'mouse'}}else if(WB.tool==='lasso'){WB.lasso=[p];WB.selection=null;WB.selectedNode=null}else if(WB.tool==='arrow')WB.active={kind:'arrow',pointerId:e.pointerId,start:p,end:p};else if(WB.tool==='eraser')wbEraseAt(p);wbRequestPaint()});
  c.addEventListener('pointermove',e=>{if(e.cancelable)e.preventDefault();if(WB.pan&&WB.pan.id===e.pointerId){const V=wbCamera();V.x=WB.pan.cx-(e.clientX-WB.pan.x)/V.zoom;V.y=WB.pan.cy-(e.clientY-WB.pan.y)/V.zoom;wbRequestPaint();return}const p=wbPoint(e,c);if(WB.active&&WB.active.kind==='stroke'&&WB.active.pointerId===e.pointerId)wbAddPointerPoints(WB.active,e,c);else if(WB.lasso){const a=WB.lasso[WB.lasso.length-1];if(Math.hypot(p.x-a.x,p.y-a.y)>2.5/wbCamera().zoom)WB.lasso.push(p)}else if(WB.active&&WB.active.kind==='arrow'&&WB.active.pointerId===e.pointerId)WB.active.end=p;else if(WB.tool==='eraser'&&e.buttons)wbEraseAt(p);wbRequestPaint()});
  c.addEventListener('pointerup',async e=>{if(e.cancelable)e.preventDefault();try{if(c.hasPointerCapture&&c.hasPointerCapture(e.pointerId))c.releasePointerCapture(e.pointerId)}catch(_){};if(WB.pan&&WB.pan.id===e.pointerId){WB.pan=null;wbSaveSoon();return}if(WB.active&&WB.active.kind==='stroke'&&WB.active.pointerId===e.pointerId){wbAddPointerPoints(WB.active,e,c);const st=WB.active;WB.active=null;if(st.pts.length>1){st.b=wbBounds(st.pts);wbV4Data().strokes.push(st);wbSaveSoon();wbRequestPaint();wbUpdateStatus();setTimeout(()=>wbSmartAfterStroke(st),40)}return}if(WB.lasso){const poly=WB.lasso;WB.lasso=null;const captured=wbCaptureSelection(poly),node=wbV4Data().nodes.find(n=>wbInPoly({x:n.x+n.w/2,y:n.y+n.h/2},poly));if(captured){WB.selection=captured;WB.selectedNode=null;render();setTimeout(()=>wbRecognizeSelection(),20)}else if(node){WB.selectedNode=node.id;WB.selection=null;render()}else{WB.selection=null;WB.selectedNode=null;wbRequestPaint()}return}if(WB.active&&WB.active.kind==='arrow'&&WB.active.pointerId===e.pointerId){const ar=WB.active;WB.active=null,A=wbNearestNode(ar.start,80/wbCamera().zoom),B=wbNearestNode(ar.end,80/wbCamera().zoom);if(A&&B&&A.id!==B.id)await wbCreateArrow(A.id,B.id,wbRelValue(),wbEdgeKindValue());else{toast('Start and finish near two labeled whiteboard items');wbRequestPaint()}return}});
  c.addEventListener('pointercancel',()=>{WB.active=null;WB.lasso=null;WB.pan=null;wbRequestPaint()});
};

/* -------- adaptive online stroke classifier -------- */
function wtLearnState(){const T=wtTraining();T.adaptive=T.adaptive||{corrections:{},charCounts:{},version:1};T.adaptive.corrections=T.adaptive.corrections||{};T.adaptive.charCounts=T.adaptive.charCounts||{};return T.adaptive}
function wtDirHist(strokes,bins=8){const h=Array(bins).fill(0);let total=0;for(const st of strokes){const p=st.pts||[];for(let i=1;i<p.length;i++){const dx=p[i].x-p[i-1].x,dy=p[i].y-p[i-1].y,L=Math.hypot(dx,dy);if(L<.3)continue;let a=Math.atan2(dy,dx);if(a<0)a+=Math.PI*2;const k=Math.min(bins-1,Math.floor(a/(Math.PI*2)*bins));h[k]+=L;total+=L}}return h.map(x=>total?x/total:0)}
function wtTurning(strokes){let sum=0,n=0;for(const st of strokes){const p=st.pts||[];for(let i=2;i<p.length;i++){const a=Math.atan2(p[i-1].y-p[i-2].y,p[i-1].x-p[i-2].x),b=Math.atan2(p[i].y-p[i-1].y,p[i].x-p[i-1].x);let d=Math.abs(b-a);if(d>Math.PI)d=Math.PI*2-d;sum+=d/Math.PI;n++}}return n?sum/n:0}
function wtIntersections(strokes){let hits=0;const seg=[];for(const st of strokes){const p=st.pts||[];const step=Math.max(1,Math.floor(p.length/24));for(let i=step;i<p.length;i+=step)seg.push([p[i-step],p[i]])}function ccw(a,b,c){return(c.y-a.y)*(b.x-a.x)>(b.y-a.y)*(c.x-a.x)}for(let i=0;i<seg.length;i++)for(let j=i+2;j<seg.length&&j<i+30;j++){const [a,b]=seg[i],[c,d]=seg[j];if(ccw(a,c,d)!==ccw(b,c,d)&&ccw(a,b,c)!==ccw(a,b,d))hits++}return Math.min(1,hits/6)}
function wtFeatureVector(strokes){if(!strokes?.length)return[];const b=wbUnionBounds(strokes.map(wbStrokeBounds)),w=Math.max(1,b.w),h=Math.max(1,b.h),diag=Math.hypot(w,h),lens=strokes.map(wbStrokeLen),total=lens.reduce((a,x)=>a+x,0),closure=strokes.map(st=>{const p=st.pts||[];if(p.length<2)return 1;return Math.hypot(p[0].x-p[p.length-1].x,p[0].y-p[p.length-1].y)/Math.max(1,wbStrokeLen(st))}).reduce((a,x)=>a+x,0)/strokes.length,dir=wtDirHist(strokes),arrow=wtArrowFeatureFromStrokes(strokes)||[0,0,0,0,0];return[Math.min(1,strokes.length/12),Math.min(4,w/h)/4,Math.min(4,h/w)/4,Math.min(4,total/diag)/4,Math.min(1,closure),wtTurning(strokes),wtIntersections(strokes),...dir,...arrow]}
function wtFeatureDist(a,b){if(!a?.length||!b?.length)return 9;let s=0,w=0;for(let i=0;i<Math.min(a.length,b.length);i++){const ww=i>=15?1.5:1,d=(a[i]||0)-(b[i]||0);s+=ww*d*d;w+=ww}return Math.sqrt(s/Math.max(1,w))}
function wtTrainableCategory(c){return ['node_enclosure','relationship_arrow','sequence_arrow','definition','class','relationship_label','sequence_step'].includes(c)}
function wtAdaptiveExamples(){return wtSamples().filter(x=>x.features?.length&&wtTrainableCategory(x.category))}
function wtClassifyGesture(strokes,allowed){const f=wtFeatureVector(strokes),arr=[];for(const x of wtAdaptiveExamples()){if(allowed&&!allowed.has(x.category))continue;arr.push({x,d:wtFeatureDist(f,x.features)})}arr.sort((a,b)=>a.d-b.d);const top=arr.slice(0,9),vote={};top.forEach(({x,d})=>{const weight=(x.meta&&x.meta.autoLetter)?0.35:1/(.05+d*d);vote[x.category]=(vote[x.category]||0)+weight});const sum=Object.values(vote).reduce((a,x)=>a+x,0)||1;return Object.entries(vote).sort((a,b)=>b[1]-a[1]).map(([category,v])=>({category,score:v/sum})).slice(0,4)}
function wtRecordCorrection(predicted,correct){predicted=String(predicted||'').trim();correct=String(correct||'').trim();if(!correct)return;const A=wtLearnState();for(const ch of correct.toLowerCase())if(/\p{L}|\d/u.test(ch))A.charCounts[ch]=(A.charCounts[ch]||0)+1;if(predicted&&canon(predicted)!==canon(correct)){const k=canon(predicted);A.corrections[k]=A.corrections[k]||{};A.corrections[k][correct]=(A.corrections[k][correct]||0)+1}}
function wtCorrectionFor(s){const m=wtLearnState().corrections[canon(s||'')];if(!m)return'';return Object.entries(m).sort((a,b)=>b[1]-a[1])[0]?.[0]||''}
function wtAddAutoLetters(label,strokes,parentId){label=String(label||'').trim();const chars=[...label].filter(ch=>/\p{L}|\d/u.test(ch));if(chars.length<2||chars.length>24||!strokes?.length)return;const b=wbUnionBounds(strokes.map(wbStrokeBounds));if(b.w<chars.length*3)return;chars.forEach((ch,i)=>{const x0=b.x+b.w*i/chars.length,x1=b.x+b.w*(i+1)/chars.length,parts=[];for(const st of strokes){const pts=(st.pts||[]).filter(p=>p.x>=x0-2&&p.x<=x1+2);if(pts.length>1)parts.push({...st,pts,b:wbBounds(pts)})}if(parts.length){const sm=wtStoreExample('letter_auto',ch,parts,{autoLetter:true,parentId},'word-segmentation');if(sm){sm.features=wtFeatureVector(parts);sm.meta.autoLetter=true}}})}

const _wtStoreExampleV6=wtStoreExample;
wtStoreExample=function(category,label,strokes,meta={},source='trainer'){const sm=_wtStoreExampleV6(category,label,strokes,meta,source);if(!sm)return sm;sm.features=wtFeatureVector(strokes);if(['word','node','relationship_label','definition','class','sequence_step','sequence_block'].includes(category)){wtRecordCorrection(meta&&meta.predicted,label);wtAddAutoLetters(label,strokes,sm.id)}return sm};

/* include auto-letter samples only for one-character recognition; they are low weight. */
const _wtAllowedCatsV6=wtAllowedCats;
wtAllowedCats=function(mode){const a=_wtAllowedCatsV6(mode);if(mode==='letter')a.add('letter_auto');return a};

/* improved personal text front-end: correction memory > prototypes > OCR > corrected OCR. */
const _wbRecognizeAdaptiveBase=wbRecognizeStrokes;
wbRecognizeStrokes=async function(strokes,mode='node'){let P=wtPrototypeMatches(strokes,mode);if(mode==='letter'){const sig=wtSparseSignature(strokes);for(const x of wtSamples()){if(x.category!=='letter_auto'||!x.sig?.length)continue;const score=wtSigSim(sig,x.sig)*.55;if(score>.2)P.push({label:x.label,score,category:x.category})}P.sort((a,b)=>b.score-a.score)}if(P[0]?.score>=.80)return{guesses:P.map(x=>x.label).slice(0,6),engine:'adaptive personal ink'};const base=await _wbRecognizeAdaptiveBase(strokes,mode),out=[];for(const g of [...P.filter(x=>x.score>=.42).map(x=>x.label),...(base.guesses||[])]){const c=wtCorrectionFor(g),v=c||g;if(v&&!out.some(x=>canon(x)===canon(v)))out.push(v)}return{guesses:out.slice(0,6),engine:P[0]?.score>=.42?`adaptive ink + ${base.engine||'OCR'}`:(base.engine||'OCR')}};

/* gesture classifier assists semantic guesses, but explicit lasso labels remain authoritative. */
const _wbGuessSelectionKindV6=wbGuessSelectionKind;
wbGuessSelectionKind=function(text){const k=_wbGuessSelectionKindV6(text);if(!WB.selection?.strokeIds?.length)return k;const st=WB.selection.strokeIds.map(wbStroke).filter(Boolean),g=wtClassifyGesture(st);if(g[0]?.score>=.72){const m={node_enclosure:'node',relationship_arrow:'relationship',sequence_arrow:'sequence_connector',definition:'definition',class:'class',relationship_label:'relationship',sequence_step:'sequence_step'};return m[g[0].category]||k}return k};

/* When user confirms text, remember both the OCR guess and the correction. */
const _v7CommitNode=wbCommitLassoNode;wbCommitLassoNode=async function(){const pred=WB.selection?.guess||'',correct=(document.getElementById('wb-sel-node')?.value||pred).trim();if(correct)wtRecordCorrection(pred,correct);return _v7CommitNode()};
const _v7CommitDef=wbCommitLassoDefinition;wbCommitLassoDefinition=async function(){const pred=WB.selection?.guess||'',correct=(document.getElementById('wb-def-text')?.value||pred).trim();if(correct)wtRecordCorrection(pred,correct);return _v7CommitDef()};
const _v7CommitStep=wbCommitLassoSequenceStep;wbCommitLassoSequenceStep=async function(){const pred=WB.selection?.guess||'',correct=(document.getElementById('wb-step-text')?.value||pred).trim();if(correct)wtRecordCorrection(pred,correct);return _v7CommitStep()};

/* Trainer UI: expose adaptive learning status and a live classify button. */
const _trainerHTMLv6=trainerHTML;
trainerHTML=function(){let h=_trainerHTMLv6(),A=wtLearnState(),E=wtAdaptiveExamples().length,auto=wtSamples().filter(x=>x.category==='letter_auto').length,corr=Object.keys(A.corrections||{}).length;h=h.replace('<div class="trainerhint">',`<div class="trainerlearn"><div class="trainerstat"><b>${E}</b><span>classifier examples</span></div><div class="trainerstat"><b>${auto}</b><span>letters learned from words</span></div><div class="trainerstat"><b>${corr}</b><span>text corrections</span></div><div class="trainerstat"><b>k-NN</b><span>online gesture model</span></div></div><div class="trainerhint">`);h=h.replace('<button class="btn" onclick="wtSaveExample()">Save example</button>',`<button class="btn" onclick="wtSaveExample()">Save example</button><button class="mini" onclick="wtTestAdaptive()">Test guess</button>`);return h};
function wtTestAdaptive(){if(!WT.strokes.length)return toast('Draw something first');const g=wtClassifyGesture(WT.strokes),p=wtPrototypeMatches(WT.strokes,'node').slice(0,3),msg=[g.length?'Gesture: '+g.map(x=>`${wtCatLabel(x.category)} ${Math.round(x.score*100)}%`).join(' · '):'Gesture: not enough trained examples',p.length?'Text prototypes: '+p.map(x=>`${x.label} ${Math.round(x.score*100)}%`).join(' · '):'Text prototypes: none'].join('<br>');WT.lastResult=msg;const e=document.getElementById('wt-test');if(e){e.style.display='block';e.innerHTML=msg}}

/* Re-wrap trainer save so every manual sample contributes features and relation/
   sequence arrows remain distinct classes instead of sharing only arrowPos. */
wtSaveExample=async function(){if(!WT.strokes.length)return toast('Draw an example first');const cat=document.getElementById('wt-cat')?.value||'letter',label=(document.getElementById('wt-label')?.value||'').trim();if(wtIsTextCat(cat)&&!label)return toast('Label what you wrote first');const sm=wtStoreExample(cat,label||wtCatLabel(cat),WT.strokes,{},'trainer');if(cat==='node_enclosure'){const st=[...WT.strokes].sort((a,b)=>wbStrokeLen(b)-wbStrokeLen(a))[0],info=st&&wbEnclosureInfo(st);if(info)wbTrain('node',info.feat,true)}if(cat==='relationship_arrow'||cat==='sequence_arrow'){const f=wtArrowFeatureFromStrokes(WT.strokes);if(f)wbTrain('arrow',f,true)}await save();WT.lastResult=`Saved ${wtCatLabel(cat)}${label?`: ${label}`:''}. Adaptive classifier updated${sm&&sm.features?.length?' immediately':''}.`;WT.strokes=[];render()};



/* ==================== V8.1 GUIDED INK TRAINER ====================
   Restores the guided "tell me what to draw, then save it" workflow.
   Manual trainer remains available underneath. */
WT.guided = WT.guided || {active:false, queue:[], i:0, set:'alphabet_lower', reps:5, saved:0};

const WT_GUIDED_SETS = [
  ['alphabet_lower','Lowercase alphabet'],
  ['alphabet_upper','Uppercase alphabet'],
  ['digits','Digits 0–9'],
  ['medgraph_symbols','MedGraph symbols'],
  ['shapes_arrows','Circles + arrows'],
  ['mixed_basics','Mixed basics'],
  ['graph_terms','Terms already in MedGraph']
];

function wtGuidedBaseItems(set){
  const letters = s => [...s].map(ch=>({category:'letter',label:ch,prompt:`Write lowercase “${ch}”`}));
  const caps = s => [...s].map(ch=>({category:'letter',label:ch,prompt:`Write uppercase “${ch}”`}));
  if(set==='alphabet_lower') return letters('abcdefghijklmnopqrstuvwxyz');
  if(set==='alphabet_upper') return caps('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  if(set==='digits') return [...'0123456789'].map(ch=>({category:'letter',label:ch,prompt:`Write the digit “${ch}”`}));
  if(set==='medgraph_symbols') return [
    {category:'definition',label:'::',prompt:'Write the definition symbol  ::'},
    {category:'class',label:'[drug]',prompt:'Write  [drug]'},
    {category:'class',label:'[disease]',prompt:'Write  [disease]'},
    {category:'class',label:'[bacterium]',prompt:'Write  [bacterium]'},
    {category:'class',label:'[virus]',prompt:'Write  [virus]'},
    {category:'sequence_step',label:'1.',prompt:'Write a numbered step marker  1.'},
    {category:'sequence_step',label:'2.',prompt:'Write a numbered step marker  2.'},
    {category:'sequence_step',label:'3.',prompt:'Write a numbered step marker  3.'},
    {category:'relationship_label',label:'inhibits',prompt:'Write the relationship label “inhibits”'},
    {category:'relationship_label',label:'activates',prompt:'Write the relationship label “activates”'},
    {category:'relationship_label',label:'causes',prompt:'Write the relationship label “causes”'}
  ];
  if(set==='shapes_arrows') return [
    {category:'node_enclosure',label:'Node circle / box',prompt:'Draw a circle around an imaginary node'},
    {category:'node_enclosure',label:'Node circle / box',prompt:'Draw a box around an imaginary node'},
    {category:'relationship_arrow',label:'Relationship arrow',prompt:'Draw a relationship arrow pointing RIGHT  →'},
    {category:'relationship_arrow',label:'Relationship arrow',prompt:'Draw a relationship arrow pointing LEFT  ←'},
    {category:'relationship_arrow',label:'Relationship arrow',prompt:'Draw a relationship arrow pointing UP  ↑'},
    {category:'relationship_arrow',label:'Relationship arrow',prompt:'Draw a relationship arrow pointing DOWN  ↓'},
    {category:'relationship_arrow',label:'Relationship arrow',prompt:'Draw a relationship arrow pointing diagonally  ↗'},
    {category:'relationship_arrow',label:'Relationship arrow',prompt:'Draw a relationship arrow pointing diagonally  ↙'},
    {category:'sequence_arrow',label:'Sequence / process arrow',prompt:'Draw the arrow you use for PROCEDURE / SEQUENCE order'},
    {category:'sequence_arrow',label:'Sequence / process arrow',prompt:'Draw another sequence arrow in a different direction'}
  ];
  if(set==='mixed_basics'){
    return [
      ...letters('aceimnrstuv'),
      ...[...'0123'].map(ch=>({category:'letter',label:ch,prompt:`Write the digit “${ch}”`})),
      ...wtGuidedBaseItems('medgraph_symbols').slice(0,8),
      ...wtGuidedBaseItems('shapes_arrows')
    ];
  }
  if(set==='graph_terms'){
    const defs=(G.defs||[]).filter(d=>d&&d.term).slice();
    for(let i=defs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[defs[i],defs[j]]=[defs[j],defs[i]]}
    return defs.slice(0,30).map(d=>({category:'word',label:d.term,prompt:`Write the MedGraph term “${d.term}”`}));
  }
  return letters('abcdefghijklmnopqrstuvwxyz');
}

function wtBuildGuidedQueue(set,reps){
  const base=wtGuidedBaseItems(set);
  const q=[];
  for(let r=0;r<reps;r++) for(const item of base) q.push({...item,rep:r+1});
  return q;
}
function wtGuidedItem(){return WT.guided?.queue?.[WT.guided.i]||null}
function wtStartGuided(){
  const set=document.getElementById('wt-guide-set')?.value||WT.guided.set||'alphabet_lower';
  const reps=Math.max(1,parseInt(document.getElementById('wt-guide-reps')?.value||WT.guided.reps||5,10));
  const q=wtBuildGuidedQueue(set,reps);
  if(!q.length){toast(set==='graph_terms'?'Add some MedGraph terms first':'Nothing in this training set');return}
  WT.guided={active:true,queue:q,i:0,set,reps,saved:0};
  WT.strokes=[];WT.active=null;WT.lastResult='';
  render();
}
function wtStopGuided(){WT.guided.active=false;WT.strokes=[];WT.active=null;render()}
function wtSkipGuided(){
  if(!WT.guided.active)return;
  WT.strokes=[];WT.active=null;
  WT.guided.i++;
  if(WT.guided.i>=WT.guided.queue.length){WT.guided.active=false;WT.lastResult=`Guided set finished. Saved ${WT.guided.saved} examples.`}
  render();
}
function wtGuidedSyncControls(){
  const it=wtGuidedItem(); if(!WT.guided.active||!it)return;
  const cat=document.getElementById('wt-cat'),lab=document.getElementById('wt-label');
  if(cat){cat.value=it.category;wtCategoryChanged()}
  if(lab)lab.value=wtIsTextCat(it.category)?it.label:'';
}

const _trainerHTMLv8preGuide = trainerHTML;
trainerHTML=function(){
  let h=_trainerHTMLv8preGuide();
  const g=WT.guided||{}, it=wtGuidedItem(), total=g.queue?.length||0, done=Math.min(g.i||0,total);
  const pct=total?Math.round(done/total*100):0;
  const guide = `<div class="panel" style="margin-bottom:14px;border-width:2px">
    <div class="panel-h" style="margin-bottom:10px">
      <span style="width:10px;height:10px;border-radius:50%;background:#15803D"></span>
      <h2>Guided Training</h2>
      <span class="hint" style="margin-left:auto">MedGraph tells you what to write → you draw it → Save & next</span>
    </div>
    ${g.active&&it ? `
      <div style="border:1px solid var(--line);background:var(--surface2);padding:16px;border-radius:var(--r);margin-bottom:10px">
        <div class="eyebrow">Write this now</div>
        <div style="font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;font-size:25px;font-weight:600;margin:7px 0 4px">${esc(it.prompt)}</div>
        <div class="hint">${esc(wtCatLabel(it.category))} · example ${done+1} of ${total} · repetition ${it.rep}/${g.reps}</div>
        <div style="height:7px;background:var(--line2);margin-top:10px;border-radius:10px;overflow:hidden"><div style="height:100%;width:${pct}%;background:var(--ok)"></div></div>
      </div>
      <div class="actions" style="margin-top:0;padding-top:0;border-top:0">
        <button class="btn" onclick="wtSaveExample()">Save & next</button>
        <button class="mini" onclick="wtSkipGuided()">Skip</button>
        <button class="mini x" onclick="wtStopGuided()">Stop guided session</button>
        <span class="hint" style="margin-left:auto">${g.saved||0} saved this session</span>
      </div>` : `
      <div class="grid2">
        <div class="fld"><label class="eyebrow">Training set</label>
          <select id="wt-guide-set">${WT_GUIDED_SETS.map(([k,l])=>`<option value="${k}" ${g.set===k?'selected':''}>${esc(l)}</option>`).join('')}</select>
        </div>
        <div class="fld"><label class="eyebrow">Examples per item</label>
          <select id="wt-guide-reps">${[3,5,10,20].map(n=>`<option value="${n}" ${Number(g.reps||5)===n?'selected':''}>${n}×</option>`).join('')}</select>
        </div>
      </div>
      <div class="actions"><button class="btn" onclick="wtStartGuided()">Start guided training</button>
      <span class="hint">For words, use “Terms already in MedGraph”; you do not need to train every medical word individually.</span></div>`}
  </div>`;
  h = guide + h;
  return h;
};

const _initTrainerV8preGuide=initTrainer;
initTrainer=function(){
  _initTrainerV8preGuide();
  wtGuidedSyncControls();
};

const _wtSaveExampleV8preGuide=wtSaveExample;
wtSaveExample=async function(){
  if(!WT.guided?.active) return _wtSaveExampleV8preGuide();
  const it=wtGuidedItem();
  if(!it)return;
  if(!WT.strokes.length)return toast('Draw the requested example first');
  const sm=wtStoreExample(it.category,it.label,WT.strokes,{guided:true,set:WT.guided.set,rep:it.rep},'guided-trainer');
  if(it.category==='node_enclosure'){
    const st=[...WT.strokes].sort((a,b)=>wbStrokeLen(b)-wbStrokeLen(a))[0],info=st&&wbEnclosureInfo(st);
    if(info)wbTrain('node',info.feat,true);
  }
  if(it.category==='relationship_arrow'||it.category==='sequence_arrow'){
    const f=wtArrowFeatureFromStrokes(WT.strokes);
    if(f)wbTrain('arrow',f,true);
  }
  WT.guided.saved=(WT.guided.saved||0)+1;
  WT.guided.i++;
  WT.strokes=[];WT.active=null;
  if(WT.guided.i>=WT.guided.queue.length){
    const n=WT.guided.saved;
    WT.guided.active=false;
    WT.lastResult=`Guided training complete — saved ${n} examples.`;
    await save();render();toast(`Guided training complete: ${n} examples`);return;
  }
  await save();
  render();
};



/* ==================== V8.2 WORD RECOGNITION FIX ====================
   Problem fixed:
   - a whole handwritten word was being compared against single-letter prototypes,
     so one trained letter could win for the entire selection.
   New behavior:
   1) whole-word/node prototypes are compared only against other whole words
   2) trained letters are used as COMPONENTS of a word
   3) segmented letter guesses are combined into a candidate word
   4) that candidate is biased toward existing MedGraph vocabulary
*/

function wtWordBounds(strokes){
  return wbUnionBounds((strokes||[]).map(wbStrokeBounds));
}

function wtLikelyMultiLetter(strokes){
  if(!strokes?.length)return false;
  const b=wtWordBounds(strokes);
  const widths=strokes.map(s=>Math.max(1,wbStrokeBounds(s).w)).sort((a,b)=>a-b);
  const med=widths[Math.floor(widths.length/2)]||1;
  return strokes.length>=3 || b.w>Math.max(28,b.h*1.35,med*2.2);
}

function wtWordPrototypeMatches(strokes,mode='node'){
  const sig=wtSparseSignature(strokes), arr=[];
  const allowed = mode==='relation'
    ? new Set(['relationship_label'])
    : new Set(['word','node','definition','class','sequence_step','sequence_block']);
  for(const x of wtSamples()){
    if(!allowed.has(x.category)||!x.label||!x.sig?.length)continue;
    if([...String(x.label)].filter(ch=>/\p{L}|\d/u.test(ch)).length<2 && x.category!=='class' && x.category!=='definition')continue;
    const score=wtSigSim(sig,x.sig);
    if(score>=.22)arr.push({label:x.label,score,category:x.category});
  }
  arr.sort((a,b)=>b.score-a.score);
  const seen=new Set();
  return arr.filter(x=>{
    const k=canon(x.label);
    if(seen.has(k))return false;
    seen.add(k);return true;
  }).slice(0,6);
}

function wtLetterSamples(){
  return wtSamples().filter(x=>
    (x.category==='letter'||x.category==='letter_auto') &&
    [...String(x.label||'')].filter(ch=>/\p{L}|\d/u.test(ch)).length===1 &&
    x.sig?.length
  );
}

function wtRecognizeLetterInk(strokes){
  if(!strokes?.length)return [];
  const sig=wtSparseSignature(strokes), scoreBy={};
  for(const x of wtLetterSamples()){
    let score=wtSigSim(sig,x.sig);
    if(x.category==='letter_auto')score*=0.58; // derived word slices are weaker evidence
    const k=String(x.label||'').toLowerCase();
    if(!k)continue;
    scoreBy[k]=Math.max(scoreBy[k]||0,score);
  }
  return Object.entries(scoreBy)
    .map(([label,score])=>({label,score}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,4);
}

/* Group strokes into probable printed characters.
   Strokes that overlap in x or sit very close together stay in the same character.
   Large horizontal gaps split characters. */
function wtSegmentWordInk(strokes){
  if(!strokes?.length)return [];
  const items=strokes.map(st=>({st,b:wbStrokeBounds(st)}))
    .sort((a,b)=>(a.b.x+a.b.w/2)-(b.b.x+b.b.w/2));

  const all=wtWordBounds(strokes);
  const avgH=Math.max(8,all.h);
  const gaps=[];
  for(let i=1;i<items.length;i++){
    const prev=items[i-1].b, cur=items[i].b;
    gaps.push(cur.x-(prev.x+prev.w));
  }
  const posGaps=gaps.filter(g=>g>0).sort((a,b)=>a-b);
  const medGap=posGaps.length?posGaps[Math.floor(posGaps.length/2)]:avgH*.08;
  const splitGap=Math.max(avgH*.16, medGap*1.8, 5);

  const groups=[];
  let g=[];
  for(let i=0;i<items.length;i++){
    if(!g.length){g=[items[i]];continue}
    const gb=wbUnionBounds(g.map(x=>x.b)), cur=items[i];
    const gap=cur.b.x-(gb.x+gb.w);
    const xOverlap=Math.min(gb.x+gb.w,cur.b.x+cur.b.w)-Math.max(gb.x,cur.b.x);
    /* dots/crossbars often sit above the main body; overlap keeps them attached */
    if(gap>splitGap && xOverlap<0){
      groups.push(g.map(x=>x.st));g=[cur];
    }else g.push(cur);
  }
  if(g.length)groups.push(g.map(x=>x.st));

  /* If one huge connected group remains (e.g. letters touch), do a light x-slice
     fallback based on trained-character scale. */
  if(groups.length<=1 && wtLikelyMultiLetter(strokes)){
    const b=all;
    const letterWidths=wtLetterSamples().map(x=>{
      const s=(x.strokes||[]);
      if(!s.length)return 0;
      let minx=9,maxx=-9;
      s.forEach(st=>(st.pts||[]).forEach(p=>{minx=Math.min(minx,p[0]);maxx=Math.max(maxx,p[0])}));
      return Math.max(0,maxx-minx);
    }).filter(Boolean);
    const est=Math.max(2,Math.min(18,Math.round(b.w/Math.max(12,b.h*.62))));
    const slices=[];
    for(let i=0;i<est;i++){
      const x0=b.x+b.w*i/est, x1=b.x+b.w*(i+1)/est, part=[];
      for(const st of strokes){
        const pts=(st.pts||[]).filter(p=>p.x>=x0-3&&p.x<=x1+3);
        if(pts.length>1)part.push({...st,pts,b:wbBounds(pts)});
      }
      if(part.length)slices.push(part);
    }
    if(slices.length>=2)return slices;
  }
  return groups;
}

function wtComposeLetters(strokes){
  const seg=wtSegmentWordInk(strokes);
  if(seg.length<2)return [];
  const choices=seg.map(s=>wtRecognizeLetterInk(s));
  if(choices.some(c=>!c.length))return [];

  /* beam search preserves a few alternatives instead of greedily locking every char */
  let beam=[{text:'',score:1}];
  for(const opts of choices){
    const next=[];
    for(const b of beam)for(const o of opts.slice(0,3)){
      if(o.score<.12)continue;
      next.push({text:b.text+o.label,score:b.score*Math.max(.08,o.score)});
    }
    next.sort((a,b)=>b.score-a.score);
    beam=next.slice(0,12);
    if(!beam.length)break;
  }
  return beam.map(x=>({
    label:x.text,
    score:Math.pow(x.score,1/Math.max(1,seg.length)),
    category:'letters-composed'
  })).filter(x=>x.label.length>=2).slice(0,8);
}

function wtEditDistance(a,b){
  a=canon(a||'');b=canon(b||'');
  const m=a.length,n=b.length,dp=Array(n+1);
  for(let j=0;j<=n;j++)dp[j]=j;
  for(let i=1;i<=m;i++){
    let prev=dp[0];dp[0]=i;
    for(let j=1;j<=n;j++){
      const old=dp[j];
      dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));
      prev=old;
    }
  }
  return dp[n];
}

function wtVocabularyCandidates(raw){
  raw=String(raw||'').trim();
  if(raw.length<2)return [];
  const pool=[];
  (G.defs||[]).forEach(d=>{
    if(d?.term)pool.push(d.term);
    (d?.aliases||[]).forEach(a=>pool.push(a));
  });
  const seen=new Set(), out=[];
  for(const term of pool){
    const k=canon(term);if(!k||seen.has(k))continue;seen.add(k);
    const d=wtEditDistance(raw,term), den=Math.max(canon(raw).length,k.length,1);
    const sim=1-d/den;
    if(sim>=.42)out.push({label:term,score:sim,category:'MedGraph vocabulary'});
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,8);
}

/* Replace the v8.1 recognizer wrapper.
   Critical change: if the ink looks like a word, DO NOT let a one-letter prototype
   become the whole-word answer. Instead compose trained letters into text. */
const _wbRecognizeV82Base = wbRecognizeStrokes;
wbRecognizeStrokes = async function(strokes,mode='node'){
  const multi = wtLikelyMultiLetter(strokes);

  if(!multi || mode==='letter'){
    return _wbRecognizeV82Base(strokes,mode);
  }

  const whole = wtWordPrototypeMatches(strokes,mode);
  const composed = wtComposeLetters(strokes);

  let vocab=[];
  for(const c of composed.slice(0,5)){
    vocab.push(...wtVocabularyCandidates(c.label).map(v=>({
      ...v,
      score: Math.min(1, v.score*.72 + c.score*.28)
    })));
  }
  vocab.sort((a,b)=>b.score-a.score);

  /* Run the underlying native/browser recognizer too, but filter out accidental
     single-character answers for obvious multi-letter ink. */
  const base = await _wbRecognizeV82Base(strokes,mode);
  const baseGuesses=(base.guesses||[]).filter(g=>{
    const n=[...String(g)].filter(ch=>/\p{L}|\d/u.test(ch)).length;
    return n>=2;
  });

  const merged=[];
  const add=(label,source,score=0)=>{
    label=String(label||'').trim();
    if(!label)return;
    if([...label].filter(ch=>/\p{L}|\d/u.test(ch)).length<2)return;
    const corrected=wtCorrectionFor(label)||label;
    if(!merged.some(x=>canon(x.label)===canon(corrected)))
      merged.push({label:corrected,source,score});
  };

  whole.forEach(x=>add(x.label,'whole-word training',x.score));
  vocab.slice(0,6).forEach(x=>add(x.label,'letters + MedGraph vocabulary',x.score));
  composed.slice(0,5).forEach(x=>add(x.label,'trained letters',x.score));
  baseGuesses.forEach(x=>add(x,base.engine||'handwriting',.35));

  merged.sort((a,b)=>b.score-a.score);
  return {
    guesses:merged.slice(0,8).map(x=>x.label),
    engine:merged[0]?.source || base.engine || 'personal word recognizer'
  };
};

/* Make trainer "Test guess" actually test words as words, not only gestures. */
const _wtTestAdaptiveV82 = wtTestAdaptive;
wtTestAdaptive = async function(){
  if(!WT.strokes.length)return toast('Draw something first');
  const cat=document.getElementById('wt-cat')?.value||'letter';
  const mode=cat==='letter'?'letter':cat==='relationship_label'?'relation':'node';
  const r=await wbRecognizeStrokes(WT.strokes,mode);
  const g=wtClassifyGesture(WT.strokes);
  const bits=[];
  if(r.guesses?.length)bits.push(`Text: ${r.guesses.map((x,i)=>`${i? '':'★ '}${esc(x)}`).join(' · ')}<br><span class="hint">${esc(r.engine||'recognizer')}</span>`);
  else bits.push('Text: no confident word guess yet');
  if(g.length)bits.push('Gesture: '+g.slice(0,3).map(x=>`${wtCatLabel(x.category)} ${Math.round(x.score*100)}%`).join(' · '));
  WT.lastResult=bits.join('<br><br>');
  const e=document.getElementById('wt-test');
  if(e){e.style.display='block';e.innerHTML=WT.lastResult}
};




/* ==================== V10 SHARED HANDWRITING STORE ====================
   A dedicated localStorage record is used for the personal handwriting model.
   This intentionally does not depend on MedGraph's graph-storage backend, so
   the Ink Lab and Whiteboard see the same samples even if the graph itself is
   using a different storage adapter. */
const MG_HANDWRITING_SHARED_KEY='medgraph_handwriting_shared_v5';
const MG_HANDWRITING_CHANNEL='medgraph-handwriting-v5';
let MG_HWR_BC=null;
function mgHwrSampleKey(s){
  return s?.id||[s?.category||'',String(s?.label||'').toLowerCase(),s?.source||'',JSON.stringify(s?.sig||[]).slice(0,220)].join('|');
}
function mgHwrEmpty(){return{version:5,updatedAt:Date.now(),samples:[],arrowPos:[],arrowNeg:[],nodePos:[],nodeNeg:[],lab:{}}}
function mgHwrMerge(dst,src){
  dst=dst||mgHwrEmpty();src=src||{};dst.samples=dst.samples||[];
  const seen=new Set(dst.samples.map(mgHwrSampleKey));
  for(const s of (src.samples||[])){const k=mgHwrSampleKey(s);if(!seen.has(k)){dst.samples.push(s);seen.add(k)}}
  for(const k of ['arrowPos','arrowNeg','nodePos','nodeNeg']){
    dst[k]=Array.isArray(dst[k])?dst[k]:[];const have=new Set(dst[k].map(x=>JSON.stringify(x)));
    for(const x of (Array.isArray(src[k])?src[k]:[])){const q=JSON.stringify(x);if(!have.has(q)){dst[k].push(x);have.add(q)}}
  }
  dst.lab={...(src.lab||{}),...(dst.lab||{})};dst.updatedAt=Date.now();dst.version=5;return dst;
}
function mgHwrReadShared(){
  try{const x=JSON.parse(localStorage.getItem(MG_HANDWRITING_SHARED_KEY)||'null');return x&&typeof x==='object'?x:mgHwrEmpty()}catch(e){return mgHwrEmpty()}
}
function mgHwrWriteShared(T,announce=true){
  try{
    const merged=mgHwrMerge(mgHwrReadShared(),T||{});localStorage.setItem(MG_HANDWRITING_SHARED_KEY,JSON.stringify(merged));
    if(announce&&MG_HWR_BC)try{MG_HWR_BC.postMessage({type:'training-updated',count:(merged.samples||[]).length})}catch(e){}
    return merged;
  }catch(e){return T||mgHwrEmpty()}
}
function mgHwrSyncIntoWhiteboard(writeBack=true){
  const W=wbData();W.training=W.training||{};
  const shared=mgHwrReadShared();mgHwrMerge(W.training,shared);
  const merged=writeBack?mgHwrWriteShared(W.training,false):shared;
  const n=(W.training.samples||[]).length, el=document.getElementById('wb-hwr-shared-count');
  if(el)el.textContent=`${n} personal ink sample${n===1?'':'s'} loaded`;
  return{count:n,sharedCount:(merged.samples||[]).length};
}
function mgHwrInitSync(){
  mgHwrSyncIntoWhiteboard(true);
  try{if('BroadcastChannel'in window){MG_HWR_BC=new BroadcastChannel(MG_HANDWRITING_CHANNEL);MG_HWR_BC.onmessage=e=>{if(e.data?.type==='training-updated'){mgHwrSyncIntoWhiteboard(false);}}}}catch(e){}
  window.addEventListener('storage',e=>{if(e.key===MG_HANDWRITING_SHARED_KEY)mgHwrSyncIntoWhiteboard(false)});
}

/* ==================== V9 OPEN-VOCABULARY HANDWRITING ====================
   Important behavior:
   - A word does NOT have to already exist in MedGraph.
   - Individual letters, trained pairs, and trained trios can compose a brand-new word.
   - Existing MedGraph terms are suggestions/rerankers only; they no longer define
     the set of legal answers.
   - Manual text fields always accept completely new words/phrases.
========================================================================= */

function wtOpenSampleWeight(x){
  if(x?.meta?.weight!=null)return +x.meta.weight;
  if(x.category==='letter_auto')return .55;
  if(x.category==='pair_auto')return .45;
  if(x.category==='trio_auto')return .40;
  if(x.category==='letter_synthetic_context')return .10;
  if(x.category==='pair_synthetic_context')return .08;
  if(x.category==='trio_synthetic_context')return .07;
  return 1;
}
function wtOpenLetterSamples(){
  return wtSamples().filter(x=>
    ['letter','letter_auto','letter_synthetic_context'].includes(x.category) &&
    [...String(x.label||'')].filter(ch=>/\p{L}|\d/u.test(ch)).length===1 &&
    x.sig?.length
  );
}
function wtOpenChunkSamples(n){
  const cats=n===2
    ? ['letter_pair','pair_auto','pair_synthetic_context']
    : ['letter_trio','trio_auto','trio_synthetic_context'];
  return wtSamples().filter(x=>
    cats.includes(x.category) &&
    [...String(x.label||'')].filter(ch=>/\p{L}|\d/u.test(ch)).length===n &&
    x.sig?.length
  );
}
function wtOpenRecognizeInk(strokes,samples,limit=4){
  if(!strokes?.length||!samples?.length)return [];
  const sig=wtSparseSignature(strokes),scoreBy={};
  for(const x of samples){
    let score=wtSigSim(sig,x.sig)*wtOpenSampleWeight(x);
    const lab=String(x.label||'').toLowerCase();
    if(!lab)continue;
    scoreBy[lab]=Math.max(scoreBy[lab]||0,score);
  }
  return Object.entries(scoreBy)
    .map(([label,score])=>({label,score}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit);
}
function wtOpenUnionStrokes(parts,a,b){
  const out=[];
  for(let i=a;i<b;i++)for(const st of (parts[i]||[]))out.push(st);
  return out;
}
function wtOpenVocabularyDecode(strokes){
  const parts=wtSegmentWordInk(strokes);
  if(parts.length<2)return [];

  const opts=Array.from({length:parts.length},()=>[]);
  for(let i=0;i<parts.length;i++){
    wtOpenRecognizeInk(parts[i],wtOpenLetterSamples(),4).forEach(x=>{
      if(x.score>=.07)opts[i].push({len:1,text:x.label,score:x.score,source:'letter'});
    });

    if(i+1<parts.length){
      const ink=wtOpenUnionStrokes(parts,i,i+2);
      wtOpenRecognizeInk(ink,wtOpenChunkSamples(2),3).forEach(x=>{
        if(x.score>=.06)opts[i].push({len:2,text:x.label,score:x.score*1.06,source:'pair'});
      });
    }
    if(i+2<parts.length){
      const ink=wtOpenUnionStrokes(parts,i,i+3);
      wtOpenRecognizeInk(ink,wtOpenChunkSamples(3),3).forEach(x=>{
        if(x.score>=.055)opts[i].push({len:3,text:x.label,score:x.score*1.10,source:'trio'});
      });
    }
    if(!opts[i].length)opts[i].push({len:1,text:'?',score:.025,source:'unknown'});
  }

  let beam=[{i:0,text:'',log:0,chunks:0}];
  let finished=[];
  for(let guard=0;guard<48&&beam.length;guard++){
    const next=[];
    for(const b of beam){
      if(b.i>=parts.length){finished.push(b);continue}
      for(const o of opts[b.i]){
        if(b.i+o.len>parts.length)continue;
        next.push({
          i:b.i+o.len,
          text:b.text+o.text,
          log:b.log+Math.log(Math.max(.015,o.score)),
          chunks:b.chunks+(o.len>1?1:0)
        });
      }
    }
    next.sort((a,b)=>b.log-a.log);
    beam=next.slice(0,40);
  }
  finished.push(...beam.filter(b=>b.i>=parts.length));
  finished.sort((a,b)=>b.log-a.log);

  const seen=new Set(),out=[];
  for(const b of finished){
    const text=String(b.text||'').replace(/\?+/g,'?');
    const clean=[...text].filter(ch=>/\p{L}|\d/u.test(ch)).length;
    if(clean<2)continue;
    const key=text.toLowerCase();
    if(seen.has(key))continue;seen.add(key);
    const score=Math.exp(b.log/Math.max(1,parts.length));
    out.push({label:text,score,source:b.chunks?'open letters + chunks':'open letters'});
    if(out.length>=10)break;
  }
  return out;
}
function wtKnownTermReranks(rawCandidates){
  const out=[];
  for(const c of rawCandidates.slice(0,6)){
    for(const v of wtVocabularyCandidates(c.label)){
      /* Known terms are allowed to help, but not to erase the raw unseen spelling. */
      out.push({
        label:v.label,
        score:Math.min(.92,v.score*.58+c.score*.42),
        source:'known MedGraph term'
      });
    }
  }
  out.sort((a,b)=>b.score-a.score);
  return out.slice(0,8);
}

/* Final recognizer wrapper: open spelling is a separate first-class path. */
async function mgRawHandwritingEngine(strokes){
  let guesses=[],engine='';
  try{guesses=await wbNativeRecognize(strokes);if(guesses.length)engine='browser on-device'}catch(e){}
  if(!guesses.length&&WB.hwrPipe){try{guesses=await wbAIRecognize(strokes);if(guesses.length)engine='local TrOCR'}catch(e){}}
  return{guesses:(guesses||[]).map(x=>String(x||'').trim()).filter(Boolean),engine};
}
function mgOpenCandidateSegCounts(strokes){
  const b=wtWordBounds(strokes),direct=wtOpenLetterSamples();let aspects=[];
  for(const s of direct){
    const pts=(s.strokes||[]).flatMap(st=>(st.pts||[]).map(q=>Array.isArray(q)?{x:+q[0],y:+q[1]}:q));
    if(!pts.length)continue;let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
    pts.forEach(p=>{x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)});
    const a=(x1-x0)/Math.max(.05,y1-y0);if(isFinite(a)&&a>.08&&a<2.2)aspects.push(a);
  }
  aspects.sort((a,b)=>a-b);const a=aspects.length?aspects[Math.floor(aspects.length/2)]:.55;
  const est=Math.max(2,Math.min(20,Math.round((b.w/Math.max(1,b.h))/Math.max(.24,a*.78))));
  const counts=new Set([est-2,est-1,est,est+1,est+2,wtSegmentWordInk(strokes).length]);
  return [...counts].filter(n=>n>=2&&n<=20).sort((a,b)=>Math.abs(a-est)-Math.abs(b-est));
}
function mgSliceWordInk(strokes,n){
  const b=wtWordBounds(strokes),parts=[];
  for(let i=0;i<n;i++){
    const x0=b.x+b.w*i/n,x1=b.x+b.w*(i+1)/n,part=[];
    for(const st of strokes){
      const pts=(st.pts||[]).filter(p=>p.x>=x0-2&&p.x<=x1+2);
      if(pts.length>1)part.push({...st,pts,b:wbBounds(pts)});
    }
    if(part.length)parts.push(part);else parts.push([]);
  }
  return parts;
}
function mgDecodeParts(parts){
  if(parts.length<2)return[];const opts=Array.from({length:parts.length},()=>[]);
  for(let i=0;i<parts.length;i++){
    wtOpenRecognizeInk(parts[i],wtOpenLetterSamples(),4).forEach(x=>{if(x.score>=.035)opts[i].push({len:1,text:x.label,score:x.score})});
    if(i+1<parts.length){const ink=wtOpenUnionStrokes(parts,i,i+2);wtOpenRecognizeInk(ink,wtOpenChunkSamples(2),3).forEach(x=>{if(x.score>=.03)opts[i].push({len:2,text:x.label,score:x.score*1.06})})}
    if(i+2<parts.length){const ink=wtOpenUnionStrokes(parts,i,i+3);wtOpenRecognizeInk(ink,wtOpenChunkSamples(3),3).forEach(x=>{if(x.score>=.025)opts[i].push({len:3,text:x.label,score:x.score*1.10})})}
    if(!opts[i].length)return[];
  }
  let beam=[{i:0,text:'',log:0}],done=[];
  for(let guard=0;guard<50&&beam.length;guard++){
    const next=[];for(const b of beam){if(b.i>=parts.length){done.push(b);continue}for(const o of opts[b.i])if(b.i+o.len<=parts.length)next.push({i:b.i+o.len,text:b.text+o.text,log:b.log+Math.log(Math.max(.01,o.score))})}
    next.sort((a,b)=>b.log-a.log);beam=next.slice(0,48);
  }
  done.push(...beam.filter(x=>x.i>=parts.length));done.sort((a,b)=>b.log-a.log);
  const seen=new Set(),out=[];for(const x of done){const k=canon(x.text);if(!k||seen.has(k))continue;seen.add(k);out.push({label:x.text,score:Math.exp(x.log/Math.max(1,parts.length)),source:'open spelling'});if(out.length>=6)break}return out;
}
function mgOpenSpellCandidates(strokes){
  const all=[];all.push(...wtOpenVocabularyDecode(strokes));all.push(...wtComposeLetters(strokes));
  for(const n of mgOpenCandidateSegCounts(strokes))all.push(...mgDecodeParts(mgSliceWordInk(strokes,n)));
  const seen=new Map();for(const x of all){const k=canon(x.label);if(!k)continue;const old=seen.get(k);if(!old||x.score>old.score)seen.set(k,{...x,source:x.source||'open spelling'})}
  return [...seen.values()].sort((a,b)=>b.score-a.score).slice(0,12);
}
const _wbRecognizeV10Fallback = wbRecognizeStrokes;
wbRecognizeStrokes = async function(strokes,mode='node'){
  if(!strokes||!strokes.length)return{guesses:[],openGuesses:[],knownGuesses:[],engine:''};
  mgHwrSyncIntoWhiteboard(false);
  const multi=wtLikelyMultiLetter(strokes);
  if(!multi||mode==='letter')return _wbRecognizeV10Fallback(strokes,mode);

  const rawOpen=mgOpenSpellCandidates(strokes);
  const rawEngine=await mgRawHandwritingEngine(strokes);
  for(const g of rawEngine.guesses){
    const chars=[...g].filter(ch=>/\p{L}|\d/u.test(ch)).length;if(chars>=2&&!rawOpen.some(x=>canon(x.label)===canon(g)))rawOpen.push({label:g,score:.50,source:rawEngine.engine||'open handwriting'});
  }
  rawOpen.sort((a,b)=>b.score-a.score);

  /* Known words are suggestions only. They can never delete the raw spelling list. */
  const known=wtKnownTermReranks(rawOpen).filter(x=>resolve(x.label)?.exists);
  const whole=wtWordPrototypeMatches(strokes,mode).filter(x=>resolve(x.label)?.exists).map(x=>({...x,source:'seen-word suggestion'}));
  const knownAll=[...known,...whole].sort((a,b)=>b.score-a.score);

  const openGuesses=[],knownGuesses=[],seen=new Set();
  for(const x of rawOpen){const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);openGuesses.push(x.label);if(openGuesses.length>=5)break}
  for(const x of knownAll){const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);knownGuesses.push(x.label);if(knownGuesses.length>=4)break}

  /* No dictionary lookup is required. If training is sufficient, the first answers are raw spellings. */
  const guesses=[...openGuesses,...knownGuesses];
  return{guesses,openGuesses,knownGuesses,engine:openGuesses.length?'personal open-vocabulary model':(rawEngine.engine||'known-term suggestion'),trainingCount:wtOpenLetterSamples().length};
};


/* ==================== V11 / PWA V6 HANDWRITING ====================
   Canonical corpus: IndexedDB, shared by Ink Lab and Whiteboard.
   This block deliberately overrides the v5 localStorage sharing layer.
=================================================================== */
const MG_HWR_V6_DB='medgraph_handwriting_v6';
const MG_HWR_V6_STORE='kv';
const MG_HWR_V6_TRAINING_KEY='training';
let MG_HWR_V6_DBP=null;
let MG_HWR_MEMORY={version:6,updatedAt:Date.now(),samples:[],arrowPos:[],arrowNeg:[],nodePos:[],nodeNeg:[],lab:{}};
let MG_HWR_PROTO_CACHE=null;
let MG_HWR_PERSIST_TIMER=null;

function mgHwrCountV6(){return(MG_HWR_MEMORY.samples||[]).length}
function mgHwrKeyV6(s){
  if(s?.id)return'id:'+s.id;
  return[s?.category||'',String(s?.label||'').toLowerCase(),s?.source||'',JSON.stringify(s?.sig||[]).slice(0,260)].join('|')
}
function mgHwrMergeV6(dst,src){
  dst=dst||MG_HWR_MEMORY;src=src||{};dst.samples=Array.isArray(dst.samples)?dst.samples:[];
  const seen=new Set(dst.samples.map(mgHwrKeyV6));
  for(const s of(Array.isArray(src.samples)?src.samples:[])){
    const k=mgHwrKeyV6(s);if(!seen.has(k)){dst.samples.push(s);seen.add(k)}
  }
  for(const k of['arrowPos','arrowNeg','nodePos','nodeNeg']){
    dst[k]=Array.isArray(dst[k])?dst[k]:[];
    const have=new Set(dst[k].map(x=>JSON.stringify(x)));
    for(const x of(Array.isArray(src[k])?src[k]:[])){
      const q=JSON.stringify(x);if(!have.has(q)){dst[k].push(x);have.add(q)}
    }
  }
  dst.lab={...(src.lab||{}),...(dst.lab||{})};dst.version=6;dst.updatedAt=Date.now();
  MG_HWR_PROTO_CACHE=null;return dst
}
function mgHwrOpenDBV6(){
  if(MG_HWR_V6_DBP)return MG_HWR_V6_DBP;
  MG_HWR_V6_DBP=new Promise((resolve,reject)=>{
    const r=indexedDB.open(MG_HWR_V6_DB,1);
    r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(MG_HWR_V6_STORE))db.createObjectStore(MG_HWR_V6_STORE)};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)
  });return MG_HWR_V6_DBP
}
async function mgHwrGetV6(key){
  const db=await mgHwrOpenDBV6();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(MG_HWR_V6_STORE,'readonly'),rq=tx.objectStore(MG_HWR_V6_STORE).get(key);
    rq.onsuccess=()=>resolve(rq.result);rq.onerror=()=>reject(rq.error)
  })
}
async function mgHwrPutV6(key,value){
  const db=await mgHwrOpenDBV6();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(MG_HWR_V6_STORE,'readwrite');tx.objectStore(MG_HWR_V6_STORE).put(value,key);
    tx.oncomplete=()=>resolve(true);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('IndexedDB write aborted'))
  })
}
function mgLegacyLabTrainingV6(){
  try{
    const x=JSON.parse(localStorage.getItem('medgraph_handwriting_lab_v1')||'null'),out={samples:[],arrowPos:[],arrowNeg:[],nodePos:[],nodeNeg:[],lab:{}};
    if(!x)return out;
    mgHwrMergeV6(out,x.personalTraining);
    mgHwrMergeV6(out,x.standalone?.whiteboard?.training);
    mgHwrMergeV6(out,x.graph?.whiteboard?.training);
    return out
  }catch(e){return null}
}
function mgLegacySharedV5(){
  try{return JSON.parse(localStorage.getItem('medgraph_handwriting_shared_v5')||'null')}catch(e){return null}
}
async function mgHwrPersistNowV6(){
  MG_HWR_MEMORY.version=6;MG_HWR_MEMORY.updatedAt=Date.now();
  await mgHwrPutV6(MG_HWR_V6_TRAINING_KEY,MG_HWR_MEMORY);
  try{
    if(MG_HWR_BC)MG_HWR_BC.postMessage({type:'training-updated',count:mgHwrCountV6()})
  }catch(e){}
  return mgHwrCountV6()
}
function mgHwrPersistSoonV6(){
  clearTimeout(MG_HWR_PERSIST_TIMER);
  MG_HWR_PERSIST_TIMER=setTimeout(()=>mgHwrPersistNowV6().catch(console.error),80)
}
async function mgHwrInitV6(){
  const merged={version:6,updatedAt:Date.now(),samples:[],arrowPos:[],arrowNeg:[],nodePos:[],nodeNeg:[],lab:{}};
  let stored=null;try{stored=await mgHwrGetV6(MG_HWR_V6_TRAINING_KEY)}catch(e){}
  mgHwrMergeV6(merged,stored);
  /* Recover every older location, especially the full trainer state that v5
     accidentally hid when it switched training() to the main graph. */
  mgHwrMergeV6(merged,mgLegacyLabTrainingV6());
  mgHwrMergeV6(merged,mgLegacySharedV5());
  mgHwrMergeV6(merged,G?.whiteboard?.training);
  MG_HWR_MEMORY=merged;MG_HWR_PROTO_CACHE=null;
  try{
    await mgHwrPersistNowV6();
    /* Once IndexedDB has the superset, stop duplicating hundreds of stroke
       samples inside graph localStorage. Gesture arrays stay with the board. */
    if(G?.whiteboard?.training)G.whiteboard.training.samples=[];
    localStorage.removeItem('medgraph_handwriting_shared_v5');
  }catch(e){console.warn('V6 handwriting migration retained legacy backups',e)}
  try{
    if('BroadcastChannel'in window){
      MG_HWR_BC=new BroadcastChannel('medgraph-handwriting-v6');
      MG_HWR_BC.onmessage=async e=>{if(e.data?.type==='training-updated')await mgHwrSyncIntoWhiteboard(false)}
    }
  }catch(e){}
  window.addEventListener('storage',()=>{});
  return mgHwrCountV6()
}
async function mgHwrSyncIntoWhiteboard(writeBack=false){
  try{
    const incoming=await mgHwrGetV6(MG_HWR_V6_TRAINING_KEY);
    if(incoming)mgHwrMergeV6(MG_HWR_MEMORY,incoming)
  }catch(e){}
  if(writeBack)try{await mgHwrPersistNowV6()}catch(e){}
  const n=mgHwrCountV6(),el=document.getElementById('wb-hwr-shared-count');
  if(el)el.textContent=`${n} personal ink sample${n===1?'':'s'} loaded`;
  return{count:n,sharedCount:n}
}
async function mgHwrManualSync(){
  const r=await mgHwrSyncIntoWhiteboard(false);render();toast(`Loaded ${r.count} personal handwriting samples`)
}
mgHwrInitSync=function(){return mgHwrInitV6()};

/* All text prototypes now come from the canonical shared model. */
wtTraining=function(){return MG_HWR_MEMORY};
wtSamples=function(){return MG_HWR_MEMORY.samples||[]};

/* Remove the old 1,200-example cap and persist new Whiteboard training to IDB. */
wtStoreExample=function(category,label,strokes,meta={},source='trainer'){
  if(!strokes?.length)return null;
  const sample={id:uid('wtex'),category,label:String(label||'').trim(),sig:wtSparseSignature(strokes),
    strokes:wtCompactStrokes(strokes),meta,source,created:Date.now()};
  wtSamples().push(sample);MG_HWR_PROTO_CACHE=null;mgHwrPersistSoonV6();return sample
};
wtDelete=function(id){
  const T=wtSamples(),i=T.findIndex(x=>x.id===id);if(i>=0)T.splice(i,1);
  MG_HWR_PROTO_CACHE=null;mgHwrPersistSoonV6();render()
};
wtResetTraining=async function(){
  if(!confirm('Delete all personal Ink Trainer examples?\n\nThis does not delete your MedGraph or whiteboard notes.'))return;
  MG_HWR_MEMORY={version:6,updatedAt:Date.now(),samples:[],arrowPos:[],arrowNeg:[],nodePos:[],nodeNeg:[],lab:{}};
  MG_HWR_PROTO_CACHE=null;await mgHwrPersistNowV6();render()
};

/* Full JSON exports still contain the personal model even though runtime graph
   storage no longer duplicates it. */
function mgGraphWithTrainingV6(){
  const o=structuredClone(G);o.whiteboard=o.whiteboard||{};o.whiteboard.training=structuredClone(MG_HWR_MEMORY);return o
}
exportText=function(){return JSON.stringify(mgGraphWithTrainingV6(),null,2)};
handwritingExportObject=function(){
  return{format:'medgraph-handwriting-training',version:6,exportedAt:new Date().toISOString(),
    training:structuredClone(MG_HWR_MEMORY),annotations:structuredClone((G.whiteboard&&G.whiteboard.annotations)||[]),
    metadata:{nodeCount:(G.defs||[]).length,sampleCount:mgHwrCountV6()}}
};
importTrainingText=function(txt){
  let inc;try{inc=JSON.parse(txt)}catch(e){return toast('That is not valid JSON')}
  const t=inc&&inc.format==='medgraph-handwriting-training'?inc.training:
          inc&&inc.training?inc.training:inc&&inc.whiteboard&&inc.whiteboard.training?inc.whiteboard.training:null;
  if(!t)return toast('That file does not contain MedGraph handwriting training');
  mgHwrMergeV6(MG_HWR_MEMORY,t);mgHwrPersistNowV6().then(()=>{render();toast(`Handwriting merged · ${mgHwrCountV6()} samples`)})
};

/* ---------- fast bounded prototype index ---------- */
function mgHwrProtoIndexV6(){
  if(MG_HWR_PROTO_CACHE)return MG_HWR_PROTO_CACHE;
  const idx={1:new Map(),2:new Map(),3:new Map()};
  for(const s of wtSamples()){
    const lab=String(s.label||'').toLowerCase(),n=[...lab].filter(ch=>/\p{L}|\d/u.test(ch)).length;
    const ok=n===1?['letter','letter_auto','letter_synthetic_context'].includes(s.category):
             n===2?['letter_pair','pair_auto','pair_synthetic_context'].includes(s.category):
             n===3?['letter_trio','trio_auto','trio_synthetic_context'].includes(s.category):false;
    if(!ok||!s.sig?.length)continue;
    if(!idx[n].has(lab))idx[n].set(lab,[]);
    idx[n].get(lab).push(s)
  }
  for(const n of[1,2,3])for(const [lab,a]of idx[n]){
    a.sort((x,y)=>(wtOpenSampleWeight(y)-wtOpenSampleWeight(x))||((y.created||0)-(x.created||0)));
    idx[n].set(lab,a.slice(0,8))
  }
  MG_HWR_PROTO_CACHE=idx;return idx
}
function mgRecognizeChunkV6(strokes,n,limit=5){
  if(!strokes?.length)return[];const sig=wtSparseSignature(strokes),out=[];
  for(const [label,arr]of mgHwrProtoIndexV6()[n]){
    let best=0;for(const s of arr)best=Math.max(best,wtSigSim(sig,s.sig)*wtOpenSampleWeight(s));
    if(best>0)out.push({label,score:best})
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,limit)
}
function mgLetterGeometryV6(){
  const arr=[];
  for(const s of wtSamples()){
    if(!['letter','letter_auto'].includes(s.category)||[...String(s.label||'')].filter(ch=>/\p{L}|\d/u.test(ch)).length!==1)continue;
    const pts=(s.strokes||[]).flatMap(st=>(st.pts||[]).map(q=>Array.isArray(q)?{x:+q[0],y:+q[1]}:q)).filter(p=>isFinite(p.x)&&isFinite(p.y));
    if(!pts.length)continue;
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;pts.forEach(p=>{x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)});
    const aspect=(x1-x0)/Math.max(.02,y1-y0);
    if(isFinite(aspect)&&aspect>.08&&aspect<2.4)arr.push({aspect,strokes:(s.strokes||[]).length||1})
  }
  arr.sort((a,b)=>a.aspect-b.aspect);
  const aspects=arr.map(x=>x.aspect),sc=arr.map(x=>x.strokes).sort((a,b)=>a-b);
  return{aspect:aspects.length?aspects[Math.floor(aspects.length/2)]:.52,strokes:sc.length?sc[Math.floor(sc.length/2)]:1.5}
}
function mgCandidateLengthsV6(strokes){
  const b=wtWordBounds(strokes),A=mgLetterGeometryV6(),wordAspect=b.w/Math.max(1,b.h);
  const aspectEst=wordAspect/Math.max(.24,A.aspect*.88);
  const genericEst=wordAspect/.46;
  const strokeEst=(strokes.length||1)/Math.max(.75,A.strokes);
  const gapEst=Math.max(2,wtSegmentWordInk(strokes).length||2);
  /* Aspect carries most weight. Stroke count is only a weak hint because some
     people connect several letters in one stroke. */
  const est=Math.max(2,Math.min(30,.68*Math.max(aspectEst,genericEst*.78)+.17*strokeEst+.15*gapEst));
  const min=Math.max(2,Math.floor(est*.52));
  const max=Math.min(30,Math.max(min+4,Math.ceil(est*1.55+2)));
  const vals=[];for(let n=min;n<=max;n++)vals.push(n);
  vals.sort((a,b)=>Math.abs(a-est)-Math.abs(b-est));
  return{vals,est,min,max,wordAspect}
}
function mgDensityPartsV6(strokes,n){
  const b=wtWordBounds(strokes);if(!b.w||n<2)return[];
  const bins=Math.max(120,Math.min(420,Math.round(b.w))),d=Array(bins).fill(0);
  for(const st of strokes)for(const p of(st.pts||[])){
    const k=Math.max(0,Math.min(bins-1,Math.round((p.x-b.x)/b.w*(bins-1))));d[k]++
  }
  const sm=d.map((_,i)=>{
    let s=0,w=0;for(let j=-3;j<=3;j++){const k=i+j;if(k>=0&&k<bins){const q=4-Math.abs(j);s+=d[k]*q;w+=q}}return s/Math.max(1,w)
  });
  const cuts=[b.x];
  for(let i=1;i<n;i++){
    const target=i/n*(bins-1),radius=Math.max(3,Math.round(bins/n*.34));
    let best=Math.round(target),bestScore=Infinity;
    for(let k=Math.max(2,Math.round(target-radius));k<=Math.min(bins-3,Math.round(target+radius));k++){
      const density=sm[k],pen=.18*Math.abs(k-target)/Math.max(1,radius),score=density+pen;
      if(score<bestScore){bestScore=score;best=k}
    }
    let x=b.x+b.w*best/(bins-1);
    const minSep=b.w/n*.38;
    x=Math.max(cuts[cuts.length-1]+minSep,x);cuts.push(Math.min(b.x+b.w-minSep*(n-i),x))
  }
  cuts.push(b.x+b.w);
  const parts=[];
  for(let i=0;i<n;i++){
    const x0=cuts[i],x1=cuts[i+1],part=[];
    for(const st of strokes){
      const src=st.pts||[],pieces=[];let run=[];
      for(const p of src){
        if(p.x>=x0-2&&p.x<=x1+2)run.push(p);
        else if(run.length){if(run.length>1)pieces.push(run);run=[]}
      }
      if(run.length>1)pieces.push(run);
      for(const pts of pieces)part.push({...st,id:(st.id||'st')+'_'+i+'_'+part.length,pts,b:wbBounds(pts)})
    }
    parts.push(part)
  }
  return parts
}
function mgDecodePartsV6(parts,n,est){
  if(parts.length!==n||parts.some(p=>!p.length))return[];
  const opts=Array.from({length:n},()=>[]);
  for(let i=0;i<n;i++){
    mgRecognizeChunkV6(parts[i],1,5).forEach(x=>{if(x.score>=.025)opts[i].push({len:1,text:x.label,score:x.score})});
    if(i+1<n){
      const ink=wtOpenUnionStrokes(parts,i,i+2);
      mgRecognizeChunkV6(ink,2,4).forEach(x=>{if(x.score>=.022)opts[i].push({len:2,text:x.label,score:x.score*1.05})})
    }
    if(i+2<n){
      const ink=wtOpenUnionStrokes(parts,i,i+3);
      mgRecognizeChunkV6(ink,3,4).forEach(x=>{if(x.score>=.020)opts[i].push({len:3,text:x.label,score:x.score*1.08})})
    }
    if(!opts[i].length)return[]
  }
  let beam=[{i:0,text:'',log:0}],done=[];
  for(let guard=0;guard<60&&beam.length;guard++){
    const next=[];
    for(const b of beam){
      if(b.i>=n){done.push(b);continue}
      for(const o of opts[b.i])if(b.i+o.len<=n)next.push({
        i:b.i+o.len,text:b.text+o.text,log:b.log+Math.log(Math.max(.008,o.score))
      })
    }
    next.sort((a,b)=>b.log-a.log);beam=next.slice(0,64)
  }
  done.push(...beam.filter(x=>x.i>=n));done.sort((a,b)=>b.log-a.log);
  const lengthPrior=Math.exp(-Math.abs(n-est)/Math.max(2,est*.55)),seen=new Set(),out=[];
  for(const x of done){
    const k=canon(x.text);if(!k||seen.has(k))continue;seen.add(k);
    out.push({label:x.text,score:Math.exp(x.log/n)*(.72+.28*lengthPrior),source:`open spelling · ${n} chars`});
    if(out.length>=5)break
  }
  return out
}
function mgOpenSpellCandidatesV6(strokes){
  const L=mgCandidateLengthsV6(strokes),all=[];
  /* Only keep legacy segmentation candidates if their length is geometrically
     plausible; this prevents a 2-letter tail from beating a 12-letter word. */
  for(const x of[...wtOpenVocabularyDecode(strokes),...wtComposeLetters(strokes)]){
    const n=[...String(x.label||'')].filter(ch=>/\p{L}|\d/u.test(ch)).length;
    if(n>=L.min&&n<=L.max)all.push({...x,source:x.source||'open spelling'})
  }
  for(const n of L.vals){
    const parts=mgDensityPartsV6(strokes,n);
    all.push(...mgDecodePartsV6(parts,n,L.est))
  }
  const seen=new Map();
  for(const x of all){
    const k=canon(x.label);if(!k)continue;const old=seen.get(k);
    if(!old||x.score>old.score)seen.set(k,x)
  }
  return{candidates:[...seen.values()].sort((a,b)=>b.score-a.score).slice(0,14),lengthModel:L}
}

/* Final recognizer: await the shared corpus, then use full-word geometry.
   Known MedGraph words remain secondary suggestions only. */
const _wbRecognizeV6Fallback=wbRecognizeStrokes;
wbRecognizeStrokes=async function(strokes,mode='node'){
  if(!strokes||!strokes.length)return{guesses:[],openGuesses:[],knownGuesses:[],engine:''};
  await mgHwrSyncIntoWhiteboard(false);
  if(mode==='letter'||!wtLikelyMultiLetter(strokes))return _wbRecognizeV6Fallback(strokes,mode);

  const dec=mgOpenSpellCandidatesV6(strokes),rawOpen=dec.candidates;
  const rawEngine=await mgRawHandwritingEngine(strokes);
  for(const g of rawEngine.guesses||[]){
    const n=[...g].filter(ch=>/\p{L}|\d/u.test(ch)).length;
    if(n>=dec.lengthModel.min&&n<=dec.lengthModel.max&&!rawOpen.some(x=>canon(x.label)===canon(g))){
      rawOpen.push({label:g,score:.50,source:rawEngine.engine||'open handwriting'})
    }
  }
  rawOpen.sort((a,b)=>b.score-a.score);

  const known=wtKnownTermReranks(rawOpen).filter(x=>resolve(x.label)?.exists);
  const whole=wtWordPrototypeMatches(strokes,mode).filter(x=>resolve(x.label)?.exists).map(x=>({...x,source:'known/seen suggestion'}));
  const openGuesses=[],knownGuesses=[],seen=new Set();
  for(const x of rawOpen){
    const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);openGuesses.push(x.label);if(openGuesses.length>=7)break
  }
  for(const x of[...known,...whole].sort((a,b)=>b.score-a.score)){
    const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);knownGuesses.push(x.label);if(knownGuesses.length>=3)break
  }
  return{
    guesses:[...openGuesses,...knownGuesses],
    openGuesses,knownGuesses,
    engine:`personal open spelling · ${Math.round(dec.lengthModel.est)}-char estimate`,
    trainingCount:mgHwrCountV6(),
    estimatedCharacters:dec.lengthModel.est
  }
};



/* ==================== PWA V7 FAST OPEN-VOCABULARY DECODER ====================
   Recognition is intentionally memory-only after page startup. IndexedDB is
   re-read on manual sync/BroadcastChannel, not on every pen pause.
============================================================================ */
let MG_V7_LETTER_GEOM_CACHE=null;
let MG_V7_KNOWN_CACHE=null;

const _mgHwrMergeV7=mgHwrMergeV6;
mgHwrMergeV6=function(dst,src){
  const r=_mgHwrMergeV7(dst,src);MG_HWR_PROTO_CACHE=null;MG_V7_LETTER_GEOM_CACHE=null;return r;
};
function mgLetterGeometryV7(){
  if(MG_V7_LETTER_GEOM_CACHE)return MG_V7_LETTER_GEOM_CACHE;
  const arr=[];
  for(const s of wtSamples()){
    if(!['letter','letter_auto'].includes(s.category)||[...String(s.label||'')].filter(ch=>/\p{L}|\d/u.test(ch)).length!==1)continue;
    const pts=(s.strokes||[]).flatMap(st=>(st.pts||[]).map(q=>Array.isArray(q)?{x:+q[0],y:+q[1]}:q)).filter(p=>isFinite(p.x)&&isFinite(p.y));
    if(!pts.length)continue;
    let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of pts){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)}
    const aspect=(x1-x0)/Math.max(.02,y1-y0);
    if(isFinite(aspect)&&aspect>.08&&aspect<2.4)arr.push({aspect,strokes:(s.strokes||[]).length||1});
    if(arr.length>=240)break;
  }
  const med=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null};
  MG_V7_LETTER_GEOM_CACHE={aspect:med(arr.map(x=>x.aspect))||.52,strokes:med(arr.map(x=>x.strokes))||1.5};
  return MG_V7_LETTER_GEOM_CACHE;
}
mgCandidateLengthsV6=function(strokes){
  const b=wtWordBounds(strokes),A=mgLetterGeometryV7(),wordAspect=b.w/Math.max(1,b.h);
  const aspectEst=wordAspect/Math.max(.24,A.aspect*.90),genericEst=wordAspect/.47,
        strokeEst=(strokes.length||1)/Math.max(.9,A.strokes),
        gapEst=Math.max(2,wtSegmentWordInk(strokes).length||2);
  const est=Math.max(2,Math.min(32,.72*Math.max(aspectEst,genericEst*.78)+.13*strokeEst+.15*gapEst));
  const center=Math.round(est),set=new Set();
  for(const d of[0,-1,1,-2,2]){const n=center+d;if(n>=2&&n<=32)set.add(n)}
  /* one wider fallback catches compressed writing without exploding compute */
  const wide=Math.round(est*1.22);if(wide>=2&&wide<=32)set.add(wide);
  return{vals:[...set],est,min:Math.max(2,Math.floor(est*.58)),max:Math.min(32,Math.ceil(est*1.45+1)),wordAspect};
};
function mgLabelSpecificChunkScoreV7(strokes,n,label){
  const arr=mgHwrProtoIndexV6()[n].get(String(label||'').toLowerCase())||[];
  if(!arr.length||!strokes?.length)return 0;
  const sig=wtSparseSignature(strokes);let best=0;
  for(const s of arr)best=Math.max(best,wtSigSim(sig,s.sig)*wtOpenSampleWeight(s));
  return best;
}
function mgLetterChoicesV7(strokes,limit=4){
  return mgRecognizeChunkV6(strokes,1,limit);
}
function mgDecodePartsV7(parts,n,est){
  if(parts.length!==n||parts.some(p=>!p.length))return[];
  const letters=parts.map(p=>mgLetterChoicesV7(p,4));
  if(letters.some(a=>!a.length))return[];
  let beam=[{text:'',log:0}];
  for(let i=0;i<n;i++){
    const next=[];
    for(const b of beam)for(const c of letters[i]){
      let score=Math.max(.008,c.score),bonus=0;
      if(i>=1){
        const pair=(b.text.slice(-1)+c.label).toLowerCase();
        const ps=mgLabelSpecificChunkScoreV7(wtOpenUnionStrokes(parts,i-1,i+1),2,pair);
        bonus+=ps*.22;
      }
      if(i>=2){
        const trio=(b.text.slice(-2)+c.label).toLowerCase();
        const ts=mgLabelSpecificChunkScoreV7(wtOpenUnionStrokes(parts,i-2,i+1),3,trio);
        bonus+=ts*.16;
      }
      next.push({text:b.text+c.label,log:b.log+Math.log(score)+bonus});
    }
    next.sort((a,b)=>b.log-a.log);beam=next.slice(0,28);
  }
  const prior=Math.exp(-Math.abs(n-est)/Math.max(2,est*.6)),seen=new Set(),out=[];
  for(const b of beam){
    const k=canon(b.text);if(!k||seen.has(k))continue;seen.add(k);
    out.push({label:b.text,score:Math.exp(b.log/n)*(.76+.24*prior),source:`open spelling · ${n} chars`});
    if(out.length>=5)break;
  }
  return out;
}
function mgOpenSpellCandidatesV7(strokes){
  const L=mgCandidateLengthsV6(strokes),all=[];
  for(const n of L.vals){
    const parts=mgDensityPartsV6(strokes,n);
    all.push(...mgDecodePartsV7(parts,n,L.est));
  }
  const seen=new Map();
  for(const x of all){const k=canon(x.label);if(!k)continue;const o=seen.get(k);if(!o||x.score>o.score)seen.set(k,x)}
  return{candidates:[...seen.values()].sort((a,b)=>b.score-a.score).slice(0,12),lengthModel:L};
}
function mgKnownVocabularyV7(){
  const stamp=`${G.defs?.length||0}|${G.rels?.length||0}`;
  if(MG_V7_KNOWN_CACHE?.stamp===stamp)return MG_V7_KNOWN_CACHE.words;
  const words=[];for(const d of(G.defs||[])){if(d?.term)words.push(d.term);for(const a of(d?.aliases||[]))words.push(a)}
  MG_V7_KNOWN_CACHE={stamp,words:[...new Set(words.filter(Boolean))]};return MG_V7_KNOWN_CACHE.words;
}
function mgKnownSuggestionsV7(open){
  const V=mgKnownVocabularyV7(),out=[];
  for(const raw of open.slice(0,3)){
    const c=canon(raw.label),L=c.length,first=c[0]||'';
    let checked=0;
    for(const v of V){
      const cv=canon(v);if(!cv||Math.abs(cv.length-L)>3)continue;
      if(first&&cv[0]!==first)continue;
      if(++checked>450)break;
      const d=editDistance(c,cv),sim=1-d/Math.max(1,L,cv.length);
      if(sim>.55)out.push({label:v,score:sim});
    }
  }
  out.sort((a,b)=>b.score-a.score);const seen=new Set();
  return out.filter(x=>{const k=canon(x.label);if(seen.has(k))return false;seen.add(k);return true}).slice(0,3);
}
/* Final V7 recognizer does NOT reread the full IndexedDB corpus on every word. */
wbRecognizeStrokes=async function(strokes,mode='node'){
  if(!strokes||!strokes.length)return{guesses:[],openGuesses:[],knownGuesses:[],engine:''};
  if(mode==='letter'||!wtLikelyMultiLetter(strokes))return _wbRecognizeV6Fallback(strokes,mode);
  const dec=mgOpenSpellCandidatesV7(strokes),rawOpen=dec.candidates;
  const rawEngine=await mgRawHandwritingEngine(strokes);
  for(const g of rawEngine.guesses||[]){
    const n=[...g].filter(ch=>/\p{L}|\d/u.test(ch)).length;
    if(n>=dec.lengthModel.min&&n<=dec.lengthModel.max&&!rawOpen.some(x=>canon(x.label)===canon(g))){
      rawOpen.push({label:g,score:.48,source:rawEngine.engine||'open handwriting'});
    }
  }
  rawOpen.sort((a,b)=>b.score-a.score);
  const openGuesses=[],seen=new Set();
  for(const x of rawOpen){const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);openGuesses.push(x.label);if(openGuesses.length>=7)break}
  const knownGuesses=[];
  for(const x of mgKnownSuggestionsV7(rawOpen)){const k=canon(x.label);if(seen.has(k))continue;seen.add(k);knownGuesses.push(x.label)}
  return{guesses:[...openGuesses,...knownGuesses],openGuesses,knownGuesses,
    engine:`fast personal spelling · ~${Math.round(dec.lengthModel.est)} chars`,
    trainingCount:mgHwrCountV6(),estimatedCharacters:dec.lengthModel.est};
};

/* ----- canonical export/import ----- */
async function mgV7Sha256(text){
  try{const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
  catch(e){return''}
}
function mgV7CategoryCounts(T){const o={};for(const s of(T.samples||[]))o[s.category||'unknown']=(o[s.category||'unknown']||0)+1;return o}
async function mgV7FreshTraining(){
  try{const t=await mgHwrGetV6(MG_HWR_V6_TRAINING_KEY);if(t)mgHwrMergeV6(MG_HWR_MEMORY,t)}catch(e){}
  return MG_HWR_MEMORY;
}
async function mgV7TrainingObject(){
  const T=structuredClone(await mgV7FreshTraining()),raw=JSON.stringify(T);
  return{T,checksum:await mgV7Sha256(raw),sampleCount:(T.samples||[]).length,categoryCounts:mgV7CategoryCounts(T)};
}
exportDownload=async function(){
  const a=await mgV7TrainingObject(),Gx=structuredClone(G);Gx.whiteboard=Gx.whiteboard||{};Gx.whiteboard.training=a.T;
  Gx.whiteboard.training.lab={...(Gx.whiteboard.training.lab||{}),exportMeta:{version:7,sampleCount:a.sampleCount,checksum:a.checksum,categoryCounts:a.categoryCounts,created:new Date().toISOString()}};
  const check=JSON.parse(JSON.stringify(Gx))?.whiteboard?.training?.samples?.length||0;
  if(check!==a.sampleCount)return alert(`Export self-check failed (${check}/${a.sampleCount})`);
  return shareOrDownloadJSON(`medgraph-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(Gx,null,2));
};
exportHandwritingDownload=async function(){
  const a=await mgV7TrainingObject();
  const pack={format:'medgraph-handwriting-training-pack',version:7,created:new Date().toISOString(),sampleCount:a.sampleCount,categoryCounts:a.categoryCounts,checksum:a.checksum,training:a.T};
  const check=JSON.parse(JSON.stringify(pack))?.training?.samples?.length||0;
  if(check!==a.sampleCount)return alert(`Export self-check failed (${check}/${a.sampleCount})`);
  return shareOrDownloadJSON(`medgraph-handwriting-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(pack,null,2));
};
importTrainingText=function(txt){
  let x;try{x=JSON.parse(txt)}catch(e){return toast('That is not valid JSON')}
  const t=x?.format==='medgraph-handwriting-training-pack'?x.training:
          x?.training?.samples?x.training:
          x?.whiteboard?.training?.samples?x.whiteboard.training:
          x?.graph?.whiteboard?.training?.samples?x.graph.whiteboard.training:
          Array.isArray(x?.samples)?{samples:x.samples}:null;
  if(!t)return toast('No handwriting training found');
  const before=mgHwrCountV6();mgHwrMergeV6(MG_HWR_MEMORY,t);
  mgHwrPersistNowV6().then(()=>{render();toast(`Imported ${mgHwrCountV6()-before} new · ${mgHwrCountV6()} total`)});
};



/* ==================== PWA V8 RECOGNITION AUDIT FIXES ====================
   Fixes found in the v7 audit:
   1) pair/trio scoring rerasterized the same ink dozens of times per beam step;
   2) word segmentation assumed perfectly horizontal writing;
   3) spatial clustering could absorb a neighboring word after a small pause;
   4) 2–3 letter unseen words could fall through to an older vocabulary-biased path;
   5) async recognition results could overwrite newer ink guesses.
=========================================================================== */
let MG_V8_RECOG_SERIAL=0;
let MG_V8_CHUNK_SCORE_CACHE=new Map();
function mgRotateWordV8(strokes,angle,cx,cy){
  const c=Math.cos(angle),s=Math.sin(angle);return(strokes||[]).map(st=>{
    const pts=(st.pts||[]).map(p=>{const dx=p.x-cx,dy=p.y-cy;return{...p,x:cx+dx*c-dy*s,y:cy+dx*s+dy*c}});
    return{...st,pts,b:wbBounds(pts)};
  });
}
function mgDeskewWordV8(strokes){
  if(!strokes?.length)return strokes||[];const B=wtWordBounds(strokes),centers=[];
  for(const st of strokes){const b=wbStrokeBounds(st);if(b.w+b.h<2)continue;centers.push({x:b.x+b.w/2,y:b.y+b.h/2,w:Math.max(1,Math.sqrt(Math.max(1,b.w*b.h)))})}
  let angle=0;
  if(centers.length>=3){
    let sw=0,mx=0,my=0;for(const p of centers){sw+=p.w;mx+=p.x*p.w;my+=p.y*p.w}mx/=sw;my/=sw;
    let xx=0,xy=0;for(const p of centers){xx+=(p.x-mx)*(p.x-mx)*p.w;xy+=(p.x-mx)*(p.y-my)*p.w}
    if(xx>1)angle=Math.atan2(xy,xx);
  }else if(strokes.length===1){
    const p=strokes[0].pts||[];if(p.length>6){const a=p[Math.floor(p.length*.10)],z=p[Math.floor(p.length*.90)];if(z.x-a.x>Math.max(18,B.w*.55))angle=Math.atan2(z.y-a.y,z.x-a.x)}
  }
  angle=Math.max(-24*Math.PI/180,Math.min(24*Math.PI/180,angle));
  if(Math.abs(angle)<1.5*Math.PI/180)return strokes;
  return mgRotateWordV8(strokes,-angle,B.x+B.w/2,B.y+B.h/2);
}
function mgChunkSpecificMapV8(strokes,n,labels){
  if(!strokes?.length||!labels?.size)return new Map();
  const sig=wtSparseSignature(strokes),idx=mgHwrProtoIndexV6()[n],out=new Map();
  for(const label of labels){let best=0;for(const s of(idx.get(label)||[]))best=Math.max(best,wtSigSim(sig,s.sig)*wtOpenSampleWeight(s));out.set(label,best)}
  return out;
}
function mgDecodePartsV8(parts,n,est){
  if(parts.length!==n||parts.some(p=>!p.length))return[];
  const letters=parts.map(p=>mgLetterChoicesV7(p,5));if(letters.some(a=>!a.length))return[];
  const pairMaps=Array(n).fill(null),trioMaps=Array(n).fill(null);
  for(let i=1;i<n;i++){
    const labels=new Set();for(const a of letters[i-1])for(const b of letters[i])labels.add((a.label+b.label).toLowerCase());
    pairMaps[i]=mgChunkSpecificMapV8(wtOpenUnionStrokes(parts,i-1,i+1),2,labels);
  }
  for(let i=2;i<n;i++){
    const labels=new Set();for(const a of letters[i-2])for(const b of letters[i-1])for(const c of letters[i])labels.add((a.label+b.label+c.label).toLowerCase());
    trioMaps[i]=mgChunkSpecificMapV8(wtOpenUnionStrokes(parts,i-2,i+1),3,labels);
  }
  let beam=[{text:'',log:0}];
  for(let i=0;i<n;i++){
    const next=[];for(const b of beam)for(const c of letters[i]){
      const pair=i>=1?(b.text.slice(-1)+c.label).toLowerCase():'',trio=i>=2?(b.text.slice(-2)+c.label).toLowerCase():'';
      const bonus=(pairMaps[i]?.get(pair)||0)*.22+(trioMaps[i]?.get(trio)||0)*.16;
      next.push({text:b.text+c.label,log:b.log+Math.log(Math.max(.006,c.score))+bonus});
    }
    next.sort((a,b)=>b.log-a.log);beam=next.slice(0,24);if(!beam.length)return[];
  }
  const prior=Math.exp(-Math.abs(n-est)/Math.max(2,est*.6)),seen=new Set(),out=[];
  for(const b of beam){const k=canon(b.text);if(!k||seen.has(k))continue;seen.add(k);out.push({label:b.text,score:Math.exp(b.log/n)*(.76+.24*prior),source:`open spelling · ${n} chars`});if(out.length>=5)break}
  return out;
}
function mgOpenSpellCandidatesV8(original){
  const strokes=mgDeskewWordV8(original),L=mgCandidateLengthsV6(strokes),all=[];
  for(const n of L.vals){const parts=mgDensityPartsV6(strokes,n);all.push(...mgDecodePartsV8(parts,n,L.est))}
  const seen=new Map();for(const x of all){const k=canon(x.label);if(!k)continue;const o=seen.get(k);if(!o||x.score>o.score)seen.set(k,x)}
  return{candidates:[...seen.values()].sort((a,b)=>b.score-a.score).slice(0,12),lengthModel:L,normalized:strokes};
}
/* Split a spatial cluster at a genuine whitespace/pause boundary and retain the
   component containing the most recently drawn stroke. */
const _wbClusterRecentV8Base=wbClusterRecent;
wbClusterRecent=function(latest){
  const raw=_wbClusterRecentV8Base(latest);if(raw.length<2)return raw;
  const latestB=wbStrokeBounds(latest),latestX=latestB.x+latestB.w/2,B=wbUnionBounds(raw.map(wbStrokeBounds)),H=Math.max(12,B.h);
  const items=raw.map(st=>({st,b:wbStrokeBounds(st)})).sort((a,b)=>a.b.x-b.b.x),cuts=[];
  for(let i=1;i<items.length;i++){
    const a=items[i-1],b=items[i],gap=b.b.x-(a.b.x+a.b.w),dt=Math.abs((b.st.created||0)-(a.st.created||0));
    const strong=gap>Math.max(20,H*.52),pauseGap=dt>900&&gap>Math.max(12,H*.26);
    if(strong||pauseGap)cuts.push((a.b.x+a.b.w+b.b.x)/2);
  }
  if(!cuts.length)return raw;let lo=-Infinity,hi=Infinity;for(const x of cuts){if(x<latestX)lo=Math.max(lo,x);else if(x>latestX)hi=Math.min(hi,x)}
  const kept=raw.filter(st=>{const b=wbStrokeBounds(st),x=b.x+b.w/2;return x>lo&&x<hi});return kept.length?kept:raw;
};
/* Treat estimated 2+ character ink as open vocabulary even if the old heuristic
   thinks the strokes form only one or two connected components. */
wbRecognizeStrokes=async function(strokes,mode='node'){
  if(!strokes||!strokes.length)return{guesses:[],openGuesses:[],knownGuesses:[],engine:''};
  if(mode==='letter')return _wbRecognizeV6Fallback(strokes,mode);
  const serial=++MG_V8_RECOG_SERIAL,dec=mgOpenSpellCandidatesV8(strokes),est=dec.lengthModel.est;
  if(est<1.65&&!wtLikelyMultiLetter(strokes))return _wbRecognizeV6Fallback(strokes,mode);
  const rawOpen=dec.candidates.slice();
  const rawEngine=await mgRawHandwritingEngine(dec.normalized);
  for(const g of rawEngine.guesses||[]){const n=[...g].filter(ch=>/\p{L}|\d/u.test(ch)).length;if(n>=dec.lengthModel.min&&n<=dec.lengthModel.max&&!rawOpen.some(x=>canon(x.label)===canon(g)))rawOpen.push({label:g,score:.47,source:rawEngine.engine||'open handwriting'})}
  rawOpen.sort((a,b)=>b.score-a.score);
  const openGuesses=[],seen=new Set();for(const x of rawOpen){const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);openGuesses.push(x.label);if(openGuesses.length>=7)break}
  const knownGuesses=[];for(const x of mgKnownSuggestionsV7(rawOpen)){const k=canon(x.label);if(seen.has(k))continue;seen.add(k);knownGuesses.push(x.label)}
  return{guesses:[...openGuesses,...knownGuesses],openGuesses,knownGuesses,engine:`personal open spelling · ~${Math.round(est)} chars`,trainingCount:mgHwrCountV6(),estimatedCharacters:est,serial};
};
/* Prevent a slower result for older ink from replacing a newer recognition. */
wbScheduleWordGuess=function(st){
  clearTimeout(WB.wordTimer);if(!WB.autoText)return;const scheduledStrokeId=st.id;
  WB.wordTimer=setTimeout(()=>{
    if(WB.pendingNode||WB.pendingArrow||!wbStroke(scheduledStrokeId)||st.role)return;const cl=wbClusterRecent(st);if(!cl.length||cl.length>90)return;
    const clusterIds=cl.map(x=>x.id),clusterKey=clusterIds.join('|');
    const run=async()=>{const rr=await wbRecognizeStrokes(cl,'node');const current=wbStroke(scheduledStrokeId);if(!current||current.role)return;const now=wbClusterRecent(current).map(x=>x.id).join('|');if(now!==clusterKey)return;if(rr.guesses.length){WB.ghostText={strokeIds:clusterIds,bounds:wbUnionBounds(cl.map(wbStrokeBounds)),text:rr.guesses[0],alts:rr.guesses,openAlts:rr.openGuesses||rr.guesses,knownAlts:rr.knownGuesses||[],engine:rr.engine,cls:wbGuessClass(rr.guesses[0])};render()}};
    if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1500});else setTimeout(run,30);
  },1150);
};



/* ---------- V8.1 phrase grouping + backup completeness ---------- */
function mgWordGroupsV8(strokes){
  if(!strokes?.length)return[];const items=strokes.map(st=>({st,b:wbStrokeBounds(st)})).filter(x=>x.b.w+x.b.h>1);if(items.length<2)return[strokes];
  const allH=items.map(x=>Math.max(2,x.b.h)).sort((a,b)=>a-b),rawMed=allH[Math.floor(allH.length/2)]||16;
  const body=items.filter(x=>x.b.h>=Math.max(7,rawMed*.48));
  const seed=body.length?body:items,bodyH=seed.map(x=>Math.max(6,x.b.h)).sort((a,b)=>a-b),medH=bodyH[Math.floor(bodyH.length/2)]||Math.max(12,rawMed),lines=[];
  /* Build lines from body strokes first; dots/diacritics get attached afterward. */
  for(const it of seed.slice().sort((a,b)=>(a.b.y+a.b.h/2)-(b.b.y+b.b.h/2))){
    const cy=it.b.y+it.b.h/2;let best=null,bd=Infinity;for(const L of lines){const d=Math.abs(cy-L.cy);if(d<bd&&d<Math.max(20,medH*.68)){best=L;bd=d}}
    if(!best){best={items:[],cy};lines.push(best)}best.items.push(it);best.cy=best.items.reduce((s,x)=>s+x.b.y+x.b.h/2,0)/best.items.length;
  }
  const seedSet=new Set(seed.map(x=>x.st.id));for(const it of items){if(seedSet.has(it.st.id))continue;const cx=it.b.x+it.b.w/2,cy=it.b.y+it.b.h/2;let best=null,score=Infinity;
    for(const L of lines){const lb=wbUnionBounds(L.items.map(x=>x.b)),xgap=Math.max(0,lb.x-cx,cx-(lb.x+lb.w)),dy=Math.abs(cy-L.cy),s=dy+xgap*.55;if(xgap<Math.max(24,medH*.8)&&s<score){score=s;best=L}}
    (best||lines[0]).items.push(it);
  }
  lines.sort((a,b)=>a.cy-b.cy);const groups=[];for(const L of lines){const a=L.items.sort((x,y)=>x.b.x-y.b.x);let g=[];
    for(const it of a){if(!g.length){g=[it];continue}const gb=wbUnionBounds(g.map(x=>x.b)),gap=it.b.x-(gb.x+gb.w),H=Math.max(medH,gb.h,it.b.h);if(gap>Math.max(22,H*.58)){groups.push(g.map(x=>x.st));g=[it]}else g.push(it)}if(g.length)groups.push(g.map(x=>x.st));
  }return groups.length?groups:[strokes];
}
async function mgRecognizeSingleV8(strokes,mode='node'){
  const dec=mgOpenSpellCandidatesV8(strokes),est=dec.lengthModel.est;
  if(est<1.65&&!wtLikelyMultiLetter(strokes))return _wbRecognizeV6Fallback(strokes,mode);
  const rawOpen=dec.candidates.slice(),rawEngine=await mgRawHandwritingEngine(dec.normalized);
  for(const g of rawEngine.guesses||[]){const n=[...g].filter(ch=>/\p{L}|\d/u.test(ch)).length;if(n>=dec.lengthModel.min&&n<=dec.lengthModel.max&&!rawOpen.some(x=>canon(x.label)===canon(g)))rawOpen.push({label:g,score:.47,source:rawEngine.engine||'open handwriting'})}
  rawOpen.sort((a,b)=>b.score-a.score);const openGuesses=[],seen=new Set();for(const x of rawOpen){const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);openGuesses.push(x.label);if(openGuesses.length>=7)break}
  const knownGuesses=[];for(const x of mgKnownSuggestionsV7(rawOpen)){const k=canon(x.label);if(seen.has(k))continue;seen.add(k);knownGuesses.push(x.label)}
  return{guesses:[...openGuesses,...knownGuesses],openGuesses,knownGuesses,engine:`personal open spelling · ~${Math.round(est)} chars`,trainingCount:mgHwrCountV6(),estimatedCharacters:est};
}
wbRecognizeStrokes=async function(strokes,mode='node'){
  if(!strokes||!strokes.length)return{guesses:[],openGuesses:[],knownGuesses:[],engine:''};if(mode==='letter')return _wbRecognizeV6Fallback(strokes,mode);
  const groups=mgWordGroupsV8(strokes);
  if(groups.length>1&&groups.length<=8){
    const rs=[];for(const g of groups)rs.push(await mgRecognizeSingleV8(g,mode));
    if(rs.every(r=>r.guesses?.length)){
      const first=rs.map(r=>r.guesses[0]).join(' '),alts=[first];
      for(let i=0;i<rs.length&&alts.length<6;i++)for(const x of(rs[i].openGuesses||rs[i].guesses).slice(1,3)){const p=rs.map((r,j)=>j===i?x:r.guesses[0]).join(' ');if(!alts.some(a=>canon(a)===canon(p)))alts.push(p)}
      return{guesses:alts,openGuesses:alts,knownGuesses:[],engine:`personal phrase spelling · ${groups.length} words`,trainingCount:mgHwrCountV6()};
    }
  }
  return mgRecognizeSingleV8(strokes,mode);
};
async function mgV8LabBackupFromDB(){
  try{const s=await mgHwrGetV6('lab-state');if(!s)return null;return{validation:structuredClone(s.validation||[]),labState:{guided:s.guided||{},segment:{overrides:s.segment?.overrides||{}},generator:s.gen||{}}}}catch(e){return null}
}
exportDownload=async function(){
  const a=await mgV7TrainingObject(),backup=await mgV8LabBackupFromDB();if(backup){a.T.lab=a.T.lab||{};a.T.lab.backupV8=backup}a.checksum=await mgV7Sha256(JSON.stringify(a.T));
  const Gx=structuredClone(G);Gx.whiteboard=Gx.whiteboard||{};Gx.whiteboard.training=a.T;Gx.whiteboard.training.lab={...(Gx.whiteboard.training.lab||{}),exportMeta:{version:8,sampleCount:a.sampleCount,checksum:a.checksum,categoryCounts:a.categoryCounts,created:new Date().toISOString()}};
  const rt=JSON.parse(JSON.stringify(Gx)),n=rt?.whiteboard?.training?.samples?.length||0;if(n!==a.sampleCount)return alert(`Export self-check failed (${n}/${a.sampleCount})`);
  return shareOrDownloadJSON(`medgraph-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(Gx,null,2));
};
exportHandwritingDownload=async function(){
  const a=await mgV7TrainingObject(),backup=await mgV8LabBackupFromDB();if(backup){a.T.lab=a.T.lab||{};a.T.lab.backupV8=backup}
  const pack={format:'medgraph-handwriting-training-pack',version:8,created:new Date().toISOString(),sampleCount:a.sampleCount,categoryCounts:a.categoryCounts,checksum:await mgV7Sha256(JSON.stringify(a.T)),training:a.T,validation:backup?.validation||[],labState:backup?.labState||null};
  const rt=JSON.parse(JSON.stringify(pack));if((rt.training?.samples?.length||0)!==a.sampleCount)return alert('Handwriting backup self-check failed');return shareOrDownloadJSON(`medgraph-handwriting-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(pack,null,2));
};
importTrainingText=function(txt){
  let x;try{x=JSON.parse(txt)}catch(e){return toast('That is not valid JSON')}
  const t=x?.format==='medgraph-handwriting-training-pack'?x.training:x?.training?.samples?x.training:x?.whiteboard?.training?.samples?x.whiteboard.training:x?.graph?.whiteboard?.training?.samples?x.graph.whiteboard.training:Array.isArray(x?.samples)?{samples:x.samples}:null;if(!t)return toast('No handwriting training found');
  const before=mgHwrCountV6();mgHwrMergeV6(MG_HWR_MEMORY,t);const backup=x.labState?{validation:x.validation||[],labState:x.labState}:t?.lab?.backupV8;
  const restoredState=backup?.labState?{guided:backup.labState.guided||{},segment:backup.labState.segment||{},gen:backup.labState.generator||backup.labState.gen||{},validation:backup.validation||[]}:null;
  Promise.all([mgHwrPersistNowV6(),restoredState?mgHwrPutV6('lab-state',restoredState):Promise.resolve()]).then(()=>{render();toast(`Imported ${mgHwrCountV6()-before} new · ${mgHwrCountV6()} total${backup?' + trainer state':''}`)});
};



/* ==================== PWA V9 STABILITY / RECOGNITION ==================== */
const MEDGRAPH_BUILD_V9='9.0-stable';
const MG_V9_SIG_CACHE=new WeakMap();let MG_V9_WRITING_METRICS=null;
function mgV9Pop32(x){x=x-((x>>>1)&0x55555555);x=(x&0x33333333)+((x>>>2)&0x33333333);return((((x+(x>>>4))&0x0F0F0F0F)*0x01010101)>>>24)}
function mgV9Bits(a){if(!a||typeof a!=='object')return{b:new Uint32Array(18),n:0};let q=MG_V9_SIG_CACHE.get(a);if(q)return q;const b=new Uint32Array(18);let n=0;for(const v0 of a){const v=v0|0;if(v<0||v>=576)continue;const i=v>>>5,m=1<<(v&31);if(!(b[i]&m)){b[i]|=m;n++}}q={b,n};MG_V9_SIG_CACHE.set(a,q);return q}
wtSigSim=function(a,b){if(!a?.length||!b?.length)return 0;const A=mgV9Bits(a),B=mgV9Bits(b);let inter=0;for(let i=0;i<18;i++)inter+=mgV9Pop32(A.b[i]&B.b[i]);return inter/Math.max(1,A.n+B.n-inter)};

const _mgHwrMergeV9Base=mgHwrMergeV6;
mgHwrMergeV6=function(dst,src){const r=_mgHwrMergeV9Base(dst,src);MG_V9_WRITING_METRICS=null;MG_HWR_PROTO_CACHE=null;return r};
const _wtStoreV9Base=wtStoreExample;
wtStoreExample=function(...args){const r=_wtStoreV9Base(...args);MG_V9_WRITING_METRICS=null;return r};

function mgIsSyntheticV9(s){return !!(s?.meta?.synthetic||String(s?.source||'').startsWith('synthetic'))}
function mgSampleAspectV9(s){const pts=(s?.strokes||[]).flatMap(st=>(st.pts||[]).map(q=>Array.isArray(q)?{x:+q[0],y:+q[1]}:q)).filter(p=>isFinite(p.x)&&isFinite(p.y));if(!pts.length)return null;let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;for(const p of pts){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)}return(x1-x0)/Math.max(.015,y1-y0)}
function mgWritingMetricsV9(){if(MG_V9_WRITING_METRICS)return MG_V9_WRITING_METRICS;const pitches=[],letterAspects=[],strokesPerLetter=[];for(const s of wtSamples()){
  const label=String(s.label||'').trim(),letters=[...label].filter(ch=>/\p{L}|\d/u.test(ch));if(['letter','letter_auto'].includes(s.category)&&letters.length===1){const a=mgSampleAspectV9(s);if(a&&a>.06&&a<2.5)letterAspects.push(a);strokesPerLetter.push((s.strokes||[]).length||1)}
  if(['word','node','sequence_step','relationship_label'].includes(s.category)&&!mgIsSyntheticV9(s)&&/^\p{L}[\p{L}\d'-]*$/u.test(label)&&letters.length>=3&&letters.length<=28){const a=mgSampleAspectV9(s),p=a/letters.length;if(p>.12&&p<1.1)pitches.push(p)}
}
 const med=a=>{if(!a.length)return null;a=a.slice().sort((x,y)=>x-y);return a[Math.floor(a.length/2)]};MG_V9_WRITING_METRICS={pitch:med(pitches)||.46,pitchN:pitches.length,letterAspect:med(letterAspects)||.52,strokes:med(strokesPerLetter)||1.5};return MG_V9_WRITING_METRICS}
mgCandidateLengthsV6=function(strokes){const b=wtWordBounds(strokes),M=mgWritingMetricsV9(),aspect=b.w/Math.max(1,b.h),pitchEst=aspect/Math.max(.18,M.pitch),letterEst=aspect/Math.max(.24,M.letterAspect*.90),strokeEst=(strokes.length||1)/Math.max(.9,M.strokes),gapEst=Math.max(2,wtSegmentWordInk(strokes).length||2);let est;if(M.pitchN>=6)est=.64*pitchEst+.18*letterEst+.08*strokeEst+.10*gapEst;else est=.44*pitchEst+.32*letterEst+.10*strokeEst+.14*gapEst;est=Math.max(1,Math.min(32,est));const c=Math.max(1,Math.round(est)),set=new Set();for(const d of[0,-1,1,-2,2]){const n=c+d;if(n>=1&&n<=32)set.add(n)}if(M.pitchN<6){for(const n of[Math.round(est*.78),Math.round(est*1.22)])if(n>=1&&n<=32)set.add(n)}return{vals:[...set].sort((a,b)=>Math.abs(a-est)-Math.abs(b-est)),est,min:Math.max(1,Math.floor(est*.62)),max:Math.min(32,Math.ceil(est*1.42+1)),wordAspect:aspect,calibrationWords:M.pitchN}};

/* Conservative word/phrase separation. Internal letter gaps and late i-dots/t
   crossbars stay with the word; only clear whitespace splits a line. */
function mgWordGroupsV9(strokes){if(!strokes?.length)return[];const items=strokes.map(st=>({st,b:wbStrokeBounds(st)})).filter(x=>x.b.w+x.b.h>1);if(items.length<2)return[strokes];const hs=items.map(x=>Math.max(3,x.b.h)).sort((a,b)=>a-b),raw=hs[Math.floor(hs.length/2)]||16,body=items.filter(x=>x.b.h>=Math.max(7,raw*.45)),seed=body.length?body:items,bhs=seed.map(x=>x.b.h).sort((a,b)=>a-b),H=bhs[Math.floor(bhs.length/2)]||raw,lines=[];for(const it of seed.slice().sort((a,b)=>(a.b.y+a.b.h/2)-(b.b.y+b.b.h/2))){const cy=it.b.y+it.b.h/2;let L=null,d0=Infinity;for(const q of lines){const d=Math.abs(cy-q.cy);if(d<d0&&d<Math.max(24,H*.78)){L=q;d0=d}}if(!L){L={items:[],cy};lines.push(L)}L.items.push(it);L.cy=L.items.reduce((s,x)=>s+x.b.y+x.b.h/2,0)/L.items.length}const ids=new Set(seed.map(x=>x.st.id));for(const it of items){if(ids.has(it.st.id))continue;const cx=it.b.x+it.b.w/2,cy=it.b.y+it.b.h/2;let best=null,score=Infinity;for(const L of lines){const B=wbUnionBounds(L.items.map(x=>x.b)),xgap=Math.max(0,B.x-cx,cx-(B.x+B.w)),d=Math.abs(cy-L.cy)+xgap*.45;if(xgap<Math.max(32,H*.95)&&d<score){score=d;best=L}}(best||lines[0]).items.push(it)}lines.sort((a,b)=>a.cy-b.cy);const out=[];for(const L of lines){const a=L.items.sort((x,y)=>x.b.x-y.b.x),pos=[];for(let i=1;i<a.length;i++){const g=a[i].b.x-(a[i-1].b.x+a[i-1].b.w);if(g>0)pos.push(g)}pos.sort((x,y)=>x-y);const med=pos.length?pos[Math.floor(pos.length/2)]:0,threshold=Math.max(24,H*.70,med*2.8);let g=[];for(const it of a){if(!g.length){g=[it];continue}const B=wbUnionBounds(g.map(x=>x.b)),gap=it.b.x-(B.x+B.w);if(gap>threshold){out.push(g.map(x=>x.st));g=[it]}else g.push(it)}if(g.length)out.push(g.map(x=>x.st))}return out.length?out:[strokes]}
mgWordGroupsV8=mgWordGroupsV9;

/* Base spatial cluster + conservative geometry-only word-space cut. Never use
   creation-time differences between spatial neighbors: late dots/crossbars are
   intentionally out of temporal order. */
wbClusterRecent=function(latest){const raw=_wbClusterRecentV8Base(latest);if(raw.length<2)return raw;const B=wbUnionBounds(raw.map(wbStrokeBounds)),H=Math.max(12,B.h),items=raw.map(st=>({st,b:wbStrokeBounds(st)})).sort((a,b)=>a.b.x-b.b.x),pos=[];for(let i=1;i<items.length;i++){const g=items[i].b.x-(items[i-1].b.x+items[i-1].b.w);if(g>0)pos.push(g)}pos.sort((a,b)=>a-b);const med=pos.length?pos[Math.floor(pos.length/2)]:0,cutGap=Math.max(30,H*.78,med*3.1),cuts=[];for(let i=1;i<items.length;i++){const a=items[i-1].b,b=items[i].b,g=b.x-(a.x+a.w);if(g>cutGap)cuts.push((a.x+a.w+b.x)/2)}if(!cuts.length)return raw;const lb=wbStrokeBounds(latest),x0=lb.x+lb.w/2;let lo=-Infinity,hi=Infinity;for(const x of cuts){if(x<x0)lo=Math.max(lo,x);else if(x>x0)hi=Math.min(hi,x)}const kept=raw.filter(st=>{const b=wbStrokeBounds(st),x=b.x+b.w/2;return x>lo&&x<hi});return kept.length?kept:raw};

async function mgRecognizeSingleV9(strokes,mode='node'){const dec=mgOpenSpellCandidatesV8(strokes),est=dec.lengthModel.est;if(est<1.45&&!wtLikelyMultiLetter(strokes))return _wbRecognizeV6Fallback(strokes,mode);const raw=dec.candidates.slice(),native=await mgRawHandwritingEngine(dec.normalized);for(const g of native.guesses||[]){const n=[...g].filter(ch=>/\p{L}|\d/u.test(ch)).length;if(n>=dec.lengthModel.min&&n<=dec.lengthModel.max&&!raw.some(x=>canon(x.label)===canon(g)))raw.push({label:g,score:.47,source:native.engine||'open handwriting'})}/* personal whole-word samples are secondary evidence, never a closed vocabulary */for(const x of wtWordPrototypeMatches(strokes,mode).slice(0,3))if(!raw.some(y=>canon(y.label)===canon(x.label)))raw.push({label:x.label,score:Math.min(.52,x.score*.58),source:'personal whole-word sample'});raw.sort((a,b)=>b.score-a.score);const open=[],seen=new Set();for(const x of raw){const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);open.push(x.label);if(open.length>=7)break}const known=[];for(const x of mgKnownSuggestionsV7(raw)){const k=canon(x.label);if(seen.has(k))continue;seen.add(k);known.push(x.label);if(known.length>=3)break}return{guesses:[...open,...known],openGuesses:open,knownGuesses:known,engine:`v9 personal spelling · ~${Math.round(est)} chars${dec.lengthModel.calibrationWords?` · ${dec.lengthModel.calibrationWords} word calibration samples`:''}`,trainingCount:mgHwrCountV6(),estimatedCharacters:est}}
wbRecognizeStrokes=async function(strokes,mode='node'){if(!strokes?.length)return{guesses:[],openGuesses:[],knownGuesses:[],engine:''};if(mode==='letter')return _wbRecognizeV6Fallback(strokes,mode);const groups=mgWordGroupsV9(strokes);if(groups.length>1&&groups.length<=8){const rs=[];for(const g of groups)rs.push(await mgRecognizeSingleV9(g,mode));if(rs.every(r=>r.guesses?.length)){const first=rs.map(r=>r.guesses[0]).join(' '),alts=[first];for(let i=0;i<rs.length&&alts.length<6;i++)for(const x of(rs[i].openGuesses||[]).slice(1,3)){const p=rs.map((r,j)=>j===i?x:r.guesses[0]).join(' ');if(!alts.some(a=>canon(a)===canon(p)))alts.push(p)}return{guesses:alts,openGuesses:alts,knownGuesses:[],engine:`v9 phrase spelling · ${groups.length} words`,trainingCount:mgHwrCountV6()}}}return mgRecognizeSingleV9(strokes,mode)};

/* Do not lose a just-written board when switching pages. */
async function goInkLabV9(){try{clearTimeout(WB.saveTimer);if(WB._viewSave)clearTimeout(WB._viewSave);await save();await mgHwrPersistNowV6()}catch(e){console.error(e);toast('Could not finish saving yet');return}location.assign('./handwriting-lab.html')}
window.addEventListener('pagehide',()=>{try{clearTimeout(WB.saveTimer);save();mgHwrPersistNowV6()}catch(e){}});
window.addEventListener('pageshow',async e=>{if(!e.persisted)return;try{await mgHwrSyncIntoWhiteboard(false);refresh();render();applySidebar()}catch(err){console.error(err)}});

/* Backup integrity checker is also available from the console as
   MedGraphIntegrityCheck() and is used by the export panel. */
async function MedGraphIntegrityCheck(){const T=await mgV7FreshTraining(),db=await mgHwrGetV6(MG_HWR_V6_TRAINING_KEY).catch(()=>null),cats=mgV7CategoryCounts(T),sum=await mgV9TrainingChecksum(T),dbSum=db?await mgV9TrainingChecksum(db):null,memorySamples=T.samples?.length||0,storedSamples=db?.samples?.length||0;return{build:MEDGRAPH_BUILD_V9,memorySamples,storedSamples,match:memorySamples===storedSamples&&(!dbSum||sum===dbSum),checksum:sum,storedChecksum:dbSum,categoryCounts:cats,calibration:mgWritingMetricsV9()}}
async function mgShowIntegrityV9(){const x=await MedGraphIntegrityCheck();alert('Build '+x.build+'\nMemory samples: '+x.memorySamples+'\nStored samples: '+x.storedSamples+'\nMatch: '+x.match+'\nCalibration words: '+x.calibration.pitchN)}



/* ---------- v9 canonical backup / restore ---------- */
function mgV9ChecksumView(T){const x=structuredClone(T||{});if(x.lab?.exportMeta)delete x.lab.exportMeta;return x}
async function mgV9TrainingChecksum(T){return mgV7Sha256(JSON.stringify(mgV9ChecksumView(T)))}
function mgV9ValidSample(s){return!!(s&&typeof s==='object'&&typeof s.category==='string'&&('label'in s)&&Array.isArray(s.sig)&&Array.isArray(s.strokes))}
function mgV9MergeTraining(dst,src){dst=dst||MG_HWR_MEMORY;src=src||{};dst.samples=Array.isArray(dst.samples)?dst.samples:[];const byId=new Map();dst.samples.forEach((s,i)=>{if(s?.id)byId.set(s.id,i)});let added=0,updated=0,skipped=0;for(const raw of(Array.isArray(src.samples)?src.samples:[])){if(!mgV9ValidSample(raw)){skipped++;continue}const s=raw;if(s.id&&byId.has(s.id)){const i=byId.get(s.id),old=dst.samples[i],oldRich=JSON.stringify(old).length,newRich=JSON.stringify(s).length;if((s.updated||s.created||0)>(old.updated||old.created||0)||newRich>oldRich){dst.samples[i]={...old,...s,meta:{...(old.meta||{}),...(s.meta||{})}};updated++}continue}if(!s.id)s.id='imp_'+Math.random().toString(36).slice(2)+Date.now().toString(36);byId.set(s.id,dst.samples.length);dst.samples.push(s);added++}for(const k of['arrowPos','arrowNeg','nodePos','nodeNeg']){dst[k]=Array.isArray(dst[k])?dst[k]:[];const have=new Set(dst[k].map(x=>JSON.stringify(x)));for(const x of(Array.isArray(src[k])?src[k]:[])){const q=JSON.stringify(x);if(!have.has(q)){dst[k].push(x);have.add(q)}}}dst.lab={...(src.lab||{}),...(dst.lab||{})};dst.version=9;dst.updatedAt=Date.now();MG_HWR_PROTO_CACHE=null;MG_V9_WRITING_METRICS=null;return{added,updated,skipped}}
async function mgV9BackupCore(){await mgHwrSyncIntoWhiteboard(false);const T=structuredClone(MG_HWR_MEMORY),state=await mgHwrGetV6('lab-state').catch(()=>null);T.lab=T.lab||{};if(state)T.lab.backupV9={version:9,validation:structuredClone(state.validation||[]),labState:{guided:structuredClone(state.guided||{}),segment:{overrides:structuredClone(state.segment?.overrides||{})},generator:structuredClone(state.gen||{})}};if(T.lab.exportMeta)delete T.lab.exportMeta;const sampleCount=T.samples?.length||0,categoryCounts=mgV7CategoryCounts(T),checksum=await mgV9TrainingChecksum(T);return{T,sampleCount,categoryCounts,checksum,backup:T.lab.backupV9||null}}
async function mgV9FullExportObject(){const a=await mgV9BackupCore(),Gx=structuredClone(G);Gx.whiteboard=Gx.whiteboard||{};Gx.whiteboard.training=structuredClone(a.T);Gx.whiteboard.training.lab=Gx.whiteboard.training.lab||{};Gx.whiteboard.training.lab.exportMeta={version:9,created:new Date().toISOString(),sampleCount:a.sampleCount,categoryCounts:a.categoryCounts,checksum:a.checksum};const rt=JSON.parse(JSON.stringify(Gx)),T=rt?.whiteboard?.training,n=T?.samples?.length||0,sum=await mgV9TrainingChecksum(T);if(n!==a.sampleCount||sum!==a.checksum)throw Error(`Full export self-check failed (${n}/${a.sampleCount})`);return{Gx,...a}}
exportDownload=async function(){try{const a=await mgV9FullExportObject();return shareOrDownloadJSON(`medgraph-v9-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(a.Gx,null,2))}catch(e){alert('Export failed before download:\n'+e.message)}};
exportHandwritingDownload=async function(){try{const a=await mgV9BackupCore(),pack={format:'medgraph-handwriting-training-pack',version:9,created:new Date().toISOString(),sampleCount:a.sampleCount,categoryCounts:a.categoryCounts,checksum:a.checksum,training:a.T,validation:a.backup?.validation||[],labState:a.backup?.labState||null},rt=JSON.parse(JSON.stringify(pack)),n=rt.training?.samples?.length||0,sum=await mgV9TrainingChecksum(rt.training);if(n!==a.sampleCount||sum!==a.checksum)throw Error(`Handwriting export self-check failed (${n}/${a.sampleCount})`);return shareOrDownloadJSON(`medgraph-handwriting-v9-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(pack,null,2))}catch(e){alert('Export failed before download:\n'+e.message)}};
exportCopy=async function(){try{const a=await mgV9FullExportObject();return copyTextSmart(JSON.stringify(a.Gx,null,2),'expta')}catch(e){alert('Copy failed:\n'+e.message)}};
exportHandwritingCopy=async function(){try{const a=await mgV9BackupCore(),pack={format:'medgraph-handwriting-training-pack',version:9,created:new Date().toISOString(),sampleCount:a.sampleCount,categoryCounts:a.categoryCounts,checksum:a.checksum,training:a.T,validation:a.backup?.validation||[],labState:a.backup?.labState||null};return copyTextSmart(JSON.stringify(pack,null,2),'exphw')}catch(e){alert('Copy failed:\n'+e.message)}};
function mgV9ExtractImport(x){if(x?.format==='medgraph-handwriting-training-pack')return{training:x.training,validation:x.validation||x.training?.lab?.backupV9?.validation||x.training?.lab?.backupV8?.validation,labState:x.labState||x.training?.lab?.backupV9?.labState||x.training?.lab?.backupV8?.labState,declared:x.sampleCount,checksum:x.checksum};if(x?.training?.samples)return{training:x.training,validation:x.validation,labState:x.labState,declared:x.sampleCount,checksum:x.checksum};if(Array.isArray(x?.samples))return{training:{samples:x.samples},validation:x.validation,labState:x.labState,declared:x.sampleCount,checksum:x.checksum};const g=x?.graph||x,t=g?.whiteboard?.training;return{graph:g,training:t,validation:t?.lab?.backupV9?.validation||t?.lab?.backupV8?.validation||t?.lab?.validation||x.validation,labState:t?.lab?.backupV9?.labState||t?.lab?.backupV8?.labState,declared:t?.lab?.exportMeta?.sampleCount,checksum:t?.lab?.exportMeta?.checksum}}
importTrainingText=async function(txt){let x;try{x=JSON.parse(txt)}catch(e){return toast('That is not valid JSON')}try{const I=mgV9ExtractImport(x);if(!I.training)throw Error('No handwriting training found');const actual=I.training.samples?.length||0;if(I.declared!=null&&+I.declared!==actual)throw Error(`Backup count mismatch: file says ${I.declared}, contains ${actual}`);if(I.checksum){const sum=await mgV9TrainingChecksum(I.training);if(sum!==I.checksum)throw Error('Backup checksum mismatch — file may be incomplete')}const before=mgHwrCountV6(),res=mgV9MergeTraining(MG_HWR_MEMORY,I.training),state=I.labState?{guided:I.labState.guided||{},segment:I.labState.segment||{},gen:I.labState.generator||I.labState.gen||{},validation:I.validation||[]}:null;await Promise.all([mgHwrPersistNowV6(),state?mgHwrPutV6('lab-state',state):Promise.resolve()]);render();toast(`Import verified · +${res.added} new · ${res.updated} updated · ${mgHwrCountV6()} total`)}catch(e){alert('Could not import handwriting:\n'+e.message)}};



/* ---------- v9 full MedGraph import + fresh raw export panel ---------- */
mgHwrMergeV6=function(dst,src){const r=mgV9MergeTraining(dst,src);MG_HWR_PROTO_CACHE=null;MG_V9_WRITING_METRICS=null;return dst};
importText=async function(txt){let inc;try{inc=JSON.parse(txt)}catch(e){return toast('That is not valid JSON')}if(!inc||!Array.isArray(inc.defs))return toast('That does not look like a MedGraph export');try{const T=inc?.whiteboard?.training,meta=T?.lab?.exportMeta;if(T&&meta?.sampleCount!=null&&(T.samples?.length||0)!==+meta.sampleCount)throw Error(`Backup count mismatch: file says ${meta.sampleCount}, contains ${T.samples?.length||0}`);if(T&&meta?.checksum){const sum=await mgV9TrainingChecksum(T);if(sum!==meta.checksum)throw Error('Backup checksum mismatch — the file may be incomplete')}if(!confirm(`Merge ${inc.defs.length} nodes and ${(inc.rels||[]).length} edges into this graph?\n\nNodes with the same name are combined, not duplicated. Question history and verified handwriting training are merged.`))return;const r=mergeGraph(inc);const backup=T?.lab?.backupV9||T?.lab?.backupV8;if(backup?.labState){const L=backup.labState,state={guided:L.guided||{},segment:L.segment||{},gen:L.generator||L.gen||{},validation:backup.validation||[]};await mgHwrPutV6('lab-state',state)}await mgHwrPersistNowV6();relinkAll();await save();refresh();render();toast(`Merged · ${r.newDefs} nodes, ${r.newRels} edges, ${r.newSeqs} sequences · ${mgHwrCountV6()} handwriting samples`)}catch(e){alert('Could not import backup:\n'+e.message)}};
const _exportJSONV9Base=exportJSON;
exportJSON=function(){_exportJSONV9Base();setTimeout(async()=>{try{const a=await mgV9FullExportObject(),ta=document.getElementById('expta');if(ta)ta.value=JSON.stringify(a.Gx,null,2);const h=await mgV9BackupCore(),pack={format:'medgraph-handwriting-training-pack',version:9,created:new Date().toISOString(),sampleCount:h.sampleCount,categoryCounts:h.categoryCounts,checksum:h.checksum,training:h.T,validation:h.backup?.validation||[],labState:h.backup?.labState||null},hw=document.getElementById('exphw');if(hw)hw.value=JSON.stringify(pack,null,2)}catch(e){console.error(e)}},0)};


/* ---------- v9 decoder edge cases: case + pair/trio rescue + relation mode ---------- */
mgHwrProtoIndexV6=function(){
  if(MG_HWR_PROTO_CACHE)return MG_HWR_PROTO_CACHE;const idx={1:new Map(),2:new Map(),3:new Map()};
  for(const sm of wtSamples()){
    const raw=String(sm.label||'').trim(),chars=[...raw].filter(ch=>/\p{L}|\d/u.test(ch)),n=chars.length;
    const ok=n===1?['letter','letter_auto','letter_synthetic_context'].includes(sm.category):n===2?['letter_pair','pair_auto','pair_synthetic_context'].includes(sm.category):n===3?['letter_trio','trio_auto','trio_synthetic_context'].includes(sm.category):false;
    if(!ok||!sm.sig?.length)continue;const lab=n===1?raw:raw.toLowerCase();if(!idx[n].has(lab))idx[n].set(lab,[]);idx[n].get(lab).push(sm)
  }
  for(const n of[1,2,3])for(const [lab,a]of idx[n]){a.sort((x,y)=>(wtOpenSampleWeight(y)-wtOpenSampleWeight(x))||((y.created||0)-(x.created||0)));idx[n].set(lab,a.slice(0,8))}
  MG_HWR_PROTO_CACHE=idx;return idx
};
function mgV9AddChoice(map,label,score){if(!label)return;const old=map.get(label)||0;if(score>old)map.set(label,score)}
function mgLetterChoicesRescuedV9(parts,i){
  const own=mgRecognizeChunkV6(parts[i],1,5),m=new Map(own.map(x=>[x.label,x.score])),weak=!own.length||(own[0]?.score||0)<.11;
  if(weak&&i+1<parts.length)for(const x of mgRecognizeChunkV6(wtOpenUnionStrokes(parts,i,i+2),2,5))mgV9AddChoice(m,[...x.label][0],x.score*.68);
  if(weak&&i>0)for(const x of mgRecognizeChunkV6(wtOpenUnionStrokes(parts,i-1,i+1),2,5)){const a=[...x.label];mgV9AddChoice(m,a[1],x.score*.68)}
  if((!m.size||Math.max(...m.values())<.08)&&i+2<parts.length)for(const x of mgRecognizeChunkV6(wtOpenUnionStrokes(parts,i,i+3),3,4))mgV9AddChoice(m,[...x.label][0],x.score*.58);
  return[...m.entries()].map(([label,score])=>({label,score})).sort((a,b)=>b.score-a.score).slice(0,5)
}
mgDecodePartsV8=function(parts,n,est){
  if(parts.length!==n||parts.some(p=>!p.length))return[];const letters=parts.map((_,i)=>mgLetterChoicesRescuedV9(parts,i));if(letters.some(a=>!a.length))return[];
  const pairMaps=Array(n).fill(null),trioMaps=Array(n).fill(null);
  for(let i=1;i<n;i++){const labels=new Set();for(const a of letters[i-1])for(const b of letters[i])labels.add((a.label+b.label).toLowerCase());pairMaps[i]=mgChunkSpecificMapV8(wtOpenUnionStrokes(parts,i-1,i+1),2,labels)}
  for(let i=2;i<n;i++){const labels=new Set();for(const a of letters[i-2])for(const b of letters[i-1])for(const c of letters[i])labels.add((a.label+b.label+c.label).toLowerCase());trioMaps[i]=mgChunkSpecificMapV8(wtOpenUnionStrokes(parts,i-2,i+1),3,labels)}
  let beam=[{text:'',log:0}];for(let i=0;i<n;i++){const next=[];for(const b of beam)for(const c of letters[i]){const pair=i>=1?(b.text.slice(-1)+c.label).toLowerCase():'',trio=i>=2?(b.text.slice(-2)+c.label).toLowerCase():'';const bonus=(pairMaps[i]?.get(pair)||0)*.22+(trioMaps[i]?.get(trio)||0)*.16;next.push({text:b.text+c.label,log:b.log+Math.log(Math.max(.006,c.score))+bonus})}next.sort((a,b)=>b.log-a.log);beam=next.slice(0,24);if(!beam.length)return[]}
  const prior=Math.exp(-Math.abs(n-est)/Math.max(2,est*.6)),seen=new Set(),out=[];for(const b of beam){const k=canon(b.text);if(!k||seen.has(k))continue;seen.add(k);out.push({label:b.text,score:Math.exp(b.log/n)*(.76+.24*prior),source:`open spelling · ${n} chars`});if(out.length>=5)break}return out
};
function mgRelationSuggestionsV9(raw){const out=[];for(const r of ALL_RELS){for(const v of[r,phrase(r),r.replace(/_/g,' ')]){for(const x of raw.slice(0,3)){const a=canon(x.label),b=canon(v),d=editDistance(a,b),sim=1-d/Math.max(1,a.length,b.length);if(sim>.48)out.push({label:phrase(r),score:sim})}}}out.sort((a,b)=>b.score-a.score);const seen=new Set();return out.filter(x=>{const k=canon(x.label);if(seen.has(k))return false;seen.add(k);return true}).slice(0,3)}
/* Replace only the known-suggestion layer; open spelling stays first. */
mgRecognizeSingleV9=async function(strokes,mode='node'){const dec=mgOpenSpellCandidatesV8(strokes),est=dec.lengthModel.est;if(est<1.45&&!wtLikelyMultiLetter(strokes))return _wbRecognizeV6Fallback(strokes,mode);const raw=dec.candidates.slice(),native=await mgRawHandwritingEngine(dec.normalized);for(const g of native.guesses||[]){const n=[...g].filter(ch=>/\p{L}|\d/u.test(ch)).length;if(n>=dec.lengthModel.min&&n<=dec.lengthModel.max&&!raw.some(x=>canon(x.label)===canon(g)))raw.push({label:g,score:.47,source:native.engine||'open handwriting'})}for(const x of wtWordPrototypeMatches(strokes,mode).slice(0,3))if(!raw.some(y=>canon(y.label)===canon(x.label)))raw.push({label:x.label,score:Math.min(.52,x.score*.58),source:'personal whole-word sample'});raw.sort((a,b)=>b.score-a.score);const open=[],seen=new Set();for(const x of raw){const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);open.push(x.label);if(open.length>=7)break}const known=[];const secondary=mode==='relation'?mgRelationSuggestionsV9(raw):mgKnownSuggestionsV7(raw);for(const x of secondary){const k=canon(x.label);if(seen.has(k))continue;seen.add(k);known.push(x.label);if(known.length>=3)break}return{guesses:[...open,...known],openGuesses:open,knownGuesses:known,engine:`v9 personal spelling · ~${Math.round(est)} chars${dec.lengthModel.calibrationWords?` · ${dec.lengthModel.calibrationWords} word calibration samples`:''}`,trainingCount:mgHwrCountV6(),estimatedCharacters:est}}


/* ==================== V11 MODULE INTEGRATION ==================== */
let MG_V11_CANONICAL_READY=false;
let MG_V11_CANONICAL_PROMISE=null;

function mgV11ResetRecognitionCaches(){
  try{MG_HWR_PROTO_CACHE=null}catch(e){}
  try{MG_V7_LETTER_GEOM_CACHE=null}catch(e){}
  try{MG_V8_CHUNK_SCORE_CACHE?.clear?.()}catch(e){}
  try{MG_V9_WRITING_METRICS=null}catch(e){}
}
function mgV11NormalizeTraining(t){
  t=t&&typeof t==='object'?t:{};
  t.samples=Array.isArray(t.samples)?t.samples:[];
  for(const k of ['arrowPos','arrowNeg','nodePos','nodeNeg'])t[k]=Array.isArray(t[k])?t[k]:[];
  t.lab=t.lab&&typeof t.lab==='object'?t.lab:{};
  return t;
}
async function mgV11ReloadCanonicalFromStore(){
  let t=null;
  try{t=await mgHwrGetV6(MG_HWR_V6_TRAINING_KEY)}catch(e){}
  if(!t){
    /* One-time migration fallback only when no canonical record exists. */
    try{
      await mgHwrInitV6();
      t=await mgHwrGetV6(MG_HWR_V6_TRAINING_KEY);
    }catch(e){console.error(e)}
  }
  MG_HWR_MEMORY=mgV11NormalizeTraining(t||MG_HWR_MEMORY);
  MG_V11_CANONICAL_READY=true;
  mgV11ResetRecognitionCaches();
  const el=document.getElementById('wb-hwr-shared-count');
  if(el)el.textContent=`${(MG_HWR_MEMORY.samples||[]).length} personal ink samples loaded`;
  return MG_HWR_MEMORY;
}
window.mgV11ReloadCanonicalFromStore=mgV11ReloadCanonicalFromStore;

function mgV11EnsureCanonical(){
  if(MG_V11_CANONICAL_READY)return Promise.resolve(MG_HWR_MEMORY);
  if(MG_V11_CANONICAL_PROMISE)return MG_V11_CANONICAL_PROMISE;
  MG_V11_CANONICAL_PROMISE=mgV11ReloadCanonicalFromStore().finally(()=>{MG_V11_CANONICAL_PROMISE=null});
  return MG_V11_CANONICAL_PROMISE;
}

/* Capture the fully audited v9 recognizer once, then only add one lazy-load wrapper. */
const _wbRecognizeV11Audited=wbRecognizeStrokes;
wbRecognizeStrokes=async function(strokes,mode='node'){
  await mgV11EnsureCanonical();
  return _wbRecognizeV11Audited(strokes,mode);
};

window.openWhiteboardLoadedV11=async function(){
  view={mode:'whiteboard'};
  render();
  mgV11EnsureCanonical().catch(console.error);
};
window.openTrainerLoadedV11=async function(){
  await mgV11EnsureCanonical();
  view={mode:'trainer'};
  render();
};

/* Replace historical navigation functions after this module loads. */
window.openWhiteboard=window.openWhiteboardLoadedV11;
window.openTrainer=window.openTrainerLoadedV11;
window.goInkLabV9=()=>window.openInkLabV11();

/* Returning to a suspended page invalidates only the in-memory model. */
window.addEventListener('pageshow',e=>{
  if(e.persisted){
    MG_V11_CANONICAL_READY=false;
    MG_V11_CANONICAL_PROMISE=null;
  }
});


/* V11.1 clean short-ink path.
   The historical fallback chain included an IndexedDB sync in an older wrapper.
   After the canonical model is loaded, short recognition stays memory-only. */
async function mgV11RecognizeShort(strokes,mode='node'){
  const raw=[],seen=new Set();
  const add=(label,score,source)=>{
    label=String(label||'').trim();if(!label)return;
    const k=canon(label);if(!k||seen.has(k))return;
    seen.add(k);raw.push({label,score:+score||0,source});
  };

  for(const x of wtPrototypeMatches(strokes,mode))add(x.label,x.score,'personal prototype');

  if(mode==='letter'){
    const sig=wtSparseSignature(strokes);
    for(const x of wtSamples()){
      if(!['letter','letter_auto','letter_synthetic_context'].includes(x.category)||!x.label||!x.sig?.length)continue;
      const score=wtSigSim(sig,x.sig)*wtOpenSampleWeight(x);
      if(score>.12)add(x.label,score,'personal letter');
    }
  }

  raw.sort((a,b)=>b.score-a.score);
  if(raw[0]?.score<.90){
    const native=await mgRawHandwritingEngine(strokes);
    for(const g of(native.guesses||[]))add(g,.42,native.engine||'open handwriting');
  }
  raw.sort((a,b)=>b.score-a.score);

  const guesses=raw.slice(0,7).map(x=>x.label);
  return{
    guesses,
    openGuesses:guesses,
    knownGuesses:[],
    engine:raw[0]?.source||'personal short-ink model',
    trainingCount:mgHwrCountV6()
  };
}

/* Override the single-word worker used dynamically by the audited phrase recognizer. */
mgRecognizeSingleV9=async function(strokes,mode='node'){
  const dec=mgOpenSpellCandidatesV8(strokes),est=dec.lengthModel.est;
  if(est<1.45&&!wtLikelyMultiLetter(strokes))return mgV11RecognizeShort(strokes,mode);

  const raw=dec.candidates.slice(),native=await mgRawHandwritingEngine(dec.normalized);
  for(const g of native.guesses||[]){
    const n=[...g].filter(ch=>/\p{L}|\d/u.test(ch)).length;
    if(n>=dec.lengthModel.min&&n<=dec.lengthModel.max&&!raw.some(x=>canon(x.label)===canon(g)))
      raw.push({label:g,score:.47,source:native.engine||'open handwriting'});
  }
  for(const x of wtWordPrototypeMatches(strokes,mode).slice(0,3))
    if(!raw.some(y=>canon(y.label)===canon(x.label)))
      raw.push({label:x.label,score:Math.min(.52,x.score*.58),source:'personal whole-word sample'});

  raw.sort((a,b)=>b.score-a.score);
  const open=[],seen=new Set();
  for(const x of raw){
    const k=canon(x.label);if(!k||seen.has(k))continue;
    seen.add(k);open.push(x.label);if(open.length>=7)break;
  }
  const known=[],secondary=mode==='relation'?mgRelationSuggestionsV9(raw):mgKnownSuggestionsV7(raw);
  for(const x of secondary){
    const k=canon(x.label);if(seen.has(k))continue;
    seen.add(k);known.push(x.label);if(known.length>=3)break;
  }
  return{
    guesses:[...open,...known],openGuesses:open,knownGuesses:known,
    engine:`v11 personal spelling · ~${Math.round(est)} chars${dec.lengthModel.calibrationWords?` · ${dec.lengthModel.calibrationWords} word calibration samples`:''}`,
    trainingCount:mgHwrCountV6(),estimatedCharacters:est
  };
};

/* Final public recognizer: exactly one canonical lazy load, then memory-only work. */
const _wbRecognizeV11Phrase=wbRecognizeStrokes;
wbRecognizeStrokes=async function(strokes,mode='node'){
  await mgV11EnsureCanonical();
  if(mode==='letter')return mgV11RecognizeShort(strokes,mode);
  return _wbRecognizeV11Phrase(strokes,mode);
};


/* ==================== V11.2 SMART NODE TEXT FIX ====================
   Fixes:
   1) a smart enclosure uses the drawn enclosure as the semantic node bounds;
   2) enclosed handwriting is recognized even if the circle/box was drawn first;
   3) an already-computed ghost word inside the enclosure can seed the node guess;
   4) the semantic node label is rendered INSIDE the node instead of above it.
===================================================================== */

function wbRoleBlocksNodeTextV112(st){
  const r=String(st?.role||'');
  return r==='node-boundary'||r==='node-boundary-candidate'||
         r==='arrow'||r==='arrow-candidate'||r==='sequence-arrow';
}

wbInsideEnclosure=function(info,boundaryId){
  const W=wbV4Data();
  return W.strokes.filter(st=>{
    if(st.id===boundaryId||wbRoleBlocksNodeTextV112(st)||wbStrokeLinked(st.id))return false;
    const b=wbStrokeBounds(st),c=wbCenter(b);
    if(!wbInPoly(c,info.p))return false;
    /* Keep text near the edge; the previous .96-size gate could throw away a
       long handwritten word inside a relatively tight circle. */
    return b.w<info.b.w*1.08 && b.h<info.b.h*1.08;
  });
};

function wbGhostInsideEnclosureV112(info,inside){
  const g=WB.ghostText;
  if(!g?.text||!g.bounds)return null;
  const c=wbCenter(g.bounds);
  if(!wbInPoly(c,info.p))return null;
  const insideIds=new Set((inside||[]).map(s=>s.id));
  const overlap=(g.strokeIds||[]).filter(id=>insideIds.has(id)).length;
  return overlap ? g : null;
}

async function wbRecognizeEnclosedNodeV112(info,boundary,inside){
  let rr={guesses:[],openGuesses:[],knownGuesses:[],engine:''};
  if(inside.length){
    try{rr=await wbRecognizeStrokes(inside,'node')}catch(e){console.error(e)}
  }

  const ghost=wbGhostInsideEnclosureV112(info,inside);
  const guesses=[],seen=new Set();
  const add=x=>{
    x=String(x||'').trim();
    const k=canon(x);
    if(!x||!k||seen.has(k))return;
    seen.add(k);guesses.push(x);
  };
  (rr.guesses||[]).forEach(add);
  if(ghost)add(ghost.text);
  (ghost?.alts||[]).forEach(add);

  return {
    guesses,
    openGuesses:rr.openGuesses||guesses,
    knownGuesses:rr.knownGuesses||[],
    engine:rr.engine || (ghost?'existing smart-word guess':'')
  };
}

async function wbProposeNodeFromEnclosureV112(boundary,info){
  if(WB.pendingNode||WB.pendingArrow)return false;
  const inside=wbInsideEnclosure(info,boundary.id);
  if(!inside.length)return false;

  boundary.role='node-boundary-candidate';
  const token=uid('pn');
  const textBounds=wbUnionBounds(inside.map(wbStrokeBounds));

  WB.pendingNode={
    token,
    boundaryId:boundary.id,
    strokeIds:inside.map(x=>x.id),
    /* textBounds is useful for handwriting; shapeBounds is what the node should
       actually look like on the board. */
    bounds:textBounds,
    textBounds,
    shapeBounds:{...info.b},
    name:'',
    alts:[],
    cls:'',
    engine:'',
    feat:info.feat,
    score:info.score
  };
  render();

  const rr=await wbRecognizeEnclosedNodeV112(info,boundary,inside);
  if(!WB.pendingNode||WB.pendingNode.token!==token)return true;

  WB.pendingNode.alts=rr.guesses||[];
  WB.pendingNode.openAlts=rr.openGuesses||rr.guesses||[];
  WB.pendingNode.knownAlts=rr.knownGuesses||[];
  WB.pendingNode.name=(rr.guesses||[])[0]||'';
  WB.pendingNode.cls=wbGuessClass(WB.pendingNode.name);
  WB.pendingNode.engine=rr.engine||'';
  render();
  return true;
}

/* Word first -> circle/box second. */
wbMaybeEnclosure=async function(st){
  if(!WB.smart||!WB.autoShapes)return false;
  const info=wbEnclosureInfo(st);
  if(!info||info.score<.64)return false;
  return wbProposeNodeFromEnclosureV112(st,info);
};

/* Circle/box first -> word second. This is checked after a short writing pause. */
async function wbMaybeContainingEnclosureV112(latest){
  if(!WB.smart||!WB.autoShapes||WB.pendingNode||WB.pendingArrow)return false;
  const c=wbCenter(wbStrokeBounds(latest));
  let best=null;

  for(const boundary of wbV4Data().strokes){
    if(boundary.id===latest.id||wbRoleBlocksNodeTextV112(boundary)||wbStrokeLinked(boundary.id))continue;
    const info=wbEnclosureInfo(boundary);
    if(!info||info.score<.64||!wbInPoly(c,info.p))continue;
    if(!best||info.score>best.info.score)best={boundary,info};
  }
  return best ? wbProposeNodeFromEnclosureV112(best.boundary,best.info) : false;
}

/* Preserve the audited v9/v11 word grouping, but check for a pre-existing
   enclosure before creating a free-floating ghost word. */
wbScheduleWordGuess=function(st){
  clearTimeout(WB.wordTimer);
  if(!WB.autoText)return;
  const scheduledStrokeId=st.id;
  WB.wordTimer=setTimeout(async()=>{
    const current=wbStroke(scheduledStrokeId);
    if(!current||current.role||WB.pendingNode||WB.pendingArrow)return;

    if(await wbMaybeContainingEnclosureV112(current))return;

    const cl=wbClusterRecent(current);
    if(!cl.length||cl.length>90)return;
    const ids=cl.map(x=>x.id),key=ids.join('|');

    const run=async()=>{
      const rr=await wbRecognizeStrokes(cl,'node');
      const nowStroke=wbStroke(scheduledStrokeId);
      if(!nowStroke||nowStroke.role||WB.pendingNode||WB.pendingArrow)return;
      const now=wbClusterRecent(nowStroke).map(x=>x.id).join('|');
      if(now!==key)return;

      if(rr.guesses?.length){
        WB.ghostText={
          strokeIds:ids,
          bounds:wbUnionBounds(cl.map(wbStrokeBounds)),
          text:rr.guesses[0],
          alts:rr.guesses,
          openAlts:rr.openGuesses||rr.guesses,
          knownAlts:rr.knownGuesses||[],
          engine:rr.engine,
          cls:wbGuessClass(rr.guesses[0])
        };
        render();
      }
    };
    if('requestIdleCallback'in window)requestIdleCallback(run,{timeout:1400});
    else setTimeout(run,20);
  },1000);
};

/* Use the enclosure itself as the semantic node bounds, not just the word. */
wbAcceptPendingNode=async function(){
  const p=WB.pendingNode;
  if(!p)return;
  const inp=document.getElementById('wb-pnode-name'),
        sel=document.getElementById('wb-pnode-cls'),
        name=(inp&&inp.value||p.name||'').trim();
  if(!name)return toast('Need a node name');

  const gid=ensure(name,{}),d=byId(gid),cls=sel&&sel.value;
  if(cls&&d&&!d.cls)d.cls=cls;

  const b=p.shapeBounds||p.bounds;
  const ids=[...p.strokeIds,p.boundaryId];
  wbLinkBoardNode(gid,b,ids,{
    kind:'node',
    auto:true,
    textBounds:p.textBounds||p.bounds,
    shapeBounds:p.shapeBounds||null
  });

  const bs=wbStroke(p.boundaryId);
  if(bs)bs.role='node-boundary';
  wbTrain('node',p.feat,true);
  WB.pendingNode=null;
  WB.ghostText=null;
  bump();
  await save();
  refresh();
  render();
  toast(`Linked ${termOf(gid)}`);
};

/* Final renderer: semantic label is visibly INSIDE the node. Handwritten ink
   remains underneath; the small translucent tag sits along the inside top edge. */
const _wbPaintNodeTextV112=wbPaint;
wbPaint=function(){
  _wbPaintNodeTextV112();

  const c=wbCanvas();
  if(!c)return;
  const ctx=c.getContext('2d'),vis=wbVisibleBounds(),V=wbCamera();
  wbWorldTransform(ctx);

  for(const n of wbV4Data().nodes){
    if(!wbBoxHit(n,vis))continue;
    const txt=n.kind==='step'?`${n.stepOrder||'?'} · ${wbItemText(n)}`:wbItemText(n);
    if(!txt)continue;

    ctx.save();
    const fs=11/V.zoom,pad=5/V.zoom;
    ctx.font=`600 ${fs}px IBM Plex Mono, monospace`;
    const maxW=Math.max(28/V.zoom,n.w-12/V.zoom);
    const measured=ctx.measureText(txt).width;
    const boxW=Math.min(maxW,measured+pad*2);
    const boxH=18/V.zoom;

    /* top-left, but INSIDE the node */
    const x=n.x+6/V.zoom;
    const y=n.y+6/V.zoom;

    ctx.fillStyle='rgba(255,255,255,.88)';
    ctx.fillRect(x,y,boxW,boxH);
    ctx.fillStyle=n.kind==='step'?'#6B46C1':'#0F766E';
    ctx.beginPath();
    ctx.rect(x,y,boxW,boxH);
    ctx.clip();
    ctx.fillText(txt,x+pad,y+13/V.zoom);
    ctx.restore();
  }

  ctx.setTransform(1,0,0,1,0,0);
};


/* ==================== V11.3 NODE RECOGNITION COMPLETION FIX ====================
   Node recognition is personal-model-first. Native browser handwriting is only
   optional background evidence and can never hold the node panel open forever.
=============================================================================== */
function wbTimeoutV113(promise,ms,fallback){
  return new Promise(resolve=>{
    let done=false;
    const t=setTimeout(()=>{if(done)return;done=true;resolve(fallback)},ms);
    Promise.resolve(promise).then(
      v=>{if(done)return;done=true;clearTimeout(t);resolve(v)},
      ()=>{if(done)return;done=true;clearTimeout(t);resolve(fallback)}
    );
  });
}

/* Safari's experimental handwriting prediction may never settle on some builds. */
const _wbNativeRecognizeV113Base=wbNativeRecognize;
wbNativeRecognize=async function(strokes){
  return wbTimeoutV113(_wbNativeRecognizeV113Base(strokes),900,[]);
};

async function wbEnsurePersonalModelV113(){
  if(typeof mgV11EnsureCanonical!=='function')return true;
  await wbTimeoutV113(mgV11EnsureCanonical(),1200,null);
  return true;
}

function wbUniqueCandidatesV113(items,limit=8){
  const out=[],seen=new Set();
  for(const x of items||[]){
    const label=String(typeof x==='string'?x:x?.label||'').trim();
    const k=canon(label);
    if(!label||!k||seen.has(k))continue;
    seen.add(k);
    out.push({
      label,
      score:+(typeof x==='string'?0:x?.score)||0,
      source:typeof x==='string'?'':(x?.source||'')
    });
    if(out.length>=limit)break;
  }
  return out;
}

/* Synchronous personal-model recognition: letters + pairs + trios + whole words. */
function wbPersonalNodeGroupV113(strokes){
  const candidates=[];

  try{
    const dec=mgOpenSpellCandidatesV8(strokes);
    for(const x of dec.candidates||[])candidates.push(x);
  }catch(e){console.warn('open spelling',e)}

  try{
    for(const x of wtWordPrototypeMatches(strokes,'node').slice(0,5)){
      candidates.push({
        label:x.label,
        score:Math.min(.72,(+x.score||0)*.78),
        source:'personal whole-word sample'
      });
    }
  }catch(e){}

  try{
    for(const x of mgRecognizeChunkV6(strokes,1,5)){
      candidates.push({
        label:x.label,
        score:(+x.score||0)*.92,
        source:'personal letter'
      });
    }
  }catch(e){}

  candidates.sort((a,b)=>(+b.score||0)-(+a.score||0));
  return wbUniqueCandidatesV113(candidates,7);
}

async function wbPersonalNodeRecognizeV113(strokes){
  await wbEnsurePersonalModelV113();

  let groups=[];
  try{groups=mgWordGroupsV9(strokes)}catch(e){}
  if(!groups.length)groups=[strokes];
  if(groups.length>6)groups=[strokes];

  const perGroup=groups.map(wbPersonalNodeGroupV113);

  if(perGroup.length>1 && perGroup.every(x=>x.length)){
    const first=perGroup.map(x=>x[0].label).join(' ');
    const alts=[{
      label:first,
      score:perGroup.reduce((s,g)=>s+(g[0].score||0),0)/perGroup.length,
      source:'personal phrase spelling'
    }];

    for(let i=0;i<perGroup.length&&alts.length<6;i++){
      for(const alt of perGroup[i].slice(1,3)){
        const phrase=perGroup.map((g,j)=>j===i?alt.label:g[0].label).join(' ');
        alts.push({label:phrase,score:alt.score*.9,source:'personal phrase spelling'});
      }
    }
    return wbUniqueCandidatesV113(alts,7);
  }

  return wbUniqueCandidatesV113(perGroup.flat(),7);
}

function wbAppendPendingNodeCandidatesV113(token,items,engine){
  const p=WB.pendingNode;
  if(!p||p.token!==token)return false;

  const all=wbUniqueCandidatesV113([
    ...(p.alts||[]).map(label=>({label,score:1,source:p.engine||''})),
    ...(items||[])
  ],8);

  p.alts=all.map(x=>x.label);
  p.openAlts=[...p.alts];
  if(!p.name&&all[0]?.label)p.name=all[0].label;
  if(p.name)p.cls=wbGuessClass(p.name);
  if(engine)p.engine=engine;
  return true;
}

async function wbNodeNativeBonusV113(token,inside){
  const guesses=await wbNativeRecognize(inside);
  if(!guesses?.length)return;
  if(wbAppendPendingNodeCandidatesV113(
      token,
      guesses.map((label,i)=>({label,score:.48-i*.03,source:'browser handwriting'})),
      'personal model + browser handwriting'
  )) render();
}

/* This replaces the v11.2 enclosure proposal flow for BOTH draw orders. */
wbProposeNodeFromEnclosureV112=async function(boundary,info){
  if(WB.pendingNode||WB.pendingArrow)return false;
  const inside=wbInsideEnclosure(info,boundary.id);
  if(!inside.length)return false;

  boundary.role='node-boundary-candidate';
  const token=uid('pn');
  const textBounds=wbUnionBounds(inside.map(wbStrokeBounds));
  const ghost=wbGhostInsideEnclosureV112(info,inside);

  WB.pendingNode={
    token,
    boundaryId:boundary.id,
    strokeIds:inside.map(x=>x.id),
    bounds:textBounds,
    textBounds,
    shapeBounds:{...info.b},
    name:ghost?.text||'',
    alts:ghost?.alts?[...ghost.alts]:ghost?.text?[ghost.text]:[],
    openAlts:ghost?.openAlts?[...ghost.openAlts]:[],
    knownAlts:ghost?.knownAlts?[...ghost.knownAlts]:[],
    cls:ghost?.text?wbGuessClass(ghost.text):'',
    engine:ghost?.engine?'existing word guess':'',
    feat:info.feat,
    score:info.score,
    recognizing:true,
    recognitionState:'running'
  };
  render();

  try{
    const personal=await wbTimeoutV113(
      wbPersonalNodeRecognizeV113(inside),
      1800,
      []
    );

    if(!WB.pendingNode||WB.pendingNode.token!==token)return true;

    wbAppendPendingNodeCandidatesV113(
      token,
      personal,
      personal.length
        ? 'personal open-vocabulary model'
        : (ghost?'existing word guess':'personal model')
    );

    WB.pendingNode.recognizing=false;
    WB.pendingNode.recognitionState=WB.pendingNode.name?'done':'no_guess';
    if(!WB.pendingNode.name){
      WB.pendingNode.engine='no confident personal guess — type or correct the word';
    }
    render();

    /* Optional bonus; the node panel is already complete. */
    wbNodeNativeBonusV113(token,inside).catch(()=>{});
  }catch(e){
    console.error('Node recognition',e);
    if(WB.pendingNode&&WB.pendingNode.token===token){
      WB.pendingNode.recognizing=false;
      WB.pendingNode.recognitionState='error';
      WB.pendingNode.engine=ghost
        ? 'existing word guess'
        : 'recognition unavailable — type or correct the word';
      render();
    }
  }
  return true;
};

/* Explicit completion status in the panel. */
const _whiteboardHTMLV113=whiteboardHTML;
whiteboardHTML=function(){
  let html=_whiteboardHTMLV113();
  const p=WB.pendingNode;
  if(p){
    const status=p.recognizing
      ? 'recognizing with personal model…'
      : p.name
        ? 'recognition complete'
        : 'no confident guess — type the word below';
    html=html.replace(
      '<b>Node shape detected.</b>',
      `<b>Node shape detected.</b> <span class="hint">${esc(status)}</span>`
    );
  }
  return html;
};


/* ==================== V11.4 WHITEBOARD RECOGNITION CALIBRATION ====================
   - `mode="letter"` can ONLY compare against letter prototypes.
   - character scoring uses bitmap + aspect + stroke count + direction.
   - multiple prototypes vote; one accidental nearest neighbor cannot dominate.
   - weak spellings are rejected instead of surfacing unrelated words.
================================================================================== */

let MG114_DESC_CACHE=new Map();
let MG114_INDEX_CACHE=null;
let MG114_INDEX_STAMP='';

const _wtAllowedCatsV114=wtAllowedCats;
wtAllowedCats=function(mode){
  if(mode==='letter')return new Set(['letter','letter_auto','letter_synthetic_context']);
  return _wtAllowedCatsV114(mode);
};

function mg114TrainingStamp(){
  const T=wtSamples(),last=T[T.length-1];
  return`${T.length}|${last?.id||''}|${last?.created||0}`;
}
function mg114ResetCaches(){
  MG114_DESC_CACHE.clear();MG114_INDEX_CACHE=null;MG114_INDEX_STAMP='';
  try{MG_HWR_PROTO_CACHE=null}catch(e){}
  try{MG_V7_LETTER_GEOM_CACHE=null}catch(e){}
  try{MG_V8_CHUNK_SCORE_CACHE?.clear?.()}catch(e){}
}
const _mgV11ReloadCanonicalV114=mgV11ReloadCanonicalFromStore;
mgV11ReloadCanonicalFromStore=async function(){
  const r=await _mgV11ReloadCanonicalV114();
  mg114ResetCaches();return r;
};
window.mgV11ReloadCanonicalFromStore=mgV11ReloadCanonicalFromStore;

function mg114CompactDescriptor(s){
  const key=s?.id||JSON.stringify([s?.category,s?.label,s?.created]).slice(0,120);
  if(MG114_DESC_CACHE.has(key))return MG114_DESC_CACHE.get(key);
  const pts=[];for(const st of(s?.strokes||[]))for(const q of(st.pts||[])){
    const x=Array.isArray(q)?+q[0]:+q.x,y=Array.isArray(q)?+q[1]:+q.y;
    if(Number.isFinite(x)&&Number.isFinite(y))pts.push({x,y});
  }
  let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
  for(const p of pts){x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y)}
  const aspect=pts.length?(x1-x0)/Math.max(.02,y1-y0):1;
  const dir=Array(8).fill(0);let total=0;
  for(const st of(s?.strokes||[])){
    const a=st.pts||[];
    for(let i=1;i<a.length;i++){
      const p0=a[i-1],p1=a[i],xA=Array.isArray(p0)?+p0[0]:+p0.x,yA=Array.isArray(p0)?+p0[1]:+p0.y,
            xB=Array.isArray(p1)?+p1[0]:+p1.x,yB=Array.isArray(p1)?+p1[1]:+p1.y;
      const dx=xB-xA,dy=yB-yA,l=Math.hypot(dx,dy);if(l<.001)continue;
      let ang=Math.atan2(dy,dx);if(ang<0)ang+=Math.PI*2;
      dir[Math.floor(ang/(Math.PI/4))%8]+=l;total+=l;
    }
  }
  if(total)for(let i=0;i<8;i++)dir[i]/=total;
  const d={sig:s?.sig||[],aspect,strokeCount:(s?.strokes||[]).length||1,dir};
  MG114_DESC_CACHE.set(key,d);return d;
}
function mg114QueryDescriptor(strokes){
  const b=wtWordBounds(strokes),aspect=b.w/Math.max(1,b.h),dir=Array(8).fill(0);let total=0;
  for(const st of strokes){
    const a=st.pts||[];
    for(let i=1;i<a.length;i++){
      const dx=a[i].x-a[i-1].x,dy=a[i].y-a[i-1].y,l=Math.hypot(dx,dy);if(l<.2)continue;
      let ang=Math.atan2(dy,dx);if(ang<0)ang+=Math.PI*2;
      dir[Math.floor(ang/(Math.PI/4))%8]+=l;total+=l;
    }
  }
  if(total)for(let i=0;i<8;i++)dir[i]/=total;
  return{sig:wtSparseSignature(strokes),aspect,strokeCount:strokes.length||1,dir};
}
function mg114GeomSim(a,b){
  const pix=wtSigSim(a.sig,b.sig);
  const asp=Math.exp(-1.25*Math.abs(Math.log((a.aspect+.04)/(b.aspect+.04))));
  const sc=Math.exp(-Math.abs(a.strokeCount-b.strokeCount)/2.3);
  let l1=0;for(let i=0;i<8;i++)l1+=Math.abs((a.dir?.[i]||0)-(b.dir?.[i]||0));
  const dh=Math.max(0,1-l1/2);
  return .60*pix+.18*asp+.10*sc+.12*dh;
}
function mg114Weight(s){
  if(String(s?.source||'').startsWith('synthetic')||s?.meta?.synthetic)return Math.min(.12,wtOpenSampleWeight(s));
  return wtOpenSampleWeight(s);
}
function mg114Cats(n){
  return n===1?new Set(['letter','letter_auto','letter_synthetic_context']):
         n===2?new Set(['letter_pair','pair_auto','pair_synthetic_context']):
               new Set(['letter_trio','trio_auto','trio_synthetic_context']);
}
function mg114Index(){
  const stamp=mg114TrainingStamp();
  if(MG114_INDEX_CACHE&&MG114_INDEX_STAMP===stamp)return MG114_INDEX_CACHE;
  const idx={1:new Map(),2:new Map(),3:new Map()};
  for(const s of wtSamples()){
    const label=String(s.label||'').trim().toLowerCase(),
          n=[...label].filter(ch=>/\p{L}|\d/u.test(ch)).length;
    if(n<1||n>3||!mg114Cats(n).has(s.category)||!s.sig?.length)continue;
    if(!idx[n].has(label))idx[n].set(label,[]);
    idx[n].get(label).push(s);
  }
  for(const n of[1,2,3])for(const [label,a]of idx[n]){
    a.sort((x,y)=>mg114Weight(y)-mg114Weight(x)||(y.created||0)-(x.created||0));
    idx[n].set(label,a.slice(0,14));
  }
  MG114_INDEX_CACHE=idx;MG114_INDEX_STAMP=stamp;return idx;
}
function mg114Aggregate(vals){
  vals=vals.filter(Number.isFinite).sort((a,b)=>b-a).slice(0,3);
  if(!vals.length)return 0;
  if(vals.length===1)return vals[0]*.88;
  if(vals.length===2)return vals[0]*.68+vals[1]*.32;
  return vals[0]*.58+vals[1]*.27+vals[2]*.15;
}
mgRecognizeChunkV6=function(strokes,n,limit=5){
  if(!strokes?.length)return[];
  const q=mg114QueryDescriptor(strokes),out=[];
  for(const [label,arr]of mg114Index()[n]){
    const vals=arr.map(s=>mg114GeomSim(q,mg114CompactDescriptor(s))*mg114Weight(s));
    const score=mg114Aggregate(vals);
    if(score>=.12)out.push({label,score,count:vals.length});
  }
  return out.sort((a,b)=>b.score-a.score).slice(0,limit);
};
mgChunkSpecificMapV8=function(strokes,n,labels){
  const out=new Map();if(!strokes?.length||!labels?.size)return out;
  const q=mg114QueryDescriptor(strokes),idx=mg114Index()[n];
  for(const label of labels){
    const vals=(idx.get(String(label).toLowerCase())||[]).map(s=>mg114GeomSim(q,mg114CompactDescriptor(s))*mg114Weight(s));
    out.set(label,mg114Aggregate(vals));
  }
  return out;
};

/* Strict single-letter path: words/nodes are never allowed to masquerade as letters. */
mgV11RecognizeShort=async function(strokes,mode='node'){
  if(mode==='letter'){
    const raw=mgRecognizeChunkV6(strokes,1,7),top=raw[0],second=raw[1],
          margin=(top?.score||0)-(second?.score||0);
    const usable=raw.filter(x=>x.score>=.24);
    return{
      guesses:usable.map(x=>x.label),
      openGuesses:usable.map(x=>x.label),
      knownGuesses:[],
      engine:usable.length?`calibrated personal letters · margin ${margin.toFixed(2)}`:'no confident personal letter',
      trainingCount:mgHwrCountV6(),
      scores:usable
    };
  }
  const P=wtPrototypeMatches(strokes,mode).filter(x=>x.score>=.42);
  return{guesses:P.map(x=>x.label),openGuesses:P.map(x=>x.label),knownGuesses:[],engine:P.length?'personal prototype':'no confident short-text guess',trainingCount:mgHwrCountV6()};
};

/* Reject garbage open spellings instead of forcing a known-word answer. */
const _mgOpenSpellCandidatesV114=mgOpenSpellCandidatesV8;
mgOpenSpellCandidatesV8=function(strokes){
  const r=_mgOpenSpellCandidatesV114(strokes);
  const kept=(r.candidates||[]).filter(x=>x.score>=.20);
  r.candidates=kept;
  return r;
};

mgRecognizeSingleV9=async function(strokes,mode='node'){
  const dec=mgOpenSpellCandidatesV8(strokes),est=dec.lengthModel.est;
  if(est<1.45&&!wtLikelyMultiLetter(strokes))return mgV11RecognizeShort(strokes,mode);

  let raw=dec.candidates.slice();
  for(const x of wtWordPrototypeMatches(strokes,mode).slice(0,3)){
    if(x.score>=.50&&!raw.some(y=>canon(y.label)===canon(x.label)))
      raw.push({label:x.label,score:x.score*.82,source:'personal whole-word memory'});
  }
  raw.sort((a,b)=>b.score-a.score);

  /* Require either a decent top score or a clear margin. */
  const top=raw[0],second=raw[1],margin=(top?.score||0)-(second?.score||0);
  if(!top || (top.score<.24 && margin<.045)){
    return{guesses:[],openGuesses:[],knownGuesses:[],engine:'no confident raw spelling',trainingCount:mgHwrCountV6(),estimatedCharacters:est};
  }

  const open=[],seen=new Set();
  for(const x of raw){
    if(x.score<.18)continue;
    const k=canon(x.label);if(!k||seen.has(k))continue;
    seen.add(k);open.push(x.label);if(open.length>=7)break;
  }

  /* Known terms remain secondary and never replace raw spelling. */
  const known=[];
  const secondary=mode==='relation'?mgRelationSuggestionsV9(raw):mgKnownSuggestionsV7(raw);
  for(const x of secondary){
    const k=canon(x.label);if(!k||seen.has(k))continue;
    seen.add(k);known.push(x.label);if(known.length>=3)break;
  }
  return{
    guesses:[...open,...known],
    openGuesses:open,knownGuesses:known,
    engine:`calibrated personal spelling · ~${Math.round(est)} chars`,
    trainingCount:mgHwrCountV6(),estimatedCharacters:est,
    topScore:top.score,margin
  };
};

/* Node boxes should not auto-fill with a weak arbitrary guess. */
wbPersonalNodeGroupV113=function(strokes){
  const candidates=[];
  try{
    const dec=mgOpenSpellCandidatesV8(strokes);
    for(const x of dec.candidates||[])if(x.score>=.24)candidates.push(x);
  }catch(e){}
  try{
    for(const x of wtWordPrototypeMatches(strokes,'node').slice(0,5)){
      if(x.score>=.52)candidates.push({label:x.label,score:x.score*.82,source:'personal whole-word memory'});
    }
  }catch(e){}
  candidates.sort((a,b)=>(+b.score||0)-(+a.score||0));
  if(candidates.length>1 && candidates[0].score<.30 && candidates[0].score-candidates[1].score<.04)return[];
  return wbUniqueCandidatesV113(candidates,7);
};


/* ==================== V12 SHARED STROKE-SEQUENCE WHITEBOARD ==================== */
let MG12_MODEL=null,MG12_STAMP='';
function mg12Stamp(){const T=wtSamples(),last=T[T.length-1];return`${T.length}|${last?.id||''}|${last?.created||0}`}
function mg12Invalidate(){MG12_MODEL=null;MG12_STAMP=''}
function mg12Model(){const s=mg12Stamp();if(!MG12_MODEL||MG12_STAMP!==s){MG12_MODEL=MedGraphStrokeSeq.buildModel(wtSamples());MG12_STAMP=s}return MG12_MODEL}
const _mg12Reload=mgV11ReloadCanonicalFromStore;
mgV11ReloadCanonicalFromStore=async function(){const r=await _mg12Reload();mg12Invalidate();return r};window.mgV11ReloadCanonicalFromStore=mgV11ReloadCanonicalFromStore;

wtCompactStrokes=function(strokes){
  if(!strokes?.length)return[];const b=wbUnionBounds(strokes.map(wbStrokeBounds)),den=Math.max(1,b.w,b.h);
  return strokes.map(st=>{const pts=st.pts||[],t0=pts[0]?.t||0,step=Math.max(1,Math.floor(pts.length/100));return{pts:pts.filter((_,i)=>i%step===0).slice(0,110).map(p=>[
    +((p.x-b.x)/den).toFixed(4),+((p.y-b.y)/den).toFixed(4),+(p.p??.5).toFixed(3),+Math.max(0,(p.t||t0)-t0).toFixed(1)
  ])}});
};
const _wtStore12=wtStoreExample;
wtStoreExample=function(category,label,strokes,meta={},source='trainer'){const s=_wtStore12(category,label,strokes,{...meta,sequenceVersion:12},source);mg12Invalidate();return s};

function mg12Groups(strokes){try{const g=mgWordGroupsV9(strokes);if(g?.length)return g}catch(e){}return[strokes]}
function mg12Word(strokes){return MedGraphStrokeSeq.recognizeWord(strokes,mg12Model(),{limit:7})}
async function mg12RecognizeText(strokes,mode='node'){
  await mgV11EnsureCanonical();const M=mg12Model();
  if(mode==='letter'){const raw=MedGraphStrokeSeq.classifyLetter(strokes,M,7),top=raw[0],margin=(top?.score||0)-(raw[1]?.score||0),good=raw.filter(x=>x.score>=.30).slice(0,7);
    if(!top||top.score<.34||(top.score<.46&&margin<.025))return{guesses:[],openGuesses:[],knownGuesses:[],engine:'no confident personal stroke letter',scores:raw,trainingCount:mgHwrCountV6()};
    return{guesses:good.map(x=>x.label),openGuesses:good.map(x=>x.label),knownGuesses:[],engine:`personal stroke DTW · margin ${margin.toFixed(2)}`,scores:good,trainingCount:mgHwrCountV6()};
  }
  const groups=mg12Groups(strokes),per=groups.map(mg12Word);let raw=[];
  if(per.length===1)raw=per[0].raw;
  else if(per.every(x=>x.raw.length)){raw.push({label:per.map(x=>x.raw[0].label).join(' '),score:per.reduce((a,x)=>a+x.raw[0].score,0)/per.length,quality:per.every(x=>x.raw[0].quality==='good')?'good':'low',source:'personal multiword sequence decoder',trace:per.flatMap(x=>x.raw[0].trace||[])});for(let i=0;i<per.length&&raw.length<7;i++)for(const alt of per[i].raw.slice(1,3))raw.push({...alt,label:per.map((x,j)=>j===i?alt.label:x.raw[0].label).join(' ')})}
  const open=[],seen=new Set();for(const x of raw){const k=canon(x.label);if(!k||seen.has(k))continue;seen.add(k);open.push(x.label);if(open.length>=7)break}
  return{guesses:open,openGuesses:open,knownGuesses:[],engine:open.length?'personal stroke-sequence decoder':'no confident personal sequence',trainingCount:mgHwrCountV6(),sequenceDetails:per};
}
wbRecognizeStrokes=mg12RecognizeText;
wbPersonalNodeGroupV113=function(strokes){const r=mg12Word(strokes);return(r.raw||[]).filter(x=>x.score>=.30).map(x=>({label:x.label,score:x.score,source:x.source}))};

