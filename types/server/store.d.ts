export function createGalleryStore({ rootDir, storeDir }?: {
    rootDir?: any;
    storeDir?: any;
}): {
    rootDir: any;
    storeDir: any;
    isReadableImage(filePath: any): boolean;
    isDeletableGeneratedImage(filePath: any): boolean;
    buildImageUrl(filePath: any): string | null;
    listHistory(): Promise<any>;
    addHistory(entry: any): Promise<{
        id: any;
        prompt: string;
        provider: any;
        model: any;
        savedPath: any;
        imageUrl: string | null;
        responseId: any;
        sessionId: any;
        revisedPrompt: any;
        references: any;
        warnings: any;
        createdAt: any;
    }>;
    getHistory(id: any): Promise<any>;
    deleteHistory(id: any): Promise<any>;
    clearHistory(): Promise<{
        ok: boolean;
        deletedCount: number;
        failed: {
            id: any;
            savedPath: any;
            message: any;
        }[];
    }>;
    getImageDataUrl(id: any): Promise<{
        id: any;
        filename: any;
        imageUrl: any;
        dataUrl: string;
    } | null>;
    listPrompts(): Promise<any>;
    addPrompt({ title, prompt }: {
        title: any;
        prompt: any;
    }): Promise<{
        id: string;
        title: string;
        prompt: string;
        createdAt: string;
    }>;
    deletePrompt(id: any): Promise<any>;
    listReferences(): Promise<any>;
    addReference({ name, dataUrl }: {
        name: any;
        dataUrl: any;
    }): Promise<any>;
    getReference(id: any): Promise<any>;
    touchReferences(ids: any): Promise<any[]>;
    deleteReference(id: any): Promise<any>;
    getReferenceDataUrl(id: any): Promise<{
        id: any;
        filename: any;
        imageUrl: any;
        dataUrl: string;
    } | null>;
};
export namespace galleryStoreInternals {
    export { getImageContentType };
    export { parseImageDataUrl };
    export { resolveInside };
    export { readJsonFile };
}
declare function getImageContentType(filePath: any): "image/png" | "image/jpeg" | "image/gif" | "image/webp" | null;
declare function parseImageDataUrl(dataUrl: any): {
    contentType: string;
    extension: any;
    buffer: any;
};
declare function resolveInside(baseDir: any, targetPath: any): any;
declare function readJsonFile(filePath: any, fallback: any): Promise<any>;
export {};
