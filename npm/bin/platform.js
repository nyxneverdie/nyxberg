const supported = new Set(['linux-x64','linux-arm64','darwin-x64','darwin-arm64','win32-x64']);
function packageName(platform, arch) { const target = `${platform}-${arch}`; return supported.has(target) ? `@nyxberg/cli-${target}` : null; }
module.exports = { packageName };
