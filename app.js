const $ = (id) => document.getElementById(id);

const file = $("file");
const btnProcess = $("btnProcess");
const btnExport = $("btnExport");
const statusEl = $("status");

const srcCanvas = $("src");
const outCanvas = $("out");
const srcCtx = srcCanvas.getContext("2d");
const outCtx = outCanvas.getContext("2d");

const edge = $("edge"), blur = $("blur"), thick = $("thick"), shade = $("shade"), hatch = $("hatch"), ink = $("ink");
const vEdge = $("vEdge"), vBlur = $("vBlur"), vThick = $("vThick"), vShade = $("vShade"), vHatch = $("vHatch"), vInk = $("vInk");

let img = new Image();
let cvReady = false;

function syncLabels() {
  vEdge.textContent = edge.value;
  vBlur.textContent = blur.value;
  vThick.textContent = thick.value;
  vShade.textContent = shade.value;
  vHatch.textContent = hatch.value;
  vInk.textContent = ink.value;
}
[edge, blur, thick, shade, hatch, ink].forEach(r => r.addEventListener("input", () => {
  syncLabels();
  if (img.src && cvReady) process();
}));
syncLabels();

// Attendi OpenCV
const waitCV = setInterval(() => {
  if (typeof cv !== "undefined" && cv.Mat) {
    clearInterval(waitCV);
    cvReady = true;
    statusEl.textContent = "OpenCV pronto ✅ Carica una foto.";
    if (img.src) btnProcess.disabled = false;
  }
}, 50);

file.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  const url = URL.createObjectURL(f);
  img = new Image();
  img.onload = () => {
    const maxSide = 1800;
    let w = img.naturalWidth, h = img.naturalHeight;
    const scale = Math.min(1, maxSide / Math.max(w, h));
    w = Math.round(w * scale); h = Math.round(h * scale);

    srcCanvas.width = w; srcCanvas.height = h;
    outCanvas.width = w; outCanvas.height = h;

    srcCtx.clearRect(0,0,w,h);
    srcCtx.drawImage(img, 0, 0, w, h);

    btnExport.disabled = false;
    btnProcess.disabled = !cvReady;

    statusEl.textContent = cvReady ? "Pronto. Regola gli slider e premi Genera." : "Caricato. Attendo OpenCV…";
    if (cvReady) process();
  };
  img.src = url;
});

btnProcess.addEventListener("click", process);

btnExport.addEventListener("click", () => {
  const a = document.createElement("a");
  a.download = "stencil.png";
  a.href = outCanvas.toDataURL("image/png");
  a.click();
});

function process() {
  if (!cvReady || !img.src) return;

  const w = srcCanvas.width, h = srcCanvas.height;

  // Leggi immagine dal canvas
  const srcMat = cv.imread(srcCanvas);

  // Gray
  const gray = new cv.Mat();
  cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

  // Blur (pulizia)
  const k = parseInt(blur.value, 10);
  if (k > 0) {
    const ksize = new cv.Size(k, k);
    cv.GaussianBlur(gray, gray, ksize, 0, 0, cv.BORDER_DEFAULT);
  }

  // Canny edges (linee)
  const edges = new cv.Mat();
  const t1 = parseInt(edge.value, 10);
  const t2 = Math.min(255, t1 * 2);
  cv.Canny(gray, edges, t1, t2);

  // Spessore linee
  const t = parseInt(thick.value, 10);
  if (t > 1) {
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(t, t));
    cv.dilate(edges, edges, kernel);
    kernel.delete();
  }

  // Pulisci output
  outCtx.setTransform(1,0,0,1,0,0);
  outCtx.clearRect(0,0,w,h);
  outCtx.fillStyle = "#fff";
  outCtx.fillRect(0,0,w,h);

  // Disegna edges come linee nere (con opacità "ink")
  const tmp = document.createElement("canvas");
  tmp.width = w; tmp.height = h;

  const edgeRGBA = new cv.Mat();
  cv.cvtColor(edges, edgeRGBA, cv.COLOR_GRAY2RGBA);
  cv.imshow(tmp, edgeRGBA);

  const tctx = tmp.getContext("2d");
  const id = tctx.getImageData(0,0,w,h);
  const d = id.data;

  const inkAlpha = Math.round(255 * (parseInt(ink.value, 10) / 100));
  for (let i=0;i<d.length;i+=4) {
    const v = d[i]; // 0..255, linee bianche su nero
    d[i] = 0; d[i+1] = 0; d[i+2] = 0;
    d[i+3] = Math.round((v/255) * inkAlpha); // trasforma in alpha
  }
  tctx.putImageData(id,0,0);
  outCtx.drawImage(tmp,0,0);

  // Tratteggi ombre
  drawHatching(gray, w, h);

  // cleanup
  srcMat.delete(); gray.delete(); edges.delete(); edgeRGBA.delete();

  statusEl.textContent = "Stencil generato ✅ (puoi esportare PNG)";
}

function drawHatching(grayMat, w, h) {
  const intensity = parseInt(shade.value, 10) / 100;
  if (intensity <= 0) return;

  const spacing = parseInt(hatch.value, 10);
  const gray = new Uint8Array(grayMat.data);

  const hatchCanvas = document.createElement("canvas");
  hatchCanvas.width = w; hatchCanvas.height = h;
  const hctx = hatchCanvas.getContext("2d");
  hctx.clearRect(0,0,w,h);

  // disegna linee oblique base
  hctx.strokeStyle = "rgba(0,0,0,1)";
  hctx.lineWidth = 1;

  for (let y = -w; y < h + w; y += spacing) {
    hctx.beginPath();
    hctx.moveTo(0, y);
    hctx.lineTo(w, y + w);
    hctx.stroke();
  }

  // maschera alpha in base allo scuro (più scuro = più tratteggi visibili)
  const hid = hctx.getImageData(0,0,w,h);
  const hd = hid.data;

  for (let i=0, p=0; i<hd.length; i+=4, p++) {
    if (hd[i+3] === 0) continue;

    const g = gray[p];
    const dark = (255 - g) / 255; // 0..1
    const a = Math.max(0, (dark - 0.15) / 0.85);
    hd[i] = 0; hd[i+1] = 0; hd[i+2] = 0;
    hd[i+3] = Math.round(255 * a * intensity);
  }
  hctx.putImageData(hid, 0, 0);

  outCtx.drawImage(hatchCanvas, 0, 0);
}
