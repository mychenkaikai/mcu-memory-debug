declare module 'node-elf' {
    export class ELF {
        constructor(buffer: Buffer);
        
        sections: Section[];
        
        getSectionByName(name: string): Section | null;
        getSectionByType(type: number): Section | null;
    }

    export interface Section {
        name: string;
        header: SectionHeader;
        data: Buffer;
    }

    export interface SectionHeader {
        name: number;
        type: number;
        flags: number;
        addr: number;
        offset: number;
        size: number;
        link: number;
        info: number;
        addralign: number;
        entsize: number;
    }

    export const SHT: {
        NULL: number;
        PROGBITS: number;
        SYMTAB: number;
        STRTAB: number;
        RELA: number;
        HASH: number;
        DYNAMIC: number;
        NOTE: number;
        NOBITS: number;
        REL: number;
        SHLIB: number;
        DYNSYM: number;
    };

    export const STT: {
        NOTYPE: number;
        OBJECT: number;
        FUNC: number;
        SECTION: number;
        FILE: number;
        COMMON: number;
        TLS: number;
    };

    export const STB: {
        LOCAL: number;
        GLOBAL: number;
        WEAK: number;
    };
} 