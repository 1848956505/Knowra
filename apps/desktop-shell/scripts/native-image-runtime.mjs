import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

/** 原生解码器只从当前平台的 npm lock 安装结果复制；禁止跨架构冒充成功。 */
export function stageNativeImageRuntime({ repo, staging, platform = process.platform, arch = process.arch }) {
  if (platform !== process.platform || arch !== process.arch) throw new Error('图片原生依赖必须在目标平台和架构构建。');
  const copied = new Set();
  function locate(name, parent) {
    for (const base of createRequire(path.join(parent, 'package.json')).resolve.paths(name) ?? []) {
      const candidate = path.join(base, name);
      if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    }
    return null;
  }
  function copy(name, parent, optional = false) {
    const source = locate(name, parent);
    if (!source) { if (optional) return; throw new Error(`缺少图片生产依赖：${name}`); }
    const manifest = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    if (manifest.os && !manifest.os.includes(platform) || manifest.cpu && !manifest.cpu.includes(arch)) {
      if (optional) return;
      throw new Error(`图片依赖平台不匹配：${name}`);
    }
    if (copied.has(name)) return;
    copied.add(name);
    fs.cpSync(source, path.join(staging, 'node_modules', name), { recursive: true, dereference: true });
    for (const dependency of Object.keys(manifest.dependencies ?? {})) copy(dependency, source);
    for (const dependency of Object.keys(manifest.optionalDependencies ?? {})) copy(dependency, source, true);
  }
  copy('sharp', repo);
  const nativeName = `@img/sharp-${platform}-${arch}`;
  if (platform === 'darwin' && !copied.has(nativeName)) throw new Error('缺少目标 Mac 图片原生模块。');
  return [...copied].sort();
}

export async function verifyNativeImageRuntime(staging) {
  const modules = path.join(path.resolve(staging), 'node_modules');
  const checked = new Set();
  function assertLocalPackage(name) {
    if (checked.has(name)) return;
    checked.add(name);
    const directory = path.join(modules, name);
    const manifestPath = path.join(directory, 'package.json');
    if (!fs.existsSync(manifestPath)) throw new Error(`缺少打包图片依赖：${name}`);
    if (!fs.realpathSync(directory).startsWith(fs.realpathSync(modules) + path.sep)) {
      throw new Error(`图片依赖不能引用打包目录之外：${name}`);
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    for (const dependency of Object.keys(manifest.dependencies ?? {})) assertLocalPackage(dependency);
  }
  // 即使产物在仓库内，缺包也不能向上回退到开发 node_modules 而假通过。
  assertLocalPackage('sharp');
  const libc = process.platform === 'linux' && !process.report.getReport().header.glibcVersionRuntime ? 'musl' : '';
  const target = `${process.platform}${libc}-${process.arch}`;
  assertLocalPackage(`@img/sharp-${target}`);
  if (process.platform !== 'win32') assertLocalPackage(`@img/sharp-libvips-${target}`);
  const sharp = createRequire(path.join(modules, 'sharp', 'package.json'))(path.join(modules, 'sharp'));

  for (const format of ['png', 'jpeg', 'webp']) {
    const bytes = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#4682b4' } })[format]().toBuffer();
    const { info } = await sharp(bytes, { limitInputPixels: 16000000, failOn: 'warning' }).raw().toBuffer({ resolveWithObject: true });
    if (info.width !== 3 || info.height !== 2) throw new Error(`打包图片解码失败：${format}`);
  }
  return { platform: process.platform, arch: process.arch, sharp: sharp.versions.sharp };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await verifyNativeImageRuntime(process.argv[2] ?? process.cwd())));
}
