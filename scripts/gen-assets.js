const fs = require("fs");
const path = require("path");

// Minimal 48x48 green PNG (base64)
const pngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAASklEQVR4nO3NQQ0AMAgAsYF/07ADGz4JFnCH3J0RkZmZiZmZmZiZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZmZ2asDH90DBr4BFtgAAAAASUVORK5CYII=";

const assetsDir = path.resolve(__dirname, "..", "assets");

fs.mkdirSync(assetsDir, { recursive: true });

const png = Buffer.from(pngBase64, "base64");

fs.writeFileSync(path.join(assetsDir, "icon.png"), png);
fs.writeFileSync(path.join(assetsDir, "adaptive-icon.png"), png);
fs.writeFileSync(path.join(assetsDir, "splash.png"), png);
fs.writeFileSync(path.join(assetsDir, "favicon.png"), png);

console.log("Assets generated.");
