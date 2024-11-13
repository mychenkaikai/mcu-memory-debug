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
            element.children?.length 
                ? vscode.TreeItemCollapsibleState.Expanded 
                : vscode.TreeItemCollapsibleState.None
        );

        // 设置图标
        switch (element.type) {
            case 'region':
                treeItem.iconPath = new vscode.ThemeIcon('symbol-module');
                treeItem.contextValue = 'memory_region';
                break;
            case 'variable':
                treeItem.iconPath = new vscode.ThemeIcon('symbol-variable');
                break;
            case 'heap_block':
                treeItem.iconPath = new vscode.ThemeIcon('symbol-field');
                break;
        }

        // 设置描述
        if (element.type !== 'region') {
            const addressStr = this.memoryManager.formatAddress(element.address);
            const sizeStr = this.memoryManager.formatSize(element.size);
            treeItem.description = `${addressStr} | ${sizeStr}`;
            treeItem.contextValue = element.type;
            
            if (element.type === 'variable' || element.type === 'heap_block') {
                treeItem.command = {
                    command: 'memoryExplorer.readRegister',
                    title: '读取值',
                    arguments: [element, this.outputChannel]
                };
            }
        } else if (element.type === 'region' && element.address !== undefined && element.size !== undefined) {
            // 为区域添加地址范围描述
            const startAddr = this.memoryManager.formatAddress(element.address);
            const endAddr = this.memoryManager.formatAddress(element.address + element.size - 1);
            treeItem.description = `${startAddr} - ${endAddr}`;
        }

        return treeItem;
    }

    getChildren(element?: MemoryItem): Thenable<MemoryItem[]> {
        if (!element) {
            return Promise.resolve(this.memoryManager.getMemoryRegions());
        }
        return Promise.resolve(element.children || []);
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
    // 注册原有命令
    context.subscriptions.push(
        vscode.commands.registerCommand('memoryExplorer.refresh', () => {
            treeProvider.refresh();
        })
    );

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

    // 添加新的堆内存布局命令
    context.subscriptions.push(
        vscode.commands.registerCommand('memoryExplorer.showHeapLayout', (item: MemoryItem) => {
            const memoryMapView = MemoryMapView.getInstance();
            memoryMapView.show(item);
        })
    );
} 