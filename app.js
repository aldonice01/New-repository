setStatus("APP.JS v10 caricato ✅ Carica una foto.");
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

setStatus("APP.JS v10 caricato ✅ Carica una foto.");

window.onerror = (msg, url, line) => {
  setStatus(`Errore JS: ${msg} (riga ${line || "?"})`);
};

fileInput.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  setStatus("Carico immagine…");
  hasImage = false;

  // ✅ Metodo più compatibile su iPad: Image() + objectURL
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

    // mostra SUBITO l'originale
    viewMode.disabled = false;
    viewMode.value = "original";
    btnGenerate.disabled = false;
    btnExportJpg.disabled = false;

    hasImage = true;
    drawView();
    setStatus("Immagine caricata ✅ Premi Genera.");

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
  setStatus("Genero stencil…");
  setTimeout(() => {
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
  } else {
    outCtx.drawImage(srcCanvas, 0, 0);
    outCtx.globalAlpha = parseInt(alpha.value,10)/100;
    outCtx.drawImage(stencilCanvas, 0, 0);
    outCtx.globalAlpha = 1;
  }
}

// --- Stencil veloce: threshold semplice (per test) ---
// Appena confermi che funziona TUTTO, lo trasformiamo in "linee vere" (Sobel) + tratteggio.
function generateStencilJS(){
  const w = srcCanvas.width, h = srcCanvas.height;
  const src = srcCtx.getImageData(0,0,w,h);
  const data = src.data;

  const out = stencilCtx.createImageData(w,h);
  const d = out.data;

  const thr = parseInt(edge.value,10); // usiamo lo slider come soglia per adesso

  for (let i=0; i<data.length; i+=4){
    const g = (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114) | 0;
    const v = (g > thr) ? 255 : 0;
    d[i] = v; d[i+1] = v; d[i+2] = v; d[i+3] = 255;
  }

  // invert: sfondo bianco, segni neri
  for (let i=0; i<d.length; i+=4){
    d[i] = 255 - d[i];
    d[i+1] = 255 - d[i+1];
    d[i+2] = 255 - d[i+2];
  }

  stencilCtx.putImageData(out, 0, 0);
}
