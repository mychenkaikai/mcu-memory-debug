import * as vscode from 'vscode';
import { GDBInterface } from './debugger/gdbInterface';
import { MemoryTreeProvider, registerMemoryCommands } from './views/memoryTreeProvider';
import { MemoryManager } from './models/memoryManager';
let outputChannel: vscode.OutputChannel;
let memoryTreeProvider: MemoryTreeProvider | undefined;

export async function activate(context: vscode.ExtensionContext) {
	// 创建输出通道
	outputChannel = vscode.window.createOutputChannel('MCU Memory Debug');
	outputChannel.show(true);
	
	outputChannel.appendLine('MCU Memory Debug 插件开始激活');

	try {
		const gdbInterface = new GDBInterface(outputChannel);
		const memoryManager = new MemoryManager(gdbInterface, outputChannel);
		
		// 创建树视图提供者
		const treeProvider = new MemoryTreeProvider(memoryManager);
		
		// 注册树视图
		const treeView = vscode.window.createTreeView('memoryExplorer', {
				treeDataProvider: treeProvider,
				showCollapseAll: true
		});

		// 注册所有命令
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
						// 搜索所有 .elf 文件
						const elfFiles = await vscode.workspace.findFiles('**/*.elf');
						
						if (elfFiles.length > 0) {
							// 如果找到多个 .elf 文件，让用户选择
							if (elfFiles.length > 1) {
								const items = elfFiles.map(file => ({
									label: vscode.workspace.asRelativePath(file),
									description: file.fsPath,
									file: file
								}));
								
								const selected = await vscode.window.showQuickPick(items, {
									placeHolder: '请选择要加载的 ELF 文件'
								});
								
								if (selected) {
									await memoryManager.loadElfFile(selected.file.fsPath);
								}
							} else {
								// 只有一个文件时直接加载
								await memoryManager.loadElfFile(elfFiles[0].fsPath);
							}
						} else {
							outputChannel.appendLine('未找到 ELF 文件');
							vscode.window.showWarningMessage('未在工作区中找到 ELF 文件');
						}
					}

					// 添加定期读取堆信息的功能
					const heapInfoInterval = setInterval(async () => {
						if (vscode.debug.activeDebugSession) {
							await memoryManager.readHeapInfo();
						} else {
							clearInterval(heapInfoInterval);
						}
					}, 1000); // 每秒更新一次
					
					// 确保在调试会话结束时清理定时器
					context.subscriptions.push(
						vscode.debug.onDidTerminateDebugSession(() => {
							clearInterval(heapInfoInterval);
						})
					);
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
