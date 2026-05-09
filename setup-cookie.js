#!/usr/bin/env node
// ============================================================
// SunoBridge — Cookie & JWT Setup Assistant
//
// Interactive CLI to extract Suno cookie from browser DevTools.
// Supports proxy configuration for users behind firewalls.
//
// Usage: node setup-cookie.js
// ============================================================

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('\n🔧 SunoBridge — Cookie & JWT Token 配置助手\n');
console.log('请按照以下步骤操作：\n');
console.log('  ⚠️  重要：必须访问 https://suno.com/create 才能获取完整 cookie');
console.log('  ⚠️  只访问 suno.com 首页不会触发 API 请求，拿不到认证信息\n');
console.log('  1. 打开浏览器访问: https://suno.com/create');
console.log('  2. 登录你的账号');
console.log('  3. 按 F12 打开开发者工具');
console.log('  4. 切换到 Network 标签');
console.log('  5. 在页面上点击输入框（触发 API 请求）');
console.log('  6. 在 Network 里找到任意一个 studio-api.prod.suno.com 的请求');
console.log('  7. 点击请求 → Headers → Request Headers\n');

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('─'.repeat(56) + '\n');

  // Step 1: Get JWT Token
  const token = await question(
    '请粘贴 Authorization header 的值（Bearer 后面的部分）:\n> '
  );

  if (!token || token.trim().length < 100) {
    console.log('\n❌ Token 太短。请确保复制了 Bearer 后面的完整 JWT token');
    console.log('   格式类似: eyJhbGciOi... (200+ 字符)');
    process.exit(1);
  }

  console.log(
    '\n✅ JWT Token 已接收 (前50字符):',
    token.trim().substring(0, 50) + '...\n'
  );

  // Step 2: Get full Cookie
  const cookies = await question(
    '请粘贴整个 Cookie header 的值:\n> '
  );

  if (!cookies || !cookies.includes('__client')) {
    console.log('\n❌ Cookie 必须包含 __client 字段');
    console.log('   格式类似: __client=xxx; __client_Jnxw=xxx; ajs_anonymous_id=xxx; ...');
    console.log('   请确保你访问的是 https://suno.com/create 而不是首页');
    process.exit(1);
  }

  console.log('\n✅ Cookies 已接收\n');

  // Step 3: Build combined cookie with JWT as __session
  const cookieParts = cookies.split(';').map((c) => c.trim());
  const filtered = cookieParts.filter((c) => !c.startsWith('__session='));
  filtered.unshift(`__session=${token.trim()}`);
  const finalCookie = filtered.join('; ');

  // Step 4: Optional proxy configuration
  console.log('可选：如果你使用代理（如 Clash Verge），可以配置 HTTP_PROXY\n');
  const proxy = await question(
    'HTTP 代理地址（留空跳过，示例: http://127.0.0.1:7897）:\n> '
  );
  const proxyLine = proxy.trim()
    ? `\n# HTTP Proxy (for users behind firewall/VPN)\nHTTP_PROXY=${proxy.trim()}\nHTTPS_PROXY=${proxy.trim()}`
    : '';

  // Step 5: Write to .env
  const envPath = path.join(__dirname, '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf-8');
  }

  const cookieRegex = /^SUNO_COOKIE=.*$/m;
  if (cookieRegex.test(envContent)) {
    envContent = envContent.replace(cookieRegex, `SUNO_COOKIE=${finalCookie}`);
  } else {
    envContent = `SUNO_COOKIE=${finalCookie}${proxyLine}\n` + envContent;
  }

  fs.writeFileSync(envPath, envContent, 'utf-8');

  console.log('\n✅ 完成！SUNO_COOKIE 已写入 ' + envPath);
  if (proxy.trim()) {
    console.log('✅ 代理已配置: ' + proxy.trim());
  }
  console.log('\n⚠️  重要提醒:');
  console.log('   - Cookie 有效期 1-3 天，过期后重新运行此脚本刷新');
  console.log('   - 不要将 .env 提交到 git（已在 .gitignore 中排除）');
  console.log('   - 不要分享你的 cookie 给任何人');
  console.log('   - 遇到验证码用 Bridge Mode (Chrome Extension) 或注册 captcha handler\n');
  console.log('🚀 启动方式:');
  console.log('   MCP stdio:  bun run mcp:stdio');
  console.log('   MCP HTTP:   bun run mcp:http');
  console.log('   Next.js:    bun dev');
  console.log('   Bridge:     bun run bridge\n');

  rl.close();
}

main().catch((error) => {
  console.error('\n❌ 错误:', error.message);
  rl.close();
  process.exit(1);
});
