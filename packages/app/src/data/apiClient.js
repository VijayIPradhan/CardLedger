import axios from 'axios';
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
export const api = axios.create({ baseURL: BASE });
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('cl_token');
    if (token)
        config.headers.Authorization = `Bearer ${token}`;
    return config;
});
api.interceptors.response.use((r) => r, (err) => {
    if (err.response?.status === 401) {
        localStorage.removeItem('cl_token');
        window.location.href = '/login';
    }
    return Promise.reject(err);
});
export async function login(username, password) {
    const { data } = await api.post('/auth/login', { username, password });
    localStorage.setItem('cl_token', data.token);
    return data.token;
}
export function logout() {
    localStorage.removeItem('cl_token');
    window.location.href = '/login';
}
export function isAuthenticated() {
    const token = localStorage.getItem('cl_token');
    if (!token)
        return false;
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.exp * 1000 > Date.now();
    }
    catch {
        return false;
    }
}
