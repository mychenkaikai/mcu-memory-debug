declare module 'elfinfo' {
    export function parse(buffer: Buffer): ElfFile;

    export interface ElfFile {
        header: ElfHeader;
        sections: ElfSection[];
        segments: ElfSegment[];
    }

    export interface ElfHeader {
        class: string;
        data: string;
        type: string;
        machine: string;
        entry: number;
    }

    export interface ElfSection {
        name: string;
        type: string;
        flags: string[];
        address: number;
        offset: number;
        size: number;
        symbols?: ElfSymbol[];
    }

    export interface ElfSymbol {
        name: string;
        value: number;
        size: number;
        type: string;
        bind: string;
        sectionName?: string;
    }

    export interface ElfSegment {
        type: string;
        flags: string[];
        offset: number;
        vaddr: number;
        paddr: number;
        filesz: number;
        memsz: number;
    }
} 