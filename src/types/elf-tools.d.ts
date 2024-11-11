declare module 'elf-tools' {
    export function parse(buffer: Buffer): ELF;

    export interface ELF {
        getSection(name: string): Section | undefined;
        sections: Section[];
    }

    export interface Section {
        name: string;
        type: string;
        flags: string[];
        address: number;
        offset: number;
        size: number;
        link: number;
        info: number;
        addralign: number;
        entsize: number;
        data: Buffer;
        symbols: Symbol[];
    }

    export interface Symbol {
        name: string;
        value: number;
        size: number;
        type: string;
        binding: string;
        visibility: string;
        section: string;
        index: number;
    }
} 