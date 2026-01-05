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

let cvReady = false;
let hasImage = false;

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

// Se OpenCV non carica, almeno lo sapremo
const wait = setInterval(() => {
  try {
    if (typeof cv !== "undefined" && cv.Mat) {
      clearInterval(wait);
      cvReady = true;
      statusEl.textContent = "OpenCV pronto ✅ Premi Genera per lo stencil.";
      if (hasImage) btnGenerate.disabled = false;
    }
  } catch (e) {
    statusEl.textContent = "Errore OpenCV: " + e.message;
  }
}, 100);

fileInput.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  statusEl.textContent = "File selezionato… preparo immagine.";
  hasImage = false;

  // Disegno originale in modo affidabile su iPad (createImageBitmap)
  try {
    const bmp = await createImageBitmap(f);

    const maxSide = 1800;
    let w = bmp.width, h = bmp.height;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    srcCanvas.width = w; srcCanvas.height = h;
    outCanvas.width = w; outCanvas.height = h;
    stencilCanvas.width = w; stencilCanvas.height = h;

    srcCtx.clearRect(0,0,w,h);
    srcCtx.drawImage(bmp, 0, 0, w, h);

    // mostra subito l'originale (così vedi che funziona)
    viewMode.disabled = false;
    btnExportJpg.disabled = false;
    viewMode.value = "original";
    drawView();

    hasImage = true;

    if (cvReady) {
      btnGenerate.disabled = false;
      statusEl.textContent = "Immagine ok ✅ Premi Genera per creare lo stencil.";
    } else {
      statusEl.textContent = "Immagine ok ✅ Attendo OpenCV… (poi premi Genera)";
    }
  } catch (err) {
    statusEl.textContent = "Errore nel caricamento immagine: " + err.message;
  }
});

btnGenerate.addEventListener("click", () => {
  if (!hasImage) return alert("Carica prima una foto.");
  if (!cvReady) return alert("OpenCV non è pronto. Se resta così, c’è un problema di caricamento.");
  generateStencil();
  viewMode.value = "stencil";
  drawView();
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

function generateStencil(){
  statusEl.textContent = "Genero stencil…";

  const src = cv.imread(srcCanvas);

  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const k = parseInt(blur.value, 10);
  if (k > 0) cv.GaussianBlur(gray, gray, new cv.Size(k, k), 0);

  const edges = new cv.Mat();
  const t1 = parseInt(edge.value, 10);
  const t2 = Math.min(255, t1 * 2);
  cv.Canny(gray, edges, t1, t2);

  // fondo bianco
  stencilCtx.setTransform(1,0,0,1,0,0);
  stencilCtx.clearRect(0,0,stencilCanvas.width, stencilCanvas.height);
  stencilCtx.fillStyle = "#fff";
  stencilCtx.fillRect(0,0,stencilCanvas.width, stencilCanvas.height);

  // linee nere
  const w = stencilCanvas.width, h = stencilCanvas.height;
  const imgData = stencilCtx.getImageData(0,0,w,h);
  const d = imgData.data;

  for (let i=0, p=0; i<d.length; i+=4, p++){
    if (edges.data[p] > 0) {
      d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=255;
    }
  }
  stencilCtx.putImageData(imgData,0,0);

  // tratteggio (1 direzione)
  const intensity = parseInt(shade.value, 10) / 100;
  if (intensity > 0) {
    const spacing = parseInt(hatch.value, 10);

    const hatchLayer = document.createElement("canvas");
    hatchLayer.width = w; hatchLayer.height = h;
    const hctx = hatchLayer.getContext("2d");
    hctx.strokeStyle = "rgba(0,0,0,1)";
    hctx.lineWidth = 1;

    for (let y = -w; y < h + w; y += spacing) {
      hctx.beginPath();
      hctx.moveTo(0, y);
      hctx.lineTo(w, y + w);
      hctx.stroke();
    }

    const hid = hctx.getImageData(0,0,w,h);
    const hd = hid.data;
    const gdata = gray.data;

    for (let i=0, p=0; i<hd.length; i+=4, p++){
      if (hd[i+3] === 0) continue;
      const dark = (255 - gdata[p]) / 255;
      const a = Math.max(0, (dark - 0.15) / 0.85);
      hd[i]=0; hd[i+1]=0; hd[i+2]=0;
      hd[i+3]=Math.round(255 * a * intensity);
    }
    hctx.putImageData(hid,0,0);
    stencilCtx.drawImage(hatchLayer,0,0);
  }

  src.delete(); gray.delete(); edges.delete();
  statusEl.textContent = "Stencil pronto ✅";
}

function drawView(){
  if (!hasImage) return;

  outCtx.setTransform(1,0,0,1,0,0);
  outCtx.clearRect(0,0,outCanvas.width,outCanvas.height);

  const mode = viewMode.value;

  if (mode === "original") {
    outCtx.drawImage(srcCanvas,0,0);
  } else if (mode === "stencil") {
    outCtx.drawImage(stencilCanvas,0,0);
  } else {
    outCtx.drawImage(srcCanvas,0,0);
    outCtx.globalAlpha = parseInt(alpha.value,10)/100;
    outCtx.drawImage(stencilCanvas,0,0);
    outCtx.globalAlpha = 1;
  }
}
