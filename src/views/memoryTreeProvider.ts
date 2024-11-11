import * as vscode from 'vscode';
import { MemoryManager, MemoryItem } from '../models/memoryManager';
import { MemoryMapView } from './memoryMapView';

export class MemoryTreeProvider implements vscode.TreeDataProvider<MemoryItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<MemoryItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    private readonly outputChannel: vscode.OutputChannel;

    constructor(private memoryManager: MemoryManager) {
        this.outputChannel = vscode.window.createOutputChannel('MCU Memory Debug');
        // 监听内存变化事件
        this.memoryManager.onDidChangeMemory(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: MemoryItem): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            element.name,
            element.children?.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );

        // 设置图标
        switch (element.type) {
            case 'region':
                treeItem.iconPath = new vscode.ThemeIcon('symbol-module');
                break;
            case 'peripheral':
                treeItem.iconPath = new vscode.ThemeIcon('circuit-board');
                break;
            case 'variable':
                treeItem.iconPath = new vscode.ThemeIcon('symbol-variable');
                break;
        }

        // 设置描述
        const addressStr = this.memoryManager.formatAddress(element.address);
        const sizeStr = this.memoryManager.formatSize(element.size);
        const accessStr = `${element.readable ? 'R' : '-'}${element.writable ? 'W' : '-'}`;
        
        if (element.type === 'variable') {
            treeItem.description = addressStr;
            treeItem.contextValue = 'register';
            treeItem.command = {
                command: 'memoryExplorer.readRegister',
                title: '读取变量值',
                arguments: [element, this.outputChannel]
            };
        } else {
            treeItem.description = `${addressStr} | ${sizeStr} | ${accessStr}`;
            treeItem.contextValue = element.type;
        }

        return treeItem;
    }

    getChildren(element?: MemoryItem): Thenable<MemoryItem[]> {
        if (element) {
            return Promise.resolve(element.children || []);
        } else {
            return Promise.resolve(this.memoryManager.getItems());
        }
    }

    // 获取父节点
    getParent(element: MemoryItem): vscode.ProviderResult<MemoryItem> {
        // 如果需要实现向上导航，可以在这里添加逻辑
        return null;
    }
}

// 注册命令
export function registerMemoryCommands(
    context: vscode.ExtensionContext,
    treeProvider: MemoryTreeProvider,
    memoryManager: MemoryManager
) {
    // 刷新命令
    context.subscriptions.push(
        vscode.commands.registerCommand('memoryExplorer.refresh', () => {
            memoryManager.updateMemoryInfo();
        })
    );

    // 读取寄存器值命令
    context.subscriptions.push(
        vscode.commands.registerCommand('memoryExplorer.readRegister', async (item: MemoryItem, outputChannel: vscode.OutputChannel) => {
            const value = await memoryManager.getItemValue(item);
            outputChannel.appendLine(`\n变量: ${item.name}`);
            outputChannel.appendLine(`地址: ${memoryManager.formatAddress(item.address)}`);
            outputChannel.appendLine(`大小: ${memoryManager.formatSize(item.size)}`);
            outputChannel.appendLine(`值: ${value || '无法读取'}`);
            
            // 读取并显示内存内容
            const content = await memoryManager.viewMemoryContent(item.address, item.size);
            if (content) {
                outputChannel.appendLine('\n内存内容:');
                outputChannel.appendLine(content);
            }
            
            outputChannel.show(true);
        })
    );

    // 查看内存内容命令
    context.subscriptions.push(
        vscode.commands.registerCommand('memoryExplorer.viewMemory', async (item: MemoryItem) => {
            try {
                // 创建新的输出通道来显示内存内容
                const channel = vscode.window.createOutputChannel(`Memory: ${item.name}`);
                channel.show(true);
                channel.appendLine(`=== ${item.name} (${item.description}) ===`);
                channel.appendLine(`基地址: ${memoryManager.formatAddress(item.address)}`);
                channel.appendLine(`大小: ${memoryManager.formatSize(item.size)}`);
                channel.appendLine(`权限: ${item.readable ? 'R' : '-'}${item.writable ? 'W' : '-'}`);
                channel.appendLine('');

                // 分批读取内存内容
                const batchSize = 64; // 每次读取 64 字节
                const totalSize = Math.min(256, item.size); // 最多读取 256 字节
                
                for (let offset = 0; offset < totalSize; offset += batchSize) {
                    const size = Math.min(batchSize, totalSize - offset);
                    const content = await memoryManager.viewMemoryContent(item.address + offset, size);
                    if (content) {
                        channel.appendLine(content);
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`查看内存内容失败: ${error}`);
            }
        })
    );

    // 显示内存布局命令
    context.subscriptions.push(
        vscode.commands.registerCommand('memoryExplorer.showMemoryMap', () => {
            const memoryMapView = new MemoryMapView(context);
            memoryMapView.show(memoryManager.getItems());
        })
    );
} 