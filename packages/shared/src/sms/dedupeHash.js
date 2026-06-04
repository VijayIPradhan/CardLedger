export async function dedupeHash(input) {
    const raw = `${input.sender}|${input.body}|${input.timestamp ?? 0}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(raw);
    const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
