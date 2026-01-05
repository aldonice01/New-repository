const $ = (id) => document.getElementById(id);

const fileInput = $("file");
const btnGenerate = $("btnGenerate");
const btnExportJpg = $("btnExportJpg");
const viewMode = $("viewMode");
const statusEl = $("status");

const edge = $("edge"), blur = $("blur"), shade = $("shade"), hatch = $("hatch"), alpha = $("alpha");
const vEdge = $("vEdge"), vBlur = $("vBlur"), vShade = $("vShade"), vHatch = $("vHatch"), vAlpha = $("vAlpha");

const srcCanvas = $("src");
const srcCtx = srcCanvas.getContext("2d");
const outCanvas = $("canvas");
const outCtx = outCanvas.getContext("2d");

const stencilCanvas = document.createElement("canvas");
const stencilCtx = stencilCanvas.getContext("2d");

let hasImage = false;

function setStatus(t){ statusEl.textContent = t; }

function syncLabels(){
  vEdge.textContent = edge.value;
  vBlur.textContent = blur.value;
  vShade.textContent = shade.value;
  vHatch.textContent = hatch.value;
  vAlpha.textContent = alpha.value;
}
[edge, blur, shade, hatch, alpha].forEach(el => el.addEventListener("input", () => {
  syncLabels();
  if (hasImage && viewMode.value === "overlay") drawView();
}));
syncLabels();

window.onerror = (msg, url, line) => {
  setStatus(`Errore JS: ${msg} (riga ${line || "?"})`);
};

fileInput.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  setStatus("Carico immagine…");
  hasImage = false;

  try {
    const bmp = await createImageBitmap(f);

    // ✅ per velocità su iPad: 900px max
    const maxSide = 900;
    let w = bmp.width, h = bmp.height;
    const s = Math.min(1, maxSide / Math.max(w, h));
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));

    srcCanvas.width = w; srcCanvas.height = h;
    outCanvas.width = w; outCanvas.height = h;
    stencilCanvas.width = w; stencilCanvas.height = h;

    srcCtx.setTransform(1,0,0,1,0,0);
    srcCtx.clearRect(0,0,w,h);
    srcCtx.drawImage(bmp, 0, 0, w, h);

    hasImage = true;
    viewMode.disabled = false;
    btnGenerate.disabled = false;
    btnExportJpg.disabled = false;

    viewMode.value = "original";
    drawView();

    setStatus("Immagine ok ✅ Premi Genera.");
  } catch (err) {
    setStatus("Errore caricamento immagine: " + err.message);
  }
});

btnGenerate.addEventListener("click", () => {
  if (!hasImage) return alert("Carica prima una foto.");
  setStatus("Genero stencil…");
  setTimeout(() => { // lascia respirare UI
    generateStencilJS();
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
  link.download = "export.jpg";
  link.href = outCanvas.toDataURL("image/jpeg", 0.95);
  link.click();
});

function drawView(){
  if (!hasImage) return;

  outCtx.setTransform(1,0,0,1,0,0);
  outCtx.clearRect(0,0,outCanvas.width,outCanvas.height);

  const mode = viewMode.value;

  if (mode === "original") {
    outCtx.drawImage(srcCanvas, 0, 0);
  } else if (mode === "stencil") {
    outCtx.drawImage(stencilCanvas, 0, 0);
  } else { // overlay
    outCtx.drawImage(srcCanvas, 0, 0);
    outCtx.globalAlpha = parseInt(alpha.value,10)/100;
    outCtx.drawImage(stencilCanvas, 0, 0);
    outCtx.globalAlpha = 1;
  }
}

// ---- STENCIL: edge detection (Sobel) + (opzionale) hatch ----
function generateStencilJS(){
  const w = srcCanvas.width, h = srcCanvas.height;

  const src = srcCtx.getImageData(0,0,w,h);
  const data = src.data;

  // grayscale
  const g = new Uint8ClampedArray(w*h);
  for (let i=0, p=0; i<data.length; i+=4, p++){
    // luminanza
    g[p] = (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114) | 0;
  }

  // blur (box blur veloce) — slider: 0,3,5,7,9 → radius 0..4
  const k = parseInt(blur.value, 10);
  const radius = k === 0 ? 0 : Math.min(4, Math.floor(k/2));
  const gb = radius ? boxBlurGray(g, w, h, radius) : g;

  // Sobel edges
  const threshold = parseInt(edge.value, 10); // 20..200
  const out = new Uint8ClampedArray(w*h); // 0/255
  sobelThreshold(gb, w, h, threshold, out);

  // Disegna stencil: fondo bianco + linee nere
  const img = stencilCtx.createImageData(w,h);
  const d = img.data;
  for (let p=0, i=0; p<out.length; p++, i+=4){
    const isEdge = out[p] === 255;
    d[i] = isEdge ? 0 : 255;
    d[i+1] = isEdge ? 0 : 255;
    d[i+2] = isEdge ? 0 : 255;
    d[i+3] = 255;
  }
  stencilCtx.putImageData(img, 0, 0);

  // Tratteggio 1 direzione (opzionale)
  const intensity = parseInt(shade.value, 10) / 100;
  if (intensity > 0) {
    drawHatchOnStencil(stencilCanvas, gb, w, h, intensity, parseInt(hatch.value,10));
  }
}

function sobelThreshold(g, w, h, thr, out){
  // kernel sobel:
  // gx = [-1 0 1; -2 0 2; -1 0 1]
  // gy = [ 1 2 1;  0 0 0; -1 -2 -1]
  for (let y=1; y<h-1; y++){
    const yw = y*w;
    for (let x=1; x<w-1; x++){
      const p = yw + x;

      const a = g[p-w-1], b=g[p-w], c=g[p-w+1];
      const d = g[p-1],           f=g[p+1];
      const g1= g[p+w-1], h1=g[p+w], i1=g[p+w+1];

      const gx = (-a + c) + (-2*d + 2*f) + (-g1 + i1);
      const gy = ( a + 2*b + c) + (-g1 - 2*h1 - i1);

      const mag = Math.abs(gx) + Math.abs(gy); // approx veloce
      out[p] = (mag > thr*8) ? 255 : 0; // fattore per match slider
    }
  }
  // bordi
  for (let x=0; x<w; x++){ out[x]=0; out[(h-1)*w+x]=0; }
  for (let y=0; y<h; y++){ out[y*w]=0; out[y*w+w-1]=0; }
}

function boxBlurGray(g, w, h, r){
  // blur separabile (2 pass) per velocità
  const tmp = new Uint8ClampedArray(w*h);
  const out = new Uint8ClampedArray(w*h);
  const size = r*2 + 1;

  // orizzontale
  for (let y=0; y<h; y++){
    let sum = 0;
    const row = y*w;
    for (let x=-r; x<=r; x++){
      const xx = Math.min(w-1, Math.max(0, x));
      sum += g[row+xx];
    }
    for (let x=0; x<w; x++){
      tmp[row+x] = (sum / size) | 0;
      const xRemove = x - r;
      const xAdd = x + r + 1;
      if (xRemove >= 0) sum -= g[row+xRemove];
      if (xAdd < w) sum += g[row+xAdd];
    }
  }

  // verticale
  for (let x=0; x<w; x++){
    let sum = 0;
    for (let y=-r; y<=r; y++){
      const yy = Math.min(h-1, Math.max(0, y));
      sum += tmp[yy*w + x];
    }
    for (let y=0; y<h; y++){
      out[y*w + x] = (sum / size) | 0;
      const yRemove = y - r;
      const yAdd = y + r + 1;
      if (yRemove >= 0) sum -= tmp[yRemove*w + x];
      if (yAdd < h) sum += tmp[yAdd*w + x];
    }
  }
  return out;
}

function drawHatchOnStencil(stencilCanvas, gray, w, h, intensity, spacing){
  const sctx = stencilCanvas.getContext("2d");
  const hatchLayer = document.createElement("canvas");
  hatchLayer.width = w; hatchLayer.height = h;
  const hctx = hatchLayer.getContext("2d");

  hctx.clearRect(0,0,w,h);
  hctx.strokeStyle = "rgba(0,0,0,1)";
  hctx.lineWidth = 1;

  // tratteggio diagonale
  for (let y = -w; y < h + w; y += spacing) {
    hctx.beginPath();
    hctx.moveTo(0, y);
    hctx.lineTo(w, y + w);
    hctx.stroke();
  }

  const hid = hctx.getImageData(0,0,w,h);
  const hd = hid.data;

  for (let i=0, p=0; i<hd.length; i+=4, p++){
    if (hd[i+3] === 0) continue;
    const dark = (255 - gray[p]) / 255;
    const a = Math.max(0, (dark - 0.15) / 0.85);
    hd[i] = 0; hd[i+1] = 0; hd[i+2] = 0;
    hd[i+3] = Math.round(255 * a * intensity);
  }
  hctx.putImageData(hid,0,0);

  sctx.drawImage(hatchLayer, 0, 0);
}
