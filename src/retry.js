/**
 * Retry utility — retries a function up to N times with delay
 */
export async function retry(fn, { attempts = 3, delayMs = 3000, label = '' } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`  ⟳ ${label || 'Retry'} attempt ${i}/${attempts} failed: ${err.message}. Waiting ${delayMs / 1000}s...`);
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
}
