import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// 单文件构建:dist/index.html 自包含,可拷到任何机器双击使用(数据不出浏览器)
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: { chunkSizeWarningLimit: 4096 },
});
