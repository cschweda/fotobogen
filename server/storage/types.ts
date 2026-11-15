// Where photo files are kept (DESIGN.md section 7). Only the local-disk
// adapter ships; this interface is what an object-storage adapter would
// implement later. Nothing outside server/storage/ builds these paths.

export type StorageArea = 'originals' | 'derivatives'

export interface Storage {
  /** Move a local file into storage under `key`. */
  put(area: StorageArea, key: string, fromPath: string): Promise<void>
  get(area: StorageArea, key: string): NodeJS.ReadableStream
  /** The whole file in memory. For small files (resized copies); use `get` for large ones. Null when missing. */
  read(area: StorageArea, key: string): Promise<Buffer | null>
  /** Size in bytes, or null when there is no such file. */
  size(area: StorageArea, key: string): Promise<number | null>
  /** Deleting a file that is not there is not an error. */
  delete(area: StorageArea, key: string): Promise<void>
  /** The address a browser uses for a derivative. Originals have none. */
  publicUrl(key: string): string
  /**
   * A path on this machine for libraries that read files themselves (sharp,
   * exifr). An object-storage adapter would download to a temp file here.
   */
  localPath(area: StorageArea, key: string): string
}
