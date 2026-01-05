setStatus("APP.JS v11 caricato ✅ Carica una foto.");
const $ = (id) => document.getElementById(id);

const fileInput = $("file");
const btnGenerate = $("btnGenerate");
const btnExportJpg = $("btnExportJpg");
const viewMode = $("viewMode");
const statusEl = $("status");

const srcCanvas = $("src");
const srcCtx = srcCanvas.getContext("2d");
const outCanvas = $("canvas");
const outCtx = outCanvas.getContext("2d");

const edge = $("edge"), blur = $("blur"), shade = $("shade"), hatch = $("hatch"), alpha = $("alpha");
const vEdge = $("vEdge"), vBlur = $("vBlur"), vShade = $("vShade"), vHatch = $("vHatch"), vAlpha = $("vAlpha");

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

setStatus("APP.JS v11 caricato ✅ Carica una foto.");

window.onerror = (msg, url, line) => {
  setStatus(`Errore JS: ${msg} (riga ${line || "?"})`);
};

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
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));

    srcCanvas.width = w; srcCanvas.height = h;
    outCanvas.width = w; outCanvas.height = h;
    stencilCanvas.width = w; stencilCanvas.height = h;

    srcCtx.setTransform(1,0,0,1,0,0);
    srcCtx.clearRect(0,0,w,h);
    srcCtx.drawImage(img, 0, 0, w, h);

    viewMode.disabled = false;
    viewMode.value = "original";
    btnGenerate.disabled = false;
    btnExportJpg.disabled = false;

    hasImage = true;
    drawView();
    setStatus("Immagine caricata ✅ Premi Genera (solo linee).");

    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("Errore: immagine non leggibile.");
  };
  img.src = url;
});

btnGenerate.addEventListener("click", () => {
  if (!hasImage) return alert("Carica prima una foto.");
  setStatus("Genero stencil linee…");
  setTimeout(() => {
    generateLineStencil();
    viewMode.value = "stencil";
    drawView();
    setStatus("Stencil a linee pronto ✅");
  }, 10);
});

viewMode.addEventListener("change", drawView);
alpha.addEventListener("input", drawView);

btnExportJpg.addEventListener("click", () => {
  if (!hasImage) return alert("Carica una foto.");
  const link = document.createElement("a");
  link.download = "stencil-linee.jpg";
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
  } else {
    outCtx.drawImage(srcCanvas, 0, 0);
    outCtx.globalAlpha = parseInt(alpha.value,10)/100;
    outCtx.drawImage(stencilCanvas, 0, 0);
    outCtx.globalAlpha = 1;
  }
}

// ---- SOLO LINEE: grayscale -> (optional blur) -> Sobel -> threshold -> draw ----
function generateLineStencil(){
  const w = srcCanvas.width, h = srcCanvas.height;
  const src = srcCtx.getImageData(0,0,w,h);
  const data = src.data;

  // grayscale
  let g = new Uint8ClampedArray(w*h);
  for (let i=0, p=0; i<data.length; i+=4, p++){
    g[p] = (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114) | 0;
  }

  // blur (box blur separabile) — slider blur: 0,3,5,7,9
  const k = parseInt(blur.value, 10);
  const radius = k === 0 ? 0 : Math.min(4, Math.floor(k/2));
  if (radius) g = boxBlurGray(g, w, h, radius);

  // sobel threshold
  const thr = parseInt(edge.value, 10); // 20..200
  const edges = new Uint8ClampedArray(w*h);
  sobelEdges(g, w, h, thr, edges);

  // render: white background + black edges
  const out = stencilCtx.createImageData(w,h);
  const d = out.data;
  for (let p=0, i=0; p<edges.length; p++, i+=4){
    const isEdge = edges[p] === 1;
    d[i]   = isEdge ? 0 : 255;
    d[i+1] = isEdge ? 0 : 255;
    d[i+2] = isEdge ? 0 : 255;
    d[i+3] = 255;
  }
  stencilCtx.putImageData(out, 0, 0);
}

function sobelEdges(g, w, h, thr, out){
  // thr è “sensibilità”: più basso = più linee, più alto = meno linee
  // scala: mag approx (|gx|+|gy|) può arrivare alto, quindi normalizziamo col *6
  const T = thr * 6;

  // azzera bordi
  out.fill(0);

  for (let y=1; y<h-1; y++){
    const yw = y*w;
    for (let x=1; x<w-1; x++){
      const p = yw + x;

      const a = g[p-w-1], b=g[p-w], c=g[p-w+1];
      const d = g[p-1],           f=g[p+1];
      const g1= g[p+w-1], h1=g[p+w], i1=g[p+w+1];

      const gx = (-a + c) + (-2*d + 2*f) + (-g1 + i1);
      const gy = ( a + 2*b + c) + (-g1 - 2*h1 - i1);

      const mag = Math.abs(gx) + Math.abs(gy);
      out[p] = (mag > T) ? 1 : 0;
    }
  }
}

function boxBlurGray(g, w, h, r){
  const tmp = new Uint8ClampedArray(w*h);
  const out = new Uint8ClampedArray(w*h);
  const size = r*2 + 1;

  // horizontal
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

  // vertical
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
