import * as vscode from 'vscode';

interface MemoryRegion {
    start: number;
    size: number;
    name: string;
    description: string;
    readable: boolean;
    writable: boolean;
}

export class GDBInterface {
    private session?: vscode.DebugSession;
    private readonly memoryRegions: MemoryRegion[] = [
        { 
            start: 0x08000000, 
            size: 0x10000, 
            name: 'FLASH', 
            description: 'Program Memory',
            readable: true,
            writable: false
        },
        { 
            start: 0x20000000, 
            size: 0x8000, 
            name: 'SRAM', 
            description: 'Static RAM',
            readable: true,
            writable: true
        },
        { 
            start: 0x40000000, 
            size: 0x1000, 
            name: 'APB1', 
            description: 'Peripheral Bus 1',
            readable: true,
            writable: true
        },
        { 
            start: 0x40010000, 
            size: 0x1000, 
            name: 'APB2', 
            description: 'Peripheral Bus 2',
            readable: true,
            writable: true
        },
        { 
            start: 0x40020000, 
            size: 0x1000, 
            name: 'AHB1', 
            description: 'Advanced High-performance Bus 1',
            readable: true,
            writable: true
        }
    ];

    constructor(private outputChannel: vscode.OutputChannel) {}

    async connect(session: vscode.DebugSession) {
        this.session = session;
        this.outputChannel.appendLine('正在连接到 cortex-debug 会话');
    }

    async sendCommand(command: string): Promise<string> {
        if (!this.session) {
            throw new Error('未连接到调试会话');
        }

        try {
            this.outputChannel.appendLine(`发送 GDB 命令: ${command}`);
            const response = await vscode.debug.activeDebugSession?.customRequest('evaluate', {
                expression: command,
                context: 'repl'
            });
            
            if (response && response.result) {
                this.outputChannel.appendLine(`命令响应: ${JSON.stringify(response, null, 2)}`);
                return response.result;
            } else {
                this.outputChannel.appendLine('命令执行成功，但没有返回数据');
                return '';
            }
        } catch (error) {
            this.outputChannel.appendLine(`命令执行失败: ${error}`);
            return '';
        }
    }

    async initializeMemoryInfo() {
        try {
            this.outputChannel.appendLine('\n=== 内存区域扫描 ===');
            
            for (const region of this.memoryRegions) {
                this.outputChannel.appendLine(`\n--- ${region.name} (${region.description}) ---`);
                this.outputChannel.appendLine(`基地址: 0x${region.start.toString(16).toUpperCase().padStart(8, '0')}`);
                this.outputChannel.appendLine(`大小: ${this.formatSize(region.size)}`);
                this.outputChannel.appendLine(`权限: ${region.readable ? 'R' : '-'}${region.writable ? 'W' : '-'}`);
                
                if (region.readable) {
                    const data = await this.readMemory(region.start, Math.min(64, region.size));
                    if (data) {
                        this.outputChannel.appendLine('内存内容:');
                        this.outputChannel.appendLine(this.formatMemoryContent(region.start, data));
                    }
                } else {
                    this.outputChannel.appendLine('内存不可读');
                }
            }

            return true;
        } catch (error) {
            this.outputChannel.appendLine(`初始化内存信息失败: ${error}`);
            return true;
        }
    }

    private formatSize(size: number): string {
        if (size >= 1024 * 1024) {
            return `${(size / (1024 * 1024)).toFixed(2)} MB`;
        } else if (size >= 1024) {
            return `${(size / 1024).toFixed(2)} KB`;
        } else {
            return `${size} 字节`;
        }
    }

    public formatMemoryContent(baseAddress: number, data: Buffer): string {
        let output = '';
        const bytesPerLine = 16;
        
        // 添加列标题
        output += '         ';
        for (let i = 0; i < bytesPerLine; i++) {
            output += ` ${i.toString(16).toUpperCase().padStart(2, '0')}`;
        }
        output += '  |0123456789ABCDEF|\n';
        output += '-'.repeat(77) + '\n';
        
        for (let offset = 0; offset < data.length; offset += bytesPerLine) {
            // 地址
            output += `0x${(baseAddress + offset).toString(16).toUpperCase().padStart(8, '0')}: `;
            
            // 十六进制数据
            const lineData = data.slice(offset, offset + bytesPerLine);
            const hexPart = Array.from(lineData)
                .map(byte => byte.toString(16).toUpperCase().padStart(2, '0'))
                .join(' ');
            output += hexPart.padEnd(bytesPerLine * 3, ' ');
            
            // ASCII 表示
            output += '  |';
            const asciiPart = Array.from(lineData)
                .map(byte => byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.')
                .join('');
            output += asciiPart.padEnd(16, ' ');
            output += '|';
            
            output += '\n';
        }
        
        return output;
    }

    async readMemory(address: number, size: number): Promise<Buffer | null> {
        try {
            this.outputChannel.appendLine(`读取内存: 地址 0x${address.toString(16).toUpperCase().padStart(8, '0')}, 大小 ${this.formatSize(size)}`);
            const response = await vscode.debug.activeDebugSession?.customRequest('readMemory', {
                memoryReference: `0x${address.toString(16)}`,
                offset: 0,
                count: size
            });
            
            if (response && response.data) {
                const buffer = Buffer.from(response.data, 'base64');
                return buffer;
            }
            return null;
        } catch (error) {
            this.outputChannel.appendLine(`读取内存失败 (0x${address.toString(16).toUpperCase().padStart(8, '0')}): ${error}`);
            return null;
        }
    }

    async getMemoryRegions(): Promise<MemoryRegion[]> {
        return this.memoryRegions;
    }
} 