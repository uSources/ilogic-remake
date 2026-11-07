// Los tipos de singleFile.mjs, para usarlo desde los tests.
export declare const ASSET_MIME_TYPES: Readonly<Record<string, string>>;
export declare function assetMimeType(fileName: string): string | null;
export declare function replaceOnce(text: string, search: string, replacement: string): string;
export declare function scriptSafe(js: string): string;
export declare function syntaxErrorsOf(js: string): string[];
export declare function replacementPatternCounts(text: string): Record<string, number>;
export declare function assertScriptKept(html: string, js: string): void;
export interface SingleFileParts {
  html: string;
  scriptTag: string;
  styleTag: string;
  css: string;
  js: string;
  assets: Record<string, string>;
  favicon: string;
}
export declare function singleFileHtml(parts: SingleFileParts): string;
