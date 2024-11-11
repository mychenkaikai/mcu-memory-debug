import * as vscode from 'vscode';
import * as fs from 'fs';

export interface ElfSymbol {
    name: string;
    address: number;
    size: number;
    type: string;
    binding: string;
    section: string;
}

export class ElfParser {
    private symbols: ElfSymbol[] = [];

    // ELF 文件格式常量
    private readonly EI_NIDENT = 16;
    private readonly SHT_SYMTAB = 2;
    private readonly SHT_STRTAB = 3;
    private readonly STT_OBJECT = 1;
    private readonly STB_LOCAL = 0;
    private readonly STB_GLOBAL = 1;

    constructor(private outputChannel: vscode.OutputChannel) {}

    async parseFile(filePath: string): Promise<ElfSymbol[]> {
        try {
            this.outputChannel.appendLine(`解析 ELF 文件: ${filePath}`);
            const buffer = fs.readFileSync(filePath);
            
            // 验证 ELF 魔数
            if (buffer.length < 4 || 
                buffer[0] !== 0x7F || 
                buffer[1] !== 0x45 || // 'E'
                buffer[2] !== 0x4C || // 'L'
                buffer[3] !== 0x46) { // 'F'
                throw new Error('不是有效的 ELF 文件');
            }

            // 检查是否是 32 位 ELF
            const is32Bit = buffer[4] === 1;
            const isLittleEndian = buffer[5] === 1;

            this.outputChannel.appendLine(`文件类型: ${is32Bit ? '32位' : '64位'}`);
            this.outputChannel.appendLine(`字节序: ${isLittleEndian ? '小端' : '大端'}`);

            // 读取节头表偏移
            let shoff = buffer.readUInt32LE(32);
            let shentsize = buffer.readUInt16LE(46);
            let shnum = buffer.readUInt16LE(48);
            let shstrndx = buffer.readUInt16LE(50);

            this.outputChannel.appendLine(`节头表偏移: 0x${shoff.toString(16)}`);
            this.outputChannel.appendLine(`节头表项大小: ${shentsize}`);
            this.outputChannel.appendLine(`节头表项数量: ${shnum}`);
            this.outputChannel.appendLine(`字符串表索引: ${shstrndx}`);

            // 读取字符串表
            let strTabOffset = shoff + shstrndx * shentsize;
            let strTabShOffset = buffer.readUInt32LE(strTabOffset + 16);
            let strTabSize = buffer.readUInt32LE(strTabOffset + 20);

            this.outputChannel.appendLine(`字符串表偏移: 0x${strTabShOffset.toString(16)}`);
            this.outputChannel.appendLine(`字符串表大小: ${strTabSize}`);

            // 查找符号表和其字符串表
            let symtabOffset = 0;
            let symtabSize = 0;
            let symstrOffset = 0;
            let symstrSize = 0;

            for (let i = 0; i < shnum; i++) {
                let sectionOffset = shoff + i * shentsize;
                let sectionType = buffer.readUInt32LE(sectionOffset + 4);
                
                if (sectionType === this.SHT_SYMTAB) {
                    symtabOffset = buffer.readUInt32LE(sectionOffset + 16);
                    symtabSize = buffer.readUInt32LE(sectionOffset + 20);
                    let link = buffer.readUInt32LE(sectionOffset + 24);
                    
                    // 获取关联的字符串表
                    let strSecOffset = shoff + link * shentsize;
                    symstrOffset = buffer.readUInt32LE(strSecOffset + 16);
                    symstrSize = buffer.readUInt32LE(strSecOffset + 20);
                    
                    this.outputChannel.appendLine(`找到符号表: 偏移=0x${symtabOffset.toString(16)}, 大小=${symtabSize}`);
                    break;
                }
            }

            if (symtabOffset === 0) {
                this.outputChannel.appendLine('未找到符号表');
                return [];
            }

            // 解析符号表
            this.symbols = [];
            const symbolEntSize = 16; // 32位 ELF 的符号表项大小
            const numSymbols = symtabSize / symbolEntSize;

            for (let i = 0; i < numSymbols; i++) {
                const symOffset = symtabOffset + i * symbolEntSize;
                const nameOffset = buffer.readUInt32LE(symOffset);
                const value = buffer.readUInt32LE(symOffset + 4);
                const size = buffer.readUInt32LE(symOffset + 8);
                const info = buffer[symOffset + 12];
                const bind = info >> 4;
                const type = info & 0xf;
                const shndx = buffer.readUInt16LE(symOffset + 14);

                // 读取符号名称
                if (nameOffset > 0 && nameOffset < symstrSize) {
                    let name = '';
                    let j = symstrOffset + nameOffset;
                    while (j < buffer.length && buffer[j] !== 0) {
                        name += String.fromCharCode(buffer[j]);
                        j++;
                    }

                    // 只处理全局变量和静态变量
                    if (type === this.STT_OBJECT && 
                        size > 0 && 
                        (bind === this.STB_GLOBAL || bind === this.STB_LOCAL)) {
                        
                        const bindingStr = bind === this.STB_GLOBAL ? 'GLOBAL' : 'LOCAL';
                        
                        this.outputChannel.appendLine(`\n变量: ${name}`);
                        this.outputChannel.appendLine(`  地址: 0x${value.toString(16).padStart(8, '0')}`);
                        this.outputChannel.appendLine(`  大小: ${this.formatSize(size)}`);
                        this.outputChannel.appendLine(`  类型: ${bindingStr} OBJECT`);
                        this.outputChannel.appendLine(`  段索引: ${shndx}`);

                        this.symbols.push({
                            name,
                            address: value,
                            size,
                            type: 'OBJECT',
                            binding: bindingStr,
                            section: shndx.toString()
                        });
                    }
                }
            }

            this.outputChannel.appendLine(`\n找到 ${this.symbols.length} 个变量符号`);
            return this.symbols;
        } catch (error) {
            this.outputChannel.appendLine(`解析 ELF 文件失败: ${error}`);
            if (error instanceof Error) {
                this.outputChannel.appendLine(`错误堆栈: ${error.stack}`);
            }
            throw error;
        }
    }

    private formatSize(size: number): string {
        if (size >= 1024) {
            return `${(size / 1024).toFixed(2)} KB`;
        } else {
            return `${size} 字节`;
        }
    }
} 