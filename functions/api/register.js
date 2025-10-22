// /functions/api/register.js

/**
 * Função para criar o hash da senha (armazenamento seguro)
 */
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Handler para a rota de registro (POST)
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

        const passwordHash = await hashPassword(password);

        await env.nomevariavel.prepare(
            `INSERT INTO usuarios (username, password_hash) VALUES (?, ?)`
        ).bind(username, passwordHash).run();

        return new Response(JSON.stringify({ success: true, message: 'Usuário criado com sucesso!' }), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (e) {
        if (e.message && e.message.includes('UNIQUE constraint failed')) {
            return new Response(JSON.stringify({ message: 'Este nome de usuário já existe.' }), {
                status: 409,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        console.error("Erro no registro:", e);
        return new Response(JSON.stringify({ message: 'Erro interno ao criar usuário.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
