import * as vscode from 'vscode';
import { MemoryTreeProvider, registerMemoryCommands } from './views/memoryTreeProvider';
import { MemoryManager } from './models/memoryManager';
import { GDBInterface } from './debugger/gdbInterface';

let outputChannel: vscode.OutputChannel;
let memoryTreeProvider: MemoryTreeProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
	// 创建输出通道
	outputChannel = vscode.window.createOutputChannel('MCU Memory Debug');
	outputChannel.show(true);  // true 表示不要切换到输出面板
	
	outputChannel.appendLine('MCU Memory Debug 插件开始激活');

	try {
		const gdbInterface = new GDBInterface(outputChannel);
		const memoryManager = new MemoryManager(gdbInterface, outputChannel);
		
		memoryTreeProvider = new MemoryTreeProvider(memoryManager);

		// 创建树视图提供者
		const treeProvider = new MemoryTreeProvider(memoryManager);
		
		// 注册树视图
		const treeView = vscode.window.createTreeView('memoryExplorer', {
			treeDataProvider: treeProvider,
			showCollapseAll: true
		});

		// 注册命令
		registerMemoryCommands(context, treeProvider, memoryManager);

		// 将树视图添加到订阅列表
		context.subscriptions.push(treeView);

		// 将输出通道添加到订阅列表中
		context.subscriptions.push(outputChannel);

		// 监听调试会话启动
		context.subscriptions.push(
			vscode.debug.onDidStartDebugSession(async session => {
				if (session.type === 'cortex-debug') {
					// 获取当前工作区
					const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
					if (workspaceFolder) {
						// 查找 .elf 文件
						const elfFiles = await vscode.workspace.findFiles('**/*.elf', '**/build/**');
						if (elfFiles.length > 0) {
							await memoryManager.loadElfFile(elfFiles[0].fsPath);
						}
					}
				}
			})
		);

		outputChannel.appendLine('MCU Memory Debug 插件激活成功');
	} catch (error) {
		outputChannel.appendLine(`插件激活失败: ${error}`);
		vscode.window.showErrorMessage('MCU Memory Debug 插件激活失败: ' + error);
		throw error;
	}
}

export function deactivate() {
	outputChannel.appendLine('MCU Memory Debug 插件准备停用');
	try {
		// 清理资源
		memoryTreeProvider = undefined;
		outputChannel.appendLine('MCU Memory Debug 插件已清理完毕');
	} catch (error) {
		outputChannel.appendLine(`插件停用时出错: ${error}`);
	}
}
