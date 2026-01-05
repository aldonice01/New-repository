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

let img = new Image();
let cvReady = false;

// canvas stencil interno
const stencilCanvas = document.createElement("canvas");
const stencilCtx = stencilCanvas.getContext("2d");

function syncLabels(){
  vEdge.textContent = edge.value;
  vBlur.textContent = blur.value;
  vShade.textContent = shade.value;
  vHatch.textContent = hatch.value;
  vAlpha.textContent = alpha.value;
}
[edge, blur, shade, hatch, alpha].forEach(el => el.addEventListener("input", syncLabels));
syncLabels();

// attendo OpenCV
const wait = setInterval(() => {
  if (typeof cv !== "undefined" && cv.Mat) {
    clearInterval(wait);
    cvReady = true;
    statusEl.textContent = "OpenCV pronto ✅ Carica una foto.";
    // abilito generate solo quando c'è anche una foto
    if (img.src) btnGenerate.disabled = false;
  }
}, 50);

fileInput.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  statusEl.textContent = "Caricamento foto…";
  img = new Image();
  img.onload = () => {
    // ridimensiono per velocità su iPad
    const maxSide = 1800;
    let w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    w = Math.round(w * scale);
    h = Math.round(h * scale);

    srcCanvas.width = w; srcCanvas.height = h;
    outCanvas.width = w; outCanvas.height = h;
    stencilCanvas.width = w; stencilCanvas.height = h;

    srcCtx.clearRect(0,0,w,h);
    srcCtx.drawImage(img, 0, 0, w, h);

    btnExportJpg.disabled = false;
    viewMode.disabled = false;

    if (cvReady) {
      btnGenerate.disabled = false;
      statusEl.textContent = "Pronto ✅ Premi Genera.";
    } else {
      statusEl.textContent = "Foto ok. Attendo OpenCV…";
    }

    // default vista
    viewMode.value = "stencil";
    drawView(); // mostra qualcosa (anche se vuoto) subito
  };
  img.src = URL.createObjectURL(f);
});

btnGenerate.addEventListener("click", () => {
  if (!cvReady) return alert("OpenCV non è ancora pronto. Riprova tra pochi secondi.");
  if (!img.src) return alert("Carica prima una foto.");
  generateStencil();
  drawView();
});

viewMode.addEventListener("change", drawView);
alpha.addEventListener("input", drawView);

btnExportJpg.addEventListener("click", () => {
  if (!img.src) return alert("Carica una foto.");
  // esporta quello che stai vedendo (original/stencil/overlay)
  const link = document.createElement("a");
  link.download = "stencil.jpg";
  link.href = outCanvas.toDataURL("image/jpeg", 0.95);
  link.click();
});

function generateStencil(){
  statusEl.textContent = "Genero stencil…";

  // Leggo SEMPRE dal canvas (compatibile iPad)
  const src = cv.imread(srcCanvas);

  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  const k = parseInt(blur.value, 10);
  if (k > 0) {
    cv.GaussianBlur(gray, gray, new cv.Size(k, k), 0);
  }

  // edges
  const edges = new cv.Mat();
  const t1 = parseInt(edge.value, 10);
  const t2 = Math.min(255, t1 * 2);
  cv.Canny(gray, edges, t1, t2);

  // stencil base: bianco
  stencilCtx.setTransform(1,0,0,1,0,0);
  stencilCtx.clearRect(0,0,stencilCanvas.width, stencilCanvas.height);
  stencilCtx.fillStyle = "#fff";
  stencilCtx.fillRect(0,0,stencilCanvas.width, stencilCanvas.height);

  // Disegno linee nere dagli edges
  // (edges: 255 dove c'è bordo)
  const w = stencilCanvas.width, h = stencilCanvas.height;
  const imgData = stencilCtx.getImageData(0,0,w,h);
  const d = imgData.data;

  for (let i=0, p=0; i<d.length; i+=4, p++){
    if (edges.data[p] > 0) {
      d[i]=0; d[i+1]=0; d[i+2]=0; d[i+3]=255;
    }
  }
  stencilCtx.putImageData(imgData, 0, 0);

  // Tratteggio semplice (1 direzione) in base allo scuro
  const intensity = parseInt(shade.value, 10) / 100;
  if (intensity > 0) {
    const spacing = parseInt(hatch.value, 10);

    // disegno tratteggi su layer
    const hatchLayer = document.createElement("canvas");
    hatchLayer.width = w; hatchLayer.height = h;
    const hctx = hatchLayer.getContext("2d");
    hctx.clearRect(0,0,w,h);
    hctx.strokeStyle = "rgba(0,0,0,1)";
    hctx.lineWidth = 1;

    for (let y = -w; y < h + w; y += spacing) {
      hctx.beginPath();
      hctx.moveTo(0, y);
      hctx.lineTo(w, y + w);
      hctx.stroke();
    }

    // maschera alpha per scuro (dal gray)
    const hid = hctx.getImageData(0,0,w,h);
    const hd = hid.data;
    const gdata = gray.data; // 0..255

    for (let i=0, p=0; i<hd.length; i+=4, p++){
      if (hd[i+3] === 0) continue;
      const dark = (255 - gdata[p]) / 255; // 0..1
      const a = Math.max(0, (dark - 0.15) / 0.85);
      hd[i]=0; hd[i+1]=0; hd[i+2]=0;
      hd[i+3]=Math.round(255 * a * intensity);
    }
    hctx.putImageData(hid,0,0);

    // sopra lo stencil
    stencilCtx.drawImage(hatchLayer, 0, 0);
  }

  src.delete(); gray.delete(); edges.delete();

  statusEl.textContent = "Stencil pronto ✅";
}

function drawView(){
  if (!img.src) {
    outCtx.clearRect(0,0,outCanvas.width,outCanvas.height);
    return;
  }
  const mode = viewMode.value;

  outCtx.setTransform(1,0,0,1,0,0);
  outCtx.clearRect(0,0,outCanvas.width,outCanvas.height);

  if (mode === "original") {
    outCtx.drawImage(srcCanvas, 0, 0);
  } else if (mode === "stencil") {
    outCtx.drawImage(stencilCanvas, 0, 0);
  } else { // overlay
    outCtx.drawImage(srcCanvas, 0, 0);
    outCtx.globalAlpha = parseInt(alpha.value, 10) / 100;
    outCtx.drawImage(stencilCanvas, 0, 0);
    outCtx.globalAlpha = 1;
  }
}
