const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
    console.log('开始构建...');
    
    try {
        const ctx = await esbuild.context({
            entryPoints: ['src/extension.ts'],
            bundle: true,
            external: ['vscode'],
            format: 'cjs',
            platform: 'node',
            outfile: 'dist/extension.js',
            sourcemap: !production,
            minify: production,
            logLevel: 'info'
        });

        console.log('构建上下文创建成功');

        if (watch) {
            console.log('启动监视模式...');
            await ctx.watch();
            console.log('监视模式已启动');
        } else {
            console.log('开始单次构建...');
            await ctx.rebuild();
            await ctx.dispose();
            console.log('构建完成');
        }
    } catch (err) {
        console.error('构建失败:', err);
        process.exit(1);
    }
}

console.log('esbuild 脚本启动');
main().catch((err) => {
    console.error('致命错误:', err);
    process.exit(1);
});
