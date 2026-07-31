const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const isWatch = process.argv.includes('--watch');

const entryPoints = {
  'background': 'src/background/index.js',
  'content': 'src/content/index.js',
  'sidepanel': 'src/sidepanel/index.js',
  'page-bridge': 'src/page/page-bridge.js',
};

async function build() {
  const config = {
    entryPoints,
    bundle: true,
    outdir: 'dist',
    target: 'chrome100',
    format: 'iife',
    minify: true,
    sourcemap: false,
    loader: { '.css': 'text' },
  };

  if (isWatch) {
    const ctx = await esbuild.context(config);
    await ctx.watch();
    console.log('Watching...');
  } else {
    await esbuild.build(config);
    console.log('Build complete');

    // Copy static files to dist
    fs.copyFileSync('manifest.json', 'dist/manifest.json');
    fs.copyFileSync('src/sidepanel/index.html', 'dist/sidepanel.html');
    fs.cpSync('public/icons', 'dist/icons', { recursive: true });
    console.log('Static files copied');
  }
}

build().catch(() => process.exit(1));
