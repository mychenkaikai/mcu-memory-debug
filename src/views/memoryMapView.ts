import * as vscode from 'vscode';
import { MemoryItem } from '../models/memoryManager';

export interface MemorySegment {
    name: string;
    items: MemoryItem[];
    minAddress: number;
    maxAddress: number;
}

export class MemoryMapView {
    private panel: vscode.WebviewPanel | undefined;
    private readonly outputChannel: vscode.OutputChannel;

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('Memory Map View');
    }

    public show(region: MemoryItem) {
        if (this.panel) {
            this.panel.reveal();
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'memoryMap',
                `Memory Layout - ${region.name}`,
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // 添加面板关闭事件处理
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }

        // 确保有正确的地址范围
        if (region.address === undefined || region.size === undefined) {
            vscode.window.showErrorMessage('无效的内存区域信息');
            return;
        }

        const items = region.children || [];
        const sortedItems = items
            .filter(item => item.type === 'variable' || item.type === 'heap_block')
            .sort((a, b) => a.address - b.address);

        // 添加间隔块
        const completeItems: MemoryItem[] = [];
        
        // 添加起始间隔（如果需要）
        if (sortedItems.length > 0 && sortedItems[0].address > region.address) {
            completeItems.push({
                id: `gap_start_${region.address}`,
                name: 'Unused',
                address: region.address,
                size: sortedItems[0].address - region.address,
                type: 'gap'
            });
        }

        // 添加项目间的间隔
        for (let i = 0; i < sortedItems.length; i++) {
            completeItems.push(sortedItems[i]);
            
            if (i < sortedItems.length - 1) {
                const currentEnd = sortedItems[i].address + sortedItems[i].size;
                const nextStart = sortedItems[i + 1].address;
                
                if (nextStart > currentEnd) {
                    completeItems.push({
                        id: `gap_${currentEnd}`,
                        name: 'Unused',
                        address: currentEnd,
                        size: nextStart - currentEnd,
                        type: 'gap'
                    });
                }
            }
        }

        // 添加结束间隔（如果需要）
        if (sortedItems.length > 0) {
            const lastItem = sortedItems[sortedItems.length - 1];
            const lastEnd = lastItem.address + lastItem.size;
            const regionEnd = region.address + region.size - 1;
            
            if (regionEnd > lastEnd) {
                completeItems.push({
                    id: `gap_end_${lastEnd}`,
                    name: 'Unused',
                    address: lastEnd,
                    size: regionEnd - lastEnd + 1,
                    type: 'gap'
                });
            }
        }

        this.panel.webview.html = this.getWebviewContent({
            name: region.name,
            items: completeItems,
            minAddress: region.address,
            maxAddress: region.address + region.size - 1
        });

        // 调试输出
        this.outputChannel.appendLine(`显示内存区域: ${region.name}`);
        this.outputChannel.appendLine(`地址范围: 0x${region.address.toString(16)} - 0x${(region.address + region.size - 1).toString(16)}`);
        this.outputChannel.appendLine(`包含 ${completeItems.length} 个项目（包括间隔）`);
    }

    private getWebviewContent(segments: MemorySegment): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        padding: 10px;
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                    }
                    #container {
                        display: flex;
                        gap: 20px;
                        padding: 10px;
                    }
                    .segment {
                        flex: 1;
                        min-width: 200px;
                    }
                    .segment-title {
                        font-weight: bold;
                        margin-bottom: 10px;
                        color: var(--vscode-editor-foreground);
                    }
                    .memory-map {
                        position: relative;
                        width: 100%;
                        height: 600px;
                        background: var(--vscode-editor-background);
                        border: 1px solid var(--vscode-panel-border);
                        overflow-y: auto;
                    }
                    .memory-block {
                        position: absolute;
                        width: 100%;
                        height: 30px;
                        background: var(--vscode-button-background);
                        border: 1px solid var(--vscode-button-border);
                        cursor: pointer;
                        transition: all 0.3s;
                        padding: 5px;
                        box-sizing: border-box;
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                    }
                    .memory-block:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .block-name {
                        flex: 1;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }
                    .block-address {
                        font-size: 0.8em;
                        color: var(--vscode-descriptionForeground);
                        margin-left: 8px;
                    }
                    #controls {
                        margin-bottom: 10px;
                    }
                    button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 5px 10px;
                        cursor: pointer;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .block-info {
                        font-size: 1em;
                        color: var(--vscode-descriptionForeground);
                        margin-left: 8px;
                        display: flex;
                        flex-direction: column;
                        align-items: flex-end;
                    }
                    .block-address, .block-size {
                        margin: 2px 0;
                    }
                    .memory-block.gap {
                        background: var(--vscode-disabledForeground);
                        opacity: 0.5;
                        cursor: default;
                    }
                    .memory-block.gap:hover {
                        background: var(--vscode-disabledForeground);
                    }
                    .memory-block.heap_block {
                        background: #FFA500;
                        border: 1px solid #FF8C00;
                    }
                    .memory-block.heap_block:hover {
                        background: #FF8C00;
                    }
                    .memory-block.variable {
                        background: var(--vscode-button-background);
                        border: 1px solid var(--vscode-button-border);
                    }
                </style>
            </head>
            <body>
                <div id="controls">
                    <button onclick="zoomIn()">放大间距</button>
                    <button onclick="zoomOut()">缩小间距</button>
                    <span id="scale">间距: 30px</span>
                </div>
                <div id="container">
                    <div class="segment">
                        <div class="segment-title">${segments.name} (0x${segments.minAddress.toString(16).toUpperCase()} - 0x${segments.maxAddress.toString(16).toUpperCase()})</div>
                        <div id="memoryMap" class="memory-map"></div>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const segments = ${JSON.stringify(segments)};
                    let blockHeight = 30;

                    function updateMemoryMap() {
                        segments.items.forEach((item, index) => {
                            const block = document.createElement('div');
                            block.className = 'memory-block' + 
                                (item.type === 'gap' ? ' gap' : 
                                 item.type === 'heap_block' ? ' heap_block' : 
                                 item.type === 'variable' ? ' variable' : '');
                            block.style.top = (index * (blockHeight + 2)) + 'px';
                            block.style.height = blockHeight + 'px';
                            
                            const nameSpan = document.createElement('span');
                            nameSpan.className = 'block-name';
                            nameSpan.textContent = item.name;
                            
                            const infoDiv = document.createElement('div');
                            infoDiv.className = 'block-info';
                            
                            const addressRange = document.createElement('span');
                            addressRange.className = 'block-address';
                            addressRange.textContent = '0x' + item.address.toString(16).toUpperCase() + 
                                                         ' - 0x' + (item.address + item.size - 1).toString(16).toUpperCase();
                            
                            const sizeSpan = document.createElement('span');
                            sizeSpan.className = 'block-size';
                            sizeSpan.textContent = item.size + ' bytes';
                            
                            infoDiv.appendChild(addressRange);
                            infoDiv.appendChild(sizeSpan);
                            
                            block.appendChild(nameSpan);
                            block.appendChild(infoDiv);
                            
                            if (item.type !== 'gap') {
                                block.onclick = () => {
                                    vscode.postMessage({
                                        command: 'showValue',
                                        address: item.address
                                    });
                                };
                            }
                            
                            document.getElementById('memoryMap').appendChild(block);
                        });
                    }

                    function zoomIn() {
                        blockHeight += 5;
                        document.getElementById('scale').textContent = \`间距: \${blockHeight}px\`;
                        updateMemoryMap();
                    }

                    function zoomOut() {
                        if (blockHeight > 20) {
                            blockHeight -= 5;
                            document.getElementById('scale').textContent = \`间距: \${blockHeight}px\`;
                            updateMemoryMap();
                        }
                    }

                    updateMemoryMap();
                </script>
            </body>
            </html>
        `;
    }
} 