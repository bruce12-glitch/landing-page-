// reveal
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting) e.target.classList.add('in')}),{threshold:.12});
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
  // faq
  document.querySelectorAll('.faq-q').forEach(b=>b.addEventListener('click',()=>{
    const it=b.parentElement; const open=it.classList.contains('open');
    document.querySelectorAll('.faq-item').forEach(x=>x.classList.remove('open'));
    if(!open) it.classList.add('open');
  }));
  // 3D tilt for shield & feature cards
  const shield=document.getElementById('shield');
  const stage=document.getElementById('stage');
  if(shield && stage && window.matchMedia('(hover:hover)').matches){
    stage.addEventListener('mousemove', e=>{
      const r=stage.getBoundingClientRect();
      const x=(e.clientX - r.left)/r.width - .5;
      const y=(e.clientY - r.top)/r.height - .5;
      shield.style.transform=`rotateX(${6 - y*8}deg) rotateY(${-8 + x*12}deg) translateZ(0)`;
      shield.style.transition='none';
    });
    stage.addEventListener('mouseleave',()=>{
      shield.style.transition='transform .6s cubic-bezier(.16,1,.3,1)';
      shield.style.transform='rotateX(6deg) rotateY(-8deg)';
    });
  }
  // subtle parallax for rings
  let ticking=false;
  window.addEventListener('scroll',()=>{
    if(ticking) return; ticking=true;
    requestAnimationFrame(()=>{
      const y=window.scrollY;
      document.querySelectorAll('.ring').forEach((el,i)=>{
        el.style.transform=`translate(-50%,-50%) rotateX(68deg) translateY(${y*0.02*(i+1)}px)`;
      });
      ticking=false;
    });
  }, {passive:true});
  // tilt for feat cards
  document.querySelectorAll('.tilt').forEach(c=>{
    if(!window.matchMedia('(hover:hover)').matches) return;
    c.addEventListener('mousemove', e=>{
      const r=c.getBoundingClientRect();
      const x=(e.clientX - r.left)/r.width - .5;
      const y=(e.clientY - r.top)/r.height - .5;
      c.style.transform=`perspective(800px) rotateX(${-y*6}deg) rotateY(${x*8}deg) translateY(-4px)`;
    });
    c.addEventListener('mouseleave',()=>{c.style.transform='';});
  });