// APP v14 — FIX: abilita Genera + diagnostica ID
const $ = (id) => document.getElementById(id);

function must(id){
  const el = $(id);
  if (!el) throw new Error(`Elemento mancante: #${id}`);
  return el;
}

const statusEl = must("status");
function setStatus(t){ statusEl.textContent = t; }

window.onerror = (msg, url, line) => setStatus(`Errore JS: ${msg} (riga ${line || "?"})`);

let fileInput, btnGenerate, btnExportJpg, viewMode, modeSel;
let srcCanvas, srcCtx, outCanvas, outCtx;
let hasImage = false;

const stencilCanvas = document.createElement("canvas");
const stencilCtx = stencilCanvas.getContext("2d");

function init(){
  try{
    fileInput = must("file");
    btnGenerate = must("btnGenerate");
    btnExportJpg = must("btnExportJpg");
    viewMode = must("viewMode");
    modeSel = must("mode");

    srcCanvas = must("src");
    outCanvas = must("canvas");

    srcCtx = srcCanvas.getContext("2d");
    outCtx = outCanvas.getContext("2d");

    // sliders (se mancasse uno, lo segnalo ma non blocco l'app)
    const sliderIds = ["edge","blur","clean","thick","shade","hatch","alpha"];
    sliderIds.forEach(id => {
      if (!$(id)) setStatus(`Attenzione: manca slider #${id} (ok ma controlla index.html)`);
    });

    btnGenerate.disabled = true;
    btnExportJpg.disabled = true;
    viewMode.disabled = true;

    setStatus("APP v14 caricato ✅ Carica una foto.");

    fileInput.addEventListener("change", onPickFile);
    btnGenerate.addEventListener("click", onGenerate);
    btnExportJpg.addEventListener("click", onExport);
    viewMode.addEventListener("change", drawView);
    const a = $("alpha"); if (a) a.addEventListener("input", drawView);

  }catch(e){
    setStatus("ERRORE setup: " + e.message);
  }
}

async function onPickFile(e){
  const f = e.target.files?.[0];
  if (!f) return;

  setStatus("Carico immagine…");
  hasImage = false;

  // Metodo più compatibile su iPad
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

    // 🔥 QUI abilitiamo SEMPRE
    hasImage = true;
    btnGenerate.disabled = false;
    btnExportJpg.disabled = false;
    viewMode.disabled = false;

    viewMode.value = "original";
    drawView();

    setStatus("Immagine caricata ✅ Ora puoi premere Genera.");
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("Errore: immagine non leggibile.");
  };
  img.src = url;
}

function onGenerate(){
  if (!hasImage) return alert("Carica prima una foto.");
  setStatus("Genero stencil…");

  // Per ora: genera una preview lineare semplice (poi rimettiamo l’engine completo)
  generateSimpleLines();

  viewMode.value = "stencil";
  drawView();
  setStatus("Stencil pronto ✅");
}

function onExport(){
  if (!hasImage) return alert("Carica una foto.");
  const link = document.createElement("a");
  link.download = "export.jpg";
  link.href = outCanvas.toDataURL("image/jpeg", 0.95);
  link.click();
}

function drawView(){
  if (!hasImage) return;

  const mode = viewMode.value;
  outCtx.setTransform(1,0,0,1,0,0);
  outCtx.clearRect(0,0,outCanvas.width,outCanvas.height);

  if (mode === "original") {
    outCtx.drawImage(srcCanvas, 0, 0);
  } else if (mode === "stencil") {
    outCtx.drawImage(stencilCanvas, 0, 0);
  } else {
    outCtx.drawImage(srcCanvas, 0, 0);
    const a = $("alpha");
    const av = a ? (parseInt(a.value,10)/100) : 0.35;
    outCtx.globalAlpha = av;
    outCtx.drawImage(stencilCanvas, 0, 0);
    outCtx.globalAlpha = 1;
  }
}

// ---- GENERATORE SEMPLICE SOLO LINEE (test) ----
// Quando confermi che Genera è cliccabile e funziona,
// ti reinserisco l’engine v13 completo (edge+clean+thick+hatch).
function generateSimpleLines(){
  const w = srcCanvas.width, h = srcCanvas.height;
  const src = srcCtx.getImageData(0,0,w,h).data;

  const out = stencilCtx.createImageData(w,h);
  const d = out.data;

  // soglia fissa (giusto per vedere che genera qualcosa)
  for (let i=0; i<src.length; i+=4){
    const g = (src[i]*0.299 + src[i+1]*0.587 + src[i+2]*0.114) | 0;
    // evidenzia contorni grossolani: differenza tra pixel vicini (veloce)
    // (non è ancora “inkroom”, è solo per test click+output)
    const v = (g < 140) ? 0 : 255;
    d[i]=255; d[i+1]=255; d[i+2]=255; d[i+3]=255;
    if (v === 0){
      d[i]=0; d[i+1]=0; d[i+2]=0;
    }
  }
  stencilCtx.putImageData(out, 0, 0);
}

document.addEventListener("DOMContentLoaded", init);
