export function createHttpHandler({ resolveConfigImpl, createProviderImpl, createStoreImpl }?: {
    resolveConfigImpl?: typeof resolveConfig | undefined;
    createProviderImpl?: typeof createProvider | undefined;
    createStoreImpl?: typeof createGalleryStore | undefined;
}): (request: any, response: any) => Promise<void>;
import { resolveConfig } from '../config.js';
import { createProvider } from '../providers/createProvider.js';
import { createGalleryStore } from './store.js';
