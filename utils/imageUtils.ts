
/**
 * High-Precision Cognitive Image Preprocessing.
 * Cleans luminance, whiteness backgrounds, and sharpens character edges.
 */
export const preprocessCanvas = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  // 1. Luminance Normalization
  let min = 255, max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (avg < min) min = avg;
    if (avg > max) max = avg;
  }

  const range = max - min || 1;
  for (let i = 0; i < data.length; i += 4) {
    let gray = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]);
    gray = ((gray - min) / range) * 255;
    
    // Adaptive Background Whitening
    if (gray > 185) gray = 255; 
    if (gray < 70) gray = 0;

    data[i] = data[i+1] = data[i+2] = gray;
  }
  ctx.putImageData(imageData, 0, 0);

  // 2. Sharpness Convolution Pass (Laplacian Hybrid)
  const kernel = [
     0, -1,  0,
    -1,  5, -1,
     0, -1,  0
  ];
  applyConvolution(canvas, kernel);
};

export const applyConvolution = (canvas: HTMLCanvasElement, kernel: number[]) => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const side = Math.round(Math.sqrt(kernel.length));
  const halfSide = Math.floor(side / 2);
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const sw = src.width, sh = src.height;
  const output = ctx.createImageData(sw, sh);
  const dst = output.data, srcData = src.data;

  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const dstOff = (y * sw + x) * 4;
      let r = 0, g = 0, b = 0;
      for (let cy = 0; cy < side; cy++) {
        for (let cx = 0; cx < side; cx++) {
          const scy = y + cy - halfSide, scx = x + cx - halfSide;
          if (scy >= 0 && scy < sh && scx >= 0 && scx < sw) {
            const srcOff = (scy * sw + scx) * 4;
            const wt = kernel[cy * side + cx];
            r += srcData[srcOff] * wt;
            g += srcData[srcOff + 1] * wt;
            b += srcData[srcOff + 2] * wt;
          }
        }
      }
      dst[dstOff] = Math.min(255, Math.max(0, r));
      dst[dstOff+1] = Math.min(255, Math.max(0, g));
      dst[dstOff+2] = Math.min(255, Math.max(0, b));
      dst[dstOff+3] = 255;
    }
  }
  ctx.putImageData(output, 0, 0);
};
