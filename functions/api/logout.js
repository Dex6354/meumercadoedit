// /functions/api/logout.js

export async function onRequestPost({ request, env }) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        await env.nomevariavel.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
    }
    return new Response(JSON.stringify({ success: true, message: 'Logout realizado.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
