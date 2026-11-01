/**
 * Remplace `localStorage` par une Map en mémoire pendant les tests.
 * Chaque test repart d'un stockage vide : aucun token ne fuit d'un test à l'autre.
 * À appeler AVANT d'injecter `AuthService`, qui lit le token dans son constructeur.
 */
export function installLocalStorageMock(initial: Record<string, string> = {}): Map<string, string> {
  const storage = new Map<string, string>(Object.entries(initial));
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    },
  });
  return storage;
}
