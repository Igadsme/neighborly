import { StorageService } from '../../storage/storage.service'

/**
 * A `StorageService` double for suites that exercise listing behavior but
 * not object storage. Fails loudly if a test accidentally depends on a real
 * upload, so a stub can never hide a missing assertion.
 */
export function stubStorage(): { calls: Array<{ method: string; args: unknown[] }>; provider: { provide: typeof StorageService; useValue: StorageService } } {
  const calls: Array<{ method: string; args: unknown[] }> = []
  return {
    calls,
    provider: {
      provide: StorageService,
      useValue: {
        isConfigured: () => false,
        putListingImage: async (...args: unknown[]) => {
          calls.push({ method: 'putListingImage', args })
          throw new Error('unexpected storage call')
        },
        remove: async (...args: unknown[]) => {
          calls.push({ method: 'remove', args })
        },
        removeMany: async (...args: unknown[]) => {
          calls.push({ method: 'removeMany', args })
        },
        exists: async () => false
      } as unknown as StorageService
    }
  }
}