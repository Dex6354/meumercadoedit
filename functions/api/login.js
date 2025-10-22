// /functions/api/login.js

/**
 * Função para criar o hash da senha (para comparação)
 */
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Handler para a rota de login (POST)
 */
export async function onRequestPost({ request, env }) {
    try {
        const { username, password } = await request.json();

        if (!username || !password) {
            return new Response(JSON.stringify({ message: 'Usuário e senha são obrigatórios' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        const user = await env.nomevariavel.prepare(
            `SELECT id, password_hash FROM usuarios WHERE username = ?`
        ).bind(username).first();

        if (!user) {
            return new Response(JSON.stringify({ message: 'Usuário ou senha inválidos.' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const passwordHash = await hashPassword(password);
        if (passwordHash !== user.password_hash) {
            return new Response(JSON.stringify({ message: 'Usuário ou senha inválidos.' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Se a senha estiver correta, crie uma sessão
        const token = crypto.randomUUID();
        const expires_at = Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7); // Expira em 7 dias

        await env.nomevariavel.prepare(
            `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
        ).bind(token, user.id, expires_at).run();

        return new Response(JSON.stringify({ success: true, token: token }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (e) {
        console.error("Erro no login:", e);
        return new Response(JSON.stringify({ message: 'Erro interno ao tentar fazer login.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
