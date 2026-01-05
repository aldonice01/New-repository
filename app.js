const fileInput = document.getElementById("file");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const edge = document.getElementById("edge");
const blur = document.getElementById("blur");
const shade = document.getElementById("shade");
const alpha = document.getElementById("alpha");
const viewMode = document.getElementById("viewMode");
const exportJpg = document.getElementById("exportJpg");

let originalImg = new Image();
let stencilCanvas = document.createElement("canvas");
let stencilCtx = stencilCanvas.getContext("2d");
let cvReady = false;

const waitCV = setInterval(() => {
  if (typeof cv !== "undefined") {
    clearInterval(waitCV);
    cvReady = true;
  }
}, 50);

fileInput.addEventListener("change", e => {
  const f = e.target.files[0];
  if (!f) return;

  originalImg.onload = () => {
    canvas.width = originalImg.width;
    canvas.height = originalImg.height;
    stencilCanvas.width = originalImg.width;
    stencilCanvas.height = originalImg.height;
    generateStencil();
  };

  originalImg.src = URL.createObjectURL(f);
});

[edge, blur, shade, alpha, viewMode].forEach(el =>
  el.addEventListener("input", () => {
    if (originalImg.src) drawView();
  })
);

function generateStencil() {
  if (!cvReady) return;

  const src = cv.imread(originalImg);
  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  if (blur.value > 0) {
    const k = blur.value | 0;
    cv.GaussianBlur(gray, gray, new cv.Size(k, k), 0);
  }

  const edges = new cv.Mat();
  cv.Canny(gray, edges, edge.value, edge.value * 2);

  stencilCtx.fillStyle = "white";
  stencilCtx.fillRect(0,0,stencilCanvas.width, stencilCanvas.height);

  const imgData = stencilCtx.getImageData(0,0,stencilCanvas.width, stencilCanvas.height);
  for (let i = 0; i < imgData.data.length; i += 4) {
    if (edges.data[i/4] > 0) {
      imgData.data[i] = 0;
      imgData.data[i+1] = 0;
      imgData.data[i+2] = 0;
      imgData.data[i+3] = 255;
    }
  }
  stencilCtx.putImageData(imgData,0,0);

  src.delete(); gray.delete(); edges.delete();
  drawView();
}

function drawView() {
  ctx.clearRect(0,0,canvas.width,canvas.height);

  if (viewMode.value === "original") {
    ctx.drawImage(originalImg,0,0);
  }

  if (viewMode.value === "stencil") {
    ctx.drawImage(stencilCanvas,0,0);
  }

  if (viewMode.value === "overlay") {
    ctx.drawImage(originalImg,0,0);
    ctx.globalAlpha = alpha.value / 100;
    ctx.drawImage(stencilCanvas,0,0);
    ctx.globalAlpha = 1;
  }
}

exportJpg.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "stencil.jpg";
  link.href = canvas.toDataURL("image/jpeg", 1.0);
  link.click();
});
