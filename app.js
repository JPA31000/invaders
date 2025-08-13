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

  // --- Element selectors ---
  const startScreen = document.getElementById('start-screen');
  const gameContainer = document.getElementById('game-container');
  const newGameBtn = document.getElementById('newGameBtn');

  const screenEl = document.getElementById('screen');
  const canvas=document.getElementById('game'), ctx=canvas.getContext('2d');
  const scoreEl=document.getElementById('score'), livesIconsEl=document.getElementById('livesIcons');
  const qIndexEl=document.getElementById('qIndex'), qTotalEl=document.getElementById('qTotal');
  const timeEl=document.getElementById('time'), questionTextEl=document.getElementById('questionText');
  const choicesChipsEl=document.getElementById('choicesChips'), noticeEl=document.getElementById('notice');
  const overlay=document.getElementById('overlay');
  const pauseBtn=document.getElementById('pauseBtn');
  const downloadCsvBtn=document.getElementById('downloadCsv');
  const difficultySel=document.getElementById('difficulty'), themePlaySel=document.getElementById('themePlay');
  const tryAgainBtn = document.getElementById('tryAgainBtn');
  const W=canvas.width, H=canvas.height;

  let state={ running:false, paused:false, over:false,
    score:0, lives:3, timeLeft:240, startTime:0, // Game time is now 4 minutes
    bullets:[], enemyBullets:[], enemies:[], shields:[], bonuses:[],
    enemyDir:1, enemySpeed:40, enemyFireBase:1.6, enemyFireTimer:0, enemyBulletSpeedBase:160,
    player:{x:W/2, y:H-60, w:44, h:18, speed:370, cooldown:280, canShoot:true, sizeFactor:1},
    questionOrder:[], qIndex:0, currentQ:null,
    stats:[], difficulty:'normal',
    anim:{invaderPhase:0, invaderTimer:0},
    nextBonusTimer:7.0,
    powerups:{double:false, nx:false, untilDouble:0, untilNx:0}, // Renamed 'auto' to 'nx'
    // New state variables for new rules
    redBallCounter: 0,
    wrongAnswersInRow: 0,
    wrongAnswerTimestamps: []
  };

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
  function drawBonus(b){
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);

    let text = '', color = '';
    switch(b.type) {
      case 'double':  text = '2x'; color = 'rgba(100,255,180,.9)'; break;
      case 'nx':      text = 'nx'; color = 'rgba(255,230,120,.9)'; break;
      case 'shrink':  text = 'pti'; color = 'rgba(200, 150, 255, .9)'; break;
      case 'redball': text = '';    color = 'rgba(239, 68, 68, .9)'; break;
    }
    ctx.fillStyle = color;
    ctx.fill();
    if(b.type === 'redball') {
        ctx.strokeStyle = 'rgba(255, 150, 150, .9)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.fillStyle = '#00122a';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  const keys={left:false,right:false,shoot:false};
  document.addEventListener('keydown',e=>{
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'q') keys.left = true;
    if (key === 'arrowright' || key === 'd') keys.right = true;
    if (key === ' '){ keys.shoot=true; e.preventDefault(); }
    if (key === 'p'){ togglePause(); }
  });
  document.addEventListener('keyup',e=>{
    const key = e.key.toLowerCase();
    if (key === 'arrowleft' || key === 'q') keys.left = false;
    if (key === 'arrowright' || key === 'd') keys.right = false;
    if (key === ' ') keys.shoot = false;
  });
  screenEl.addEventListener('mousedown', (e) => {
    if (state.running && !state.paused && e.button === 0) {
      shoot();
    }
  });


  function setLivesIcons(){ livesIconsEl.textContent='🛸'.repeat(state.lives); }
  function togglePause(){ if(!state.running) return; state.paused=!state.paused; notice(state.paused?'PAUSE':''); }
  function notice(txt,color){ noticeEl.textContent=txt||''; noticeEl.style.color=color||'#fff'; if(txt){ setTimeout(()=>{ if(noticeEl.textContent===txt) noticeEl.textContent=''; }, 1200);}}

  function getDefaultKey(){ return (themePlaySel.options.length>0? themePlaySel.options[0].value : (BANK_KEYS[0]||'')); }
  function getBankFor(key){ return (BANKS && BANKS[key]) ? BANKS[key] : []; }

  function startGame(){
    startScreen.hidden = true;
    gameContainer.hidden = false;
    requestAnimationFrame(() => {
        window.scrollTo(0, 0);
    });

    const bankKey=themePlaySel.value || getDefaultKey();
    const base=getBankFor(bankKey);
    if(!base.length){ notice('Ce thème ne contient aucune question.', 'var(--danger)'); overlay.hidden=false; return; }

    tryAgainBtn.hidden = true;
    downloadCsvBtn.hidden = true;
    overlay.hidden=true;
    state.running=true; state.paused=false; state.over=false;
    state.score=0; state.lives=3; state.timeLeft=240; state.stats=[]; setLivesIcons();
    state.player.x=W/2; state.bullets=[]; state.enemyBullets=[]; state.enemies=[]; state.qIndex=0; state.shields=[]; state.bonuses=[]; notice('');
    state.player.sizeFactor=1;
    state.powerups={double:false, nx:false, untilDouble:0, untilNx:0};
    // Reset new state variables
    state.redBallCounter = 0;
    state.wrongAnswersInRow = 0;
    state.wrongAnswerTimestamps = [];
    
    QUESTION_BANK=JSON.parse(JSON.stringify(base)); qTotalEl.textContent=QUESTION_BANK.length;
    state.questionOrder=[...Array(QUESTION_BANK.length).keys()].sort(()=>Math.random()-0.5);
    nextQuestion(); setupShields(); state.startTime=performance.now(); last=performance.now();
    SFX.start(); requestAnimationFrame(loop);
  }
  function endGame(){
    // Planifie l'affichage de GAME OVER dans ~2s
    if(state.pendingGameOver || state.over) return;
    state.pendingGameOver = true;
    state.pendingGameOverUntil = performance.now() + 2000; // 2 secondes
  }
  function finalizeGameOver(){
    if(state.over) return;
    state.running=false; state.over=true; state.showPixelGameOver = true; state.flashUntil = performance.now() + 140;
    overlay.hidden=false;
    tryAgainBtn.hidden = false;
    downloadCsvBtn.hidden=false;
    const ok=state.stats.filter(s=>s.ok).length, total=state.stats.length||1, rate=Math.round(100*ok/total);
    overlay.querySelector('h2').textContent=`Game Over`;
    overlay.querySelector('p.small').textContent = `Score final : ${state.score} — Réussite : ${rate}%`;
    draw();
  })();