// APP v13 — 2 modalità: Solo linee / Linee + tratteggi (no OpenCV, iPad safe)
const $ = (id) => document.getElementById(id);

const fileInput = $("file");
const btnGenerate = $("btnGenerate");
const btnExportJpg = $("btnExportJpg");
const viewMode = $("viewMode");
const modeSel = $("mode");
const statusEl = $("status");

const srcCanvas = $("src");
const srcCtx = srcCanvas.getContext("2d");
const outCanvas = $("canvas");
const outCtx = outCanvas.getContext("2d");

const edge = $("edge"), blur = $("blur"), alpha = $("alpha");
const shade = $("shade"), hatch = $("hatch");
const clean = $("clean"), thick = $("thick");

const vEdge = $("vEdge"), vBlur = $("vBlur"), vAlpha = $("vAlpha");
const vShade = $("vShade"), vHatch = $("vHatch");
const vClean = $("vClean"), vThick = $("vThick");

const stencilCanvas = document.createElement("canvas");
const stencilCtx = stencilCanvas.getContext("2d");

let hasImage = false;

function setStatus(t){ statusEl.textContent = t; }
function syncLabels(){
  vEdge.textContent = edge.value;
  vBlur.textContent = blur.value;
  vAlpha.textContent = alpha.value;
  vShade.textContent = shade.value;
  vHatch.textContent = hatch.value;
  vClean.textContent = clean.value;
  vThick.textContent = thick.value;
}
[edge, blur, alpha, shade, hatch, clean, thick, modeSel].forEach(el =>
  el.addEventListener("input", () => { syncLabels(); if (hasImage && viewMode.value==="overlay") drawView(); })
);
syncLabels();

setStatus("APP.JS v13 caricato ✅ Carica una foto.");
window.onerror = (msg, url, line) => setStatus(`Errore JS: ${msg} (riga ${line || "?"})`);

fileInput.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  setStatus("Carico immagine…");
  hasImage = false;

  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => {
    const maxSide = 900;
    let w = img.naturalWidth, h = img.naturalHeight;
    const s = Math.min(1, maxSide / Math.max(w, h));
    w = Math.max(1, Math.round(w*s));
    h = Math.max(1, Math.round(h*s));

    srcCanvas.width = w; srcCanvas.height = h;
    outCanvas.width = w; outCanvas.height = h;
    stencilCanvas.width = w; stencilCanvas.height = h;

    srcCtx.setTransform(1,0,0,1,0,0);
    srcCtx.clearRect(0,0,w,h);
    srcCtx.drawImage(img, 0, 0, w, h);

    hasImage = true;
    viewMode.disabled = false;
    viewMode.value = "original";
    btnGenerate.disabled = false;
    btnExportJpg.disabled = false;

    drawView();
    setStatus("Immagine caricata ✅ Premi Genera.");
    URL.revokeObjectURL(url);
  };
  img.onerror = () => { URL.revokeObjectURL(url); setStatus("Errore: immagine non leggibile."); };
  img.src = url;
});

btnGenerate.addEventListener("click", () => {
  if (!hasImage) return alert("Carica prima una foto.");
  setStatus("Genero stencil…");
  setTimeout(() => {
    generateStencil();
    viewMode.value = "stencil";
    drawView();
    setStatus("Stencil pronto ✅");
  }, 10);
});

viewMode.addEventListener("change", drawView);
alpha.addEventListener("input", drawView);

btnExportJpg.addEventListener("click", () => {
  if (!hasImage) return alert("Carica una foto.");
  const link = document.createElement("a");
  link.download = (modeSel.value === "hatch") ? "stencil-linee-tratteggi.jpg" : "stencil-linee.jpg";
  link.href = outCanvas.toDataURL("image/jpeg", 0.95);
  link.click();
});

function drawView(){
  if (!hasImage) return;
  outCtx.setTransform(1,0,0,1,0,0);
  outCtx.clearRect(0,0,outCanvas.width,outCanvas.height);

  const mode = viewMode.value;
  if (mode === "original") outCtx.drawImage(srcCanvas, 0, 0);
  else if (mode === "stencil") outCtx.drawImage(stencilCanvas, 0, 0);
  else {
    outCtx.drawImage(srcCanvas, 0, 0);
    outCtx.globalAlpha = parseInt(alpha.value,10)/100;
    outCtx.drawImage(stencilCanvas, 0, 0);
    outCtx.globalAlpha = 1;
  }
}

// -------------------- STENCIL ENGINE --------------------
function generateStencil(){
  const w = srcCanvas.width, h = srcCanvas.height;
  const src = srcCtx.getImageData(0,0,w,h).data;

  // grayscale
  let g = new Uint8ClampedArray(w*h);
  for (let i=0, p=0; i<src.length; i+=4, p++){
    g[p] = (src[i]*0.299 + src[i+1]*0.587 + src[i+2]*0.114) | 0;
  }

  // autocontrast (aiuta moltissimo per “inkroom look”)
  g = autoContrast(g);

  // blur base
  const k = parseInt(blur.value,10);
  const radius = k === 0 ? 0 : Math.min(4, Math.floor(k/2));
  if (radius) g = boxBlurGray(g, w, h, radius);

  // pulizia rumore extra
  const c = parseInt(clean.value,10);
  for (let i=0;i<c;i++) g = boxBlurGray(g, w, h, 1);

  // edges (Sobel + soglia)
  const thr = parseInt(edge.value,10);
  let edgeMask = sobelBinary(g, w, h, thr);

  // “opening” leggero: toglie puntinato e sporco
  edgeMask = erode(edgeMask, w, h, 1);
  edgeMask = dilate(edgeMask, w, h, 1);

  // spessore linee
  const t = parseInt(thick.value,10);
  for (let i=1;i<t;i++) edgeMask = dilate(edgeMask, w, h, 1);

  // render base: bianco + linee nere
  const out = stencilCtx.createImageData(w,h);
  const d = out.data;
  for (let p=0, i=0; p<edgeMask.length; p++, i+=4){
    const isEdge = edgeMask[p] === 1;
    d[i] = isEdge ? 0 : 255;
    d[i+1] = isEdge ? 0 : 255;
    d[i+2] = isEdge ? 0 : 255;
    d[i+3] = 255;
  }
  stencilCtx.putImageData(out, 0, 0);

  // se modalità tratteggi: aggiungi hatch basato su scuro
  if (modeSel.value === "hatch") {
    const intensity = parseInt(shade.value,10)/100;  // 0..1
    const spacing = parseInt(hatch.value,10);        // 4..24
    if (intensity > 0) drawHatch(stencilCanvas, g, w, h, intensity, spacing);
  }
}

// -------------------- IMAGE OPS --------------------
function autoContrast(g){
  let min=255, max=0;
  for (let i=0;i<g.length;i++){ const v=g[i]; if(v<min)min=v; if(v>max)max=v; }
  const range = Math.max(1, max-min);
  const out = new Uint8ClampedArray(g.length);
  for (let i=0;i<g.length;i++) out[i] = ((g[i]-min)*255/range) | 0;
  return out;
}

function boxBlurGray(g, w, h, r){
  const tmp = new Uint8ClampedArray(w*h);
  const out = new Uint8ClampedArray(w*h);
  const size = r*2+1;

  // horizontal
  for (let y=0;y<h;y++){
    const row=y*w;
    let sum=0;
    for (let x=-r;x<=r;x++){
      const xx=Math.min(w-1,Math.max(0,x));
      sum += g[row+xx];
    }
    for (let x=0;x<w;x++){
      tmp[row+x] = (sum/size) | 0;
      const xr=x-r, xa=x+r+1;
      if (xr>=0) sum -= g[row+xr];
      if (xa<w)  sum += g[row+xa];
    }
  }
  // vertical
  for (let x=0;x<w;x++){
    let sum=0;
    for (let y=-r;y<=r;y++){
      const yy=Math.min(h-1,Math.max(0,y));
      sum += tmp[yy*w + x];
    }
    for (let y=0;y<h;y++){
      out[y*w + x] = (sum/size) | 0;
      const yr=y-r, ya=y+r+1;
      if (yr>=0) sum -= tmp[yr*w + x];
      if (ya<h)  sum += tmp[ya*w + x];
    }
  }
  return out;
}

function sobelBinary(g, w, h, thr){
  const out = new Uint8ClampedArray(w*h);
  out.fill(0);
  const T = thr * 6; // scala
  for (let y=1;y<h-1;y++){
    const yw=y*w;
    for (let x=1;x<w-1;x++){
      const p=yw+x;
      const a=g[p-w-1], b=g[p-w], c=g[p-w+1];
      const d=g[p-1],             f=g[p+1];
      const g1=g[p+w-1], h1=g[p+w], i1=g[p+w+1];

      const gx=(-a+c)+(-2*d+2*f)+(-g1+i1);
      const gy=( a+2*b+c)+(-g1-2*h1-i1);

      const mag = Math.abs(gx)+Math.abs(gy);
      out[p] = (mag > T) ? 1 : 0;
    }
  }
  return out;
}

// morfologia binaria semplice (veloce)
function erode(bin, w, h, it=1){
  let cur = bin;
  for (let k=0;k<it;k++){
    const out = new Uint8ClampedArray(w*h);
    for (let y=1;y<h-1;y++){
      const yw=y*w;
      for (let x=1;x<w-1;x++){
        const p=yw+x;
        // se uno dei vicini è 0, erode a 0
        const v =
          cur[p] & cur[p-1] & cur[p+1] &
          cur[p-w] & cur[p+w] &
          cur[p-w-1] & cur[p-w+1] &
          cur[p+w-1] & cur[p+w+1];
        out[p] = v ? 1 : 0;
      }
    }
    cur = out;
  }
  return cur;
}

function dilate(bin, w, h, it=1){
  let cur = bin;
  for (let k=0;k<it;k++){
    const out = new Uint8ClampedArray(w*h);
    for (let y=1;y<h-1;y++){
      const yw=y*w;
      for (let x=1;x<w-1;x++){
        const p=yw+x;
        const v =
          cur[p] | cur[p-1] | cur[p+1] |
          cur[p-w] | cur[p+w] |
          cur[p-w-1] | cur[p-w+1] |
          cur[p+w-1] | cur[p+w+1];
        out[p] = v ? 1 : 0;
      }
    }
    cur = out;
  }
  return cur;
}

// hatch sopra lo stencil: solo tratteggi (no riempimenti)
function drawHatch(stencilCanvas, gray, w, h, intensity, spacing){
  const sctx = stencilCanvas.getContext("2d");
  const hatchLayer = document.createElement("canvas");
  hatchLayer.width = w; hatchLayer.height = h;
  const hctx = hatchLayer.getContext("2d");

  hctx.clearRect(0,0,w,h);
  hctx.strokeStyle = "rgba(0,0,0,1)";
  hctx.lineWidth = 1;

  // tratteggio diagonale (stile stencil)
  for (let y=-w; y<h+w; y+=spacing){
    hctx.beginPath();
    hctx.moveTo(0, y);
    hctx.lineTo(w, y+w);
    hctx.stroke();
  }

  // maschera alpha in base allo scuro
  const img = hctx.getImageData(0,0,w,h);
  const d = img.data;
  for (let i=0, p=0; i<d.length; i+=4, p++){
    if (d[i+3] === 0) continue;
    const dark = (255 - gray[p]) / 255; // 0..1
    const a = Math.max(0, (dark - 0.20) / 0.80); // taglia luci
    d[i]=0; d[i+1]=0; d[i+2]=0;
    d[i+3] = Math.round(255 * a * intensity);
  }
  hctx.putImageData(img,0,0);

  // applica al foglio stencil
  sctx.drawImage(hatchLayer, 0, 0);
}
