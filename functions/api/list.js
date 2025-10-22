// /functions/api/list.js

/**
 * Função para obter o ID do usuário a partir de um token de autorização
 */
async function getUserIdFromToken(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    const token = authHeader.split(' ')[1];
    const now = Math.floor(Date.now() / 1000);

    const session = await env.nomevariavel.prepare(
        `SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?`
    ).bind(token, now).first();

    return session ? session.user_id : null;
}

/**
 * Handler para buscar a lista (GET)
 */
export async function onRequestGet({ request, env }) {
    const userId = await getUserIdFromToken(request, env);
    if (!userId) {
        return new Response(JSON.stringify({ message: 'Não autorizado' }), { status: 401 });
    }

    const { results } = await env.nomevariavel.prepare(
        // ATUALIZADO: Seleciona o 'id' do item
        `SELECT id, item AS name, shibata AS priceShibata, nagumo AS priceNagumo, purchased 
         FROM nometabela WHERE user_id = ? ORDER BY id DESC`
    ).bind(userId).all();

    const items = results.map(row => ({
        ...row,
        purchased: row.purchased === 1,
    }));

    return new Response(JSON.stringify(items), { headers: { 'Content-Type': 'application/json' } });
}

/**
 * Handler para salvar/sincronizar a lista (POST)
 * Esta função foi reescrita para mesclar (UPSERT) em vez de substituir.
 */
export async function onRequestPost({ request, env }) {
    const userId = await getUserIdFromToken(request, env);
    if (!userId) {
        return new Response(JSON.stringify({ message: 'Não autorizado' }), { status: 401 });
    }

    // 1. Espera um corpo com 'items' (para upsert) e 'deletes' (para excluir)
    const body = await request.json();
    const items = body.items || [];
    const deletes = body.deletes || []; // Array de IDs para deletar

    const statements = [];

    // 2. Cria statements de DELETE para IDs pendentes
    if (deletes.length > 0) {
        const placeholders = deletes.map(() => '?').join(',');
        statements.push(
            env.nomevariavel.prepare(
                `DELETE FROM nometabela WHERE user_id = ? AND id IN (${placeholders})`
            ).bind(userId, ...deletes)
        );
    }

    // 3. Cria statements de UPDATE (se item.id existe) ou INSERT (se item.id é null)
    const upsertStmts = items.map(item => {
        if (item.id) {
            // UPDATE para item existente
            return env.nomevariavel.prepare(
                `UPDATE nometabela SET item = ?, shibata = ?, nagumo = ?, purchased = ? 
                 WHERE id = ? AND user_id = ?`
            ).bind(
                item.name,
                item.priceShibata || 'R$ 0,00',
                item.priceNagumo || 'R$ 0,00',
                item.purchased ? 1 : 0,
                item.id,
                userId
            );
        } else {
            // INSERT para novo item
            return env.nomevariavel.prepare(
                `INSERT INTO nometabela (item, shibata, nagumo, purchased, user_id) 
                 VALUES (?, ?, ?, ?, ?)`
            ).bind(
                item.name,
                item.priceShibata || 'R$ 0,00',
                item.priceNagumo || 'R$ 0,00',
                item.purchased ? 1 : 0,
                userId
            );
        }
    });

    // 4. Executa todas as operações em lote
    await env.nomevariavel.batch([...statements, ...upsertStmts]);

    // 5. CRUCIAL: Retorna a lista nova e mesclada do banco de dados.
    // Isso garante que o cliente receba os novos IDs dos itens que acabou de inserir.
    const { results } = await env.nomevariavel.prepare(
        `SELECT id, item AS name, shibata AS priceShibata, nagumo AS priceNagumo, purchased 
         FROM nometabela WHERE user_id = ? ORDER BY id DESC`
    ).bind(userId).all();

    const updatedItems = results.map(row => ({
        ...row,
        purchased: row.purchased === 1,
    }));

    return new Response(JSON.stringify(updatedItems), { headers: { 'Content-Type': 'application/json' } });
}
