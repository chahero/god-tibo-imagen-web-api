export function createHttpHandler({ resolveConfigImpl, createProviderImpl }?: {
    resolveConfigImpl?: typeof resolveConfig | undefined;
    createProviderImpl?: typeof createProvider | undefined;
}): (request: any, response: any) => Promise<void>;
import { resolveConfig } from '../config.js';
import { createProvider } from '../providers/createProvider.js';
