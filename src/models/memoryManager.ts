import * as vscode from 'vscode';
import { GDBInterface } from '../debugger/gdbInterface';
import { ElfParser, ElfSymbol } from '../debugger/elfParser';

export interface MemoryItem {
    id: string;
    name: string;
    address: number;
    size: number;
    type: 'region' | 'peripheral' | 'variable' | 'heap_block' | 'gap';
    description?: string;
    readable?: boolean;
    writable?: boolean;
    children?: MemoryItem[];
    color?: string;
}

interface HeapBlock {
    ptr: number;
    size: number;
    name: string;
}

interface HeapInfoConfig {
    address: number;
    size: number;
}

export class MemoryManager {
    private memoryItems: Map<string, MemoryItem> = new Map();
    private eventEmitter = new vscode.EventEmitter<void>();
    private elfParser: ElfParser;
    private outputChannel: vscode.OutputChannel;
    private heapInfo: HeapInfoConfig = {
        address: 0,
        size: 0
    };

    constructor(private gdbInterface: GDBInterface, outputChannel: vscode.OutputChannel) {
        this.elfParser = new ElfParser(outputChannel);
        this.outputChannel = outputChannel;
    }

    public onDidChangeMemory = this.eventEmitter.event;

    async updateMemoryInfo() {
        try {
            // 获取当前工作区
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (workspaceFolder) {
                // 查找 .elf 文件
                const elfFiles = await vscode.workspace.findFiles('**/*.elf', '**/build/**');
                if (elfFiles.length > 0) {
                    await this.loadElfFile(elfFiles[0].fsPath);
                }
            }
            
            // 通知视图更新
            this.eventEmitter.fire();
        } catch (error) {
            console.error('更新内存信息失败:', error);
        }
    }

    private createPeripheralRegisters(baseAddress: number): MemoryItem[] {
        const registers: MemoryItem[] = [];
        const registerNames = {
            0x00: 'CR1',
            0x04: 'CR2',
            0x08: 'SR',
            0x0C: 'DR',
            0x10: 'BRR'
        };

        for (const [offset, name] of Object.entries(registerNames)) {
            const address = baseAddress + parseInt(offset);
            registers.push({
                id: `reg_${address.toString(16)}`,
                name: name,
                address: address,
                size: 4,
                type: 'variable',
                description: `${name} Register at offset ${offset}`
            });
        }

        return registers;
    }

    async readRegisterValue(address: number): Promise<string | undefined> {
        try {
            const data = await this.gdbInterface.readMemory(address, 4);
            if (data) {
                const value = data.readUInt32LE(0);
                return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`;
            }
            return undefined;
        } catch (error) {
            console.error('读取寄存器值失败:', error);
            return undefined;
        }
    }

    getItems(): MemoryItem[] {
        return Array.from(this.memoryItems.values());
    }

    async getItemValue(item: MemoryItem): Promise<string | undefined> {
        if (item.type === 'variable') {
            return await this.readRegisterValue(item.address);
        }
        return undefined;
    }

    formatAddress(address: number): string {
        return `0x${address.toString(16).toUpperCase().padStart(8, '0')}`;
    }

    formatSize(size: number): string {
        if (size >= 1024 * 1024) {
            return `${(size / (1024 * 1024)).toFixed(2)} MB`;
        } else if (size >= 1024) {
            return `${(size / 1024).toFixed(2)} KB`;
        } else {
            return `${size} Bytes`;
        }
    }

    async viewMemoryContent(address: number, size: number): Promise<string | null> {
        try {
            const data = await this.gdbInterface.readMemory(address, size);
            if (data) {
                return this.gdbInterface.formatMemoryContent(address, data);
            }
            return null;
        } catch (error) {
            console.error('查看内存内容失败:', error);
            return null;
        }
    }

    async loadElfFile(filePath: string) {
        try {
            this.outputChannel.appendLine(`正在加载 ELF 文件: ${filePath}`);
            const symbols = await this.elfParser.parseFile(filePath);
            
            this.outputChannel.appendLine(`成功解析 ELF 文件，找到 ${symbols.length} 个符号`);
            
            // 为每个符号创建内存项
            for (const symbol of symbols) {
                const symbolItem: MemoryItem = {
                    id: `symbol_${symbol.name}`,
                    name: symbol.name,
                    address: symbol.address,
                    size: symbol.size,
                    type: 'variable',
                    description: `${symbol.binding.toLowerCase()} ${symbol.type.toLowerCase()} in ${symbol.section}`,
                    readable: true,
                    writable: true
                };

                this.memoryItems.set(symbolItem.id, symbolItem);
            }

            this.eventEmitter.fire();
        } catch (error) {
            this.outputChannel.appendLine(`加载 ELF 文件失败: ${error}`);
            if (error instanceof Error) {
                this.outputChannel.appendLine(`错误堆栈: ${error.stack}`);
            }
            throw error;
        }
    }

    private parseHeapBlocks(data: Buffer): HeapBlock[] {
        const blocks: HeapBlock[] = [];
        try {
            // 调试输出
            this.outputChannel.appendLine('开始解析堆块数据:');
            this.outputChannel.appendLine(this.gdbInterface.formatMemoryContent(0x20000070, data));

            let offset = 0;
            while (offset < data.length) {
                const ptr = data.readUInt32LE(offset);
                if (ptr === 0) break; // 如果指针为0，说明到达了未使用的块

                const size = data.readUInt32LE(offset + 4);
                const namePtr = data.readUInt32LE(offset + 8);

                // 调试输出
                this.outputChannel.appendLine(`找到堆块: 地址=0x${ptr.toString(16)}, 大小=${size}`);

                if (ptr !== 0 && size > 0) {
                    blocks.push({
                        ptr: ptr,
                        size: size,
                        name: `Heap Block @0x${ptr.toString(16)}`
                    });
                }

                offset += 16; // 每个堆块记录占用16字节
            }

            this.outputChannel.appendLine(`共解析到 ${blocks.length} 个堆块`);
        } catch (error) {
            this.outputChannel.appendLine(`解析堆块数据时出错: ${error}`);
        }
        return blocks;
    }

    async initHeapInfo() {
        try {
            // 尝试从目标程序获取 heap_info 的地址和大小
            const heapInfoAddr = await this.gdbInterface.evaluateExpression('&heap_info');
            const heapInfoSize = await this.gdbInterface.evaluateExpression('sizeof(heap_info)');
            
            if (heapInfoAddr && heapInfoSize) {
                this.heapInfo = {
                    address: heapInfoAddr,
                    size: heapInfoSize
                };
                this.outputChannel.appendLine(`堆信息初始化成功: 地址=0x${heapInfoAddr.toString(16)}, 大小=${heapInfoSize}字节`);
            } else {
                throw new Error('无法获取堆信息地址和大小');
            }
        } catch (error) {
            this.outputChannel.appendLine(`堆信息初始化失败: ${error}`);
            throw error;
        }
    }

    async readHeapInfo() {
        try {
            // 确保堆信息已初始化
            if (this.heapInfo.address === 0) {
                await this.initHeapInfo();
            }
            
            this.outputChannel.appendLine(`开始读取堆信息: 地址=0x${this.heapInfo.address.toString(16)}, 大小=${this.heapInfo.size}字节`);
            
            const heapInfoData = await this.gdbInterface.readMemory(this.heapInfo.address, this.heapInfo.size);
            
            // 添加空值检查
            if (!heapInfoData) {
                this.outputChannel.appendLine('无法读取堆信息数据');
                return;
            }
            
            const blocks = this.parseHeapBlocks(heapInfoData);
            
            // 清除旧的堆块信息
            for (const [id, item] of this.memoryItems.entries()) {
                if (item.type === 'heap_block') {
                    this.memoryItems.delete(id);
                }
            }
            
            // 添加新的堆块信息
            for (const block of blocks) {
                const heapItem: MemoryItem = {
                    id: `heap_${block.ptr}`,
                    name: block.name,
                    address: block.ptr,
                    size: block.size,
                    type: 'heap_block',
                    description: `Heap allocation of ${this.formatSize(block.size)}`,
                    readable: true,
                    writable: true,
                    color: '#FFA500' // 橙黄色
                };
                
                this.memoryItems.set(heapItem.id, heapItem);
                
                // 添加调试输出
                this.outputChannel.appendLine(`添加堆块: ${JSON.stringify(heapItem, null, 2)}`);
            }
            
            // 输出所有内存项的信息
            this.outputChannel.appendLine('当前所有内存项:');
            for (const [id, item] of this.memoryItems.entries()) {
                this.outputChannel.appendLine(`${id}: ${item.type} @ 0x${item.address.toString(16)} (${item.size} bytes)`);
            }
            
            this.eventEmitter.fire();
            
        } catch (error) {
            this.outputChannel.appendLine(`读取堆信息失败: ${error}`);
        }
    }
} 