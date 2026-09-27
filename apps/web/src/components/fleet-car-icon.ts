/** Top-down autonomous minivan symbol. State color appears on the roof and outline. */
export function fleetCarIcon(color: string): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable");

  context.shadowColor = "#1b2b3899";
  context.shadowBlur = 7;
  context.shadowOffsetY = 3;
  context.fillStyle = "#f8fafb";
  context.strokeStyle = color;
  context.lineWidth = 5;
  context.beginPath();
  context.roundRect(12, 5, 40, 86, 13);
  context.fill();
  context.stroke();
  context.shadowColor = "transparent";

  context.fillStyle = "#253949";
  context.beginPath();
  context.roundRect(17, 22, 30, 16, 5);
  context.fill();
  context.beginPath();
  context.roundRect(17, 62, 30, 13, 4);
  context.fill();

  context.fillStyle = color;
  context.beginPath();
  context.roundRect(19, 42, 26, 15, 5);
  context.fill();
  context.fillStyle = "#f8fafb";
  context.beginPath();
  context.arc(32, 49.5, 5, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#253949";
  context.beginPath();
  context.arc(32, 49.5, 2.5, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#e4eaf0";
  context.fillRect(19, 9, 10, 3);
  context.fillRect(35, 9, 10, 3);
  context.fillStyle = "#da5965";
  context.fillRect(19, 86, 10, 3);
  context.fillRect(35, 86, 10, 3);
  return context.getImageData(0, 0, 64, 96);
}
