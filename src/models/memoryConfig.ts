import * as vscode from 'vscode';

interface MemoryRange {
    start: number;
    end: number;
    name: string;
}

export interface MemoryConfig {
    flash: MemoryRange;
    sram: MemoryRange;
}

export class MemoryConfigParser {
    async parseLinkerScript(ldPath: string): Promise<MemoryConfig | null> {
        try {
            const content = await vscode.workspace.fs.readFile(vscode.Uri.file(ldPath));
            const text = Buffer.from(content).toString('utf8');
            // 解析类似这样的内容:
            // MEMORY
            // {
            //   FLASH (rx) : ORIGIN = 0x08000000, LENGTH = 64K
            //   SRAM (rwx) : ORIGIN = 0x20000000, LENGTH = 20K
            // }
            const flashMatch = text.match(/FLASH.*?ORIGIN\s*=\s*(0x[0-9A-Fa-f]+).*?LENGTH\s*=\s*(\d+)K/s);
            const sramMatch = text.match(/RAM.*?ORIGIN\s*=\s*(0x[0-9A-Fa-f]+).*?LENGTH\s*=\s*(\d+)K/s);
            if (flashMatch && sramMatch) {
                return {
                    flash: {
                        start: parseInt(flashMatch[1], 16),
                        end: parseInt(flashMatch[1], 16) + parseInt(flashMatch[2]) * 1024 - 1,
                        name: 'Flash Memory'
                    },
                    sram: {
                        start: parseInt(sramMatch[1], 16),
                        end: parseInt(sramMatch[1], 16) + parseInt(sramMatch[2]) * 1024 - 1,
                        name: 'SRAM'
                    }
                };
            }
            return null;
        } catch (error) {
            console.error('解析链接器脚本失败:', error);
            return null;
        }
    }
} 