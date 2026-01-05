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

let cvReady = false;
let hasImage = false;

// layer stencil
const stencilCanvas = document.createElement("canvas");
const hatchCanvas = document.createElement("canvas");

// mostra errori JS nello status (su iPad è comodissimo)
window.onerror = (msg, url, line, col) => {
  statusEl.textContent = `Errore JS: ${msg} (riga ${line})`;
};

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

// Attendo OpenCV
const wait = setInterval(() => {
  if (typeof cv !== "undefined" && cv.Mat) {
    clearInterval(wait);
    cvReady = true;
    setStatus("OpenCV pronto ✅ Carica una foto.");
    if (hasImage) btnGenerate.disabled = false;
  }
}, 100);

fileInput.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  hasImage = false;
  btnGenerate.disabled = true;
  btnExportJpg.disabled = true;
  viewMode.disabled = true;

  setStatus("Carico immagine…");

  // ✅ dimensione aggressiva per velocità su iPad
  const maxSide = 900;

  // 1) tentativo: createImageBitmap
  try {
    const bmp = await createImageBitmap(f);
    drawBitmapToCanvases(bmp, maxSide);
    bmp.close?.();
    onImageReady();
    return;
  } catch (err1) {
    // 2) fallback: Image() + objectURL (super compatibile)
    try {
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        drawImageToCanvases(img, maxSide);
        URL.revokeObjectURL(url);
        onImageReady();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setStatus("Errore: non riesco a leggere questa immagine.");
      };
      img.src = url;
      return;
    } catch (err2) {
      setStatus("Errore caricamento immagine: " + (err2?.message || err1?.message));
      return;
    }
  }
});

function drawBitmapToCanvases(bmp, maxSide){
  let w = bmp.width, h = bmp.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  srcCanvas.width = w; srcCanvas.height = h;
  outCanvas.width = w; outCanvas.height = h;
  stencilCanvas.width = w; stencilCanvas.height = h;
  hatchCanvas.width = w; hatchCanvas.height = h;

  srcCtx.setTransform(1,0,0,1,0,0);
  srcCtx.clearRect(0,0,w,h);
  srcCtx.drawImage(bmp, 0, 0, w, h);

  viewMode.value = "original";
  drawView();
}

function drawImageToCanvases(img, maxSide){
  let w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  w = Math.max(1, Math.round(w * scale));
  h = Math.max(1, Math.round(h * scale));

  srcCanvas.width = w; srcCanvas.height = h;
  outCanvas.width = w; outCanvas.height = h;
  stencilCanvas.width = w; stencilCanvas.height = h;
  hatchCanvas.width = w; hatchCanvas.height = h;

  srcCtx.setTransform(1,0,0,1,0,0);
  srcCtx.clearRect(0,0,w,h);
  srcCtx.drawImage(img, 0, 0, w, h);

  viewMode.value = "original";
  drawView();
}

function onImageReady(){
  hasImage = true;
  btnExportJpg.disabled = false;
  viewMode.disabled = false;
  setStatus(cvReady ? "Immagine ok ✅ Premi Genera." : "Immagine ok ✅ Attendo OpenCV…");
  btnGenerate.disabled = !cvReady;
}

btnGenerate.addEventListener("click", () => {
  if (!hasImage) return alert("Carica prima una foto.");
  if (!cvReady) return alert("OpenCV non è pronto.");
  generateStencilFast();
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

function generateStencilFast(){
  setStatus("Genero stencil…");

  const w = srcCanvas.width, h = srcCanvas.height;

  const src = cv.imread(srcCanvas);

  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const k = parseInt(blur.value, 10);
  if (k > 0) cv.GaussianBlur(gray, gray, new cv.Size(k, k), 0);

  const edges = new cv.Mat();
  const t1 = parseInt(edge.value, 10);
  const t2 = Math.min(255, t1 * 2);
  cv.Canny(gray, edges, t1, t2);

  // invert: sfondo bianco, linee nere
  const inv = new cv.Mat();
  cv.bitwise_not(edges, inv);

  const rgba = new cv.Mat();
  cv.cvtColor(inv, rgba, cv.COLOR_GRAY2RGBA);

  stencilCanvas.width = w; stencilCanvas.height = h;
  cv.imshow(stencilCanvas, rgba);

  // tratteggio 1 direzione
  const intensity = parseInt(shade.value, 10) / 100;
  if (intensity > 0) {
    const spacing = parseInt(hatch.value, 10);
    hatchCanvas.width = w; hatchCanvas.height = h;
    const hctx = hatchCanvas.getContext("2d");
    hctx.setTransform(1,0,0,1,0,0);
    hctx.clearRect(0,0,w,h);
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

    const sctx = stencilCanvas.getContext("2d");
    sctx.drawImage(hatchCanvas, 0, 0);
  }

  src.delete(); gray.delete(); edges.delete(); inv.delete(); rgba.delete();
  setStatus("Stencil pronto ✅");
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
    outCtx.globalAlpha = parseInt(alpha.value,10)/100;
    outCtx.drawImage(stencilCanvas, 0, 0);
    outCtx.globalAlpha = 1;
  }
}
