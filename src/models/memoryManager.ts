import * as vscode from 'vscode';
import { GDBInterface } from '../debugger/gdbInterface';
import { ElfParser, ElfSymbol } from '../debugger/elfParser';

export interface MemoryItem {
    id: string;
    name: string;
    address: number;
    size: number;
    type: 'region' | 'peripheral' | 'variable';
    value?: string;
    children?: MemoryItem[];
    description?: string;
    readable?: boolean;
    writable?: boolean;
}

export class MemoryManager {
    private memoryItems: Map<string, MemoryItem> = new Map();
    private eventEmitter = new vscode.EventEmitter<void>();
    private elfParser: ElfParser;

    constructor(private gdbInterface: GDBInterface, outputChannel: vscode.OutputChannel) {
        this.elfParser = new ElfParser(outputChannel);
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
            const symbols = await this.elfParser.parseFile(filePath);
            
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
            console.error('加载 ELF 文件失败:', error);
        }
    }
} 