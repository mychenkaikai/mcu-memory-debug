import * as vscode from 'vscode';
import { MemoryItem } from '../models/memoryManager';

interface MemorySegment {
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

    public show(items: MemoryItem[]) {
        if (this.panel) {
            this.panel.reveal();
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'memoryMap',
                'Memory Layout',
                vscode.ViewColumn.Two,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }

        // 按地址排序并分段
        const sortedItems = items
            .filter(item => item.type === 'variable')
            .sort((a, b) => a.address - b.address);

        // 将内存分段
        const segments: MemorySegment[] = this.segmentMemory(sortedItems);
        this.panel.webview.html = this.getWebviewContent(segments);

        // 处理 webview 消息
        this.panel.webview.onDidReceiveMessage(async message => {
            if (message.command === 'showValue' && message.address) {
                const item = sortedItems.find(i => i.address === message.address);
                if (item) {
                    vscode.commands.executeCommand('memoryExplorer.readRegister', item, this.outputChannel);
                }
            }
        });
    }

    private segmentMemory(items: MemoryItem[]): MemorySegment[] {
        const segments: MemorySegment[] = [];
        const segmentRanges = [
            { start: 0x00000000, end: 0x0000FFFF, name: 'Flash Memory' },
            { start: 0x20000000, end: 0x2000FFFF, name: 'SRAM' }
        ];

        for (const range of segmentRanges) {
            const segmentItems: MemoryItem[] = [];
            const rangeItems = items.filter(
                item => item.address >= range.start && item.address <= range.end
            ).sort((a, b) => a.address - b.address);

            if (rangeItems.length > 0) {
                // 添加间隔块
                for (let i = 0; i < rangeItems.length; i++) {
                    if (i === 0 && rangeItems[i].address > range.start) {
                        // 添加起始间隔
                        segmentItems.push({
                            id: `gap_${range.start}`,
                            name: 'None',
                            address: range.start,
                            size: rangeItems[i].address - range.start,
                            type: 'gap'
                        });
                    }

                    segmentItems.push(rangeItems[i]);

                    if (i < rangeItems.length - 1) {
                        const gapStart = rangeItems[i].address + rangeItems[i].size;
                        const gapEnd = rangeItems[i + 1].address;
                        if (gapEnd > gapStart) {
                            segmentItems.push({
                                id: `gap_${gapStart}`,
                                name: 'None',
                                address: gapStart,
                                size: gapEnd - gapStart,
                                type: 'gap'
                            });
                        }
                    }
                }

                segments.push({
                    name: range.name,
                    items: segmentItems,
                    minAddress: range.start,
                    maxAddress: range.end
                });
            }
        }

        return segments;
    }

    private getWebviewContent(segments: MemorySegment[]): string {
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
                </style>
            </head>
            <body>
                <div id="controls">
                    <button onclick="zoomIn()">放大间距</button>
                    <button onclick="zoomOut()">缩小间距</button>
                    <span id="scale">间距: 30px</span>
                </div>
                <div id="container">
                    ${segments.map((segment, index) => `
                        <div class="segment">
                            <div class="segment-title">${segment.name} (0x${segment.minAddress.toString(16).toUpperCase()} - 0x${segment.maxAddress.toString(16).toUpperCase()})</div>
                            <div id="memoryMap${index}" class="memory-map"></div>
                        </div>
                    `).join('')}
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    const segments = ${JSON.stringify(segments)};
                    let blockHeight = 30;

                    function updateMemoryMap() {
                        segments.forEach((segment, segmentIndex) => {
                            const memoryMap = document.getElementById('memoryMap' + segmentIndex);
                            memoryMap.innerHTML = '';
                            
                            segment.items.forEach((item, index) => {
                                const block = document.createElement('div');
                                block.className = 'memory-block' + (item.type === 'gap' ? ' gap' : '');
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
                                
                                memoryMap.appendChild(block);
                            });
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