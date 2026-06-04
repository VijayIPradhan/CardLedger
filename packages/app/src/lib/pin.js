const STORAGE_KEY = 'cl_pin_hash';
function hashPin(pin) {
    return btoa(pin + 'cl-salt-v1');
}
export function setupPin(pin) {
    localStorage.setItem(STORAGE_KEY, hashPin(pin));
}
export function isPinSet() {
    return !!localStorage.getItem(STORAGE_KEY);
}
export function verifyPin(pin) {
    return hashPin(pin) === localStorage.getItem(STORAGE_KEY);
}
