// Eén plek voor de repo-identiteit: gebruikt door index.html (catalogus-fallback
// naar raw.githubusercontent.com) en api/p.js (hosts.json-allowlist-fallback).
export const REPO = { owner: 'JJersandro', name: 'IPTv', branch: 'main' };
export const rawUrl = (path) => `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${REPO.branch}/${path}`;
