const CSS = `
.s3d{position:absolute;inset:0;overflow:hidden;color:#ccc;font:14px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
  user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.s3d *{box-sizing:border-box}
.s3d [hidden]{display:none!important}
.s3d-hud{position:absolute;inset:0;padding:12px 14px;pointer-events:none}
.s3d-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.s3d-stat{color:#888;letter-spacing:.12em;font-size:11px;text-transform:uppercase}
.s3d-stat b{display:block;color:#ccc;font-size:26px;font-weight:300;letter-spacing:.04em;font-variant-numeric:tabular-nums}
.s3d-stat.r{text-align:right}
.s3d-pop-wrap{position:relative;height:0}
.s3d-pop{position:absolute;left:0;top:4px;white-space:nowrap;font-size:15px;animation:s3d-pop 1s ease-out forwards}
@keyframes s3d-pop{0%{opacity:0;transform:translateY(0) scale(.7)}15%{opacity:1;transform:translateY(4px) scale(1.15)}100%{opacity:0;transform:translateY(26px) scale(1)}}
.s3d-fx{position:absolute;left:14px;bottom:calc(14px + env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;width:min(220px,50vw)}
.s3d-badge{border:1px solid var(--c);color:var(--c);padding:3px 7px 5px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;background:rgba(0,0,0,.6)}
.s3d-badge.neg{border-style:dashed;box-shadow:0 0 8px color-mix(in srgb,var(--c) 35%,transparent)}
.s3d-badge.neg::before{content:"! "}
.s3d-bar{height:2px;margin-top:4px;background:#222}
.s3d-bar i{display:block;height:100%;width:100%;background:var(--c);transform-origin:left;will-change:transform}
.s3d-badge.blink{animation:s3d-blink .35s steps(2) infinite}
@keyframes s3d-blink{50%{opacity:.25}}
.s3d-toast{position:absolute;left:0;right:0;top:30%;text-align:center;font-size:clamp(26px,8vw,52px);font-weight:200;letter-spacing:.3em;
  padding-left:.3em;pointer-events:none;animation:s3d-toast 1.1s ease-out forwards;text-shadow:0 0 18px currentColor}
@keyframes s3d-toast{0%{opacity:0;transform:scale(.8)}15%{opacity:1;transform:scale(1.05)}70%{opacity:1}100%{opacity:0;transform:scale(1.15)}}
.s3d-screen{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;
  padding:16px;background:rgba(0,0,0,.82);pointer-events:auto;overflow-y:auto;text-align:center}
.s3d-screen.menu{background:rgba(0,0,0,.6);justify-content:flex-start;padding-top:max(20px,5vh)}
.s3d-title{margin:0;font-size:clamp(30px,9vw,64px);font-weight:200;letter-spacing:.35em;padding-left:.35em;color:#ccc;animation:s3d-title 5s ease-in-out infinite}
@keyframes s3d-title{0%,100%{opacity:.75;letter-spacing:.35em}50%{opacity:1;letter-spacing:.42em}}
.s3d-h{margin:0;font-weight:200;font-size:clamp(24px,7vw,40px);letter-spacing:.3em;padding-left:.3em;color:#ccc}
.s3d-sub{color:#888;font-size:12px;letter-spacing:.1em}
.s3d-btn{pointer-events:auto;background:#000;color:#ccc;border:1px solid #666;font:inherit;letter-spacing:.25em;text-transform:uppercase;
  padding:12px 28px;cursor:pointer;min-height:44px;touch-action:manipulation}
.s3d-btn:hover,.s3d-btn:active{border-color:#ccc;color:#fff}
.s3d-skins{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;max-width:420px}
.s3d-skin{background:#000;border:1px solid #333;color:#888;padding:8px 8px 6px;font:inherit;font-size:11px;letter-spacing:.08em;cursor:pointer;
  display:flex;flex-direction:column;align-items:center;gap:6px;width:76px;touch-action:manipulation}
.s3d-skin.sel{border-color:#ccc;color:#ccc}
.s3d-view{display:flex;align-items:center;justify-content:center;gap:10px;color:#888;font-size:11px;letter-spacing:.12em;text-transform:uppercase}
.s3d-vbtn{background:#000;border:1px solid #333;color:#888;padding:6px 14px;font:inherit;letter-spacing:.12em;cursor:pointer;min-height:32px;touch-action:manipulation}
.s3d-vbtn.sel{border-color:#ccc;color:#ccc}
.s3d-sw{position:relative;width:52px;height:16px;border-radius:8px;overflow:visible}
.sw-classic{background:#2ecc40}
.sw-rainbow{background:linear-gradient(90deg,#f33,#fc3,#3f6,#3cf,#93f,#f33);background-size:200% 100%;animation:s3d-slide 3s linear infinite}
@keyframes s3d-slide{to{background-position:-200% 0}}
.sw-pumpkin{background:#ff8a1a}
.sw-pumpkin::after{content:"";position:absolute;left:50%;top:-5px;width:4px;height:7px;margin-left:-2px;background:#3a9d23;border-radius:1px}
.sw-neon{background:linear-gradient(90deg,#ff2bd6,#18f0ff);box-shadow:0 0 8px #ff2bd6aa}
.sw-lava{background:linear-gradient(90deg,#ff7a1a,#e02000);animation:s3d-lava 1.6s ease-in-out infinite}
@keyframes s3d-lava{50%{filter:brightness(1.5);box-shadow:0 0 10px #ff5a10}}
.sw-galaxy{background:linear-gradient(90deg,#5b2bd6,#1e3aa8);overflow:hidden}
.sw-galaxy::after{content:"";position:absolute;inset:0;background:radial-gradient(1px 1px at 20% 30%,#fff,transparent),radial-gradient(1px 1px at 55% 70%,#fff,transparent),radial-gradient(1.5px 1.5px at 80% 35%,#fff,transparent);animation:s3d-twinkle 1.4s ease-in-out infinite}
@keyframes s3d-twinkle{50%{opacity:.2}}
.s3d-legend{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:4px 18px;max-width:640px;width:100%;text-align:left;font-size:12px;color:#888}
.s3d-legend div{display:flex;gap:8px;align-items:baseline}
.s3d-dot{flex:none;width:9px;height:9px;border-radius:50%;background:var(--c);align-self:center}
.s3d-legend b{color:#ccc;font-weight:400}
.s3d-legend .neg b::after{content:" (-)";color:#888}
.s3d-legend .pos b::after{content:" (+)";color:#888}
.s3d-hint{color:#666;font-size:12px;max-width:420px}
.s3d-new{color:#ccc;letter-spacing:.2em;animation:s3d-blink .8s steps(2) infinite}
.s3d-big{font-size:48px;font-weight:200;color:#ccc}
@media (max-height:560px){.s3d-legend{display:none}.s3d-screen{gap:10px}}
@media (prefers-reduced-motion:reduce){.s3d *{animation-duration:.01s!important}}
`;

let injected: HTMLStyleElement | null = null;
export function injectStyles(): () => void {
  injected = document.createElement('style');
  injected.textContent = CSS;
  document.head.appendChild(injected);
  const el = injected;
  return () => el.remove();
}
