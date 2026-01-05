function process() {
  const file = document.getElementById("file").files[0];
  if (!file) return alert("Carica un'immagine");

  const img = new Image();
  img.onload = () => {
    const canvas = document.getElementById("out");
    const ctx = canvas.getContext("2d");

    canvas.width = img.width;
    canvas.height = img.height;
    ctx.drawImage(img, 0, 0);

    const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
    const d = imgData.data;

    for (let i=0;i<d.length;i+=4) {
      const g = (d[i]+d[i+1]+d[i+2])/3;
      const v = g > 120 ? 255 : 0;
      d[i]=d[i+1]=d[i+2]=v;
    }

    ctx.putImageData(imgData,0,0);
  };

  img.src = URL.createObjectURL(file);
}
