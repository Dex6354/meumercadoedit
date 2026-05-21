export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Cabeçalhos CORS para permitir que o Cloudflare Pages acesse o Worker
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*", 
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    // Responde imediatamente ao preflight do navegador (OPTIONS)
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Verifica a rota da API
    if (url.pathname === '/api/shopping-list' || url.pathname === '/') {
      
      // Método GET: Retorna os itens salvos no KV
      if (request.method === 'GET') {
        const dados = await env.KV.get('shopping_list_items');
        return new Response(dados || '[]', {
          headers: { 
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Método PUT: Salva a lista atualizada no KV
      if (request.method === 'PUT') {
        try {
          const itens = await request.json();
          
          await env.KV.put('shopping_list_items', JSON.stringify(itens));

          return new Response(JSON.stringify({ success: true }), {
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        } catch (error) {
          return new Response(JSON.stringify({ error: 'Erro ao salvar os dados' }), {
            status: 400,
            headers: { 
              'Content-Type': 'application/json',
              ...corsHeaders
            }
          });
        }
      }
    }

    return new Response('Rota não encontrada', { 
      status: 404, 
      headers: corsHeaders 
    });
  } 
}
