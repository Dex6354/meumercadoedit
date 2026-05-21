export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Verifica se a requisição é para a rota correta
    if (url.pathname === '/api/shopping-list') {
      
      // Método GET: Retorna os itens salvos no KV
      if (request.method === 'GET') {
        const dados = await env.KV.get('shopping_list_items');
        // Se estiver vazio no KV, retorna um array vazio []
        return new Response(dados || '[]', {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Método PUT: Atualiza/Salva a lista completa de itens recebida do front-end
      if (request.method === 'PUT') {
        try {
          const itens = await request.json();
          
          // Grava a string JSON dentro da chave do KV
          await env.KV.put('shopping_list_items', JSON.stringify(itens));

          return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'JSON inválido ou erro ao salvar' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    }

    // Retorno padrão para qualquer outra rota não mapeada
    return new Response('Rota não encontrada', { status: 404 });
  } 
}
