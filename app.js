(()=>{
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  let audioCtx=null; const soundOn=()=>document.getElementById('sound').checked;
  function beep(freq=520, dur=0.06){
    if(!soundOn()) return;
    try{
      if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
      const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type='square'; o.frequency.value=freq; g.gain.setValueAtTime(.035, audioCtx.currentTime);
      o.connect(g).connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime+dur);
    }catch{}
  }
  async function playSeq(steps=[], gain=.035){
    if(!soundOn()) return;
    if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    for(let i=0;i<steps.length;i++){
      const [f,d]=steps[i]; const o=audioCtx.createOscillator(), g=audioCtx.createGain();
      o.type='square'; o.frequency.value=f; g.gain.value=gain; o.connect(g).connect(audioCtx.destination);
      const t=audioCtx.currentTime; o.start(t); o.stop(t+(d||0.08)); await new Promise(r=>setTimeout(r,(d||0.08)*1000));
    }
  }
  const SFX={ start:()=>playSeq([[880,.10],[1175,.10],[1568,.12]]),
              correct:()=>playSeq([[1320,.06],[1760,.06]]),
              wrong:()=>playSeq([[220,.10],[165,.08]]),
              bonus:()=>playSeq([[980,.06],[1245,.06]]),
              fire:()=>beep(900,.05), enemyFire:()=>beep(180,.05), stepA:()=>beep(300,.03), stepB:()=>beep(260,.03) };

  let BANKS=null; let BANK_KEYS=[];

  const canvas=document.getElementById('game'), ctx=canvas.getContext('2d');
  const scoreEl=document.getElementById('score'), livesIconsEl=document.getElementById('livesIcons');
  const qIndexEl=document.getElementById('qIndex'), qTotalEl=document.getElementById('qTotal');
  const timeEl=document.getElementById('time'), questionTextEl=document.getElementById('questionText');
  const choicesChipsEl=document.getElementById('choicesChips'), noticeEl=document.getElementById('notice');
  const overlay=document.getElementById('overlay');
  const pauseBtn=document.getElementById('pauseBtn');
  const downloadCsvBtn=document.getElementById('downloadCsv');
  const difficultySel=document.getElementById('difficulty'), themePlaySel=document.getElementById('themePlay');
  const newGameBtn = document.getElementById('newGameBtn');
  const tryAgainBtn = document.getElementById('tryAgainBtn');
  const W=canvas.width, H=canvas.height;

  let state={ running:false, paused:false, over:false,
    score:0, lives:3, timeLeft:120, startTime:0,
    bullets:[], enemyBullets:[], enemies:[], shields:[], bonuses:[],
    enemyDir:1, enemySpeed:40, enemyFireBase:1.6, enemyFireTimer:0, enemyBulletSpeedBase:160,
    player:{x:W/2, y:H-60, w:44, h:18, speed:370, cooldown:280, canShoot:true, sizeFactor:1},
    questionOrder:[], qIndex:0, currentQ:null,
    stats:[], difficulty:'normal',
    anim:{invaderPhase:0, invaderTimer:0},
    totalCorrect:0, correctSinceSizeToggle:0, aliensBuffed:false, shieldSmall:false,
    nextBonusTimer:7.0, powerups:{double:false, auto:false, untilDouble:0, untilAuto:0},
    streak:0, bestStreak:0
  };
  function currentMultiplier(){ const s=state.streak; if(s>=8) return 2.0; if(s>=5) return 1.5; if(s>=3) return 1.2; return 1.0; }
  function updateHudStreak(){ document.getElementById('streak').textContent=state.streak; document.getElementById('bestStreak').textContent=state.bestStreak; document.getElementById('mult').textContent='×'+currentMultiplier().toFixed(1); }

  const SPRITES={
    invA:[["0011100","0100010","1000001","1011101","1111111","0100010","1000001"],
          ["0011100","0100010","1000001","1011101","0111110","0100010","0011100"]],
    invB:[["0011100","0111110","1111111","1011101","0011100","0100010","1000001"],
          ["0011100","0111110","1111111","1011101","0011100","1000001","0100010"]],
    invC:[["0001000","0011100","0111110","1111111","1011101","0011100","0100010"],
          ["0001000","0011100","0111110","1111111","1011101","0100010","0011100"]],
    player:[["000010000","000111000","001111100","111111111"]]
  };
  function drawSprite(x,y,scale,color,frame){
    ctx.save(); ctx.translate(x,y); ctx.fillStyle=color;
    for(let r=0;r<frame.length;r++){ const row=frame[r]; for(let c=0;c<row.length;c++){ if(row[c]==='1'){ ctx.fillRect(c*scale,r*scale,scale,scale); } } }
    ctx.restore();
  }
  function drawPlayer(x,y,scaleFactor){ const scale=3*scaleFactor, frame=SPRITES.player[0], w=frame[0].length*scale, h=frame.length*scale; ctx.save(); ctx.translate(x-w/2,y-h/2); drawSprite(0,0,scale,'#66d8ff',frame); ctx.restore(); }
  function drawInvader(e){ const frame=SPRITES[e.sprite][state.anim.invaderPhase]; drawSprite(e.x,e.y,e.scale,'#8bb0ff',frame); ctx.save(); ctx.fillStyle='#cfe3ff'; ctx.font='bold 12px system-ui, sans-serif'; ctx.textAlign='center'; ctx.textBaseline='top'; ctx.fillText(e.letter, e.x+e.fw/2, e.y+e.fh+6); ctx.restore(); }
  function drawBonus(b){ ctx.save(); ctx.translate(b.x,b.y); ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fillStyle= b.type==='double' ? 'rgba(100,255,180,.9)' : 'rgba(255,230,120,.9)'; ctx.fill(); ctx.fillStyle='#00122a'; ctx.font='bold 10px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(b.type==='double'?'2x':'AUTO',0,0); ctx.restore(); }

  const keys={left:false,right:false,shoot:false};
  document.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft') keys.left=true;
    if(e.key==='ArrowRight') keys.right=true;
    if(e.key===' '){ keys.shoot=true; e.preventDefault(); }
    if(e.key.toLowerCase()==='p'){ togglePause(); }
  });
  document.addEventListener('keyup',e=>{ if(e.key==='ArrowLeft') keys.left=false; if(e.key==='ArrowRight') keys.right=false; if(e.key===' ') keys.shoot=false; });

  function setLivesIcons(){ livesIconsEl.textContent='🛸'.repeat(state.lives); }
  function togglePause(){ if(!state.running) return; state.paused=!state.paused; notice(state.paused?'PAUSE':''); }
  function notice(txt,color){ noticeEl.textContent=txt||''; noticeEl.style.color=color||'#fff'; if(txt){ setTimeout(()=>{ if(noticeEl.textContent===txt) noticeEl.textContent=''; }, 900);}}

  function themeChanged(){
    const base=getBankFor(themePlaySel.value); qTotalEl.textContent=base.length;
    if(state.running){ notice('Thème changé — une nouvelle partie appliquera le changement'); }
    else{ questionTextEl.textContent=`Thème sélectionné : ${themePlaySel.value}`; }
  }

  function getDefaultKey(){ return (themePlaySel.options.length>0? themePlaySel.options[0].value : (BANK_KEYS[0]||'')); }
  function getBankFor(key){ return (BANKS && BANKS[key]) ? BANKS[key] : []; }

  function startGame(){
    const bankKey=themePlaySel.value || getDefaultKey();
    const base=getBankFor(bankKey);
    if(!base.length){ notice('Ce thème ne contient aucune question.', 'var(--danger)'); overlay.hidden=false; return; }

    newGameBtn.hidden = true;
    tryAgainBtn.hidden = true;
    downloadCsvBtn.hidden = true;
    overlay.hidden=true;
    state.running=true; state.paused=false; state.over=false;
    state.score=0; state.lives=3; state.timeLeft=120; state.stats=[]; setLivesIcons();
    state.player.x=W/2; state.bullets=[]; state.enemyBullets=[]; state.enemies=[]; state.qIndex=0; state.shields=[]; state.bonuses=[]; notice('');
    state.totalCorrect=0; state.correctSinceSizeToggle=0; state.aliensBuffed=false; state.shieldSmall=false; state.player.sizeFactor=1;
    state.powerups={double:false,auto:false,untilDouble:0,untilAuto:0}; state.nextBonusTimer=7.0;
    state.streak=0; state.bestStreak=0; updateHudStreak();
    state.questionOrder=[...Array(base.length).keys()].sort(()=>Math.random()-0.5);
    QUESTION_BANK=JSON.parse(JSON.stringify(base)); qTotalEl.textContent=QUESTION_BANK.length;
    nextQuestion(); setupShields(); state.startTime=performance.now(); last=performance.now();
    SFX.start(); requestAnimationFrame(loop);
  }
  function endGame(){
    state.running=false; state.over=true;
    overlay.hidden=false;
    tryAgainBtn.hidden = false;
    downloadCsvBtn.hidden=false;
    const ok=state.stats.filter(s=>s.ok).length, total=state.stats.length||1, rate=Math.round(100*ok/total);
    overlay.querySelector('h2').textContent=`Game Over`;
    overlay.querySelector('p.small').textContent = `Score final : ${state.score} — Réussite : ${rate}% — Meilleure série : ${state.bestStreak}`;
  }

  let QUESTION_BANK=[];
  function nextQuestion(){
    if(state.qIndex>=state.questionOrder.length || state.timeLeft<=0){ endGame(); return; }
    const qi=state.questionOrder[state.qIndex];
    const q=JSON.parse(JSON.stringify(QUESTION_BANK[qi]));
    const tmp=q.choices.map((t,i)=>({t,i})); for(let i=tmp.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [tmp[i],tmp[j]]=[tmp[j],tmp[i]]; }
    q.choices=tmp.map(o=>o.t); q.correct=tmp.findIndex(o=>o.i===q.correct);
    state.currentQ=q; qIndexEl.textContent=(state.qIndex+1);
    questionTextEl.textContent=`${q.q} — Thème : ${themePlaySel.value}`; renderChoiceChips(q);
    const labels='ABCDEFGHIJKLMNOPQRSTUVWXYZ'; const n=q.choices.length; state.enemies=[];
    const margin=70, spacing=(canvas.width-2*margin)/n, y0=120;
    for(let i=0;i<n;i++){
      const sprite=i%3===0?'invA':(i%3===1?'invB':'invC');
      const scale=4; const fw=SPRITES[sprite][0][0].length*scale; const fh=SPRITES[sprite][0].length*scale;
      const x=margin+i*spacing+(spacing-fw)/2, y=y0;
      state.enemies.push({x:x,y:y,fw:fw,fh:fh,scale:scale,sprite:sprite,letter:labels[i],text:q.choices[i],correct:(i===q.correct),alive:true});
    }
  }
  function renderChoiceChips(q){
    choicesChipsEl.innerHTML=''; const labels='ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    q.choices.forEach((c,i)=>{ const chip=document.createElement('span'); chip.className='chip'; chip.textContent=`${labels[i]}) ${c}`; choicesChipsEl.appendChild(chip); });
  }

  function setupShields(){ state.shields=[]; const Y=canvas.height-150, Wsh=110, Hsh=36; const centers=[canvas.width*0.22,canvas.width*0.5,canvas.width*0.78]; for(const cx of centers){ state.shields.push({x:cx-Wsh/2, y:Y, w:Wsh, h:Hsh, hp:18, maxhp:18}); } }
  function shrinkShields(){ for(const s of state.shields){ const cx=s.x+s.w/2, cy=s.y+s.h/2; s.w=Math.round(s.w*.72); s.h=Math.round(s.h*.72); s.x=cx-s.w/2; s.y=cy-s.h/2; } }

  function shoot(){
    if(!state.running||state.paused) return; const p=state.player; if(!p.canShoot) return;
    if(state.powerups.double){ state.bullets.push({x:p.x-10*p.sizeFactor,y:p.y-20,vy:-520,w:3,h:10}); state.bullets.push({x:p.x+10*p.sizeFactor,y:p.y-20,vy:-520,w:3,h:10}); }
    else{ state.bullets.push({x:p.x,y:p.y-20,vy:-520,w:3,h:10}); }
    p.canShoot=false; setTimeout(()=>p.canShoot=true,p.cooldown); SFX.fire();
  }
  function enemyShoot(){
    const alive=state.enemies.filter(e=>e.alive); if(!alive.length) return;
    const e=alive[Math.floor(Math.random()*alive.length)], v=state.enemyBulletSpeedBase+Math.random()*70;
    state.enemyBullets.push({x:e.x+e.fw/2,y:e.y+e.fh+6,vy:v,w:3,h:10}); SFX.enemyFire();
  }

  function onCorrect(enemy){
    const t=performance.now()-state.startTime; const base=120+(state.difficulty==='hard'?30:0);
    state.streak+=1; state.bestStreak=Math.max(state.bestStreak,state.streak); updateHudStreak();
    state.score+=Math.round(base*currentMultiplier()); notice('✔ Correct','var(--accent2)'); SFX.correct();
    state.stats.push({q:state.currentQ.q, theme:themePlaySel.value, choice:enemy.text, correctChoice:state.currentQ.choices[state.currentQ.correct], ok:true, ms:t});
    state.totalCorrect+=1; state.correctSinceSizeToggle+=1;
    if(state.totalCorrect>=3 && !state.aliensBuffed){ state.aliensBuffed=true; state.enemyFireBase=Math.max(0.6,state.enemyFireBase-0.5); state.enemyBulletSpeedBase+=80; notice('⚠️ Cadence ennemie ↑','var(--accent3)'); }
    if(state.correctSinceSizeToggle>=2){ state.correctSinceSizeToggle=0; state.player.sizeFactor=(state.player.sizeFactor===1?2:1); notice(state.player.sizeFactor===2?'⬆ Taille x2':'⬇ Taille normale'); }
    if(state.totalCorrect>=4 && !state.shieldSmall){ state.shieldSmall=true; shrinkShields(); notice('Boucliers réduits'); }
    state.qIndex++; nextQuestion();
  }
  function onWrong(enemy){
    state.score=(state.score>120)?(state.score-120):0; state.streak=0; updateHudStreak();
    if(state.difficulty==='hard') loseLife(); notice('✖ Faux','var(--danger)'); SFX.wrong();
    const t=performance.now()-state.startTime; state.stats.push({q:state.currentQ.q, theme:themePlaySel.value, choice:enemy.text, correctChoice:state.currentQ.choices[state.currentQ.correct], ok:false, ms:t});
  }
  function handleHit(enemy){ if(enemy.correct){ onCorrect(enemy); } else { onWrong(enemy); enemy.alive=false; } }
  function loseLife(){ state.lives=Math.max(0,state.lives-1); setLivesIcons(); state.streak=0; updateHudStreak(); if(state.lives<=0) endGame(); }

  let last=0;
  function update(dt){
    if(!state.running||state.paused) return;
    const tnow=performance.now();
    state.timeLeft=Math.max(0,state.timeLeft-dt); timeEl.textContent=Math.ceil(state.timeLeft); if(state.timeLeft<=0){ endGame(); return; }

    if(state.powerups.double && tnow>state.powerups.untilDouble){ state.powerups.double=false; notice('Tirs doublés terminés'); }
    if(state.powerups.auto && tnow>state.powerups.untilAuto){ state.powerups.auto=false; notice('Tir auto terminé'); }

    const p=state.player; if(keys.left) p.x-=p.speed*dt; if(keys.right) p.x+=p.speed*dt; p.x=clamp(p.x,30,canvas.width-30);
    if(keys.shoot){ shoot(); keys.shoot=false; } if(state.powerups.auto && p.canShoot) shoot();

    let leftMost=Infinity, rightMost=-Infinity;
    for(const e of state.enemies){ if(!e.alive) continue; leftMost=Math.min(leftMost,e.x); rightMost=Math.max(rightMost,e.x+e.fw); }
    if(leftMost===Infinity){ state.qIndex++; nextQuestion(); }
    else{
      const hitL=leftMost<=20 && state.enemyDir<0, hitR=rightMost>=canvas.width-20 && state.enemyDir>0;
      if(hitL||hitR){ state.enemyDir*=-1; for(const e of state.enemies){ e.y+=28; } }
      for(const e of state.enemies){ if(!e.alive) continue; e.x+=state.enemyDir*state.enemySpeed*dt; }
      const reachedBottom=state.enemies.some(e=>e.alive && (e.y+e.fh)>= (canvas.height-120));
      if(reachedBottom){ loseLife(); state.qIndex++; nextQuestion(); if(state.lives<=0){ endGame(); return; } }
    }

    state.enemyFireTimer+=dt; const interval=state.enemyFireBase+Math.random()*0.6; if(state.enemyFireTimer>interval){ state.enemyFireTimer=0; enemyShoot(); }

    for(const b of state.bullets) b.y+=b.vy*dt; state.bullets=state.bullets.filter(b=>b.y>-20 && b.y<canvas.height+20);
    for(const eb of state.enemyBullets) eb.y+=eb.vy*dt; state.enemyBullets=state.enemyBullets.filter(b=>b.y<canvas.height+30);

    for(const b of state.bullets){
      for(const e of state.enemies){
        if(!e.alive) continue;
        if(rectsOverlap({x:b.x-2,y:b.y,w:b.w,h:b.h},{x:e.x,y:e.y,w:e.fw,h:e.fh})){ e.alive=false; b.y=-9999; handleHit(e); break; }
      }
    }
    for(const eb of state.enemyBullets){
      for(const s of state.shields){ if(s.hp>0 && rectsOverlap({x:eb.x-1,y:eb.y,w:eb.w,h:eb.h}, s)){ s.hp--; eb.y=canvas.height+999; break; } }
      if(rectsOverlap({x:eb.x-1,y:eb.y,w:eb.w,h:eb.h}, playerRect())){ eb.y=canvas.height+999; loseLife(); }
    }

    state.nextBonusTimer-=dt; if(state.nextBonusTimer<=0){ spawnBonus(); state.nextBonusTimer=8+Math.random()*6; }
    for(const bonus of state.bonuses) bonus.y+=bonus.vy*dt;
    state.bonuses=state.bonuses.filter(b=>{
      if(b.y>canvas.height+40) return false;
      if(rectsOverlap({x:b.x-10,y:b.y-10,w:20,h:20}, playerRect())){ applyBonus(b.type); return false; }
      return true;
    });

    state.anim.invaderTimer+=dt; if(state.anim.invaderTimer>0.35){ state.anim.invaderTimer=0; state.anim.invaderPhase=1-state.anim.invaderPhase; (state.anim.invaderPhase?SFX.stepA():SFX.stepB()); }
    updateHudStreak();
  }
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    drawStars();
    for(const s of state.shields){
      if(s.hp<=0) continue; const r=s.hp/s.maxhp; ctx.fillStyle=`rgba(90,200,90,${0.25+0.45*r})`;
      roundRect(ctx,s.x,s.y,s.w,s.h,8,true); ctx.strokeStyle='rgba(120,255,120,.35)'; ctx.lineWidth=2; roundRect(ctx,s.x,s.y,s.w,s.h,8,false);
    }
    const p=state.player; drawPlayer(p.x,p.y,p.sizeFactor);
    for(const e of state.enemies){ if(!e.alive) continue; drawInvader(e); }
    ctx.fillStyle='#e2f1ff'; for(const b of state.bullets) ctx.fillRect(b.x-1.5,b.y,b.w,b.h);
    ctx.fillStyle='#f4c542'; for(const b of state.enemyBullets) ctx.fillRect(b.x-1.5,b.y,b.w,b.h);
    for(const b of state.bonuses) drawBonus(b);
    scoreEl.textContent=state.score;
  }
  function loop(ts){ const dt=Math.min(0.035,(ts-last)/1000); last=ts; update(dt); draw(); if(state.running) requestAnimationFrame(loop); }

  function playerRect(){ const p=state.player; const w=44*p.sizeFactor, h=18*p.sizeFactor; return {x:p.x-w/2,y:p.y-h/2,w:w,h:h}; }
  function rectsOverlap(a,b){ return (a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y); }
  function roundRect(ctx,x,y,w,h,r,fill){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); else ctx.stroke(); }
  function drawStars(){ for(let i=0;i<90;i++){ const x=(i*97%canvas.width), y=(i*41 + Math.floor((state.timeLeft*20 + i*13)))%canvas.height; ctx.fillStyle= i%9===0? '#a3c5ff' : (i%5===0? '#7aa4ff' : '#3b54a3'); ctx.fillRect(x,y,2,2); } }

  function spawnBonus(){ const x=60+Math.random()*(canvas.width-120); const type=Math.random()<0.5?'double':'auto'; state.bonuses.push({x:x,y:-20,vy:110+Math.random()*50,type:type}); }
  function applyBonus(type){ const t=performance.now(); if(type==='double'){ state.powerups.double=true; state.powerups.untilDouble=t+8000; notice('Bonus : tirs doublés'); SFX.bonus(); } if(type==='auto'){ state.powerups.auto=true; state.powerups.untilAuto=t+8000; notice('Bonus : tir continu'); SFX.bonus(); } }

  function exportCSV(){
    const rows=[["Thème joué","Question","Réponse choisie","Bonne réponse","Correct","Temps (s)","Série max","Score final"]];
    const themePlayed=themePlaySel.value;
    for(const s of state.stats){ rows.push([themePlayed, s.q, s.choice, s.correctChoice, s.ok?'1':'0', (s.ms/1000).toFixed(2), state.bestStreak, state.score]); }
    const csv=rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','\\\"')}"`).join(';')).join('\\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download='quiz_invaders_btp_resultats.csv'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),5000);
  }

  function applyDifficulty(){
    const d=difficultySel.value; state.difficulty=d;
    if(d==='easy'){ state.player.cooldown=220; state.enemySpeed=34; state.enemyFireBase=2.2; state.enemyBulletSpeedBase=140; }
    if(d==='normal'){ state.player.cooldown=280; state.enemySpeed=42; state.enemyFireBase=1.6; state.enemyBulletSpeedBase=160; }
    if(d==='hard'){ state.player.cooldown=320; state.enemySpeed=52; state.enemyFireBase=1.0; state.enemyBulletSpeedBase=190; }
  }
  applyDifficulty();

  newGameBtn.onclick = startGame;
  tryAgainBtn.onclick = startGame;
  pauseBtn.onclick=togglePause;
  downloadCsvBtn.onclick=exportCSV;
  difficultySel.onchange=applyDifficulty;
  themePlaySel.onchange=themeChanged;

  async function init(){
    try{
      const res=await fetch('questions-btp.json',{cache:'no-store'});
      if(!res.ok) throw new Error('HTTP '+res.status);
      BANKS=await res.json();
      BANK_KEYS=Object.keys(BANKS);
      themePlaySel.innerHTML='';
      BANK_KEYS.forEach((k,i)=>{
        const opt=document.createElement('option');
        opt.value=k; opt.textContent=k;
        themePlaySel.appendChild(opt);
      });
      const p=new URLSearchParams(location.search); const t=(p.get('theme')||'').trim();
      if(t && BANK_KEYS.includes(t)){ themePlaySel.value=t; } else { themePlaySel.selectedIndex=0; }
      const base=getBankFor(themePlaySel.value); qTotalEl.textContent=base.length;
      questionTextEl.textContent=`Thème sélectionné : ${themePlaySel.value}`;
    }catch(e){
      console.warn('Échec JSON', e);
      alert('Impossible de charger "questions-btp.json". Ouvrez via un serveur local (ex: python -m http.server) ou hébergez les fichiers.');
      themePlaySel.innerHTML='<option>Indisponible</option>';
    }
  }
  document.addEventListener('DOMContentLoaded', init);
})();