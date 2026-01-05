// APP v9 TEST
const statusEl = document.getElementById("status");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

statusEl.textContent = "APP.JS v9 caricato ✅ (se vedi questo, il file è quello giusto)";

document.getElementById("file").addEventListener("change", () => {
  statusEl.textContent = "File scelto ✅";
});

document.getElementById("btnGenerate").addEventListener("click", () => {
  statusEl.textContent = "Genera premuto ✅ Disegno test…";
  canvas.width = 800; 
  canvas.height = 500;
  ctx.fillStyle = "white";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle = "black";
  ctx.lineWidth = 6;
  ctx.strokeRect(40,40,720,420);
  ctx.font = "40px Arial";
  ctx.fillStyle = "black";
  ctx.fillText("APP.JS v9 OK", 220, 260);
});
