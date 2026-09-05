/* MedGraph v12 personal stroke-sequence recognizer */
(function(){
'use strict';
const LETTER_CATS=new Set(['letter','letter_auto','letter_synthetic_context']);
const PAIR_CATS=new Set(['letter_pair','pair_auto','pair_synthetic_context']);
const TRIO_CATS=new Set(['letter_trio','trio_auto','trio_synthetic_context']);
const WORD_CATS=new Set(['word','node','relationship_label','sequence_step','sequence_block']);
const FEAT_N=18,TEMPLATE_N=20;
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
function median(a){if(!a.length)return 0;a=[...a].sort((x,y)=>x-y);return a[Math.floor(a.length/2)]}
function canon(s){return String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'').trim()}
function chars(s){return [...String(s||'').toLowerCase()].filter(ch=>/[\p{L}\p{N}]/u.test(ch))}
function synthetic(s){return !!(s?.meta?.synthetic||String(s?.source||'').startsWith('synthetic'))}
function weight(s){
  if(synthetic(s))return Math.min(.12,+(s?.meta?.weight??.12));
  if(s?.category==='letter_auto')return .55;if(s?.category==='pair_auto')return .45;if(s?.category==='trio_auto')return .40;
  return clamp(+(s?.meta?.weight??1),.15,1);
}
function ptsFromSample(sample){
  const out=[];
  for(const st of(sample?.strokes||[])){
    const pts=[];
    for(const q of(st?.pts||[])){
      const x=Array.isArray(q)?+q[0]:+q.x,y=Array.isArray(q)?+q[1]:+q.y,
            p=Array.isArray(q)?+(q[2]??.5):+(q.p??.5),t=Array.isArray(q)?+(q[3]??0):+(q.t??0);
      if(Number.isFinite(x)&&Number.isFinite(y))pts.push({x,y,p:Number.isFinite(p)?p:.5,t:Number.isFinite(t)?t:0});
    }
    if(pts.length)out.push({pts});
  }
  return out;
}
function cloneCurrent(strokes){
  const out=[];for(const st of(strokes||[])){const pts=[];
    for(const q of(st?.pts||[])){const x=+q.x,y=+q.y,p=+(q.p??.5),t=+(q.t??0);if(Number.isFinite(x)&&Number.isFinite(y))pts.push({x,y,p:Number.isFinite(p)?p:.5,t:Number.isFinite(t)?t:0})}
    if(pts.length)out.push({pts});
  }return out;
}
function bounds(strokes){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const st of strokes||[])for(const p of st.pts||[]){x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y)}
  return Number.isFinite(x0)?{x:x0,y:y0,w:Math.max(1e-4,x1-x0),h:Math.max(1e-4,y1-y0)}:{x:0,y:0,w:1,h:1};
}
function columnSequence(strokes,forcedBins=0){
  strokes=cloneCurrent(strokes);if(!strokes.length)return[];
  const b=bounds(strokes),aspect=b.w/Math.max(1e-4,b.h),bins=Math.max(4,(forcedBins||clamp(Math.round(18+14*aspect),18,180))|0);
  const rows=Array.from({length:bins},()=>({occ:Array(8).fill(0),n:0,ys:0,y2:0,p:0,dir:[0,0,0,0],start:0,end:0}));
  for(const st of strokes){const a=st.pts||[];if(!a.length)continue;
    for(let i=0;i<a.length;i++){const p=a[i],xn=clamp((p.x-b.x)/b.w,0,1),yn=clamp((p.y-b.y)/b.h,0,1),k=clamp(Math.floor(xn*bins),0,bins-1),r=rows[k],yy=clamp(Math.floor(yn*8),0,7);
      r.occ[yy]++;r.n++;r.ys+=yn;r.y2+=yn*yn;r.p+=clamp(p.p??.5,0,1);if(i===0)r.start++;if(i===a.length-1)r.end++;
      if(i){const q=a[i-1],dx=p.x-q.x,dy=p.y-q.y,L=Math.hypot(dx,dy);if(L>.0001){const kk=clamp(Math.floor((((p.x+q.x)/2-b.x)/b.w)*bins),0,bins-1),rr=rows[kk],ax=Math.abs(dx),ay=Math.abs(dy);if(ax>=ay)rr.dir[dx>=0?0:1]+=L;else rr.dir[dy>=0?2:3]+=L}}
    }
  }
  const maxN=Math.max(1,...rows.map(r=>r.n)),maxStroke=Math.max(1,strokes.length);
  let seq=rows.map(r=>{const os=Math.max(1,r.occ.reduce((a,x)=>a+x,0)),mean=r.n?r.ys/r.n:.5,varr=r.n?Math.max(0,r.y2/r.n-mean*mean):.25,ds=Math.max(1e-6,r.dir.reduce((a,x)=>a+x,0));
    return[...r.occ.map(x=>x/os),mean,Math.sqrt(varr),r.n/maxN,...r.dir.map(x=>x/ds),r.n?r.p/r.n:.5,clamp(r.start/maxStroke,0,1),clamp(r.end/maxStroke,0,1)];
  });
  const orig=seq;seq=orig.map((v,i)=>v.map((x,j)=>.2*(orig[i-1]?.[j]??x)+.6*x+.2*(orig[i+1]?.[j]??x)));
  const ink=i=>seq[i][10]>.015;let a=0,z=seq.length-1;while(a<z&&!ink(a))a++;while(z>a&&!ink(z))z--;return seq.slice(a,z+1);
}
function resample(seq,n=TEMPLATE_N){
  if(!seq?.length)return[];if(seq.length===1)return Array.from({length:n},()=>[...seq[0]]);
  const out=[];for(let i=0;i<n;i++){const x=i*(seq.length-1)/Math.max(1,n-1),a=Math.floor(x),b=Math.min(seq.length-1,a+1),t=x-a;out.push(seq[a].map((v,j)=>v*(1-t)+seq[b][j]*t))}return out;
}
function frameDist(a,b){
  let d=0;for(let i=0;i<8;i++){const x=(a[i]||0)-(b[i]||0);d+=.055*x*x}
  for(const [i,w] of [[8,.12],[9,.08],[10,.12],[11,.045],[12,.045],[13,.045],[14,.045],[15,.04],[16,.045],[17,.045]]){const x=(a[i]||0)-(b[i]||0);d+=w*x*x}
  return Math.sqrt(d);
}
function pointDist(a,b){a=resample(a);b=resample(b);if(!a.length||!b.length)return 1;let d=0;for(let i=0;i<TEMPLATE_N;i++)d+=frameDist(a[i],b[i]);return d/TEMPLATE_N}
function dtwDistance(a,b,bandFrac=.38){
  if(!a?.length||!b?.length)return 2;const n=a.length,m=b.length,band=Math.max(Math.abs(n-m)+2,Math.ceil(Math.max(n,m)*bandFrac));
  let prev=new Float64Array(m+1),cur=new Float64Array(m+1);prev.fill(Infinity);prev[0]=0;
  for(let i=1;i<=n;i++){cur.fill(Infinity);const lo=Math.max(1,i-band),hi=Math.min(m,i+band);for(let j=lo;j<=hi;j++)cur[j]=frameDist(a[i-1],b[j-1])+Math.min(prev[j],cur[j-1],prev[j-1]);[prev,cur]=[cur,prev]}
  return prev[m]/Math.max(n,m);
}
function sim(d){return Math.exp(-3.2*Math.max(0,d))}
function aggregate(vals){vals=vals.filter(Number.isFinite).sort((a,b)=>b-a).slice(0,3);if(!vals.length)return 0;if(vals.length===1)return vals[0]*.9;if(vals.length===2)return vals[0]*.68+vals[1]*.32;return vals[0]*.58+vals[1]*.27+vals[2]*.15}
function meanTemplate(items){
  const out=Array.from({length:TEMPLATE_N},()=>Array(FEAT_N).fill(0)),den=Array(TEMPLATE_N).fill(0);
  for(const it of items){const q=resample(it.seq),w=it.w;if(!q.length)continue;for(let i=0;i<TEMPLATE_N;i++){den[i]+=w;for(let j=0;j<FEAT_N;j++)out[i][j]+=q[i][j]*w}}
  for(let i=0;i<TEMPLATE_N;i++){const d=den[i]||1;for(let j=0;j<FEAT_N;j++)out[i][j]/=d}return out;
}
function buildModel(samples){
  const letters=new Map(),pairs=new Map(),trios=new Map(),whole=[],directWidths=[],allWidths=[];
  for(const s of samples||[]){const cc=chars(s.label),lab=cc.join(''),w=weight(s),seq=columnSequence(ptsFromSample(s));if(!seq.length||!lab)continue;
    if(cc.length===1&&LETTER_CATS.has(s.category)){if(!letters.has(lab))letters.set(lab,[]);letters.get(lab).push({sample:s,seq,w,direct:s.category==='letter'&&!synthetic(s)});allWidths.push(seq.length);if(s.category==='letter'&&!synthetic(s))directWidths.push(seq.length)}
    else if(cc.length===2&&PAIR_CATS.has(s.category))pairs.set(lab,(pairs.get(lab)||0)+w);
    else if(cc.length===3&&TRIO_CATS.has(s.category))trios.set(lab,(trios.get(lab)||0)+w);
    else if(WORD_CATS.has(s.category)&&!synthetic(s)&&cc.length>=2&&cc.length<=32)whole.push({label:String(s.label).trim(),seq,w,chars:cc.length});
  }
  const templates=new Map(),exemplars=new Map(),widthFactor=new Map(),globalWidth=median(directWidths)||median(allWidths)||24;
  for(const [lab,items] of letters){items.sort((a,b)=>(b.direct-a.direct)||(b.w-a.w)||((b.sample.created||0)-(a.sample.created||0)));const keep=items.slice(0,10),direct=keep.filter(x=>x.direct),used=(direct.length>=2?direct:keep).slice(0,7);templates.set(lab,meanTemplate(used));exemplars.set(lab,keep.slice(0,6));widthFactor.set(lab,clamp(median(used.map(x=>x.seq.length))/globalWidth,.55,1.65))}
  const pitch=whole.map(x=>x.seq.length/x.chars).filter(x=>x>2&&x<30),binsPerChar=clamp(median(pitch)||Math.max(6,globalWidth*.42),5,16);
  return{templates,exemplars,widthFactor,pairs,trios,whole:whole.slice(-250),binsPerChar,directLetters:[...letters.values()].reduce((n,a)=>n+a.filter(x=>x.direct).length,0),coveredLetters:[...letters.values()].filter(a=>a.some(x=>x.direct)).length,version:12};
}
function classifyLetter(strokes,model,limit=7){
  const q=columnSequence(strokes);if(!q.length)return[];const out=[];
  for(const [lab,arr] of model.exemplars){const vals=arr.map(it=>sim(dtwDistance(q,it.seq))*it.w);let score=aggregate(vals);const t=model.templates.get(lab);if(t)score=.82*score+.18*sim(pointDist(q,t));out.push({label:lab,score,source:'personal stroke DTW'})}
  out.sort((a,b)=>b.score-a.score);const margin=(out[0]?.score||0)-(out[1]?.score||0);return out.slice(0,limit).map(x=>({...x,margin}));
}
function transitionBonus(text,ch,model){
  let b=0;if(text.length>=1){const w=model.pairs.get(text.slice(-1)+ch)||0;if(w)b+=Math.min(.11,.035*Math.log1p(w*5))}
  if(text.length>=2){const w=model.trios.get(text.slice(-2)+ch)||0;if(w)b+=Math.min(.09,.025*Math.log1p(w*5))}return b;
}
function segmentCandidates(q,model,widths){
  const cache=new Map(),labels=[...model.templates.keys()];
  return function(pos,w){const k=pos+':'+w;if(cache.has(k))return cache.get(k);const seg=q.slice(pos,Math.min(q.length,pos+w));if(seg.length<3){cache.set(k,[]);return[]}
    const arr=[];for(const lab of labels){let score=sim(pointDist(seg,model.templates.get(lab))),exp=model.binsPerChar*(model.widthFactor.get(lab)||1),wp=Math.exp(-Math.abs(Math.log((w+.5)/(exp+.5)))*1.25);score*=.72+.28*wp;if(score>=.22)arr.push({label:lab,score,width:w})}
    arr.sort((a,b)=>b.score-a.score);const r=arr.slice(0,5);cache.set(k,r);return r;
  };
}
function recognizeWord(strokes,model,{limit=7,maxChars=32}={}){
  const q=columnSequence(strokes);if(!q.length||!model.templates.size)return{raw:[],sequenceLength:0,binsPerChar:model.binsPerChar};
  const widths=[...new Set([.58,.72,.86,1,1.15,1.32,1.5].map(x=>clamp(Math.round(model.binsPerChar*x),4,24)))].sort((a,b)=>a-b),get=segmentCandidates(q,model,widths);
  const beams=Array.from({length:q.length+2},()=>[]);beams[0]=[{text:'',score:0,chars:0,trace:[],minChar:1}];
  const put=(p,s)=>{const a=beams[p];a.push(s);a.sort((x,y)=>(y.score/Math.max(1,y.chars))-(x.score/Math.max(1,x.chars)));if(a.length>22)a.length=22};
  for(let pos=0;pos<q.length;pos++){if(!beams[pos].length)continue;for(const st of beams[pos]){if(st.chars>=maxChars)continue;
    for(const w of widths){const end=pos+w;if(q.length-pos<Math.max(3,w-2))continue;for(const c of get(pos,w)){put(Math.min(q.length,end),{text:st.text+c.label,score:st.score+Math.log(Math.max(.035,c.score))+transitionBonus(st.text,c.label,model),chars:st.chars+1,minChar:Math.min(st.minChar,c.score),trace:[...st.trace,{label:c.label,score:c.score,width:w,start:pos,end:Math.min(q.length,end)}]})}}
    if(pos+1<=q.length)put(pos+1,{...st,score:st.score-.42,trace:[...st.trace,{skip:true,start:pos,end:pos+1}]});
  }}
  let finals=[];for(let p=Math.max(0,q.length-2);p<=q.length;p++)finals.push(...beams[p]);const dedup=new Map();
  for(const x of finals.filter(x=>x.text&&x.chars)){const avg=Math.exp(x.score/x.chars),item={label:x.text,score:avg,minChar:x.minChar,quality:avg>=.48&&x.minChar>=.27?'good':avg>=.35?'low':'very-low',source:'personal sequence decoder',trace:x.trace},old=dedup.get(x.text);if(!old||item.score>old.score)dedup.set(x.text,item)}
  let raw=[...dedup.values()];
  for(const w of model.whole){const score=sim(pointDist(q,w.seq))*.94;if(score>=.47){const it={label:w.label,score,minChar:score,quality:score>=.60?'good':'low',source:'personal whole-word sequence memory',trace:[]},k=canon(it.label),i=raw.findIndex(x=>canon(x.label)===k);if(i<0)raw.push(it);else if(it.score>raw[i].score)raw[i]=it}}
  raw.sort((a,b)=>b.score-a.score);const top=raw[0],margin=(top?.score||0)-(raw[1]?.score||0);if(!top||top.score<.30||(top.score<.40&&margin<.025))raw=[];
  return{raw:raw.slice(0,limit),sequenceLength:q.length,binsPerChar:model.binsPerChar,margin};
}
function editDistance(a,b){a=String(a||'');b=String(b||'');const dp=Array(b.length+1).fill(0).map((_,j)=>j);for(let i=1;i<=a.length;i++){let prev=dp[0];dp[0]=i;for(let j=1;j<=b.length;j++){const t=dp[j];dp[j]=Math.min(dp[j]+1,dp[j-1]+1,prev+(a[i-1]===b[j-1]?0:1));prev=t}}return dp[b.length]}
function cer(t,g){t=String(t||'').toLowerCase();g=String(g||'').toLowerCase();return t.length?editDistance(t,g)/t.length:(g?1:0)}
window.MedGraphStrokeSeq={buildModel,classifyLetter,recognizeWord,columnSequence,resample,dtwDistance,editDistance,cer,ptsFromSample,version:12};
})();